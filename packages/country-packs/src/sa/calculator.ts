import type {
  SaudiEmployerInput,
  SaudiWorkerInput,
  SaudiPayrollInput,
  SaudiPayrollLine,
  SaudiSettlementInput,
  SaudiResultLine,
  SaudiPilotResult,
  SaudiLeaveInput,
  SaudiLeavePreview,
} from '@gp/shared';
import { SAUDI_PREVIEW_FROM, SAUDI_RESEARCH_AS_OF } from './manifest.js';
export class SaudiBoundaryError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
const block = (code: string): never => {
  throw new SaudiBoundaryError(code);
};
export const sarMinor = (value: string) => {
  if (!/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/.test(value)) return block('saudi_invalid_sar_amount');
  const [whole, part = ''] = value.split('.');
  return BigInt(whole!) * 100n + BigInt(part.padEnd(2, '0'));
};
export const sarAmount = (value: bigint) =>
  `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`;
const round = (n: bigint, d: bigint) => (n + d / 2n) / d;
const days = (from: string, to: string) =>
  Math.floor((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000) + 1;
const add = (date: string, n: number) =>
  new Date(Date.parse(date + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const addYears = (date: string, n: number) => {
  const year = Number(date.slice(0, 4)) + n,
    month = Number(date.slice(5, 7));
  const day = Math.min(Number(date.slice(8, 10)), new Date(Date.UTC(year, month, 0)).getUTCDate());
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};
const warning =
  'Unreviewed Saudi candidate: no statutory ledger, portal filing or payment is created. Calendar-day proration, 240-hour divisor and written-Gregorian anniversary service fractions require local review.';
export type SaudiWorkerContext = SaudiWorkerInput & {
  id: string;
  citizenship: string;
  joinedOn: string;
  endedOn: string | null;
};
export function assertSaudiEmployer(e: SaudiEmployerInput) {
  if (e.regime !== 'hrsd_private') block('saudi_regime_unsupported');
  if (e.workModel !== 'full_time') block('saudi_work_model_unsupported');
  if (e.endOfService !== 'statutory_gratuity') block('saudi_end_of_service_model_unsupported');
  if (e.workingTime !== 'standard') block('saudi_working_time_exclusion_requires_review');
  if (e.dailyMinutes * (7 - e.weeklyRestDays.length) > 2880) block('saudi_weekly_hours_exceeded');
  if (!e.weeklyRestDays.includes(5) && !e.restDayAuthorityReference)
    block('saudi_alternate_rest_authority_required');
}
export function assertSaudiCohort(w: SaudiWorkerContext) {
  if (w.calendarBasis !== 'gregorian_written_agreement')
    block('saudi_reviewed_hijri_calendar_required');
  if (w.workLocation !== 'SA_onshore') block('saudi_cross_border_work_requires_review');
  if (
    !['fixed_term', 'indefinite'].includes(w.contractTerm) ||
    (w.contractTerm === 'fixed_term' && !w.contractEndOn)
  )
    block('saudi_contract_term_required');
  if (w.citizenship !== 'SA' && w.contractTerm !== 'fixed_term')
    block('saudi_non_saudi_fixed_term_required');
  if (w.contractTerm === 'indefinite' && w.noticeDays < 60)
    block('saudi_indefinite_monthly_notice_requires_review');
  if (!w.singleEmployer) block('saudi_multi_employer_insurance_requires_review');
  if (
    w.authority !== 'gosi' ||
    !w.insuranceCoverageAttested ||
    !w.firstContributionOn ||
    !w.contributionSalary ||
    !w.contributionBasisOn
  )
    block('saudi_insurance_coverage_unconfirmed');
  if (w.scheme === 'non_saudi_hazards') {
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
      ].includes(w.citizenship) ||
      w.branches !== 'hazards_only' ||
      w.priorParticipation !== 'none'
    )
      block('saudi_hazards_only_coverage_unconfirmed');
    return;
  }
  if (
    !['gosi_legacy', 'gosi_new'].includes(w.scheme) ||
    w.citizenship !== 'SA' ||
    w.branches !== 'annuities_saned_hazards'
  )
    block('saudi_insurance_cohort_unsupported');
  const old = ['pre_2024_social', 'pre_2024_civil'].includes(w.priorParticipation);
  if (w.priorParticipation === 'unknown') block('saudi_insurance_history_required');
  if ((w.scheme === 'gosi_legacy') !== old) block('saudi_insurance_history_conflict');
  if (
    w.scheme === 'gosi_new' &&
    (w.firstContributionOn! < '2024-07-03' ||
      !['none', 'post_2024_only'].includes(w.priorParticipation))
  )
    block('saudi_insurance_history_conflict');
  if (w.scheme === 'gosi_legacy' && w.firstContributionOn! >= '2024-07-03')
    block('saudi_earliest_participation_evidence_required');
}
function assertDate(date: string) {
  if (date < SAUDI_PREVIEW_FROM || date > SAUDI_RESEARCH_AS_OF)
    block('saudi_date_outside_research_snapshot');
}
function assertContract(w: SaudiWorkerContext, onDate: string) {
  if (w.contractTerm === 'fixed_term' && onDate > w.contractEndOn!)
    block('saudi_contract_renewal_evidence_required');
}
export function saudiAnnuityBps(onDate: string, scheme: SaudiWorkerInput['scheme']) {
  assertDate(onDate);
  return scheme === 'gosi_new' ? (onDate < '2026-07-01' ? 950 : 1000) : 900;
}
export function saudiLeaveBands(kind: 'sick' | 'maternity', usedBefore: number, requested: number) {
  const fullLimit = kind === 'sick' ? 30 : 84,
    threeQuarterLimit = kind === 'sick' ? 90 : 84,
    totalLimit = kind === 'sick' ? 120 : 84;
  if (
    !Number.isInteger(usedBefore) ||
    !Number.isInteger(requested) ||
    usedBefore < 0 ||
    requested < 0 ||
    usedBefore + requested > totalLimit
  )
    block('saudi_leave_limit_exceeded');
  const fullDays = Math.max(
    0,
    Math.min(usedBefore + requested, fullLimit) - Math.min(usedBefore, fullLimit),
  );
  const threeQuarterDays = Math.max(
    0,
    Math.min(usedBefore + requested, threeQuarterLimit) - Math.max(usedBefore, fullLimit),
  );
  return { fullDays, threeQuarterDays, unpaidDays: requested - fullDays - threeQuarterDays };
}
export function saudiAnnualFloor(joinedOn: string, onDate: string) {
  if (onDate < joinedOn) block('saudi_service_dates_invalid');
  return {
    annualDays: onDate >= addYears(joinedOn, 5) ? 30 : 21,
    reference: 'Labor Law art 109; annual rate only, not an accrued balance',
  };
}
export function previewSaudiLeave(
  input: SaudiLeaveInput,
  employer: SaudiEmployerInput,
  w: SaudiWorkerContext,
): SaudiLeavePreview {
  assertSaudiEmployer(employer);
  assertSaudiCohort(w);
  assertDate(input.onDate);
  assertContract(w, input.onDate);
  if (!input.eligibilityAttested) block('saudi_leave_eligibility_attestation_required');
  if (input.onDate < w.joinedOn || (w.endedOn && input.onDate > w.endedOn))
    block('saudi_worker_outside_period');
  const base = {
    mode: 'preview' as const,
    kind: input.kind,
    unit: 'calendar_days' as const,
    reference:
      'Labor Law arts 109-117, 151; attested scenario, no approval, benefit/salary coordination or ledger posting',
    postedToLedger: false as const,
  };
  if (input.kind === 'sick' || input.kind === 'maternity')
    return { ...base, ...saudiLeaveBands(input.kind, input.usedBefore, input.requestedDays) };
  let limit: number;
  if (input.kind === 'annual') limit = saudiAnnualFloor(w.joinedOn, input.onDate).annualDays;
  else if (input.kind === 'parental') {
    if (
      !input.eventDate ||
      input.onDate < input.eventDate ||
      add(input.onDate, input.requestedDays - 1) > add(input.eventDate, 6)
    )
      block('saudi_parental_event_window_required');
    limit = 3;
  } else if (input.kind === 'hajj') {
    if (
      input.onDate < addYears(w.joinedOn, 2) ||
      input.usedBefore !== 0 ||
      input.requestedDays < 10
    )
      block('saudi_hajj_eligibility_requires_review');
    limit = 15;
  } else if (input.kind === 'study') {
    if (!input.eventDate || input.eventDate !== input.onDate) block('saudi_exam_evidence_required');
    limit = input.requestedDays; // Attestation includes approved enrollment, non-repeat exams and 15-day notice.
  } else {
    if (!input.eventDate || input.eventDate !== input.onDate)
      block('saudi_event_start_date_required');
    limit = input.kind === 'bereavement_sibling' ? 3 : 5;
  }
  if (input.usedBefore + input.requestedDays > limit) block('saudi_leave_limit_exceeded');
  return { ...base, fullDays: input.requestedDays, threeQuarterDays: 0, unpaidDays: 0 };
}
function contributions(
  w: SaudiWorkerContext,
  from: string,
  employedDays: number,
  periodDays: number,
  unpaidUnits: number,
) {
  assertSaudiCohort(w);
  if (employedDays !== periodDays || unpaidUnits > 0)
    block('saudi_partial_month_insurance_requires_review');
  if (w.contributionBasisOn! > from || w.firstContributionOn! > from)
    block('saudi_contribution_basis_date_invalid');
  const raw = sarMinor(w.contributionSalary!),
    minimum = w.scheme === 'non_saudi_hazards' ? 40000n : 150000n;
  if (raw < minimum) block('saudi_contribution_salary_below_minimum');
  const basis = raw > 4500000n ? 4500000n : raw;
  const annuity =
    w.scheme === 'non_saudi_hazards'
      ? 0n
      : round(basis * BigInt(saudiAnnuityBps(from, w.scheme)), 10000n);
  const saned = w.scheme === 'non_saudi_hazards' ? 0n : round(basis * 75n, 10000n);
  const hazards = round(basis * BigInt(w.occupationalHazardsBps), 10000n);
  return {
    employee: annuity + saned,
    employer: annuity + saned + hazards,
    government: 0n,
    basis,
    annuity,
    saned,
    hazards,
  };
}
function payrollLine(
  input: SaudiPayrollLine,
  w: SaudiWorkerContext,
  e: SaudiEmployerInput,
  from: string,
  to: string,
): SaudiResultLine {
  assertContract(w, to);
  const periodDays = days(from, to),
    start = w.joinedOn > from ? w.joinedOn : from,
    end = w.endedOn && w.endedOn < to ? w.endedOn : to,
    employedDays = Math.max(0, days(start, end));
  if (!employedDays) block('saudi_worker_outside_period');
  const sick = saudiLeaveBands('sick', input.sickDaysBefore, input.sickDays);
  if (input.unpaidDays + input.sickDays > employedDays) block('saudi_leave_exceeds_employed_days');
  if (input.unpaidDays > 20) block('saudi_unpaid_leave_contract_suspension_requires_review');
  const unpaidUnits = input.unpaidDays * 4 + sick.unpaidDays * 4 + sick.threeQuarterDays;
  const monthlyBasic = sarMinor(input.basic),
    monthlyAllowances = sarMinor(input.allowances);
  if (monthlyBasic <= 0n) block('saudi_positive_basic_required');
  const units = BigInt(employedDays * 4 - unpaidUnits),
    denominator = BigInt(periodDays * 4);
  const basic = round(monthlyBasic * units, denominator),
    allowances = round(monthlyAllowances * units, denominator);
  const byDate = new Map<string, typeof input.overtime>();
  for (const item of input.overtime)
    byDate.set(item.date, [...(byDate.get(item.date) ?? []), item]);
  const totalMinutes = input.overtime.reduce((n, x) => n + x.minutes, 0);
  if (input.yearOvertimeMinutesBefore + totalMinutes > 43200)
    block('saudi_annual_overtime_limit_requires_review');
  let overtime = 0n;
  for (const [date, rows] of byDate) {
    if (date < start || date > end) block('saudi_overtime_outside_employment');
    if (
      new Set(rows.map((x) => `${x.scheduledMinutes}:${x.ramadan}:${x.weeklyWorkedMinutes}`))
        .size !== 1
    )
      block('saudi_overtime_day_context_conflict');
    const first = rows[0]!,
      worked = rows.reduce((n, x) => n + x.minutes, 0),
      isRest = e.weeklyRestDays.includes(new Date(date + 'T00:00:00Z').getUTCDay());
    if (first.ramadan && w.ramadanHours === 'unknown')
      block('saudi_ramadan_classification_required');
    const scheduledLimit =
      first.ramadan && w.ramadanHours === 'applies'
        ? Math.min(e.dailyMinutes, 360)
        : e.dailyMinutes;
    if (
      first.scheduledMinutes > scheduledLimit ||
      first.scheduledMinutes + worked > 600 ||
      first.weeklyWorkedMinutes > 3600 ||
      first.weeklyWorkedMinutes < first.scheduledMinutes + worked
    )
      block('saudi_working_time_limit_exceeded');
    if (isRest && !rows.every((x) => x.kind === 'rest' || x.kind === 'holiday'))
      block('saudi_rest_day_classification_conflict');
    if (!isRest && rows.some((x) => x.kind === 'rest'))
      block('saudi_rest_day_classification_conflict');
    // Same art 107 rate for ordinary/night/holiday claims. No compensatory-leave substitution or legalization of rest-day work.
    for (const item of rows)
      overtime += round(
        ((monthlyBasic + monthlyAllowances) * 2n + monthlyBasic) * BigInt(item.minutes),
        30n * 8n * 60n * 2n,
      );
  }
  const gross = basic + allowances + overtime,
    c = contributions(w, from, employedDays, periodDays, unpaidUnits);
  let deductions = 0n;
  const grouped = new Map<string, bigint>();
  for (const item of input.deductions) {
    if (item.kind === 'consented_other' && !item.writtenConsent)
      block('saudi_deduction_written_consent_required');
    const amount = sarMinor(item.amount);
    grouped.set(item.kind, (grouped.get(item.kind) ?? 0n) + amount);
    deductions += amount;
  }
  if ((grouped.get('loan') ?? 0n) * 10n > gross || (grouped.get('court_debt') ?? 0n) * 4n > gross)
    block('saudi_deduction_category_limit');
  for (const kind of ['disciplinary', 'damage'])
    if ((grouped.get(kind) ?? 0n) * 30n > gross * 5n) block('saudi_five_day_deduction_limit');
  if ((deductions + c.employee) * 2n > gross) block('saudi_aggregate_deduction_limit');
  return {
    employeeId: w.employeeId,
    currency: 'SAR',
    gross: sarAmount(gross),
    employeeContribution: sarAmount(c.employee),
    employerContribution: sarAmount(c.employer),
    governmentContribution: '0.00',
    deductions: sarAmount(deductions),
    net: sarAmount(gross - deductions - c.employee),
    components: [
      {
        code: 'BASIC',
        amount: sarAmount(basic),
        reference: 'Contract; candidate calendar-day proration',
      },
      {
        code: 'ALLOWANCES',
        amount: sarAmount(allowances),
        reference: 'Fixed cash wage elements supplied for this preview',
      },
      {
        code: 'OVERTIME',
        amount: sarAmount(overtime),
        reference: 'Labor Law art 107; hourly wage plus 50% basic; proposed 240-hour divisor',
      },
    ],
    facts: {
      periodDays,
      employedDays,
      unpaidDays: input.unpaidDays,
      sickFullDays: sick.fullDays,
      sickThreeQuarterDays: sick.threeQuarterDays,
      sickUnpaidDays: sick.unpaidDays,
      contributionBasis: sarAmount(c.basis),
      scheme: w.scheme,
      annuityBps: w.scheme === 'non_saudi_hazards' ? 0 : saudiAnnuityBps(from, w.scheme),
      employeeAnnuity: sarAmount(c.annuity),
      employeeSaned: sarAmount(c.saned),
      employerHazards: sarAmount(c.hazards),
      governmentSupportApplied: false,
      wageSchedule: 'Monthly contractual due date requires independent reconciliation',
    },
  };
}
export function previewSaudiPayroll(
  input: SaudiPayrollInput,
  e: SaudiEmployerInput,
  workers: SaudiWorkerContext[],
): SaudiPilotResult {
  assertSaudiEmployer(e);
  assertDate(input.periodStart);
  assertDate(input.periodEnd);
  const last = new Date(
    Date.UTC(Number(input.periodStart.slice(0, 4)), Number(input.periodStart.slice(5, 7)), 0),
  )
    .toISOString()
    .slice(0, 10);
  if (!input.periodStart.endsWith('-01') || input.periodEnd !== last)
    block('saudi_one_calendar_month_required');
  const lines = input.lines.map((line) => {
    const w = workers.find((c) => c.id === line.workerCoverageId);
    if (!w || w.legalEntityId !== input.legalEntityId || e.legalEntityId !== input.legalEntityId)
      return block('saudi_worker_coverage_missing');
    return payrollLine(line, w, e, input.periodStart, input.periodEnd);
  });
  if (new Set(lines.map((l) => l.employeeId)).size !== lines.length)
    block('saudi_duplicate_employee');
  return {
    kind: 'payroll',
    currency: 'SAR',
    mode: 'preview',
    lines,
    total: sarAmount(lines.reduce((n, l) => n + sarMinor(l.net), 0n)),
    warnings: [warning],
  };
}
export function previewSaudiSettlement(
  input: SaudiSettlementInput,
  e: SaudiEmployerInput,
  w: SaudiWorkerContext,
): SaudiPilotResult {
  assertSaudiEmployer(e);
  assertSaudiCohort(w);
  assertDate(input.lastWorkingDay);
  assertContract(w, input.lastWorkingDay);
  if (!input.entitlementsAttested || input.terminationReason === 'article_80_disputed')
    block('saudi_settlement_local_review_required');
  if (input.lastWorkingDay < w.joinedOn || (w.endedOn && input.lastWorkingDay !== w.endedOn))
    block('saudi_service_dates_invalid');
  if (input.noticePayDays > w.noticeDays) block('saudi_notice_exceeds_contract');
  if (
    ['resignation', 'article_87_exception'].includes(input.terminationReason) &&
    input.noticePayDays > 0
  )
    block('saudi_resignation_notice_claim_requires_review');
  if (
    input.terminationReason === 'contract_end' &&
    (w.contractTerm !== 'fixed_term' || input.lastWorkingDay !== w.contractEndOn)
  )
    block('saudi_contract_expiry_date_conflict');
  if (input.terminationReason === 'article_87_exception' && !input.article87EvidenceReference)
    block('saudi_article87_evidence_required');
  const calendarDays = days(w.joinedOn, input.lastWorkingDay),
    credited = calendarDays - input.unpaidServiceDays;
  if (credited < 0) block('saudi_unpaid_service_exceeds_service');
  const endExclusive = add(w.joinedOn, credited);
  let years = Number(endExclusive.slice(0, 4)) - Number(w.joinedOn.slice(0, 4));
  if (addYears(w.joinedOn, years) > endExclusive) years--;
  const anniversary = addYears(w.joinedOn, years),
    fraction = days(anniversary, endExclusive) - 1,
    den = BigInt(days(anniversary, addYears(w.joinedOn, years + 1)) - 1);
  const serviceNumerator = BigInt(years) * den + BigInt(fraction),
    first = serviceNumerator < 5n * den ? serviceNumerator : 5n * den,
    later = serviceNumerator - first;
  const wage = sarMinor(input.basic) + sarMinor(input.allowances);
  if (sarMinor(input.basic) <= 0n) block('saudi_positive_basic_required');
  let factorN = 1n,
    factorD = 1n;
  if (input.terminationReason === 'resignation') {
    if (serviceNumerator < 2n * den) factorN = 0n;
    else if (serviceNumerator <= 5n * den) factorD = 3n;
    else if (serviceNumerator < 10n * den) {
      factorN = 2n;
      factorD = 3n;
    }
  }
  const gratuity = round(wage * (first + later * 2n) * factorN, 2n * den * factorD),
    leave = round(wage * BigInt(input.unusedAnnualDays * 2), 60n),
    notice = round(wage * BigInt(input.noticePayDays), 30n),
    salary = sarMinor(input.unpaidSalary),
    gross = gratuity + leave + notice + salary;
  const line: SaudiResultLine = {
    employeeId: w.employeeId,
    currency: 'SAR',
    gross: sarAmount(gross),
    employeeContribution: '0.00',
    employerContribution: '0.00',
    governmentContribution: '0.00',
    deductions: '0.00',
    net: sarAmount(gross),
    components: [
      {
        code: 'GRATUITY',
        amount: sarAmount(gratuity),
        reference:
          'Labor Law arts 84-87; final fixed wage; candidate Gregorian anniversary fractions and attested reason',
      },
      {
        code: 'LEAVE_ENCASHMENT',
        amount: sarAmount(leave),
        reference: 'Labor Law art 111; supplied unused entitlement and fixed wage',
      },
      {
        code: 'NOTICE_PAY',
        amount: sarAmount(notice),
        reference:
          'Labor Law arts 75-76; supplied employer-to-worker claim, not eligibility approval',
      },
      {
        code: 'UNPAID_SALARY',
        amount: sarAmount(salary),
        reference: 'Supplied outstanding wages; independently reconcile',
      },
    ],
    facts: {
      calendarDays,
      creditedServiceDays: credited,
      completedServiceYears: years,
      serviceYearBasis: 'written_gregorian_anniversary_fractions_unreviewed',
      resignationFactor: `${factorN}/${factorD}`,
      terminationReason: input.terminationReason,
      paymentDueOn: add(
        input.lastWorkingDay,
        ['resignation', 'article_87_exception'].includes(input.terminationReason) ? 14 : 7,
      ),
      insuranceSettlementCalculated: false,
    },
  };
  return {
    kind: 'settlement',
    currency: 'SAR',
    mode: 'preview',
    lines: [line],
    total: line.net,
    warnings: [
      warning,
      'Positive entitlements only. Insurance settlement, offsets, art 77/80 claims, variable/commission wages, transfers and disputed service require separate local review. Article 87 eligibility is explicitly attested, never inferred.',
    ],
  };
}
