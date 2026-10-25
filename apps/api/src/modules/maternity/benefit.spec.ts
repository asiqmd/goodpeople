import type { PayLineView } from '@gp/shared';
import {
  averageWageOf,
  clockOf,
  eligibilityOf,
  maternityRules,
  partAmount,
  partStatus,
  planParts,
  proofDeadlineOf,
  protectedWindow,
  wageWindow,
  type LockedItem,
} from './benefit.js';

const line = (code: string, kind: PayLineView['kind'], amount: string): PayLineView => ({
  code,
  name: code,
  nameBn: null,
  kind,
  inGross: kind === 'earning',
  amount,
});

/** June's pay for a worker on Tk 12,500, with changes. */
const item = (over: Partial<LockedItem>): LockedItem => ({
  periodRunId: 'june',
  periodStart: '2026-06-01',
  periodEnd: '2026-06-30',
  lockedAt: new Date('2026-07-05'),
  lines: [line('BASIC', 'earning', '8500.00'), line('HOUSE_RENT', 'earning', '4000.00')],
  workedDays: 30,
  ...over,
});

describe('maternity rules', () => {
  it('follows the 2025 amendment by the delivery date', () => {
    const before = maternityRules('2025-11-16');
    expect(before.benefitDays.value).toBe(112);
    expect(before.daysBefore.value).toBe(56);
    expect(before.protectedDaysAfter.value).toBe(56);
    const after = maternityRules('2025-11-17');
    expect(after.benefitDays).toMatchObject({ value: 120, reference: { section: '46' } });
    expect(after.daysBefore.value).toBe(60);
    expect(after.protectedDaysAfter.value).toBe(60);
    expect(after.paymentWorkingDays).toMatchObject({ value: 3, reference: { section: '47' } });
  });
});

describe('eligibility (s.46)', () => {
  const rules = maternityRules('2026-09-01');

  it('needs six months of service before the delivery', () => {
    // 180 days from 5 March 2026 is 1 September.
    expect(
      eligibilityOf(
        { joinedOn: '2026-03-05', deliveryOn: '2026-09-01', survivingChildren: 0 },
        rules,
      ),
    ).toMatchObject({ eligible: true, reasons: [], service: { days: 180, ok: true } });
    expect(
      eligibilityOf(
        { joinedOn: '2026-03-06', deliveryOn: '2026-09-01', survivingChildren: 0 },
        rules,
      ),
    ).toMatchObject({ eligible: false, reasons: ['short_service'], service: { days: 179 } });
  });

  it('pays nothing from two surviving children', () => {
    const one = eligibilityOf(
      { joinedOn: '2020-01-01', deliveryOn: '2026-09-01', survivingChildren: 1 },
      rules,
    );
    expect(one.eligible).toBe(true);
    const two = eligibilityOf(
      { joinedOn: '2026-08-01', deliveryOn: '2026-09-01', survivingChildren: 2 },
      rules,
    );
    expect(two).toMatchObject({
      eligible: false,
      reasons: ['short_service', 'surviving_children'],
      children: { surviving: 2, ok: false, rule: { value: 2 } },
    });
  });
});

describe('average daily wage (s.48)', () => {
  const window = wageWindow('2026-09-10', 3);
  it('averages the three calendar months before the notice month', () => {
    expect(window).toEqual({ start: '2026-06-01', end: '2026-08-31' });
    expect(wageWindow('2026-01-31', 3)).toEqual({ start: '2025-10-01', end: '2025-12-31' });
  });

  it('divides wages earned by the days worked', () => {
    const result = averageWageOf(
      [
        item({}),
        item({
          periodRunId: 'july',
          periodStart: '2026-07-01',
          periodEnd: '2026-07-31',
          lines: [
            line('BASIC', 'earning', '8500.00'),
            line('HOUSE_RENT', 'earning', '4000.00'),
            line('OVERTIME', 'earning', '700.00'),
            line('ABSENCE', 'deduction', '283.00'),
            line('TAX', 'deduction', '100.00'),
          ],
          workedDays: 30,
        }),
        // Outside the window: September is the notice month.
        item({ periodRunId: 'sept', periodStart: '2026-09-01', periodEnd: '2026-09-30' }),
      ],
      window,
    );
    // Absence takes back pay not earned; tax does not change what was earned.
    expect(result).toMatchObject({
      wages: '25417.00',
      workedDays: 60,
      averageDailyWage: '423.62',
      missingMonths: ['2026-08'],
    });
    expect(result!.months.map((m) => m.wages)).toEqual(['12500.00', '12917.00']);
  });

  it('adds an adjustment to its period but takes the days from the latest run', () => {
    const result = averageWageOf(
      [
        item({ workedDays: 28 }),
        item({
          lockedAt: new Date('2026-08-10'),
          lines: [line('BASIC', 'earning', '500.00')],
          workedDays: 30,
        }),
      ],
      window,
    );
    expect(result!.months).toEqual([
      { periodStart: '2026-06-01', periodEnd: '2026-06-30', wages: '13000.00', workedDays: 30 },
    ]);
  });

  it('gives nothing without locked pay or days worked', () => {
    expect(averageWageOf([], window)).toBeNull();
    expect(averageWageOf([item({ workedDays: 0 })], window)).toBeNull();
  });
});

describe('payment in parts (s.47(4))', () => {
  const rules = maternityRules('2026-12-01');

  it('splits the benefit by the option she chose', () => {
    expect(planParts('before_and_after', 120, 60)).toEqual([
      { part: 1, covers: 'before', days: 60, basis: 'certificate' },
      { part: 2, covers: 'after', days: 60, basis: 'proof' },
    ]);
    expect(planParts('after_birth_two_parts', 120, 60).map((p) => p.basis)).toEqual([
      'proof',
      'after_proof',
    ]);
    expect(planParts('after_birth_at_once', 120, 60)).toEqual([
      { part: 1, covers: 'whole', days: 120, basis: 'proof' },
    ]);
  });

  it('pays whole taka at the average wage', () => {
    expect(partAmount('407.61', 60)).toBe('24457.00');
    expect(partAmount('500.00', 120)).toBe('60000.00');
  });

  it('starts the certificate clock at the notice, not before the benefit period', () => {
    const c = { expectedDeliveryOn: '2026-12-01', deliveredOn: null, proofOn: null };
    // Notice inside the 60 days before the expected delivery.
    expect(clockOf('certificate', { ...c, noticeOn: '2026-10-15' }, rules, '2026-10-20')).toEqual({
      from: '2026-10-15',
      lost: false,
    });
    // An early notice: the certificate can only speak for the last 60 days.
    expect(clockOf('certificate', { ...c, noticeOn: '2026-08-01' }, rules, '2026-08-02')).toEqual({
      from: '2026-10-02',
      lost: false,
    });
  });

  it('loses the parts that wait for proof of birth when it is late or missing', () => {
    const c = {
      noticeOn: '2026-10-01',
      expectedDeliveryOn: '2026-12-01',
      deliveredOn: '2026-11-25',
    };
    expect(proofDeadlineOf({ ...c, proofOn: null }, rules)).toBe('2027-02-25');
    expect(clockOf('proof', { ...c, proofOn: '2027-02-25' }, rules, '2027-03-01')).toEqual({
      from: '2027-02-25',
      lost: false,
    });
    expect(clockOf('proof', { ...c, proofOn: '2027-02-26' }, rules, '2027-03-01')).toEqual({
      from: null,
      lost: true,
    });
    expect(clockOf('after_proof', { ...c, proofOn: null }, rules, '2027-02-25').lost).toBe(false);
    expect(clockOf('after_proof', { ...c, proofOn: null }, rules, '2027-02-26').lost).toBe(true);
    // The certificate's part does not depend on proof.
    expect(clockOf('certificate', { ...c, proofOn: null }, rules, '2027-06-01').lost).toBe(false);
  });

  it('tells waiting, due, overdue, paid and lost apart', () => {
    const today = '2026-11-10';
    expect(partStatus({ paidOn: null, dueOn: null, lost: false }, today)).toBe('waiting');
    expect(partStatus({ paidOn: null, dueOn: '2026-11-10', lost: false }, today)).toBe('due');
    expect(partStatus({ paidOn: null, dueOn: '2026-11-09', lost: false }, today)).toBe('overdue');
    expect(partStatus({ paidOn: '2026-11-01', dueOn: '2026-11-09', lost: true }, today)).toBe(
      'paid',
    );
    expect(partStatus({ paidOn: null, dueOn: null, lost: true }, today)).toBe('lost');
  });
});

describe('protection from dismissal (s.50)', () => {
  it('runs from six months before the delivery to 60 days after it', () => {
    expect(protectedWindow('2026-12-01', maternityRules('2026-12-01'))).toEqual({
      from: '2026-06-01',
      to: '2027-01-30',
    });
  });
});
