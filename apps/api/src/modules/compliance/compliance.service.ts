import { Injectable, NotFoundException } from '@nestjs/common';
import {
  committees,
  complianceAlerts,
  complianceSettings,
  employees,
  legalEntities,
  locations,
  tenantUsers,
  type Tx,
} from '@gp/db';
import {
  COMPLIANCE_ALERT_KINDS,
  todayIn,
  type AcknowledgeAlertInput,
  type ComplianceAlertPage,
  type ComplianceAlertQuery,
  type ComplianceAlertView,
  type ComplianceOverview,
  type ComplianceSettingsInput,
  type ComplianceSettingsView,
} from '@gp/shared';
import { and, count, desc, eq, gte, inArray, lte, sql, type SQL } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, conflict } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { TenantDb } from '../../db/db.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { employeeRef } from '../attendance/attendance-views.js';
import { duration } from './alert-text.js';
import { workingTimeLaw } from './checker.js';
import { settingsOf, type ComplianceSettings } from './compliance-check.service.js';
import { adolescentsOn, certificatesOf } from './people.js';

const a = complianceAlerts;

const toSettingsView = (s: ComplianceSettings): ComplianceSettingsView => ({
  overtimeDailyCapMinutes: s.overtimeDailyCapMinutes,
  overtimeWeeklyCapMinutes: s.overtimeWeeklyCapMinutes,
  overtimeMonthlyCapMinutes: s.overtimeMonthlyCapMinutes,
  warnAtPercent: s.warnAtPercent,
  law: workingTimeLaw(todayIn()),
  updatedAt: s.updatedAt?.toISOString() ?? null,
});

/** Settings, the alert list with acknowledgement, and the overview. */
@Injectable()
export class ComplianceService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
  ) {}

  settings(): Promise<ComplianceSettingsView> {
    return this.tenantDb.run(async (tx) => toSettingsView(await settingsOf(tx)));
  }

  /** The company's caps sit at or below the law's: above it, the law's alert comes first. */
  updateSettings(user: AuthUser, input: ComplianceSettingsInput): Promise<ComplianceSettingsView> {
    return this.tenantDb.run(async (tx) => {
      const law = workingTimeLaw(todayIn());
      for (const [cap, limit] of [
        [input.overtimeDailyCapMinutes, law.overtimeDaily],
        [input.overtimeWeeklyCapMinutes, law.overtimeWeekly],
      ] as const) {
        if (cap > limit.minutes) {
          throw badRequest(
            'cap_above_law',
            `An overtime cap can be at most ${duration(limit.minutes).en}, the law's limit (s.${limit.reference.section})`,
          );
        }
      }
      const before = await settingsOf(tx);
      const values = { ...input, updatedBy: user.id, updatedAt: new Date() };
      const [row] = await tx
        .insert(complianceSettings)
        .values({ tenantId: currentTenantId(), ...values })
        .onConflictDoUpdate({ target: complianceSettings.tenantId, set: values })
        .returning();
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'compliance.settings.update',
        entityType: 'compliance_settings',
        entityId: null,
        before: {
          overtimeDailyCapMinutes: before.overtimeDailyCapMinutes,
          overtimeWeeklyCapMinutes: before.overtimeWeeklyCapMinutes,
          overtimeMonthlyCapMinutes: before.overtimeMonthlyCapMinutes,
          warnAtPercent: before.warnAtPercent,
        },
        after: input,
      });
      return toSettingsView(row!);
    });
  }

  alerts(query: ComplianceAlertQuery): Promise<ComplianceAlertPage> {
    return this.tenantDb.run(async (tx) => {
      const where = and(
        query.kind ? eq(a.kind, query.kind) : undefined,
        query.status ? eq(a.status, query.status) : undefined,
        query.employeeId ? eq(a.employeeId, query.employeeId) : undefined,
        query.from ? gte(a.periodEnd, query.from) : undefined,
        query.to ? lte(a.periodStart, query.to) : undefined,
      );
      const [total] = await tx.select({ n: count() }).from(a).where(where);
      const items = await this.views(tx, where, {
        limit: query.pageSize,
        offset: (query.page - 1) * query.pageSize,
      });
      return { items, total: total?.n ?? 0, page: query.page, pageSize: query.pageSize };
    });
  }

  acknowledge(
    user: AuthUser,
    id: string,
    input: AcknowledgeAlertInput,
  ): Promise<ComplianceAlertView> {
    return this.tenantDb.run(async (tx) => {
      const [alert] = await tx.select().from(a).where(eq(a.id, id)).for('update');
      if (!alert) throw new NotFoundException('Alert not found');
      if (alert.status === 'acknowledged') {
        throw conflict('alert_acknowledged', 'This alert is already acknowledged');
      }
      if (alert.status === 'resolved') {
        throw conflict('alert_resolved', 'This alert no longer applies');
      }
      const now = new Date();
      await tx
        .update(a)
        .set({
          status: 'acknowledged',
          note: input.note,
          acknowledgedBy: user.id,
          acknowledgedAt: now,
          updatedAt: now,
        })
        .where(eq(a.id, id));
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'compliance.alert.acknowledge',
        entityType: 'compliance_alert',
        entityId: id,
        before: { status: alert.status },
        after: { status: 'acknowledged', note: input.note },
      });
      const [view] = await this.views(tx, eq(a.id, id), { limit: 1, offset: 0 });
      return view!;
    });
  }

  overview(): Promise<ComplianceOverview> {
    return this.tenantDb.run(async (tx) => {
      const today = todayIn();
      const counts = await tx
        .select({ kind: a.kind, status: a.status, n: count() })
        .from(a)
        .where(inArray(a.status, ['open', 'acknowledged']))
        .groupBy(a.kind, a.status);
      const kinds = COMPLIANCE_ALERT_KINDS.map((kind) => {
        const of = (status: string) =>
          counts.find((c) => c.kind === kind && c.status === status)?.n ?? 0;
        return { kind, open: of('open'), acknowledged: of('acknowledged') };
      });
      const [resolved] = await tx
        .select({ n: count() })
        .from(a)
        .where(and(eq(a.status, 'resolved'), gte(a.updatedAt, sql`now() - interval '30 days'`)));
      const minors = await adolescentsOn(tx, today);
      const certificates = await certificatesOf(
        tx,
        minors.map((m) => m.id),
        today,
      );
      const [consents] = await tx
        .select({ n: count() })
        .from(employees)
        .where(
          and(
            eq(employees.status, 'active'),
            eq(employees.gender, 'female'),
            lte(employees.nightWorkConsentFrom, today),
          ),
        );
      return {
        kinds,
        open: kinds.reduce((n, k) => n + k.open, 0),
        acknowledged: kinds.reduce((n, k) => n + k.acknowledged, 0),
        resolvedLast30Days: resolved?.n ?? 0,
        adolescents: minors.length,
        adolescentsWithoutCertificate: minors.filter((m) => {
          const state = certificates.get(m.id)?.state;
          return state === 'missing' || state === 'expired';
        }).length,
        womenWithNightConsent: consents?.n ?? 0,
        latest: await this.views(tx, eq(a.status, 'open'), { limit: 5, offset: 0 }),
      };
    });
  }

  /** Alerts with the person, committee or company they are about and who acknowledged them. */
  private async views(
    tx: Tx,
    where: SQL | undefined,
    page: { limit: number; offset: number },
  ): Promise<ComplianceAlertView[]> {
    const rows = await tx
      .select({
        alert: a,
        employee: {
          id: employees.id,
          employeeCode: employees.employeeCode,
          fullName: employees.fullName,
          fullNameBn: employees.fullNameBn,
        },
        acknowledgedBy: { id: tenantUsers.id, name: tenantUsers.name },
      })
      .from(a)
      .leftJoin(employees, eq(employees.id, a.employeeId))
      .leftJoin(tenantUsers, eq(tenantUsers.id, a.acknowledgedBy))
      .where(where)
      .orderBy(
        sql`case ${a.status} when 'open' then 0 when 'acknowledged' then 1 else 2 end`,
        desc(a.periodStart),
        desc(a.createdAt),
      )
      .limit(page.limit)
      .offset(page.offset);
    const others = [...new Set(rows.filter((r) => !r.employee?.id).map((r) => r.alert.subjectId))];
    const names = new Map<string, string>();
    if (others.length) {
      const found = [
        ...(await tx
          .select({ id: committees.id, name: committees.name })
          .from(committees)
          .where(inArray(committees.id, others))),
        ...(await tx
          .select({ id: legalEntities.id, name: legalEntities.name })
          .from(legalEntities)
          .where(inArray(legalEntities.id, others))),
        // A site with committees of its own is an establishment too.
        ...(await tx
          .select({ id: locations.id, name: locations.name })
          .from(locations)
          .where(inArray(locations.id, others))),
      ];
      for (const f of found) names.set(f.id, f.name);
    }
    return rows.map(({ alert, employee, acknowledgedBy }) => ({
      id: alert.id,
      kind: alert.kind,
      subjectId: alert.subjectId,
      employee: employee?.id ? employeeRef(employee) : null,
      subjectName: employee?.id ? null : (names.get(alert.subjectId) ?? null),
      periodStart: alert.periodStart,
      periodEnd: alert.periodEnd,
      value: alert.value,
      limit: alert.limit,
      detail: alert.detail ?? null,
      status: alert.status,
      note: alert.note,
      acknowledgedBy: acknowledgedBy?.id ? acknowledgedBy : null,
      acknowledgedAt: alert.acknowledgedAt?.toISOString() ?? null,
      createdAt: alert.createdAt.toISOString(),
      updatedAt: alert.updatedAt.toISOString(),
    }));
  }
}
