import {
  addMonths,
  daysInclusive,
  Decimal,
  money,
  monthBounds,
  type Gender,
  type GroupFigures,
  type IsoDate,
} from '@gp/shared';

// The group dashboard's figures, pure: people, their jobs and the month's attendance and pay
// in, each company's and the group's figures out. Every figure for a month counts a person
// with the company they worked for at its end (a leaver, with the company they left).

export interface JobStart {
  legalEntityId: string;
  effectiveFrom: IsoDate;
}

/**
 * The company someone works for on a date: their latest job started by then, so a leaver
 * stays with the company they left, or their first job before they start. Jobs oldest first.
 */
export function companyOn(jobs: JobStart[], on: IsoDate): string | null {
  let company = jobs[0]?.legalEntityId ?? null;
  for (const job of jobs) {
    if (job.effectiveFrom > on) break;
    company = job.legalEntityId;
  }
  return company;
}

export interface DashboardPerson {
  id: string;
  gender: Gender;
  joinedOn: IsoDate;
  separatedOn: IsoDate | null;
  /** Oldest first. */
  jobs: JobStart[];
}

/** A person's processed attendance in the month. */
export interface MonthAttendance {
  overtimeMinutes: number;
  /** Working days processed (not still to come). */
  workingDays: number;
  absentDays: number;
}

export interface DashboardInput {
  month: string;
  /** The companies shown, in their order; anyone with another company is left out. */
  companies: string[];
  people: DashboardPerson[];
  attendance: Map<string, MonthAttendance>;
  /** Open compliance alerts per company. */
  alerts: Map<string, number>;
  /** Gross pay and employer cost per person, or null when the viewer may not see pay. */
  pay: Map<string, { gross: string; employerCost: string }> | null;
}

/** The twelve months to `month`, oldest first. */
export const trendMonths = (month: string) =>
  Array.from({ length: 12 }, (_, i) => addMonths(`${month}-01`, i - 11).slice(0, 7));

/** On the books at the end of a day: joined by then and not separated on or before it. */
const onBooks = (p: DashboardPerson, day: IsoDate) =>
  p.joinedOn <= day && (p.separatedOn === null || p.separatedOn > day);

const within = (date: IsoDate | null, from: IsoDate, to: IsoDate) =>
  date !== null && date >= from && date <= to;

const round1 = (n: number) => Math.round(n * 10) / 10;
const percent = (part: number, whole: number) => (whole > 0 ? round1((part / whole) * 100) : null);

interface Tally {
  trend: number[];
  joiners: number;
  leavers: number;
  leaversInYear: number;
  women: number;
  serviceDays: number;
  overtimeMinutes: number;
  workingDays: number;
  absentDays: number;
  alerts: number;
  gross: Decimal;
  employerCost: Decimal;
}

const tally = (): Tally => ({
  trend: Array.from({ length: 12 }, () => 0),
  joiners: 0,
  leavers: 0,
  leaversInYear: 0,
  women: 0,
  serviceDays: 0,
  overtimeMinutes: 0,
  workingDays: 0,
  absentDays: 0,
  alerts: 0,
  gross: new Decimal(0),
  employerCost: new Decimal(0),
});

function figuresOf(t: Tally, payVisible: boolean): GroupFigures {
  const headcount = t.trend.at(-1)!;
  const averageHeadcount = t.trend.reduce((s, n) => s + n, 0) / t.trend.length;
  return {
    headcount,
    joiners: t.joiners,
    leavers: t.leavers,
    attritionPercent: percent(t.leaversInYear, averageHeadcount),
    womenPercent: percent(t.women, headcount),
    averageServiceYears: headcount > 0 ? round1(t.serviceDays / headcount / 365.25) : null,
    overtimeHours: round1(t.overtimeMinutes / 60),
    workingDays: t.workingDays,
    absentDays: t.absentDays,
    absencePercent: percent(t.absentDays, t.workingDays),
    openAlerts: t.alerts,
    payrollCost: payVisible
      ? {
          gross: money(t.gross),
          employerCost: money(t.employerCost),
          total: money(t.gross.plus(t.employerCost)),
        }
      : null,
    trend: t.trend,
  };
}

/** Each company's figures for the month, and the group's: the companies' added together. */
export function dashboardFigures(input: DashboardInput) {
  const months = trendMonths(input.month);
  const ends = months.map((m) => monthBounds(m).end);
  const { start, end } = monthBounds(input.month);
  const yearStart = monthBounds(months[0]!).start;
  const group = tally();
  const byCompany = new Map(input.companies.map((id) => [id, tally()]));
  /** The company's tally and the group's, when the company is shown. */
  const of = (company: string | null) => {
    const t = company === null ? undefined : byCompany.get(company);
    return t ? [t, group] : [];
  };

  for (const p of input.people) {
    ends.forEach((day, i) => {
      if (onBooks(p, day)) for (const t of of(companyOn(p.jobs, day))) t.trend[i]! += 1;
    });
    if (within(p.joinedOn, start, end)) {
      for (const t of of(companyOn(p.jobs, p.joinedOn))) t.joiners += 1;
    }
    if (within(p.separatedOn, yearStart, end)) {
      for (const t of of(companyOn(p.jobs, p.separatedOn!))) {
        t.leaversInYear += 1;
        if (p.separatedOn! >= start) t.leavers += 1;
      }
    }
    const atEnd = of(companyOn(p.jobs, end));
    if (onBooks(p, end)) {
      for (const t of atEnd) {
        if (p.gender === 'female') t.women += 1;
        t.serviceDays += daysInclusive(p.joinedOn, end) - 1;
      }
    }
    const days = input.attendance.get(p.id);
    const pay = input.pay?.get(p.id);
    for (const t of atEnd) {
      if (days) {
        t.overtimeMinutes += days.overtimeMinutes;
        t.workingDays += days.workingDays;
        t.absentDays += days.absentDays;
      }
      if (pay) {
        t.gross = t.gross.plus(pay.gross);
        t.employerCost = t.employerCost.plus(pay.employerCost);
      }
    }
  }
  for (const [company, n] of input.alerts) for (const t of of(company)) t.alerts += n;

  const payVisible = input.pay !== null;
  return {
    months,
    group: figuresOf(group, payVisible),
    companies: new Map([...byCompany].map(([id, t]) => [id, figuresOf(t, payVisible)])),
  };
}
