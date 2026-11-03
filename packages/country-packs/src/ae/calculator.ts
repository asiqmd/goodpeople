import type {
  UaeEmployerInput,
  UaeWorkerInput,
  UaePayrollInput,
  UaePayrollLine,
  UaeSettlementInput,
  UaeResultLine,
  UaePilotResult,
  UaeLeaveInput,
  UaeLeavePreview,
} from '@gp/shared';
import { UAE_PREVIEW_FROM, UAE_RESEARCH_AS_OF } from './manifest.js';

export class UaeBoundaryError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
const block = (code: string): never => {
  throw new UaeBoundaryError(code);
};
export const aedMinor = (value: string) => {
  if (!/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/.test(value)) return block('invalid_aed_amount');
  const [whole, part = ''] = value.split('.');
  return BigInt(whole!) * 100n + BigInt(part.padEnd(2, '0'));
};
export const aedAmount = (value: bigint) =>
  `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`;
const round = (n: bigint, d: bigint) => (n + d / 2n) / d;
const days = (from: string, to: string) =>
  Math.floor((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000) + 1;
const add = (date: string, n: number) =>
  new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const addMonths = (date: string, n: number) => {
  const source = new Date(date + 'T00:00:00Z'),
    day = source.getUTCDate();
  source.setUTCDate(1);
  source.setUTCMonth(source.getUTCMonth() + n);
  const last = new Date(
    Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + 1, 0),
  ).getUTCDate();
  source.setUTCDate(Math.min(day, last));
  return source.toISOString().slice(0, 10);
};
const warning =
  'Unreviewed candidate: no payable, statutory ledger, filing or payment is created. Calendar-day proration, 240-hour overtime basis and actual/365 service need local review.';
export type UaeWorkerContext = UaeWorkerInput & {
  id: string;
  citizenship: string;
  joinedOn: string;
  endedOn: string | null;
};
export function assertUaeEmployer(employer: UaeEmployerInput) {
  if (employer.regime !== 'mohre_federal_private') block('uae_regime_unsupported');
  if (employer.workModel !== 'full_time') block('uae_work_model_unsupported');
  if (employer.endOfService !== 'statutory_gratuity') block('uae_alternative_savings_unsupported');
  if (employer.workingTime !== 'standard') block('uae_working_time_exclusion_requires_review');
  if (employer.dailyMinutes * (7 - employer.weeklyRestDays.length) > 2880)
    block('uae_weekly_hours_exceeded');
}
export function assertUaeCohort(worker: UaeWorkerContext) {
  if (worker.contractTerm !== 'fixed_term' || !worker.contractEndOn)
    block('uae_fixed_term_contract_required');
  if (worker.workLocation !== 'AE_onshore') block('uae_cross_border_work_requires_review');
  if (worker.scheme === 'expatriate_none') {
    // Deliberately bounded pilot cohorts; an unknown classification is never a zero rate.
    if (
      ![
        'BD',
        'IN',
        'PK',
        'NP',
        'LK',
        'PH',
        'GB',
        'US',
        'CA',
        'AU',
        'FR',
        'DE',
        'EG',
        'JO',
      ].includes(worker.citizenship) ||
      worker.authority !== 'none_confirmed' ||
      worker.priorParticipation !== 'none'
    )
      block('uae_expat_coverage_unconfirmed');
    return;
  }
  if (
    !['gpssa_1999', 'gpssa_2023'].includes(worker.scheme) ||
    worker.citizenship !== 'AE' ||
    worker.authority !== 'gpssa' ||
    !worker.firstContributionOn ||
    !worker.contributionSalary ||
    !worker.contributionBasisOn
  )
    block('uae_insurance_cohort_unsupported');
  if (worker.priorParticipation === 'unknown') block('uae_insurance_history_required');
  const older =
    ['law_1999', 'pensioner_1999', 'gratuity_1999'].includes(worker.priorParticipation) ||
    worker.firstContributionOn! < '2023-10-31';
  if ((worker.scheme === 'gpssa_1999') !== older) block('uae_insurance_history_conflict');
  if (worker.scheme === 'gpssa_1999' && worker.priorParticipation === 'law_2023')
    block('uae_insurance_history_conflict');
}
function assertDate(date: string) {
  if (date < UAE_PREVIEW_FROM || date > UAE_RESEARCH_AS_OF)
    block('uae_date_outside_research_snapshot');
}
export function uaeLeaveBands(kind: 'sick' | 'maternity', usedBefore: number, requested: number) {
  const fullLimit = kind === 'sick' ? 15 : 45,
    halfLimit = kind === 'sick' ? 45 : 60,
    totalLimit = kind === 'sick' ? 90 : 60;
  if (
    !Number.isInteger(usedBefore) ||
    !Number.isInteger(requested) ||
    usedBefore < 0 ||
    requested < 0 ||
    usedBefore + requested > totalLimit
  )
    block('uae_leave_limit_exceeded');
  const fullDays = Math.max(
    0,
    Math.min(usedBefore + requested, fullLimit) - Math.min(usedBefore, fullLimit),
  );
  const halfDays = Math.max(
    0,
    Math.min(usedBefore + requested, halfLimit) - Math.max(usedBefore, fullLimit),
  );
  return { fullDays, halfDays, unpaidDays: requested - fullDays - halfDays };
}
export function uaeAnnualFloor(joinedOn: string, onDate: string) {
  if (onDate < joinedOn) block('uae_service_dates_invalid');
  const joined = new Date(joinedOn + 'T00:00:00Z'),
    current = new Date(onDate + 'T00:00:00Z');
  let months =
    (current.getUTCFullYear() - joined.getUTCFullYear()) * 12 +
    current.getUTCMonth() -
    joined.getUTCMonth();
  if (addMonths(joinedOn, months) > onDate) months--;
  const six = new Date(addMonths(joinedOn, 6) + 'T00:00:00Z');
  return {
    completedMonths: months,
    annualDays: months >= 12 ? 30 : current > six ? months * 2 : 0,
    reference: 'FDL 33/2021 art 29; entitlement floor, not a posted accrual balance',
  };
}
export function previewUaeLeave(
  input: UaeLeaveInput,
  employer: UaeEmployerInput,
  worker: UaeWorkerContext,
): UaeLeavePreview {
  assertUaeEmployer(employer);
  assertUaeCohort(worker);
  assertDate(input.onDate);
  if (input.onDate > worker.contractEndOn!) block('uae_contract_renewal_evidence_required');
  if (!input.eligibilityAttested) block('uae_leave_eligibility_attestation_required');
  if (input.onDate < worker.joinedOn || (worker.endedOn && input.onDate > worker.endedOn))
    block('uae_worker_outside_period');
  if (input.kind === 'sick' && !input.probationCompleted)
    block('uae_probation_sick_leave_requires_review');
  const base = {
    mode: 'preview' as const,
    kind: input.kind,
    unit: 'calendar_days' as 'calendar_days' | 'working_days',
    reference: 'FDL 33/2021 arts 29-32; attested scenario only; no entitlement approval',
    postedToLedger: false as const,
  };
  if (input.kind === 'sick' || input.kind === 'maternity')
    return { ...base, ...uaeLeaveBands(input.kind, input.usedBefore, input.requestedDays) };
  let limit: number;
  if (input.kind === 'annual') limit = uaeAnnualFloor(worker.joinedOn, input.onDate).annualDays;
  else if (input.kind === 'parental') {
    if (
      !input.eventDate ||
      input.onDate < input.eventDate ||
      input.onDate > addMonths(input.eventDate, 6)
    )
      block('uae_parental_event_window_required');
    limit = 5;
    base.unit = 'working_days';
  } else if (input.kind === 'study') {
    if (input.onDate < addMonths(worker.joinedOn, 24)) block('uae_study_service_not_met');
    limit = 10;
    base.unit = 'working_days';
  } else {
    if (!input.eventDate || input.onDate !== input.eventDate)
      block('uae_bereavement_event_date_required');
    limit = input.kind === 'bereavement_spouse' ? 5 : 3;
  }
  if (input.usedBefore + input.requestedDays > limit) block('uae_leave_limit_exceeded');
  return { ...base, fullDays: input.requestedDays, halfDays: 0, unpaidDays: 0 };
}
function pension(
  worker: UaeWorkerContext,
  from: string,
  to: string,
  employedDays: number,
  periodDays: number,
  unpaidEquivalent: number,
) {
  assertUaeCohort(worker);
  if (worker.scheme === 'expatriate_none')
    return { employee: 0n, employer: 0n, government: 0n, basis: 0n };
  if (employedDays !== periodDays || unpaidEquivalent > 0)
    block('uae_partial_month_pension_requires_review');
  if (worker.contributionBasisOn! > from || worker.firstContributionOn! > from)
    block('uae_contribution_basis_date_invalid');
  // The old-law private-sector basis is the January or joining-month salary, not this month's wage.
  if (worker.scheme === 'gpssa_1999') {
    const required =
      worker.joinedOn.slice(0, 4) === from.slice(0, 4)
        ? worker.joinedOn
        : from.slice(0, 4) + '-01-01';
    if (worker.contributionBasisOn !== required) block('uae_january_or_joining_basis_required');
  }
  const old = worker.scheme === 'gpssa_1999',
    raw = aedMinor(worker.contributionSalary!);
  const min = old ? 100000n : 300000n,
    max = old ? 5000000n : 7000000n;
  if (raw < min) block('uae_contribution_salary_below_minimum');
  const basis = raw > max ? max : raw;
  const employee = round(basis * (old ? 500n : 1100n), 10000n);
  const government = old || basis < 2000000n ? round(basis * 250n, 10000n) : 0n;
  const employer = round(basis * 1500n, 10000n) - government;
  return { employee, employer, government, basis, to };
}
function payrollLine(
  input: UaePayrollLine,
  context: UaeWorkerContext,
  employer: UaeEmployerInput,
  from: string,
  to: string,
): UaeResultLine {
  if (to > context.contractEndOn!) block('uae_contract_renewal_evidence_required');
  const periodDays = days(from, to),
    start = context.joinedOn > from ? context.joinedOn : from,
    end = context.endedOn && context.endedOn < to ? context.endedOn : to,
    employedDays = Math.max(0, days(start, end));
  if (!employedDays) block('uae_worker_outside_period');
  if (input.sickDays && !input.probationCompleted)
    block('uae_probation_sick_leave_requires_review');
  const sick = uaeLeaveBands('sick', input.sickDaysBefore, input.sickDays);
  if (input.unpaidDays + input.sickDays > employedDays) block('uae_leave_exceeds_employed_days');
  const equivalentHalfDays = input.unpaidDays * 2 + sick.unpaidDays * 2 + sick.halfDays;
  const monthlyBasic = aedMinor(input.basic),
    monthlyAllowances = aedMinor(input.allowances);
  if (monthlyBasic <= 0n) block('uae_positive_basic_required');
  const units = BigInt(employedDays * 2 - equivalentHalfDays),
    denominator = BigInt(periodDays * 2);
  const basic = round(monthlyBasic * units, denominator),
    allowances = round(monthlyAllowances * units, denominator);
  let overtime = 0n;
  const byDate = new Map<string, typeof input.overtime>();
  for (const item of input.overtime)
    byDate.set(item.date, [...(byDate.get(item.date) ?? []), item]);
  for (const [date, items] of byDate) {
    if (date < start || date > end) block('uae_overtime_outside_employment');
    const ordinary = items.filter((i) => i.kind === 'day' || i.kind === 'night');
    if (ordinary.reduce((n, i) => n + i.minutes, 0) > 120) block('uae_daily_overtime_exceeded');
    if (
      items.length > 2 ||
      (items.some((i) => i.kind === 'rest' || i.kind === 'holiday') && items.length !== 1)
    )
      block('uae_overlapping_overtime_categories');
    for (const item of items) {
      const day = new Date(date + 'T00:00:00Z').getUTCDay(),
        rest = employer.weeklyRestDays.includes(day);
      if (
        (item.kind === 'rest' && !rest) ||
        (rest && (item.kind === 'day' || item.kind === 'night'))
      )
        block('uae_overtime_rest_pattern_conflict');
      if (
        item.threeWeekWorkedMinutes > 8640 ||
        item.threeWeekWorkedMinutes < item.scheduledMinutes + item.minutes
      )
        block('uae_three_week_hours_invalid');
      if (item.ramadan && item.scheduledMinutes > Math.max(0, employer.dailyMinutes - 120))
        block('uae_ramadan_hours_exceeded');
      if (!item.ramadan && item.scheduledMinutes > employer.dailyMinutes)
        block('uae_normal_hours_exceeded');
      if (item.kind === 'rest' || item.kind === 'holiday') {
        // Candidate cash option: additional ordinary daily wage plus 50% of basic, prorated by worked minutes.
        overtime += round(
          ((monthlyBasic + monthlyAllowances) * 2n + monthlyBasic) * BigInt(item.minutes),
          60n * BigInt(employer.dailyMinutes),
        );
      } else {
        const factor = item.kind === 'night' && !input.shiftWorker ? 150n : 125n;
        overtime += round(monthlyBasic * BigInt(item.minutes) * factor, 30n * 8n * 60n * 100n);
      }
    }
  }
  const restDates = [...byDate]
    .filter(([, rows]) => rows.some((r) => r.kind === 'rest'))
    .map(([date]) => date)
    .toSorted();
  if (
    restDates.some((date) => restDates.includes(add(date, 1)) && restDates.includes(add(date, 2)))
  )
    block('uae_consecutive_rest_work_requires_review');
  const gross = basic + allowances + overtime;
  const contributions = pension(context, from, to, employedDays, periodDays, equivalentHalfDays);
  let deductions = 0n;
  const grouped = new Map<string, bigint>();
  for (const item of input.deductions) {
    if (item.kind === 'loan' && !item.writtenConsent) block('uae_loan_written_consent_required');
    const amount = aedMinor(item.amount);
    grouped.set(item.kind, (grouped.get(item.kind) ?? 0n) + amount);
    deductions += amount;
  }
  for (const [kind, limit] of [
    ['overpayment', 20n],
    ['disciplinary', 5n],
    ['court_debt', 25n],
  ] as const)
    if ((grouped.get(kind) ?? 0n) * 100n > gross * limit) block('uae_deduction_category_limit');
  if ((deductions + contributions.employee) * 2n > gross) block('uae_aggregate_deduction_limit');
  const net = gross - deductions - contributions.employee;
  return {
    employeeId: context.employeeId,
    currency: 'AED',
    gross: aedAmount(gross),
    employeeContribution: aedAmount(contributions.employee),
    employerContribution: aedAmount(contributions.employer),
    governmentContribution: aedAmount(contributions.government),
    deductions: aedAmount(deductions),
    net: aedAmount(net),
    components: [
      {
        code: 'BASIC',
        amount: aedAmount(basic),
        reference: 'Contract; candidate calendar-day proration',
      },
      {
        code: 'ALLOWANCES',
        amount: aedAmount(allowances),
        reference: 'Contract; candidate calendar-day proration',
      },
      {
        code: 'OVERTIME',
        amount: aedAmount(overtime),
        reference: 'FDL 33/2021 arts 19, 28; candidate hourly convention',
      },
    ],
    facts: {
      periodDays,
      employedDays,
      unpaidDays: input.unpaidDays,
      sickFullDays: sick.fullDays,
      sickHalfDays: sick.halfDays,
      sickUnpaidDays: sick.unpaidDays,
      contributionBasis: aedAmount(contributions.basis),
      scheme: context.scheme,
      wageDueOn: add(to, 1),
    },
  };
}
export function previewUaePayroll(
  input: UaePayrollInput,
  employer: UaeEmployerInput,
  contexts: UaeWorkerContext[],
): UaePilotResult {
  assertUaeEmployer(employer);
  assertDate(input.periodStart);
  assertDate(input.periodEnd);
  const last = new Date(
    Date.UTC(Number(input.periodStart.slice(0, 4)), Number(input.periodStart.slice(5, 7)), 0),
  )
    .toISOString()
    .slice(0, 10);
  if (!input.periodStart.endsWith('-01') || input.periodEnd !== last)
    block('uae_one_calendar_month_required');
  const lines = input.lines.map((line) => {
    const context = contexts.find((c) => c.id === line.workerCoverageId);
    if (
      !context ||
      context.legalEntityId !== input.legalEntityId ||
      employer.legalEntityId !== input.legalEntityId
    )
      return block('uae_worker_coverage_missing');
    return payrollLine(line, context, employer, input.periodStart, input.periodEnd);
  });
  if (new Set(lines.map((l) => l.employeeId)).size !== lines.length)
    block('uae_duplicate_employee');
  return {
    kind: 'payroll',
    currency: 'AED',
    mode: 'preview',
    lines,
    total: aedAmount(lines.reduce((n, l) => n + aedMinor(l.net), 0n)),
    warnings: [warning],
  };
}
export function previewUaeSettlement(
  input: UaeSettlementInput,
  employer: UaeEmployerInput,
  worker: UaeWorkerContext,
): UaePilotResult {
  assertUaeEmployer(employer);
  assertUaeCohort(worker);
  assertDate(input.lastWorkingDay);
  if (worker.scheme !== 'expatriate_none')
    block('uae_pension_settlement_requires_authority_review');
  if (
    input.lastWorkingDay < worker.joinedOn ||
    (worker.endedOn && input.lastWorkingDay !== worker.endedOn)
  )
    block('uae_service_dates_invalid');
  if (input.lastWorkingDay > worker.contractEndOn!) block('uae_contract_renewal_evidence_required');
  if (input.noticePayDays > worker.noticeDays) block('uae_notice_exceeds_contract');
  const calendarDays = days(worker.joinedOn, input.lastWorkingDay),
    credited = calendarDays - input.unpaidServiceDays;
  if (credited < 0) block('uae_unpaid_service_exceeds_service');
  const basic = aedMinor(input.basic),
    grossMonthly = basic + aedMinor(input.allowances);
  if (!basic) block('uae_positive_basic_required');
  const first = Math.min(credited, 1825),
    later = Math.max(0, credited - 1825);
  let gratuity = credited < 365 ? 0n : round(basic * BigInt(first * 21 + later * 30), 30n * 365n);
  if (gratuity > basic * 24n) gratuity = basic * 24n;
  const leave = round(basic * BigInt(input.unusedAnnualDays * 2), 60n),
    notice = round(grossMonthly * BigInt(input.noticePayDays), 30n),
    salary = aedMinor(input.unpaidSalary);
  const gross = gratuity + leave + notice + salary;
  const line: UaeResultLine = {
    employeeId: worker.employeeId,
    currency: 'AED',
    gross: aedAmount(gross),
    employeeContribution: '0.00',
    employerContribution: '0.00',
    governmentContribution: '0.00',
    deductions: '0.00',
    net: aedAmount(gross),
    components: [
      {
        code: 'GRATUITY',
        amount: aedAmount(gratuity),
        reference: 'FDL 33/2021 art 51; candidate actual/365; no resignation reduction',
      },
      {
        code: 'LEAVE_ENCASHMENT',
        amount: aedAmount(leave),
        reference: 'FDL 33/2021 art 29(9); basic wage',
      },
      {
        code: 'NOTICE_PAY',
        amount: aedAmount(notice),
        reference: 'FDL 33/2021 art 43; explicitly supplied claim, not eligibility approval',
      },
      {
        code: 'UNPAID_SALARY',
        amount: aedAmount(salary),
        reference: 'Supplied outstanding wages; independently reconcile',
      },
    ],
    facts: {
      calendarDays,
      creditedServiceDays: credited,
      serviceYearBasis: 'actual_365_unreviewed',
      terminationReason: input.terminationReason,
      paymentDueOn: add(input.lastWorkingDay, 14),
    },
  };
  return {
    kind: 'settlement',
    currency: 'AED',
    mode: 'preview',
    lines: [line],
    total: line.net,
    warnings: [
      warning,
      'Positive entitlements only. Offsets, disputed service, transfers, alternative savings, pension settlement and compensation claims need separate reviewed workflows.',
    ],
  };
}
