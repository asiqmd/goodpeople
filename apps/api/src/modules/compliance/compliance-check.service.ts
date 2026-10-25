import { Injectable } from '@nestjs/common';
import { BD_RULES, ruleOn, type WorkplaceKind } from '@gp/country-packs';
import {
  attendanceDays,
  complianceAlerts,
  complianceSettings,
  employees,
  jobAssignments,
  locations,
  type Tx,
} from '@gp/db';
import {
  addDays,
  addMonths,
  ageOn,
  daysInclusive,
  monthBounds,
  todayIn,
  HOURS_ALERT_KINDS,
  type ComplianceCheckResult,
  type IsoDate,
  type WorkerAlertDetail,
  type WorkerAlertKind,
} from '@gp/shared';
import { and, desc, eq, gte, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { currentTenantId } from '../../common/request-context.js';
import { TenantDb } from '../../db/db.module.js';
import { NotificationsService, usersWith } from '../notifications/notifications.service.js';
import { alertText } from './alert-text.js';
import {
  checkPerson,
  isAdolescent,
  weekStartOf,
  type CheckDay,
  type OvertimeCaps,
} from './checker.js';
import { certificatesOf } from './people.js';

export type ComplianceSettings = Omit<
  typeof complianceSettings.$inferSelect,
  'tenantId' | 'updatedAt'
> & { updatedAt: Date | null };

/** The workspace's caps, or the defaults until HR saves its own. */
export async function settingsOf(tx: Tx): Promise<ComplianceSettings> {
  const [row] = await tx.select().from(complianceSettings);
  return (
    row ?? {
      overtimeDailyCapMinutes: 120,
      overtimeWeeklyCapMinutes: 720,
      overtimeMonthlyCapMinutes: null,
      warnAtPercent: 90,
      updatedBy: null,
      updatedAt: null,
    }
  );
}

export const capsOf = (s: ComplianceSettings): OvertimeCaps => ({
  dailyMinutes: s.overtimeDailyCapMinutes,
  weeklyMinutes: s.overtimeWeeklyCapMinutes,
  monthlyMinutes: s.overtimeMonthlyCapMinutes,
});

/** What the background job looks at: this week and last, and the month to date. */
export function recentWindow(today: IsoDate): { from: IsoDate; to: IsoDate } {
  const lastWeek = addDays(weekStartOf(today), -7);
  const monthStart = `${today.slice(0, 7)}-01`;
  return { from: lastWeek < monthStart ? lastWeek : monthStart, to: today };
}

/** Days before the window read to find where a run of days without a holiday began. */
const RUN_LOOKBACK_DAYS = 28;
/** People checked at a time, to keep a large workforce's days out of memory at once. */
const BATCH = 400;

const min = (a: IsoDate, b: IsoDate) => (a < b ? a : b);
const max = (a: IsoDate, b: IsoDate) => (a > b ? a : b);
const keyOf = (kind: string, employeeId: string, periodStart: string) =>
  `${kind}|${employeeId}|${periodStart}`;

interface Person {
  id: string;
  fullName: string;
  fullNameBn: string | null;
  dateOfBirth: IsoDate;
  gender: (typeof employees.$inferSelect)['gender'];
  nightWorkConsentFrom: IsoDate | null;
  joinedOn: IsoDate;
  separatedOn: IsoDate | null;
  workplace: WorkplaceKind;
  timeZone: string;
  managerId: string | null;
}

interface Row {
  kind: WorkerAlertKind;
  employeeId: string;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  value: number;
  limit: number;
  detail: WorkerAlertDetail;
}

/**
 * The working-time check: reads processed attendance and adolescents' certificates, and
 * keeps one alert per person, kind and period. Re-running it refreshes values, keeps what HR
 * acknowledged, resolves what no longer holds, and tells people only about new alerts.
 * Committee alerts in the same table are never touched here.
 */
@Injectable()
export class ComplianceCheckService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly notifications: NotificationsService,
  ) {}

  run(range: { from: IsoDate; to: IsoDate }, employeeIds?: string[]) {
    return this.tenantDb.run((tx) => this.check(tx, range, employeeIds));
  }

  async check(
    tx: Tx,
    range: { from: IsoDate; to: IsoDate },
    employeeIds?: string[],
  ): Promise<ComplianceCheckResult> {
    const from = range.from;
    const to = min(range.to, todayIn());
    const result = { from, to, people: 0, raised: 0, updated: 0, resolved: 0, notified: 0 };
    if (from > to || employeeIds?.length === 0) return result;
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('compliance'), hashtext(${currentTenantId()}))`,
    );
    const caps = capsOf(await settingsOf(tx));
    const people = await this.peopleOf(tx, from, to, employeeIds);
    result.people = people.length;
    const hr = await usersWith(tx, 'compliance.manage');

    // Certificates are judged as of today only; an old range says nothing about them now.
    const certificates = to === todayIn();

    for (let i = 0; i < people.length; i += BATCH) {
      const batch = people.slice(i, i + BATCH);
      const rows = [
        ...(await this.hoursFindings(tx, batch, from, to, caps)),
        ...(certificates ? await this.certificateFindings(tx, batch, to) : []),
      ];
      const saved = await this.save(tx, rows);
      result.raised += saved.filter((s) => s.inserted).length;
      result.updated += saved.filter((s) => !s.inserted).length;
      result.resolved += await this.resolve(tx, batch, rows, { from, to, certificates });

      const byId = new Map(batch.map((p) => [p.id, p]));
      for (const alert of saved.filter((s) => s.inserted)) {
        const person = byId.get(alert.employeeId)!;
        const text = alertText(alert, {
          en: person.fullName,
          bn: person.fullNameBn ?? person.fullName,
        });
        result.notified += await this.notifications.notify(tx, {
          event: 'compliance.alert',
          recipients: [...hr, ...(person.managerId ? [{ employeeId: person.managerId }] : [])],
          values: { 'alert.headline': text.headline, 'alert.detail': text.detail },
          link: `/workspace/compliance/alerts?employee=${person.id}`,
          dedupeKey: `compliance.alert:${alert.id}`,
          data: { alertId: alert.id, employeeId: person.id, kind: alert.kind },
        });
      }
    }
    return result;
  }

  /** Everyone employed at some point in the range, with their workplace at its end. */
  private async peopleOf(
    tx: Tx,
    from: IsoDate,
    to: IsoDate,
    employeeIds?: string[],
  ): Promise<Person[]> {
    const rows = await tx
      .select({
        id: employees.id,
        fullName: employees.fullName,
        fullNameBn: employees.fullNameBn,
        dateOfBirth: employees.dateOfBirth,
        gender: employees.gender,
        nightWorkConsentFrom: employees.nightWorkConsentFrom,
        joinedOn: employees.joinedOn,
        separatedOn: employees.separatedOn,
      })
      .from(employees)
      .where(
        and(
          employeeIds ? inArray(employees.id, employeeIds) : undefined,
          lte(employees.joinedOn, to),
          or(isNull(employees.separatedOn), gte(employees.separatedOn, from)),
        ),
      );
    // The latest job started by the range's end: a leaver keeps the workplace they left.
    const jobs = await tx
      .select({
        employeeId: jobAssignments.employeeId,
        managerId: jobAssignments.managerId,
        kind: locations.kind,
        timeZone: locations.timeZone,
      })
      .from(jobAssignments)
      .leftJoin(locations, eq(locations.id, jobAssignments.locationId))
      .where(
        and(
          employeeIds ? inArray(jobAssignments.employeeId, employeeIds) : undefined,
          lte(jobAssignments.effectiveFrom, to),
        ),
      )
      .orderBy(desc(jobAssignments.effectiveFrom));
    const jobOf = new Map<string, (typeof jobs)[number]>();
    for (const job of jobs) if (!jobOf.has(job.employeeId)) jobOf.set(job.employeeId, job);
    return rows.map((r) => {
      const job = jobOf.get(r.id);
      return {
        ...r,
        workplace: job?.kind === 'factory' ? 'factory' : 'other',
        timeZone: job?.timeZone ?? 'Asia/Dhaka',
        managerId: job?.managerId ?? null,
      };
    });
  }

  /** Hours findings whose period overlaps the range, each judged on its whole period. */
  private async hoursFindings(
    tx: Tx,
    people: Person[],
    from: IsoDate,
    to: IsoDate,
    caps: OvertimeCaps,
  ): Promise<Row[]> {
    const readFrom = min(
      min(weekStartOf(from), monthBounds(from.slice(0, 7)).start),
      addDays(from, -RUN_LOOKBACK_DAYS),
    );
    const readTo = max(addDays(weekStartOf(to), 6), monthBounds(to.slice(0, 7)).end);
    const days = await tx
      .select({
        employeeId: attendanceDays.employeeId,
        date: attendanceDays.date,
        firstIn: attendanceDays.firstIn,
        lastOut: attendanceDays.lastOut,
        workedMinutes: attendanceDays.workedMinutes,
        overtimeMinutes: attendanceDays.overtimeMinutes,
      })
      .from(attendanceDays)
      .where(
        and(
          inArray(
            attendanceDays.employeeId,
            people.map((p) => p.id),
          ),
          gte(attendanceDays.date, readFrom),
          lte(attendanceDays.date, readTo),
        ),
      );
    const daysOf = new Map<string, CheckDay[]>();
    for (const d of days) {
      const list = daysOf.get(d.employeeId) ?? [];
      list.push(d);
      daysOf.set(d.employeeId, list);
    }
    return people.flatMap((person) =>
      checkPerson(person, daysOf.get(person.id) ?? [], caps)
        .filter((f) => f.periodEnd >= from && f.periodStart <= to)
        .map((f) => ({ ...f, employeeId: person.id })),
    );
  }

  /** s.37: an adolescent at work on `on` needs a certificate of fitness in force. */
  private async certificateFindings(tx: Tx, people: Person[], on: IsoDate): Promise<Row[]> {
    const minors = people.filter(
      (p) =>
        p.joinedOn <= on &&
        (p.separatedOn === null || p.separatedOn >= on) &&
        isAdolescent(p.dateOfBirth, on),
    );
    if (minors.length === 0) return [];
    const rule = ruleOn(BD_RULES, 'adolescent.fitness_certificate_months', on);
    const minAge = ruleOn(BD_RULES, 'adolescent.min_age', on).value;
    const statuses = await certificatesOf(
      tx,
      minors.map((p) => p.id),
      on,
    );
    const rows: Row[] = [];
    for (const person of minors) {
      const status = statuses.get(person.id)!;
      if (status.state !== 'missing' && status.state !== 'expired') continue;
      const since =
        status.state === 'expired'
          ? addDays(status.validUntil!, 1)
          : max(person.joinedOn, addMonths(person.dateOfBirth, minAge * 12));
      rows.push({
        kind: 'adolescent_certificate',
        employeeId: person.id,
        periodStart: since,
        periodEnd: on,
        value: daysInclusive(since, on),
        limit: 0,
        detail: {
          reference: rule.reference,
          rule: rule.key,
          age: ageOn(person.dateOfBirth, on),
          certificate: {
            reason: status.state,
            documentId: status.doc?.id ?? null,
            expiredOn: status.validUntil,
          },
        },
      });
    }
    return rows;
  }

  /** Inserts new alerts and refreshes changed ones, reopening any resolved before. */
  private async save(tx: Tx, rows: Row[]) {
    const saved: (Row & { id: string; inserted: boolean })[] = [];
    const a = complianceAlerts;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const written = await tx
        .insert(a)
        .values(chunk.map((r) => ({ tenantId: currentTenantId(), subjectId: r.employeeId, ...r })))
        .onConflictDoUpdate({
          target: [a.tenantId, a.kind, a.subjectId, a.periodStart],
          set: {
            periodEnd: sql`excluded.period_end`,
            value: sql`excluded.value`,
            limit: sql`excluded.limit`,
            detail: sql`excluded.detail`,
            // What HR acknowledged stays acknowledged, even after it was resolved and came back.
            status: sql`case when ${a.status} <> 'resolved' then ${a.status}
              when ${a.acknowledgedAt} is not null then 'acknowledged' else 'open' end`,
            updatedAt: new Date(),
          },
          setWhere: sql`${a.status} = 'resolved'
            or ${a.value} <> excluded.value or ${a.limit} <> excluded.limit
            or ${a.periodEnd} <> excluded.period_end
            or ${a.detail} is distinct from excluded.detail`,
        })
        .returning({
          id: a.id,
          kind: a.kind,
          periodStart: a.periodStart,
          subjectId: a.subjectId,
          inserted: sql<boolean>`(xmax = 0)`,
        });
      const byKey = new Map(chunk.map((r) => [keyOf(r.kind, r.employeeId, r.periodStart), r]));
      for (const w of written) {
        const row = byKey.get(keyOf(w.kind, w.subjectId, w.periodStart))!;
        saved.push({ ...row, id: w.id, inserted: w.inserted });
      }
    }
    return saved;
  }

  /**
   * Worker alerts of these people that the data no longer bears out (hours corrected, consent
   * recorded, a certificate uploaded, the 18th birthday passed) are resolved.
   */
  private async resolve(
    tx: Tx,
    people: Person[],
    rows: Row[],
    scope: { from: IsoDate; to: IsoDate; certificates: boolean },
  ) {
    const found = new Set(rows.map((r) => keyOf(r.kind, r.employeeId, r.periodStart)));
    const a = complianceAlerts;
    const candidates = await tx
      .select({ id: a.id, kind: a.kind, employeeId: a.employeeId, periodStart: a.periodStart })
      .from(a)
      .where(
        and(
          inArray(
            a.employeeId,
            people.map((p) => p.id),
          ),
          ne(a.status, 'resolved'),
          or(
            scope.certificates ? eq(a.kind, 'adolescent_certificate') : undefined,
            and(
              inArray(a.kind, [...HOURS_ALERT_KINDS, 'no_weekly_holiday']),
              gte(a.periodEnd, scope.from),
              lte(a.periodStart, scope.to),
            ),
          ),
        ),
      );
    const stale = candidates
      .filter((c) => !found.has(keyOf(c.kind, c.employeeId!, c.periodStart)))
      .map((c) => c.id);
    if (stale.length === 0) return 0;
    await tx
      .update(a)
      .set({ status: 'resolved', updatedAt: new Date() })
      .where(inArray(a.id, stale));
    return stale.length;
  }
}
