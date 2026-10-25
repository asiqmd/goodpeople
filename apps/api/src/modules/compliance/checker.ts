import {
  BD_RULES,
  ruleOn,
  type BdRules,
  type ClockWindow,
  type WorkplaceKind,
} from '@gp/country-packs';
import {
  addDays,
  addMonths,
  ageOn,
  CERTIFICATE_WARN_DAYS,
  groupBy,
  localParts,
  minutesOfDay,
  monthBounds,
  weekdayOf,
  zonedInstant,
  type CertificateState,
  type Gender,
  type HoursAlertKind,
  type IsoDate,
  type WorkerAlertDetail,
  type WorkingTimeLaw,
} from '@gp/shared';

// The working-time check, pure: one person's processed attendance days against the Labour
// Act's limits in force on each date and the company's overtime caps. Alerts only report;
// every minute worked is still paid (s.108).

export interface CheckPerson {
  dateOfBirth: IsoDate;
  gender: Gender;
  /** A woman's written consent to work at night, in force from this day (s.109). */
  nightWorkConsentFrom: IsoDate | null;
  /** Factories and mines have shorter adolescent hours than other establishments (s.41). */
  workplace: WorkplaceKind;
  timeZone: string;
}

export interface CheckDay {
  date: IsoDate;
  firstIn: Date | null;
  lastOut: Date | null;
  workedMinutes: number;
  overtimeMinutes: number;
}

export interface OvertimeCaps {
  dailyMinutes: number;
  weeklyMinutes: number;
  monthlyMinutes: number | null;
}

export type FindingKind = HoursAlertKind | 'no_weekly_holiday';

export interface Finding {
  kind: FindingKind;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  value: number;
  limit: number;
  detail: WorkerAlertDetail;
}

/** Weeks run Saturday to Friday, the usual working week in Bangladesh. */
export const weekStartOf = (date: IsoDate) => addDays(date, -((weekdayOf(date) + 1) % 7));

export const isAdolescent = (dateOfBirth: IsoDate, on: IsoDate) =>
  ageOn(dateOfBirth, on) < ruleOn(BD_RULES, 'adolescent.adult_age', on).value;

/** A day someone came to work, even when a missing punch leaves the hours unknown. */
const attended = (day: CheckDay) => day.workedMinutes > 0 || day.firstIn !== null;

const clock = (at: Date | null, timeZone: string) => (at ? localParts(at, timeZone).time : null);

/** Minutes of [start, end) that fall inside a daily clock window, in a time zone. */
export function minutesInWindow(
  start: Date,
  end: Date,
  window: ClockWindow,
  timeZone: string,
): number {
  if (end <= start) return 0;
  const crossesMidnight = minutesOfDay(window.to) <= minutesOfDay(window.from);
  const last = localParts(end, timeZone).date;
  let total = 0;
  for (let d = addDays(localParts(start, timeZone).date, -1); d <= last; d = addDays(d, 1)) {
    const from = zonedInstant(d, window.from, timeZone).getTime();
    const to = zonedInstant(crossesMidnight ? addDays(d, 1) : d, window.to, timeZone).getTime();
    total += Math.max(0, Math.min(end.getTime(), to) - Math.max(start.getTime(), from));
  }
  return Math.floor(total / 60_000);
}

const sum = (days: CheckDay[], pick: (d: CheckDay) => number) =>
  days.reduce((n, d) => n + pick(d), 0);

/**
 * Everything one person's days break, per kind and period: days, Saturday-to-Friday weeks,
 * calendar months and runs of days without a holiday. Periods are whole: pass every day of
 * each week and month to be judged (and a few weeks before, for runs).
 */
export function checkPerson(person: CheckPerson, days: CheckDay[], caps: OvertimeCaps): Finding[] {
  const sorted = days.toSorted((a, b) => a.date.localeCompare(b.date));
  const findings: Finding[] = [];
  const add = (f: Finding) => findings.push(f);
  const young = (d: CheckDay) => isAdolescent(person.dateOfBirth, d.date);
  const age = (on: IsoDate) => ageOn(person.dateOfBirth, on);
  const { workplace, timeZone } = person;

  for (const day of sorted) {
    const { date } = day;
    const times = { firstIn: clock(day.firstIn, timeZone), lastOut: clock(day.lastOut, timeZone) };
    if (young(day)) {
      // s.41: adolescents' own daily limit replaces the adult one.
      const rule = ruleOn(BD_RULES, 'adolescent.daily_hours', date);
      const limit = rule.value[workplace] * 60;
      if (day.workedMinutes > limit) {
        add({
          kind: 'adolescent_daily',
          periodStart: date,
          periodEnd: date,
          value: day.workedMinutes,
          limit,
          detail: {
            reference: rule.reference,
            rule: rule.key,
            workplace,
            age: age(date),
            ...times,
          },
        });
      }
    } else {
      const rule = ruleOn(BD_RULES, 'work.daily_max_hours_with_overtime', date);
      if (day.workedMinutes > rule.value * 60) {
        add({
          kind: 'daily_hours',
          periodStart: date,
          periodEnd: date,
          value: day.workedMinutes,
          limit: rule.value * 60,
          detail: { reference: rule.reference, rule: rule.key, ...times },
        });
      }
    }
    if (day.overtimeMinutes > caps.dailyMinutes) {
      add({
        kind: 'overtime_daily',
        periodStart: date,
        periodEnd: date,
        value: day.overtimeMinutes,
        limit: caps.dailyMinutes,
        detail: { reference: null, rule: null, ...times },
      });
    }

    if (!day.firstIn || !day.lastOut) continue;
    if (young(day)) {
      const rule = ruleOn(BD_RULES, 'adolescent.no_work_between', date);
      const inside = minutesInWindow(day.firstIn, day.lastOut, rule.value, timeZone);
      if (inside > 0) {
        add({
          kind: 'adolescent_night',
          periodStart: date,
          periodEnd: date,
          value: inside,
          limit: 0,
          detail: {
            reference: rule.reference,
            rule: rule.key,
            age: age(date),
            window: rule.value,
            ...times,
          },
        });
      }
    } else if (person.gender === 'female') {
      // An adolescent girl is covered, more strictly, by the adolescent night rule.
      const consented = person.nightWorkConsentFrom !== null && person.nightWorkConsentFrom <= date;
      const rule = ruleOn(BD_RULES, 'women.night_work_needs_consent', date);
      const inside = consented
        ? 0
        : minutesInWindow(day.firstIn, day.lastOut, rule.value, timeZone);
      if (inside > 0) {
        add({
          kind: 'women_night',
          periodStart: date,
          periodEnd: date,
          value: inside,
          limit: 0,
          detail: { reference: rule.reference, rule: rule.key, window: rule.value, ...times },
        });
      }
    }
  }

  const weeks = groupBy(sorted, (d) => weekStartOf(d.date));
  for (const [start, week] of weeks) {
    const end = addDays(start, 6);
    const adults = week.filter((d) => !young(d));
    const minors = week.filter(young);
    const adultRule = ruleOn(BD_RULES, 'work.weekly_max_hours_with_overtime', start);
    const adultWorked = sum(adults, (d) => d.workedMinutes);
    if (adultWorked > adultRule.value * 60) {
      add({
        kind: 'weekly_hours',
        periodStart: start,
        periodEnd: end,
        value: adultWorked,
        limit: adultRule.value * 60,
        detail: {
          reference: adultRule.reference,
          rule: adultRule.key,
          daysWorked: adults.filter(attended).length,
        },
      });
    }
    const minorRule = ruleOn(BD_RULES, 'adolescent.weekly_max_hours_with_overtime', start);
    const minorWorked = sum(minors, (d) => d.workedMinutes);
    if (minorWorked > minorRule.value[workplace] * 60) {
      add({
        kind: 'adolescent_weekly',
        periodStart: start,
        periodEnd: end,
        value: minorWorked,
        limit: minorRule.value[workplace] * 60,
        detail: {
          reference: minorRule.reference,
          rule: minorRule.key,
          workplace,
          age: age(start),
          daysWorked: minors.filter(attended).length,
        },
      });
    }
    const overtime = sum(week, (d) => d.overtimeMinutes);
    if (overtime > caps.weeklyMinutes) {
      add({
        kind: 'overtime_weekly',
        periodStart: start,
        periodEnd: end,
        value: overtime,
        limit: caps.weeklyMinutes,
        detail: { reference: null, rule: null, daysWorked: week.filter(attended).length },
      });
    }
  }

  if (caps.monthlyMinutes !== null) {
    for (const [month, inMonth] of groupBy(sorted, (d) => d.date.slice(0, 7))) {
      const overtime = sum(inMonth, (d) => d.overtimeMinutes);
      if (overtime <= caps.monthlyMinutes) continue;
      const { start, end } = monthBounds(month);
      add({
        kind: 'overtime_monthly',
        periodStart: start,
        periodEnd: end,
        value: overtime,
        limit: caps.monthlyMinutes,
        detail: { reference: null, rule: null, daysWorked: inMonth.filter(attended).length },
      });
    }
  }

  // s.103: a weekly holiday, so at most 7 − 1 days in a row. A date with no processed day
  // (not tracked yet) breaks a run like a day off.
  let run: CheckDay[] = [];
  const closeRun = () => {
    const first = run[0];
    if (!first) return;
    const rule = ruleOn(BD_RULES, 'holidays.weekly.min_days', first.date);
    const limit = 7 - Math.ceil(rule.value);
    if (run.length > limit) {
      add({
        kind: 'no_weekly_holiday',
        periodStart: first.date,
        periodEnd: run.at(-1)!.date,
        value: run.length,
        limit,
        detail: { reference: rule.reference, rule: rule.key, daysWorked: run.length },
      });
    }
    run = [];
  };
  for (const day of sorted) {
    const previous = run.at(-1);
    if (previous && (!attended(day) || addDays(previous.date, 1) !== day.date)) closeRun();
    if (attended(day)) run.push(day);
  }
  closeRun();

  return findings;
}

// ── Certificates of fitness (s.37) ───────────────────────────────────────────

export interface CertificateDoc {
  id: string;
  title: string;
  issuedOn: IsoDate | null;
  expiresOn: IsoDate | null;
  uploadedOn: IsoDate;
}

/** The last day a certificate is valid: its expiry date, else 12 months from its upload. */
export function certificateValidUntil(doc: CertificateDoc, months: number): IsoDate {
  return doc.expiresOn ?? addDays(addMonths(doc.uploadedOn, months), -1);
}

export interface CertificateStatus {
  state: CertificateState;
  /** The certificate in force, else the one that lapsed last. */
  doc: CertificateDoc | null;
  validUntil: IsoDate | null;
}

/** Whether someone has a certificate in force on a date, and how soon it lapses. */
export function certificateOn(
  docs: CertificateDoc[],
  on: IsoDate,
  months: number,
): CertificateStatus {
  const dated = docs
    .map((doc) => ({ doc, until: certificateValidUntil(doc, months) }))
    .filter(({ doc }) => (doc.issuedOn ?? doc.uploadedOn) <= on)
    .toSorted((a, b) => b.until.localeCompare(a.until));
  const best = dated[0];
  if (!best) return { state: 'missing', doc: null, validUntil: null };
  const state =
    best.until < on
      ? 'expired'
      : best.until < addDays(on, CERTIFICATE_WARN_DAYS)
        ? 'expiring'
        : 'valid';
  return { state, doc: best.doc, validUntil: best.until };
}

// ── The limits in force ──────────────────────────────────────────────────────

const inMinutes = (hours: Record<WorkplaceKind, number>) => ({
  factory: hours.factory * 60,
  other: hours.other * 60,
});

/** The working-time limits in force on a date, each with the section that sets it. */
export function workingTimeLaw(on: IsoDate): WorkingTimeLaw {
  const rule = <K extends keyof BdRules & string>(key: K) => ruleOn(BD_RULES, key, on);
  const daily = rule('work.daily_hours');
  const dailyMax = rule('work.daily_max_hours_with_overtime');
  const weekly = rule('work.weekly_hours');
  const weeklyMax = rule('work.weekly_max_hours_with_overtime');
  const holiday = rule('holidays.weekly.min_days');
  const minorDaily = rule('adolescent.daily_hours');
  const minorWeekly = rule('adolescent.weekly_max_hours_with_overtime');
  const minorNight = rule('adolescent.no_work_between');
  const certificate = rule('adolescent.fitness_certificate_months');
  const women = rule('women.night_work_needs_consent');
  return {
    adultDaily: { minutes: dailyMax.value * 60, reference: dailyMax.reference },
    adultWeekly: { minutes: weeklyMax.value * 60, reference: weeklyMax.reference },
    overtimeDaily: {
      minutes: (dailyMax.value - daily.value) * 60,
      reference: dailyMax.reference,
    },
    overtimeWeekly: {
      minutes: (weeklyMax.value - weekly.value) * 60,
      reference: weeklyMax.reference,
    },
    weeklyHoliday: { days: holiday.value, reference: holiday.reference },
    adolescentDaily: { ...inMinutes(minorDaily.value), reference: minorDaily.reference },
    adolescentWeekly: { ...inMinutes(minorWeekly.value), reference: minorWeekly.reference },
    adolescentNight: { ...minorNight.value, reference: minorNight.reference },
    adolescentCertificate: { months: certificate.value, reference: certificate.reference },
    womenNight: { ...women.value, reference: women.reference },
  };
}
