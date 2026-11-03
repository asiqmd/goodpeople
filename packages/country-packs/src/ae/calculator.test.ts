import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { uaePayrollInputSchema, uaeSettlementInputSchema, type UaeEmployerInput } from '@gp/shared';
import {
  previewUaePayroll,
  previewUaeSettlement,
  uaeLeaveBands,
  uaeAnnualFloor,
  assertUaeCohort,
  previewUaeLeave,
  type UaeWorkerContext,
} from './calculator.js';
import { uaeManifest } from './manifest.js';
import { syntheticUaeWps, nextUaeWpsState } from './wps.js';
const company = randomUUID(),
  id = randomUUID();
const employer: UaeEmployerInput = {
  legalEntityId: company,
  effectiveFrom: '2026-06-01',
  regime: 'mohre_federal_private',
  workModel: 'full_time',
  endOfService: 'statutory_gratuity',
  workingTime: 'standard',
  weeklyRestDays: [0, 6],
  dailyMinutes: 480,
  noticeDays: 30,
  probationMonths: 6,
  proration: 'calendar_days',
  reason: 'Synthetic worked boundary fixture',
};
const worker: UaeWorkerContext = {
  id,
  legalEntityId: company,
  employeeId: randomUUID(),
  effectiveFrom: '2026-06-01',
  scheme: 'expatriate_none',
  authority: 'none_confirmed',
  priorParticipation: 'none',
  workLocation: 'AE_onshore',
  contractTerm: 'fixed_term',
  contractEndOn: '2030-12-31',
  noticeDays: 30,
  probationMonths: 0,
  evidenceReference: 'Synthetic, not authority approval',
  citizenship: 'IN',
  joinedOn: '2020-01-01',
  endedOn: null,
  reason: employer.reason,
};
const payroll = () =>
  uaePayrollInputSchema.parse({
    legalEntityId: company,
    periodStart: '2026-06-01',
    periodEnd: '2026-06-30',
    reason: employer.reason,
    lines: [
      {
        workerCoverageId: id,
        basic: '6000',
        allowances: '3000',
        unpaidDays: 0,
        sickDaysBefore: 0,
        sickDays: 0,
        probationCompleted: true,
        shiftWorker: false,
        overtime: [],
        deductions: [],
      },
    ],
  });
const calculate = (input = payroll(), w = worker, e = employer) => previewUaePayroll(input, e, [w]);
describe('UAE candidate: worked fixtures and closed boundaries', () => {
  it('bounds event-based leave and rejects probation/expired employment cases', () => {
    const input = {
      legalEntityId: company,
      workerCoverageId: id,
      onDate: '2026-08-31',
      kind: 'parental' as const,
      usedBefore: 0,
      requestedDays: 5,
      eligibilityAttested: true as const,
      probationCompleted: true,
      eventDate: '2026-02-28',
    };
    expect(() => previewUaeLeave(input, employer, worker)).toThrow(
      'uae_parental_event_window_required',
    );
    expect(previewUaeLeave({ ...input, onDate: '2026-08-28' }, employer, worker)).toMatchObject({
      fullDays: 5,
      unit: 'working_days',
      postedToLedger: false,
    });
    expect(() =>
      previewUaeLeave({ ...input, kind: 'sick', probationCompleted: false }, employer, worker),
    ).toThrow('uae_probation_sick_leave_requires_review');
    expect(() =>
      previewUaeLeave({ ...input, onDate: '2026-08-28' }, employer, {
        ...worker,
        endedOn: '2026-07-31',
      }),
    ).toThrow('uae_worker_outside_period');
    expect(
      previewUaeLeave({ ...input, kind: 'study', requestedDays: 10 }, employer, worker).fullDays,
    ).toBe(10);
    expect(() =>
      previewUaeLeave({ ...input, kind: 'study' }, employer, { ...worker, joinedOn: '2025-01-01' }),
    ).toThrow('uae_study_service_not_met');
    expect(uaeAnnualFloor('2024-02-29', '2025-02-28').annualDays).toBe(30);
  });
  it('retains review/source gaps instead of registering an enabled pack', () => {
    const m = uaeManifest();
    expect(m.liveEnabled).toBe(false);
    expect(
      m.rules.every(
        (r) => r.status === 'needs_review' && r.reviewer === null && r.sourceDocumentHash === null,
      ),
    ).toBe(true);
  });
  it('reconciles three exact monthly fixtures, with no BD deductions', () => {
    for (const [from, to] of [
      ['2026-06-01', '2026-06-30'],
      ['2026-07-01', '2026-07-31'],
      ['2026-08-01', '2026-08-31'],
    ]) {
      const input = payroll();
      input.periodStart = from!;
      input.periodEnd = to!;
      expect(calculate(input).lines[0]).toMatchObject({
        gross: '9000.00',
        net: '9000.00',
        employeeContribution: '0.00',
        currency: 'AED',
      });
    }
  });
  it('prorates joining, leaving and unpaid days without float money', () => {
    const input = payroll();
    input.lines[0]!.unpaidDays = 1;
    expect(calculate(input, { ...worker, joinedOn: '2026-06-16' }).total).toBe('4200.00');
    expect(calculate(payroll(), { ...worker, endedOn: '2026-06-10' }).total).toBe('3000.00');
  });
  it('applies sick pay across both cumulative boundaries', () => {
    expect(uaeLeaveBands('sick', 14, 3)).toEqual({ fullDays: 1, halfDays: 2, unpaidDays: 0 });
    expect(uaeLeaveBands('sick', 44, 3)).toEqual({ fullDays: 0, halfDays: 1, unpaidDays: 2 });
    expect(uaeLeaveBands('maternity', 44, 3)).toEqual({ fullDays: 1, halfDays: 2, unpaidDays: 0 });
    expect(() => uaeLeaveBands('sick', 89, 2)).toThrow('uae_leave_limit_exceeded');
    const input = payroll();
    Object.assign(input.lines[0]!, { sickDaysBefore: 14, sickDays: 3 });
    expect(calculate(input).total).toBe('8700.00');
    input.lines[0]!.probationCompleted = false;
    expect(() => calculate(input)).toThrow('uae_probation_sick_leave_requires_review');
  });
  it('keeps annual entitlement separate from ledger accrual', () => {
    expect(uaeAnnualFloor('2026-01-01', '2026-07-01').annualDays).toBe(0);
    expect(uaeAnnualFloor('2026-01-01', '2026-07-02').annualDays).toBe(12);
    expect(uaeAnnualFloor('2025-07-01', '2026-07-01').annualDays).toBe(30);
  });
  it('separates day/night/shift premiums and Ramadan scheduling', () => {
    const input = payroll(),
      row = input.lines[0]!;
    row.overtime = [
      {
        date: '2026-06-01',
        minutes: 120,
        kind: 'day',
        ramadan: true,
        scheduledMinutes: 360,
        threeWeekWorkedMinutes: 7200,
      },
    ];
    expect(calculate(input).total).toBe('9062.50');
    row.overtime[0]!.kind = 'night';
    expect(calculate(input).total).toBe('9075.00');
    row.shiftWorker = true;
    expect(calculate(input).total).toBe('9062.50');
    row.overtime[0]!.scheduledMinutes = 480;
    expect(() => calculate(input)).toThrow('uae_ramadan_hours_exceeded');
    row.overtime[0]!.scheduledMinutes = 360;
    row.overtime[0]!.threeWeekWorkedMinutes = 8641;
    expect(() => calculate(input)).toThrow('uae_three_week_hours_invalid');
    row.overtime[0]!.threeWeekWorkedMinutes = 7200;
    row.overtime[0]!.minutes = 121;
    expect(() => calculate(input)).toThrow('uae_daily_overtime_exceeded');
  });
  it('uses an explicit rest pattern and cash-day basis', () => {
    const input = payroll();
    input.lines[0]!.overtime = [
      {
        date: '2026-06-06',
        minutes: 480,
        kind: 'rest',
        ramadan: false,
        scheduledMinutes: 0,
        threeWeekWorkedMinutes: 7680,
      },
    ];
    expect(calculate(input).total).toBe('9400.00');
    input.lines[0]!.overtime[0]!.date = '2026-06-08';
    expect(() => calculate(input)).toThrow('uae_overtime_rest_pattern_conflict');
  });
  it('does not select a pension scheme from a new joining date', () => {
    const old: UaeWorkerContext = {
      ...worker,
      citizenship: 'AE',
      scheme: 'gpssa_1999',
      authority: 'gpssa',
      priorParticipation: 'law_1999',
      firstContributionOn: '2024-01-01',
      contributionSalary: '10000',
      contributionBasisOn: '2026-01-01',
    };
    expect(calculate(payroll(), old).lines[0]).toMatchObject({
      employeeContribution: '500.00',
      employerContribution: '1250.00',
      governmentContribution: '250.00',
      net: '8500.00',
    });
    expect(() => assertUaeCohort({ ...old, scheme: 'gpssa_2023' })).toThrow(
      'uae_insurance_history_conflict',
    );
    expect(() => calculate(payroll(), { ...old, contributionBasisOn: '2026-02-01' })).toThrow(
      'uae_january_or_joining_basis_required',
    );
  });
  it('honours GPSSA new-law caps and the exclusive support threshold', () => {
    const w: UaeWorkerContext = {
      ...worker,
      citizenship: 'AE',
      scheme: 'gpssa_2023',
      authority: 'gpssa',
      priorParticipation: 'none',
      firstContributionOn: '2024-01-01',
      contributionSalary: '19000',
      contributionBasisOn: '2026-01-01',
    };
    expect(calculate(payroll(), w).lines[0]).toMatchObject({
      employeeContribution: '2090.00',
      employerContribution: '2375.00',
      governmentContribution: '475.00',
    });
    expect(calculate(payroll(), { ...w, contributionSalary: '20000' }).lines[0]).toMatchObject({
      employeeContribution: '2200.00',
      employerContribution: '3000.00',
      governmentContribution: '0.00',
    });
    const input = payroll();
    input.lines[0]!.basic = '100000';
    expect(
      calculate(input, { ...w, contributionSalary: '80000' }).lines[0]!.employeeContribution,
    ).toBe('7700.00');
    input.lines[0]!.unpaidDays = 1;
    expect(() => calculate(input, w)).toThrow('uae_partial_month_pension_requires_review');
  });
  it.each(['gcc_extension', 'other_authority', 'unknown'] as const)(
    'blocks %s rather than giving a zero contribution',
    (scheme) =>
      expect(() => calculate(payroll(), { ...worker, scheme })).toThrow(
        'uae_insurance_cohort_unsupported',
      ),
  );
  it('aggregates category limits across multiple deduction lines', () => {
    const input = payroll();
    input.lines[0]!.deductions = [1, 2].map(() => ({
      kind: 'overpayment' as const,
      amount: '1000',
      writtenConsent: true,
      reference: 'Synthetic court reference',
    }));
    expect(() => calculate(input)).toThrow('uae_deduction_category_limit');
    input.lines[0]!.deductions = [
      { kind: 'loan', amount: '5000', writtenConsent: true, reference: 'Synthetic loan consent' },
    ];
    expect(() => calculate(input)).toThrow('uae_aggregate_deduction_limit');
    input.lines[0]!.deductions[0]!.writtenConsent = false;
    expect(() => calculate(input)).toThrow('uae_loan_written_consent_required');
  });
  it.each(['difc', 'adgm', 'government', 'domestic', 'other_free_zone'] as const)(
    'rejects %s',
    (regime) =>
      expect(() => calculate(payroll(), worker, { ...employer, regime })).toThrow(
        'uae_regime_unsupported',
      ),
  );
  it('rejects future dates, alternative savings and mixed employees', () => {
    const input = payroll();
    input.periodStart = '2027-01-01';
    input.periodEnd = '2027-01-31';
    expect(() => calculate(input)).toThrow('uae_date_outside_research_snapshot');
    expect(() =>
      calculate(payroll(), worker, { ...employer, endOfService: 'alternative_savings' }),
    ).toThrow('uae_alternative_savings_unsupported');
    expect(() => calculate(payroll(), { ...worker, legalEntityId: randomUUID() })).toThrow(
      'uae_worker_coverage_missing',
    );
  });
  it('compares settlement thresholds, five-year boundary, cap and termination reasons', () => {
    const input = uaeSettlementInputSchema.parse({
      legalEntityId: company,
      workerCoverageId: id,
      lastWorkingDay: '2026-06-30',
      basic: '6000',
      allowances: '3000',
      unpaidServiceDays: 0,
      unusedAnnualDays: 5,
      noticePayDays: 30,
      unpaidSalary: '0',
      terminationReason: 'resignation',
      serviceHistory: 'single_employer_no_transfers',
      reason: employer.reason,
    });
    const w = { ...worker, joinedOn: '2025-07-01' };
    expect(previewUaeSettlement(input, employer, w).lines[0]).toMatchObject({
      net: '14200.00',
      facts: { creditedServiceDays: 365, paymentDueOn: '2026-07-14' },
    });
    input.terminationReason = 'employer_termination';
    expect(previewUaeSettlement(input, employer, w).total).toBe('14200.00');
    input.unpaidServiceDays = 1;
    expect(previewUaeSettlement(input, employer, w).total).toBe('10000.00');
    input.unpaidServiceDays = 0;
    const five = { ...worker, joinedOn: '2021-07-02' };
    expect(previewUaeSettlement(input, employer, five).lines[0]!.components[0]!.amount).toBe(
      '21000.00',
    );
    const long = { ...worker, joinedOn: '1950-01-01' };
    expect(previewUaeSettlement(input, employer, long).lines[0]!.components[0]!.amount).toBe(
      '144000.00',
    );
  });
  it('keeps WPS files synthetic, hash-bound, deduplicable and separate from wage payment', () => {
    const batch = syntheticUaeWps(
      calculate(),
      '2026-06-01',
      '2026-06-30',
      new Date('2026-07-01T20:30:00Z'),
    );
    expect(batch.file).toContain('SANDBOX ONLY');
    expect(batch.file).toContain('2026-07-02,0030,062026,1,9000.00,AED');
    expect(batch.paymentProven).toBe(false);
    const event = {
      eventId: 'synthetic-01',
      fileHash: batch.fileHash,
      kind: 'uploaded' as const,
      reference: 'Synthetic agent upload',
      acceptedCount: 0,
      rejectedCount: 0,
      returnedTotal: '0',
      reason: employer.reason,
    };
    expect(nextUaeWpsState('draft', event, batch).state).toBe('uploaded');
    expect(() =>
      nextUaeWpsState(
        'draft',
        { ...event, kind: 'accepted', acceptedCount: 1, returnedTotal: '9000' },
        batch,
      ),
    ).toThrow('uae_wps_acceptance_mismatch');
    expect(() =>
      nextUaeWpsState(
        'accepted',
        { ...event, kind: 'reconciled', acceptedCount: 1, returnedTotal: '8999.99' },
        batch,
      ),
    ).toThrow('uae_wps_reconciliation_mismatch');
    expect(
      nextUaeWpsState(
        'accepted',
        { ...event, kind: 'reconciled', acceptedCount: 1, returnedTotal: '9000' },
        batch,
      ).paymentProven,
    ).toBe(false);
  });
});
