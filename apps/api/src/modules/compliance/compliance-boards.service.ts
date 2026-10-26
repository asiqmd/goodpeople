import { Injectable, NotFoundException } from '@nestjs/common';
import { BD_RULES, ruleOn } from '@gp/country-packs';
import {
  attendanceDays,
  complianceAlerts,
  employees,
  jobAssignments,
  locations,
  type Tx,
} from '@gp/db';
import {
  addDays,
  addMonths,
  ageOn,
  todayIn,
  type AdolescentsView,
  type HoursBoardQuery,
  type HoursBoardRow,
  type HoursBoardView,
  type HoursLevel,
  type IsoDate,
  type NightConsentInput,
  type NightWorkQuery,
  type NightWorkRow,
  type NightWorkView,
} from '@gp/shared';
import {
  and,
  count,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lte,
  max,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest } from '../../common/errors.js';
import { TenantDb } from '../../db/db.module.js';
import { keepVisible, mustChangeEmployee } from '../access-scopes/employee-scope.js';
import { entityScope } from '../access-scopes/entity-scope.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { employeeRef } from '../attendance/attendance-views.js';
import { employeesInUnits, inForceOn, unitAndBelow } from '../employees/employee.queries.js';
import { isAdolescent, minutesInWindow, weekStartOf, workingTimeLaw } from './checker.js';
import {
  capsOf,
  ComplianceCheckService,
  recentWindow,
  settingsOf,
} from './compliance-check.service.js';
import { adolescentsOn, certificatesOf, unknownWorkplace, workplacesOn } from './people.js';
import { PolicyService } from '../group/policy.service.js';

const NIGHT_DAYS = 30;
/** Retroactive consent clears alerts this far back at most, as a check covers 93 days. */
const RECHECK_MAX_DAYS = 92;

const minDate = (a: IsoDate, b: IsoDate) => (a < b ? a : b);

/** A share of a limit in percent; anything over a zero cap counts as over it. */
const share = (value: number, limit: number) =>
  limit > 0 ? (value / limit) * 100 : value > 0 ? 101 : 0;

/** The hours board, adolescents and women at night: what HR watches between alerts. */
@Injectable()
export class ComplianceBoardsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
    private readonly check: ComplianceCheckService,
    private readonly policy: PolicyService,
  ) {}

  /**
   * One week's hours so far per worker against the law and the company's caps, from the same
   * processed days that pay them: there is no other set of hours.
   */
  hours(user: AuthUser, query: HoursBoardQuery): Promise<HoursBoardView> {
    return this.tenantDb.run(async (tx) => {
      const today = todayIn();
      const weekStart = weekStartOf(query.week ?? today);
      const weekEnd = addDays(weekStart, 6);
      const asOf = minDate(weekEnd, today);
      const month = asOf.slice(0, 7);
      const settings = await settingsOf(tx);
      const law = workingTimeLaw(weekStart);
      const units = query.orgUnitId ? await unitAndBelow(tx, query.orgUnitId) : null;
      const readFrom = minDate(weekStart, `${month}-01`);
      const scope = await entityScope(tx, user, employees.id);
      const days = await tx
        .select({
          employeeId: attendanceDays.employeeId,
          date: attendanceDays.date,
          workedMinutes: attendanceDays.workedMinutes,
          overtimeMinutes: attendanceDays.overtimeMinutes,
          firstIn: attendanceDays.firstIn,
          employee: {
            id: employees.id,
            employeeCode: employees.employeeCode,
            fullName: employees.fullName,
            fullNameBn: employees.fullNameBn,
            dateOfBirth: employees.dateOfBirth,
          },
        })
        .from(attendanceDays)
        .innerJoin(employees, eq(employees.id, attendanceDays.employeeId))
        .where(
          and(
            scope,
            units
              ? inArray(attendanceDays.employeeId, employeesInUnits(tx, units, asOf))
              : undefined,
            gte(attendanceDays.date, readFrom),
            lte(attendanceDays.date, weekEnd),
          ),
        );
      const inWeek = days.filter((d) => d.date >= weekStart);
      const people = [...new Map(inWeek.map((d) => [d.employeeId, d.employee])).values()];
      const places = await workplacesOn(
        tx,
        people.map((p) => p.id),
        asOf,
      );
      // Each person against their own company's caps.
      const policies = await this.policy.forEmployees(
        tx,
        'overtime_caps',
        settings,
        people.map((p) => p.id),
        asOf,
      );

      const rows: HoursBoardRow[] = [];
      for (const person of people) {
        const week = inWeek.filter((d) => d.employeeId === person.id);
        const worked = week.reduce((n, d) => n + d.workedMinutes, 0);
        if (worked === 0) continue;
        const overtime = week.reduce((n, d) => n + d.overtimeMinutes, 0);
        const longest = Math.max(...week.map((d) => d.workedMinutes));
        const longestOvertime = Math.max(...week.map((d) => d.overtimeMinutes));
        const monthOvertime = days
          .filter((d) => d.employeeId === person.id && d.date.startsWith(month) && d.date <= asOf)
          .reduce((n, d) => n + d.overtimeMinutes, 0);
        const caps = capsOf(policies.get(person.id)!);
        const place = places.get(person.id) ?? unknownWorkplace;
        const adolescent = isAdolescent(person.dateOfBirth, asOf);
        const weeklyLimit = adolescent
          ? law.adolescentWeekly[place.workplace]
          : law.adultWeekly.minutes;
        const dailyLimit = adolescent
          ? law.adolescentDaily[place.workplace]
          : law.adultDaily.minutes;
        const checks: [number, number | null][] = [
          [worked, weeklyLimit],
          [longest, dailyLimit],
          [overtime, caps.weeklyMinutes],
          [longestOvertime, caps.dailyMinutes],
          [monthOvertime, caps.monthlyMinutes],
        ];
        const measured = checks.filter((c): c is [number, number] => c[1] !== null);
        const percent = Math.round(Math.max(...measured.map(([v, l]) => share(v, l))));
        const level: HoursLevel = measured.some(([v, l]) => v > l)
          ? 'over'
          : percent >= settings.warnAtPercent
            ? 'warn'
            : 'ok';
        rows.push({
          employee: employeeRef(person),
          orgUnit: place.orgUnit,
          adolescent,
          workplace: place.workplace,
          daysWorked: week.filter((d) => d.workedMinutes > 0 || d.firstIn !== null).length,
          workedMinutes: worked,
          overtimeMinutes: overtime,
          longestDayMinutes: longest,
          monthOvertimeMinutes: monthOvertime,
          weeklyLimitMinutes: weeklyLimit,
          percent,
          level,
        });
      }
      rows.sort(
        (a, b) => b.percent - a.percent || a.employee.fullName.localeCompare(b.employee.fullName),
      );
      // The group's caps for the heading; a row is measured against its company's.
      const caps = capsOf(settings);
      return {
        weekStart,
        weekEnd,
        month,
        warnAtPercent: settings.warnAtPercent,
        caps: {
          daily: caps.dailyMinutes,
          weekly: caps.weeklyMinutes,
          monthly: caps.monthlyMinutes,
        },
        law,
        rows,
      };
    });
  }

  /** Adolescents at work: their age, certificate of fitness and this week's hours (s.34–41). */
  adolescents(user: AuthUser): Promise<AdolescentsView> {
    return this.tenantDb.run(async (tx) => {
      const today = todayIn();
      const weekStart = weekStartOf(today);
      const weekEnd = addDays(weekStart, 6);
      const law = workingTimeLaw(today);
      const adultAge = ruleOn(BD_RULES, 'adolescent.adult_age', today).value;
      const minors = await keepVisible(
        tx,
        await entityScope(tx, user, employees.id),
        await adolescentsOn(tx, today),
      );
      const ids = minors.map((m) => m.id);
      // One query at a time: they share the transaction's connection.
      const places = await workplacesOn(tx, ids, today);
      const certificates = await certificatesOf(tx, ids, today);
      const week = ids.length
        ? await tx
            .select({
              employeeId: attendanceDays.employeeId,
              worked: sql<number>`sum(${attendanceDays.workedMinutes})::int`,
            })
            .from(attendanceDays)
            .where(
              and(
                inArray(attendanceDays.employeeId, ids),
                gte(attendanceDays.date, weekStart),
                lte(attendanceDays.date, weekEnd),
              ),
            )
            .groupBy(attendanceDays.employeeId)
        : [];
      const open = await this.openAlerts(tx, ids);
      return {
        weekStart,
        weekEnd,
        law,
        rows: minors.map((m) => {
          const place = places.get(m.id) ?? unknownWorkplace;
          const certificate = certificates.get(m.id)!;
          return {
            employee: employeeRef(m),
            dateOfBirth: m.dateOfBirth,
            age: ageOn(m.dateOfBirth, today),
            adultOn: addMonths(m.dateOfBirth, adultAge * 12),
            workplace: place.workplace,
            location: place.location,
            certificate: {
              state: certificate.state,
              documentId: certificate.doc?.id ?? null,
              title: certificate.doc?.title ?? null,
              validUntil: certificate.validUntil,
            },
            weekWorkedMinutes: week.find((w) => w.employeeId === m.id)?.worked ?? 0,
            weekLimitMinutes: law.adolescentWeekly[place.workplace],
            dailyLimitMinutes: law.adolescentDaily[place.workplace],
            openAlerts: open.get(m.id) ?? 0,
          };
        }),
      };
    });
  }

  /**
   * Women and night work (s.109): those with consent on record, those who worked at night in
   * the last 30 days or have an open alert for it, or anyone found by name or code.
   */
  nightWork(user: AuthUser, query: NightWorkQuery): Promise<NightWorkView> {
    return this.tenantDb.run(async (tx) => {
      const today = todayIn();
      const since = addDays(today, -(NIGHT_DAYS - 1));
      const law = workingTimeLaw(today);
      const adultAge = ruleOn(BD_RULES, 'adolescent.adult_age', today).value;
      const women = and(
        eq(employees.status, 'active'),
        eq(employees.gender, 'female'),
        lte(employees.dateOfBirth, addMonths(today, -12 * adultAge)),
        await entityScope(tx, user, employees.id),
      );
      const nights = await this.nightsSince(tx, since, today, law.womenNight);
      let ids: string[];
      if (query.search) {
        const term = `%${query.search}%`;
        ids = (
          await tx
            .select({ id: employees.id })
            .from(employees)
            .where(
              and(women, or(ilike(employees.fullName, term), ilike(employees.employeeCode, term))),
            )
            .limit(50)
        ).map((r) => r.id);
      } else {
        const consenting = await tx
          .select({ id: employees.id })
          .from(employees)
          .where(and(women, isNotNull(employees.nightWorkConsentFrom)));
        const alerted = await tx
          .selectDistinct({ id: complianceAlerts.employeeId })
          .from(complianceAlerts)
          .where(
            and(eq(complianceAlerts.kind, 'women_night'), eq(complianceAlerts.status, 'open')),
          );
        ids = [
          ...new Set([
            ...consenting.map((r) => r.id),
            ...alerted.flatMap((r) => r.id ?? []),
            ...nights.keys(),
          ]),
        ];
      }
      return { since, law, rows: await this.nightRows(tx, ids, today, nights, women) };
    });
  }

  /**
   * Records a woman's written consent to work at night, or clears it, and re-checks her
   * recent nights (from the consent's date, when earlier) so alerts follow at once.
   */
  setNightConsent(
    user: AuthUser,
    employeeId: string,
    input: NightConsentInput,
  ): Promise<NightWorkRow> {
    return this.tenantDb.run(async (tx) => {
      const [employee] = await tx.select().from(employees).where(eq(employees.id, employeeId));
      if (!employee) throw new NotFoundException('Employee not found');
      await mustChangeEmployee(tx, user, employeeId);
      if (employee.gender !== 'female') {
        throw badRequest('consent_women_only', 'Night-work consent is recorded for women (s.109)');
      }
      await tx
        .update(employees)
        .set({ nightWorkConsentFrom: input.consentFrom, updatedAt: new Date() })
        .where(eq(employees.id, employeeId));
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'compliance.night_consent',
        entityType: 'employee',
        entityId: employeeId,
        before: { nightWorkConsentFrom: employee.nightWorkConsentFrom },
        after: { nightWorkConsentFrom: input.consentFrom },
      });
      const today = todayIn();
      const window = recentWindow(today);
      const earliest = addDays(today, -RECHECK_MAX_DAYS);
      const from =
        input.consentFrom && input.consentFrom < window.from ? input.consentFrom : window.from;
      await this.check.check(tx, { from: from < earliest ? earliest : from, to: today }, [
        employeeId,
      ]);
      const since = addDays(today, -(NIGHT_DAYS - 1));
      const nights = await this.nightsSince(tx, since, today, workingTimeLaw(today).womenNight, [
        employeeId,
      ]);
      const [row] = await this.nightRows(tx, [employeeId], today, nights);
      return row!;
    });
  }

  /** Days each woman worked inside the night window, from her punches in local time. */
  private async nightsSince(
    tx: Tx,
    from: IsoDate,
    to: IsoDate,
    window: { from: string; to: string },
    employeeIds?: string[],
  ): Promise<Map<string, IsoDate[]>> {
    const zone = sql`coalesce(${locations.timeZone}, 'Asia/Dhaka')`;
    const local = (column: typeof attendanceDays.firstIn) => sql`(${column} at time zone ${zone})`;
    // A span shorter than a day meets a window over midnight exactly when it starts before
    // the window ends, ends after it starts, or crosses midnight; the exact minutes follow.
    const rows = await tx
      .select({
        employeeId: attendanceDays.employeeId,
        date: attendanceDays.date,
        firstIn: attendanceDays.firstIn,
        lastOut: attendanceDays.lastOut,
        timeZone: locations.timeZone,
      })
      .from(attendanceDays)
      .innerJoin(employees, eq(employees.id, attendanceDays.employeeId))
      .leftJoin(
        jobAssignments,
        and(eq(jobAssignments.employeeId, attendanceDays.employeeId), inForceOn(to)),
      )
      .leftJoin(locations, eq(locations.id, jobAssignments.locationId))
      .where(
        and(
          employeeIds ? inArray(attendanceDays.employeeId, employeeIds) : undefined,
          eq(employees.gender, 'female'),
          gte(attendanceDays.date, from),
          lte(attendanceDays.date, to),
          isNotNull(attendanceDays.firstIn),
          isNotNull(attendanceDays.lastOut),
          or(
            sql`${local(attendanceDays.firstIn)}::time < ${window.to}::time`,
            sql`${local(attendanceDays.lastOut)}::time > ${window.from}::time`,
            sql`${local(attendanceDays.lastOut)}::date > ${local(attendanceDays.firstIn)}::date`,
          ),
        ),
      );
    const nights = new Map<string, IsoDate[]>();
    for (const r of rows) {
      const inside = minutesInWindow(r.firstIn!, r.lastOut!, window, r.timeZone ?? 'Asia/Dhaka');
      if (inside === 0) continue;
      nights.set(r.employeeId, [...(nights.get(r.employeeId) ?? []), r.date]);
    }
    return nights;
  }

  private async nightRows(
    tx: Tx,
    candidates: string[],
    today: IsoDate,
    nights: Map<string, IsoDate[]>,
    only?: SQL,
  ): Promise<NightWorkRow[]> {
    if (candidates.length === 0) return [];
    const people = await tx
      .select()
      .from(employees)
      .where(and(only, inArray(employees.id, candidates)))
      .orderBy(employees.fullName);
    const ids = people.map((p) => p.id);
    const places = await workplacesOn(tx, ids, today);
    const open = await this.openAlerts(tx, ids, 'women_night');
    const last = await tx
      .select({ employeeId: complianceAlerts.employeeId, at: max(complianceAlerts.periodStart) })
      .from(complianceAlerts)
      .where(
        and(inArray(complianceAlerts.employeeId, ids), eq(complianceAlerts.kind, 'women_night')),
      )
      .groupBy(complianceAlerts.employeeId);
    return people.map((p) => {
      const worked = (nights.get(p.id) ?? []).toSorted();
      const alerted = last.find((l) => l.employeeId === p.id)?.at ?? null;
      const lastNight = [worked.at(-1), alerted]
        .filter((d): d is string => !!d)
        .toSorted()
        .at(-1);
      return {
        employee: employeeRef(p),
        location: (places.get(p.id) ?? unknownWorkplace).location,
        consentFrom: p.nightWorkConsentFrom,
        nightDays: worked.length,
        lastNight: lastNight ?? null,
        openAlerts: open.get(p.id) ?? 0,
      };
    });
  }

  private async openAlerts(tx: Tx, ids: string[], kind?: 'women_night') {
    if (ids.length === 0) return new Map<string, number>();
    const rows = await tx
      .select({ employeeId: complianceAlerts.employeeId, n: count() })
      .from(complianceAlerts)
      .where(
        and(
          inArray(complianceAlerts.employeeId, ids),
          eq(complianceAlerts.status, 'open'),
          kind ? eq(complianceAlerts.kind, kind) : undefined,
        ),
      )
      .groupBy(complianceAlerts.employeeId);
    return new Map(rows.map((r) => [r.employeeId!, r.n]));
  }
}
