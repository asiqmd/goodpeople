import { describe, it, expect } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import {
  saudiPayrollInputSchema,
  saudiSettlementInputSchema,
  saudiWorkerInputSchema,
  type SaudiEmployerInput,
} from '@gp/shared';
import {
  assertSaudiCohort,
  previewSaudiPayroll,
  previewSaudiSettlement,
  previewSaudiLeave,
  saudiAnnualFloor,
  saudiLeaveBands,
  type SaudiWorkerContext,
} from './calculator.js';
import { saudiManifest } from './manifest.js';
import { syntheticSaudiWps, nextSaudiWpsState } from './wps.js';
const company = randomUUID(),
  id = randomUUID(),
  reason = 'Independent synthetic Saudi boundary reference';
const employer: SaudiEmployerInput = {
  legalEntityId: company,
  effectiveFrom: '2026-06-01',
  regime: 'hrsd_private',
  workModel: 'full_time',
  endOfService: 'statutory_gratuity',
  workingTime: 'standard',
  weeklyRestDays: [5, 6],
  dailyMinutes: 480,
  noticeDays: 60,
  probationDays: 180,
  proration: 'calendar_days',
  reason,
};
const worker: SaudiWorkerContext = {
  id,
  employeeId: randomUUID(),
  legalEntityId: company,
  effectiveFrom: '2026-06-01',
  scheme: 'non_saudi_hazards',
  authority: 'gosi',
  priorParticipation: 'none',
  firstContributionOn: '2020-01-01',
  contributionSalary: '9000',
  contributionBasisOn: '2026-01-01',
  workLocation: 'SA_onshore',
  contractTerm: 'fixed_term',
  contractEndOn: '2030-12-31',
  noticeDays: 60,
  probationDays: 0,
  calendarBasis: 'gregorian_written_agreement',
  ramadanHours: 'applies',
  branches: 'hazards_only',
  occupationalHazardsBps: 200,
  singleEmployer: true,
  insuranceCoverageAttested: true,
  evidenceReference: 'Synthetic GOSI status, not authority review',
  citizenship: 'IN',
  joinedOn: '2020-01-01',
  endedOn: null,
  reason,
};
const payroll = () =>
  saudiPayrollInputSchema.parse({
    legalEntityId: company,
    periodStart: '2026-06-01',
    periodEnd: '2026-06-30',
    reason,
    lines: [
      {
        workerCoverageId: id,
        basic: '6000',
        allowances: '3000',
        unpaidDays: 0,
        sickDaysBefore: 0,
        sickDays: 0,
        probationCompleted: true,
        yearOvertimeMinutesBefore: 0,
        overtime: [],
        deductions: [],
      },
    ],
  });
const calc = (w = worker, p = payroll(), e = employer) => previewSaudiPayroll(p, e, [w]);
const settlement = (overrides: Record<string, unknown> = {}) =>
  saudiSettlementInputSchema.parse({
    legalEntityId: company,
    workerCoverageId: id,
    lastWorkingDay: '2026-06-30',
    basic: '6000',
    allowances: '3000',
    unpaidServiceDays: 0,
    unusedAnnualDays: 0,
    noticePayDays: 0,
    unpaidSalary: '0',
    terminationReason: 'employer_termination',
    entitlementsAttested: true,
    serviceHistory: 'single_employer_no_transfers',
    reason,
    ...overrides,
  });
const leave = (kind = 'sick', extra: Record<string, unknown> = {}) =>
  ({
    legalEntityId: company,
    workerCoverageId: id,
    onDate: '2026-06-01',
    kind,
    usedBefore: 0,
    requestedDays: 1,
    eligibilityAttested: true,
    probationCompleted: true,
    ...extra,
  }) as Parameters<typeof previewSaudiLeave>[0];
describe('Saudi candidate independent arithmetic and boundaries', () => {
  it('retains source review and distinct definition hashes without asserting legal approval', () => {
    const m = saudiManifest();
    expect(m).toMatchObject({
      country: 'SA',
      currency: 'SAR',
      liveEnabled: false,
      previewFrom: '2026-06-01',
      previewThrough: '2026-11-03',
    });
    expect(
      m.rules.every(
        (r) =>
          r.status === 'needs_review' &&
          r.reviewer === null &&
          r.sourceDocumentHash === null &&
          r.definitionHash.length === 64,
      ),
    ).toBe(true);
  });
  it('calculates hazards-only expatriate payroll with employer cost, never an assumed insurance exemption', () => {
    const r = calc();
    expect(r.lines[0]).toMatchObject({
      gross: '9000.00',
      employeeContribution: '0.00',
      employerContribution: '180.00',
      governmentContribution: '0.00',
      net: '9000.00',
    });
    expect(r.lines[0]!.facts).toMatchObject({
      scheme: 'non_saudi_hazards',
      employerHazards: '180.00',
      employeeSaned: '0.00',
    });
  });
  it.each([
    ['gosi_legacy', '2026-06-01', '2026-06-30', '975.00', '1175.00'],
    ['gosi_new', '2026-06-01', '2026-06-30', '1025.00', '1225.00'],
    ['gosi_new', '2026-07-01', '2026-07-31', '1075.00', '1275.00'],
    ['gosi_new', '2026-08-01', '2026-08-31', '1075.00', '1275.00'],
  ] as const)('dates %s contribution changes at %s', (scheme, from, to, employee, employerCost) => {
    const w = {
      ...worker,
      citizenship: 'SA',
      joinedOn: '2025-01-01',
      scheme,
      branches: 'annuities_saned_hazards' as const,
      priorParticipation:
        scheme === 'gosi_legacy' ? ('pre_2024_social' as const) : ('none' as const),
      firstContributionOn: scheme === 'gosi_legacy' ? '2010-01-01' : '2024-07-03',
      contributionSalary: '10000',
    };
    const p = payroll();
    p.periodStart = from;
    p.periodEnd = to;
    p.lines[0]!.basic = '10000';
    p.lines[0]!.allowances = '0';
    expect(calc(w, p).lines[0]).toMatchObject({
      employeeContribution: employee,
      employerContribution: employerCost,
      governmentContribution: '0.00',
    });
  });
  it('retains legacy Civil Pension history despite a new employer joining date', () => {
    expect(() =>
      assertSaudiCohort({
        ...worker,
        citizenship: 'SA',
        scheme: 'gosi_legacy',
        branches: 'annuities_saned_hazards',
        priorParticipation: 'pre_2024_civil',
        firstContributionOn: '2010-01-01',
        joinedOn: '2025-01-01',
      }),
    ).not.toThrow();
  });
  it.each([
    { calendarBasis: 'hijri' },
    { calendarBasis: 'unknown' },
    { workLocation: 'cross_border' },
    { scheme: 'unknown' },
    { scheme: 'gcc_extension', citizenship: 'KW' },
    { singleEmployer: false },
    { insuranceCoverageAttested: false },
    { branches: 'other' },
    { contractTerm: 'unknown' },
    { authority: 'other' },
  ] as const)('blocks unsupported coverage %j', (override) => {
    expect(() => calc({ ...worker, ...override })).toThrow();
  });
  it('requires Saudi nationality and confirmed branches for the full pension cohort', () => {
    expect(() => calc({ ...worker, scheme: 'gosi_new' })).toThrow(
      'saudi_insurance_cohort_unsupported',
    );
  });
  it('rejects conflicting early periods under new law', () => {
    expect(() =>
      calc({
        ...worker,
        citizenship: 'SA',
        scheme: 'gosi_new',
        branches: 'annuities_saned_hazards',
        firstContributionOn: '2010-01-01',
      }),
    ).toThrow('saudi_insurance_history_conflict');
  });
  it('caps the recorded basis and itemizes employee and employer branches', () => {
    const p = payroll();
    p.lines[0]!.basic = '50000';
    p.lines[0]!.allowances = '0';
    p.periodStart = '2026-07-01';
    p.periodEnd = '2026-07-31';
    const r = calc(
      {
        ...worker,
        citizenship: 'SA',
        scheme: 'gosi_new',
        branches: 'annuities_saned_hazards',
        firstContributionOn: '2024-07-03',
        contributionSalary: '50000',
      },
      p,
    ).lines[0]!;
    expect(r).toMatchObject({
      employeeContribution: '4837.50',
      employerContribution: '5737.50',
      net: '45162.50',
    });
    expect(r.facts.contributionBasis).toBe('45000.00');
  });
  it('honours the documented doubled hazards rate', () => {
    expect(calc({ ...worker, occupationalHazardsBps: 400 }).lines[0]!.employerContribution).toBe(
      '360.00',
    );
  });
  it.each([
    { joinedOn: '2026-06-02' },
    { contributionSalary: '399.99' },
    { contributionBasisOn: '2026-06-02' },
    { firstContributionOn: '2026-06-02' },
    { contractEndOn: '2026-06-15' },
  ])('blocks unqualified contribution/date boundary %j', (o) => {
    expect(() => calc({ ...worker, ...o })).toThrow();
  });
  it('blocks partial/reduced months rather than guessing GOSI contribution proration', () => {
    const p = payroll();
    p.lines[0]!.unpaidDays = 1;
    expect(() => calc(worker, p)).toThrow('saudi_partial_month_insurance_requires_review');
  });
  it('computes Saudi overtime on hourly total wage plus half basic wage', () => {
    const p = payroll();
    p.lines[0]!.overtime = [
      {
        date: '2026-06-01',
        minutes: 120,
        kind: 'day',
        ramadan: false,
        scheduledMinutes: 480,
        weeklyWorkedMinutes: 2880,
      },
    ];
    expect(calc(worker, p).lines[0]).toMatchObject({ gross: '9100.00', net: '9100.00' });
  });
  it('rejects inconsistent day contexts and Ramadan hours above the recorded limit', () => {
    const p = payroll();
    p.lines[0]!.overtime = [
      {
        date: '2026-06-01',
        minutes: 60,
        kind: 'day',
        ramadan: true,
        scheduledMinutes: 480,
        weeklyWorkedMinutes: 2400,
      },
    ];
    expect(() => calc(worker, p)).toThrow('saudi_working_time_limit_exceeded');
    p.lines[0]!.overtime[0]!.scheduledMinutes = 360;
    expect(() => calc({ ...worker, ramadanHours: 'unknown' }, p)).toThrow(
      'saudi_ramadan_classification_required',
    );
  });
  it('enforces yearly overtime and the alternate weekly-rest authority boundary', () => {
    const p = payroll();
    p.lines[0]!.yearOvertimeMinutesBefore = 43200;
    p.lines[0]!.overtime = [
      {
        date: '2026-06-01',
        minutes: 1,
        kind: 'day',
        ramadan: false,
        scheduledMinutes: 480,
        weeklyWorkedMinutes: 2880,
      },
    ];
    expect(() => calc(worker, p)).toThrow('saudi_annual_overtime_limit_requires_review');
    expect(() => calc(worker, payroll(), { ...employer, weeklyRestDays: [0, 6] })).toThrow(
      'saudi_alternate_rest_authority_required',
    );
  });
  it.each([
    ['loan', '900.01', true],
    ['court_debt', '2250.01', true],
    ['damage', '1500.01', true],
    ['disciplinary', '1500.01', true],
    ['consented_other', '1', false],
    ['consented_other', '4500.01', true],
  ] as const)('rejects %s ordinary deduction limit or consent', (kind, amount, writtenConsent) => {
    const p = payroll();
    p.lines[0]!.deductions = [
      { kind, amount, writtenConsent, reference: 'Independent deduction source' },
    ];
    expect(() => calc(worker, p)).toThrow();
  });
  it('accepts the ordinary employer loan limit and reconciles net', () => {
    const p = payroll();
    p.lines[0]!.deductions = [
      { kind: 'loan', amount: '900', writtenConsent: false, reference: 'Loan source' },
    ];
    expect(calc(worker, p).total).toBe('8100.00');
  });
  it('uses full / three-quarter / unpaid Saudi sick bands', () => {
    expect(saudiLeaveBands('sick', 29, 3)).toEqual({
      fullDays: 1,
      threeQuarterDays: 2,
      unpaidDays: 0,
    });
    expect(saudiLeaveBands('sick', 89, 3)).toEqual({
      fullDays: 0,
      threeQuarterDays: 1,
      unpaidDays: 2,
    });
    expect(() => saudiLeaveBands('sick', 119, 2)).toThrow();
  });
  it('uses the actual five-year anniversary for the annual floor', () => {
    expect(saudiAnnualFloor('2021-06-02', '2026-06-01').annualDays).toBe(21);
    expect(saudiAnnualFloor('2021-06-02', '2026-06-02').annualDays).toBe(30);
  });
  it('bounds maternity at 84 standard days without creating benefit or payroll approval', () => {
    expect(
      previewSaudiLeave(leave('maternity', { requestedDays: 84 }), employer, worker),
    ).toMatchObject({ fullDays: 84, postedToLedger: false });
    expect(() =>
      previewSaudiLeave(leave('maternity', { requestedDays: 85 }), employer, worker),
    ).toThrow();
  });
  it('bounds parental event days, Hajj eligibility and sibling bereavement', () => {
    expect(
      previewSaudiLeave(
        leave('parental', { eventDate: '2026-05-29', requestedDays: 3 }),
        employer,
        worker,
      ).fullDays,
    ).toBe(3);
    expect(() =>
      previewSaudiLeave(
        leave('parental', { eventDate: '2026-05-26', requestedDays: 3 }),
        employer,
        worker,
      ),
    ).toThrow();
    expect(previewSaudiLeave(leave('hajj', { requestedDays: 15 }), employer, worker).fullDays).toBe(
      15,
    );
    expect(() =>
      previewSaudiLeave(leave('hajj', { requestedDays: 10 }), employer, {
        ...worker,
        joinedOn: '2025-01-01',
      }),
    ).toThrow();
    expect(
      previewSaudiLeave(
        leave('bereavement_sibling', { eventDate: '2026-06-01', requestedDays: 3 }),
        employer,
        worker,
      ).fullDays,
    ).toBe(3);
  });
  it.each([
    ['2024-07-02', '0.00'],
    ['2024-07-01', '3000.00'],
    ['2021-07-01', '7500.00'],
    ['2016-07-01', '67500.00'],
  ] as const)('reconciles independent resignation threshold from %s', (joinedOn, expected) => {
    expect(
      previewSaudiSettlement(settlement({ terminationReason: 'resignation' }), employer, {
        ...worker,
        joinedOn,
      }).total,
    ).toBe(expected);
  });
  it('applies full final-wage awards for normal termination and attested Article 87 exceptions', () => {
    const w = { ...worker, joinedOn: '2024-07-01' };
    expect(previewSaudiSettlement(settlement(), employer, w).total).toBe('9000.00');
    expect(
      previewSaudiSettlement(
        settlement({
          terminationReason: 'article_87_exception',
          article87EvidenceReference: 'Independently checked Article 87 evidence',
        }),
        employer,
        w,
      ).total,
    ).toBe('9000.00');
  });
  it('blocks a contract-expiry reason that conflicts with the recorded contract', () => {
    expect(() =>
      previewSaudiSettlement(settlement({ terminationReason: 'contract_end' }), employer, worker),
    ).toThrow('saudi_contract_expiry_date_conflict');
  });
  it('requires distinct evidence for an Article 87 exception', () => {
    expect(() =>
      previewSaudiSettlement(
        settlement({ terminationReason: 'article_87_exception' }),
        employer,
        worker,
      ),
    ).toThrow('saudi_article87_evidence_required');
  });
  it('rejects disputed settlement, improper notice claims and unrecognized service', () => {
    for (const o of [
      { terminationReason: 'article_80_disputed' },
      { terminationReason: 'resignation', noticePayDays: 1 },
      { unpaidServiceDays: 9999 },
    ])
      expect(() => previewSaudiSettlement(settlement(o), employer, worker)).toThrow();
  });
  it('keeps Saudi sandbox text distinct from bank/Mudad formats and reconciles exact bytes', () => {
    const b = syntheticSaudiWps(
      calc(),
      '2026-06-01',
      '2026-06-30',
      new Date('2026-11-03T00:00:00Z'),
    );
    expect(b.file).toContain('NOT A SEALED BANK FILE');
    expect(b.file).toContain('INTERNAL_CONTROL,1,9000.00,SAR');
    expect(b.file).not.toMatch(/EDR|SCR|AE0703/);
    expect(b.fileHash).toBe(createHash('sha256').update(b.file).digest('hex'));
    expect(b.paymentProven).toBe(false);
    const input = {
      eventId: randomUUID(),
      fileHash: b.fileHash,
      kind: 'accepted' as const,
      reference: 'Synthetic reference',
      acceptedCount: 1,
      rejectedCount: 0,
      returnedTotal: '9000',
      reason,
    };
    expect(() => nextSaudiWpsState('draft', input, b)).toThrow();
    expect(nextSaudiWpsState('uploaded', input, b).paymentProven).toBe(false);
    expect(() =>
      nextSaudiWpsState('uploaded', { ...input, returnedTotal: '8999.99' }, b),
    ).toThrow();
  });
  it('rejects unknown schema fields and malformed money before calculation', () => {
    const p = payroll();
    expect(saudiPayrollInputSchema.safeParse({ ...p, activate: true }).success).toBe(false);
    p.lines[0]!.basic = '1e6';
    expect(saudiPayrollInputSchema.safeParse(p).success).toBe(false);
    expect(saudiWorkerInputSchema.safeParse({ ...worker, contractEndOn: undefined }).success).toBe(
      false,
    );
  });
});
