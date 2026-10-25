import { BD_RULES, ruleOn, type BdRules } from '@gp/country-packs';
import {
  addDays,
  addMonths,
  Decimal,
  money,
  type MaternityEligibility,
  type MaternityIneligibility,
  type MaternityPartBasis,
  type MaternityPartCovers,
  type MaternityPartStatus,
  type MaternityPaymentOption,
  type MaternityRuleRef,
  type MaternityWageMonth,
  type PayLineView,
} from '@gp/shared';

// Maternity benefit under the Labour Act, Chapter IV: who is owed it, at what daily wage, in
// which parts and by when. Pure: the service loads the case and pay, and stores the results.

type NumericRule = {
  [K in keyof BdRules]: BdRules[K] extends number ? K : never;
}[keyof BdRules] &
  string;

const ruleRef = (key: NumericRule, on: string): MaternityRuleRef => {
  const rule = ruleOn(BD_RULES, key, on);
  return { key, value: rule.value as number, reference: rule.reference, status: rule.status };
};

export interface MaternityRules {
  benefitDays: MaternityRuleRef;
  daysBefore: MaternityRuleRef;
  minServiceDays: MaternityRuleRef;
  childrenLimit: MaternityRuleRef;
  averageMonths: MaternityRuleRef;
  paymentWorkingDays: MaternityRuleRef;
  proofWithinMonths: MaternityRuleRef;
  secondPartAfterProofDays: MaternityRuleRef;
  protectedMonthsBefore: MaternityRuleRef;
  protectedDaysAfter: MaternityRuleRef;
}

/**
 * The rules in force on the delivery (the expected one until it happens): the 2025 amendment
 * gives 120 days to a woman delivering from 17 November 2025, whenever she gave notice.
 */
export function maternityRules(deliveryOn: string): MaternityRules {
  const on = (key: NumericRule) => ruleRef(key, deliveryOn);
  return {
    benefitDays: on('leave.maternity.days'),
    daysBefore: on('maternity.days_before_delivery'),
    minServiceDays: on('leave.maternity.min_service_days'),
    childrenLimit: on('maternity.no_benefit_from_surviving_children'),
    averageMonths: on('maternity.average_wage_months'),
    paymentWorkingDays: on('maternity.payment_working_days'),
    proofWithinMonths: on('maternity.proof_within_months'),
    secondPartAfterProofDays: on('maternity.second_part_after_proof_days'),
    protectedMonthsBefore: on('maternity.protected_months_before'),
    protectedDaysAfter: on('maternity.protected_days_after'),
  };
}

/** The day the case turns on: the delivery once it happened, else the expected one. */
export const deliveryOf = (c: { deliveredOn: string | null; expectedDeliveryOn: string }) =>
  c.deliveredOn ?? c.expectedDeliveryOn;

const daysFrom = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/**
 * s.46: six months' service immediately before the delivery, and fewer than two surviving
 * children. A woman who fails the second still gets the leave, without the benefit.
 */
export function eligibilityOf(
  input: { joinedOn: string; deliveryOn: string; survivingChildren: number },
  rules: MaternityRules,
): MaternityEligibility {
  const served = Math.max(0, daysFrom(input.joinedOn, input.deliveryOn));
  const serviceOk = served >= rules.minServiceDays.value;
  const childrenOk = input.survivingChildren < rules.childrenLimit.value;
  const reasons: MaternityIneligibility[] = [];
  if (!serviceOk) reasons.push('short_service');
  if (!childrenOk) reasons.push('surviving_children');
  return {
    eligible: reasons.length === 0,
    reasons,
    service: {
      joinedOn: input.joinedOn,
      deliveryOn: input.deliveryOn,
      days: served,
      ok: serviceOk,
      rule: rules.minServiceDays,
    },
    children: { surviving: input.survivingChildren, ok: childrenOk, rule: rules.childrenLimit },
  };
}

// ── The average wage (s.48) ──────────────────────────────────────────────────

/** The whole calendar months immediately before the notice month. */
export function wageWindow(noticeOn: string, months: number) {
  const noticeMonth = `${noticeOn.slice(0, 7)}-01`;
  return { start: addMonths(noticeMonth, -months), end: addDays(noticeMonth, -1) };
}

/** The months of a window, as YYYY-MM. */
export function monthsIn(window: { start: string; end: string }): string[] {
  const out: string[] = [];
  for (let m = window.start; m <= window.end; m = addMonths(m, 1)) out.push(m.slice(0, 7));
  return out;
}

/** Lines that take back pay not earned; what is left of the earnings is wages earned. */
const NOT_EARNED = new Set(['ABSENCE', 'UNPAID_LEAVE']);

/** A person's item in a locked regular or adjustment run, decrypted. */
export interface LockedItem {
  /** The regular run an adjustment corrects, or the regular run itself. */
  periodRunId: string;
  periodStart: string;
  periodEnd: string;
  lockedAt: Date;
  lines: PayLineView[];
  workedDays: number;
}

export interface AverageWage {
  months: MaternityWageMonth[];
  missingMonths: string[];
  wages: string;
  workedDays: number;
  averageDailyWage: string;
}

/**
 * Wages earned in the window divided by the days actually worked, or null without any
 * locked pay or worked days in it. An adjustment pays a difference, so a period's wages add
 * up across its runs; its days are a full recount, so they come from its latest run.
 */
export function averageWageOf(
  items: LockedItem[],
  window: { start: string; end: string },
): AverageWage | null {
  const periods = new Map<string, { latest: LockedItem; wages: Decimal }>();
  for (const item of items) {
    if (item.periodStart < window.start || item.periodEnd > window.end) continue;
    let wages = new Decimal(0);
    for (const line of item.lines) {
      if (line.kind === 'earning') wages = wages.plus(line.amount);
      else if (NOT_EARNED.has(line.code)) wages = wages.minus(line.amount);
    }
    const seen = periods.get(item.periodRunId);
    periods.set(item.periodRunId, {
      latest: !seen || item.lockedAt > seen.latest.lockedAt ? item : seen.latest,
      wages: (seen?.wages ?? new Decimal(0)).plus(wages),
    });
  }
  const months: MaternityWageMonth[] = [...periods.values()]
    .map(({ latest, wages }) => ({
      periodStart: latest.periodStart,
      periodEnd: latest.periodEnd,
      wages: money(wages),
      workedDays: latest.workedDays,
    }))
    .toSorted((a, b) => a.periodStart.localeCompare(b.periodStart));
  const wages = months.reduce((s, m) => s.plus(m.wages), new Decimal(0));
  const workedDays = months.reduce((s, m) => s + m.workedDays, 0);
  if (months.length === 0 || workedDays <= 0) return null;
  const missingMonths = monthsIn(window).filter((month) => {
    const first = `${month}-01`;
    return !months.some((p) => p.periodStart < addMonths(first, 1) && p.periodEnd >= first);
  });
  return {
    months,
    missingMonths,
    wages: money(wages),
    workedDays,
    averageDailyWage: money(wages.dividedBy(workedDays)),
  };
}

// ── Parts and when they fall due (s.47) ──────────────────────────────────────

export interface PlannedPart {
  part: number;
  covers: MaternityPartCovers;
  days: number;
  basis: MaternityPartBasis;
}

/** The parts of the option she chose under s.47(4). */
export function planParts(
  option: MaternityPaymentOption,
  benefitDays: number,
  daysBefore: number,
): PlannedPart[] {
  const after = benefitDays - daysBefore;
  switch (option) {
    // (a) the days before delivery on the doctor's certificate, the rest on proof of birth.
    case 'before_and_after':
      return [
        { part: 1, covers: 'before', days: daysBefore, basis: 'certificate' },
        { part: 2, covers: 'after', days: after, basis: 'proof' },
      ];
    // (b) the days up to the delivery on proof of birth, the rest within eight weeks of it.
    case 'after_birth_two_parts':
      return [
        { part: 1, covers: 'before', days: daysBefore, basis: 'proof' },
        { part: 2, covers: 'after', days: after, basis: 'after_proof' },
      ];
    // (c) all of it on proof of birth.
    case 'after_birth_at_once':
      return [{ part: 1, covers: 'whole', days: benefitDays, basis: 'proof' }];
  }
}

/** A part's amount: the average daily wage for its days, in whole taka (paid in cash, s.48). */
export const partAmount = (averageDailyWage: string, days: number) =>
  money(new Decimal(averageDailyWage).times(days).toDecimalPlaces(0, Decimal.ROUND_HALF_UP));

export interface CaseDates {
  noticeOn: string;
  expectedDeliveryOn: string;
  deliveredOn: string | null;
  proofOn: string | null;
}

/** Proof of birth must be produced within months of the delivery (s.47). */
export const proofDeadlineOf = (c: CaseDates, rules: MaternityRules) =>
  addMonths(deliveryOf(c), rules.proofWithinMonths.value);

/**
 * When a part's clock starts, and whether it is lost. The doctor's certificate is taken as
 * produced with the notice, and no earlier than the benefit's first day before the expected
 * delivery, since it certifies a delivery within that many days. Parts waiting for proof of
 * birth are lost when it comes after the deadline, or has not come by it.
 */
export function clockOf(
  basis: MaternityPartBasis,
  c: CaseDates,
  rules: MaternityRules,
  today: string,
): { from: string | null; lost: boolean } {
  if (basis === 'certificate') {
    const first = addDays(c.expectedDeliveryOn, -rules.daysBefore.value);
    return { from: c.noticeOn > first ? c.noticeOn : first, lost: false };
  }
  const deadline = proofDeadlineOf(c, rules);
  if (c.proofOn)
    return c.proofOn > deadline ? { from: null, lost: true } : { from: c.proofOn, lost: false };
  return { from: null, lost: today > deadline };
}

export function partStatus(
  p: { paidOn: string | null; dueOn: string | null; lost: boolean },
  today: string,
): MaternityPartStatus {
  if (p.paidOn) return 'paid';
  if (p.lost) return 'lost';
  if (!p.dueOn) return 'waiting';
  return p.dueOn < today ? 'overdue' : 'due';
}

/** s.50: six months before the delivery to 60 days after it. */
export function protectedWindow(deliveryOn: string, rules: MaternityRules) {
  return {
    from: addMonths(deliveryOn, -rules.protectedMonthsBefore.value),
    to: addDays(deliveryOn, rules.protectedDaysAfter.value),
  };
}
