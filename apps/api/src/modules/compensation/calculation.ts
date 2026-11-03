import { Decimal, money, type CompensationAmounts } from '@gp/shared';
import { badRequest } from '../../common/errors.js';
import { amountFor } from '../payroll/pay-batches.service.js';
import { workOutPay, type ComponentInfo, type StructureInfo } from '../payroll/pay-calc.js';

/** Gross guidance and an independent basic floor. Every proposal is recomputed by the server. */
export function compensationPay(
  before: CompensationAmounts,
  percent: string,
  structure: StructureInfo,
  components: ComponentInfo[],
): CompensationAmounts {
  const target = new Decimal(before.grossBefore)
    .times(new Decimal(percent).dividedBy(100).plus(1))
    .ceil();
  const grossAmount = amountFor(structure, components, before.fixed, 'GROSS', target);
  const basicAmount = amountFor(
    structure,
    components,
    before.fixed,
    'BASIC',
    new Decimal(before.minimumBasic),
  );
  if (!grossAmount || !basicAmount)
    throw badRequest('compensation_formula', 'This structure cannot meet the proposed increment');
  const amountAfter = money(Decimal.max(before.amount, grossAmount, basicAmount));
  const after = workOutPay(structure, components, amountAfter, before.fixed);
  const basicAfter = after.lines.find((l) => l.code === 'BASIC')?.amount ?? '0';
  if (
    after.problems.length ||
    new Decimal(after.gross).lessThan(before.grossBefore) ||
    new Decimal(basicAfter).lessThan(before.minimumBasic)
  )
    throw badRequest('compensation_formula', 'The proposal does not meet the required pay');
  return { ...before, percent, amountAfter, grossAfter: after.gross, basicAfter };
}

export function budgetUse(
  budgets: { orgUnitId: string | null; monthlyAmount: string }[],
  lines: { orgUnitId: string | null; grossBefore: string; grossAfter: string }[],
) {
  return budgets.map((b) => {
    const proposed = money(
      lines
        .filter((l) => b.orgUnitId === null || b.orgUnitId === l.orgUnitId)
        .reduce((total, l) => total.plus(l.grossAfter).minus(l.grossBefore), new Decimal(0)),
    );
    return { ...b, proposed, within: new Decimal(proposed).lessThanOrEqualTo(b.monthlyAmount) };
  });
}
