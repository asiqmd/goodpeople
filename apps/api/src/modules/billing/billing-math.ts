import { Decimal, money, type InvoiceLine, type SeatCount } from '@gp/shared';

// What a month costs: seats at the plan's prices, the minimum, a coupon, then VAT. Pure, so
// the arithmetic on an invoice can be checked by hand.

export interface MonthPrice {
  staffSeat: string;
  workerSeat: string;
  minimum: string;
}

export interface CouponTerms {
  code: string;
  percentOff: string | null;
  amountOff: string | null;
}

export interface Quote {
  lines: InvoiceLine[];
  subtotal: string;
  discount: string;
  /** Value before VAT. */
  taxable: string;
  vat: string;
  total: string;
}

const round2 = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/** The first and last day of a month, and its length. */
export function monthBounds(month: string) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const end = new Date(Date.UTC(y, m, 0));
  return {
    start: `${month}-01`,
    end: end.toISOString().slice(0, 10),
    days: end.getUTCDate(),
  };
}

/**
 * A month's charge. `fromDay` charges a first month from that day only (billing began
 * mid-month), as a share of the month's days.
 */
export function quoteMonth(input: {
  planName: string;
  seats: SeatCount;
  price: MonthPrice;
  month: string;
  fromDay?: number;
  coupon?: CouponTerms | null;
  vatRate: number;
}): Quote {
  const { days } = monthBounds(input.month);
  const share =
    input.fromDay && input.fromDay > 1
      ? new Decimal(days - input.fromDay + 1).dividedBy(days)
      : new Decimal(1);
  const part = share.lessThan(1) ? ` (${days - input.fromDay! + 1} of ${days} days)` : '';
  const line = (description: string, quantity: number, unit: string): InvoiceLine => ({
    description,
    quantity,
    unitPrice: money(round2(new Decimal(unit).times(share))),
    amount: money(round2(new Decimal(unit).times(share)).times(quantity)),
  });
  const lines: InvoiceLine[] = [];
  if (input.seats.staff > 0) {
    lines.push(
      line(`${input.planName}: staff, per person${part}`, input.seats.staff, input.price.staffSeat),
    );
  }
  if (input.seats.workers > 0) {
    lines.push(
      line(
        `${input.planName}: workers, per person${part}`,
        input.seats.workers,
        input.price.workerSeat,
      ),
    );
  }
  let subtotal = lines.reduce((s, l) => s.plus(l.amount), new Decimal(0));
  const minimum = round2(new Decimal(input.price.minimum).times(share));
  if (subtotal.lessThan(minimum)) {
    const topUp = minimum.minus(subtotal);
    lines.push({
      description: `${input.planName}: minimum monthly charge${part}`,
      quantity: 1,
      unitPrice: money(topUp),
      amount: money(topUp),
    });
    subtotal = minimum;
  }
  const discount = input.coupon
    ? input.coupon.percentOff
      ? round2(subtotal.times(input.coupon.percentOff).dividedBy(100))
      : Decimal.min(subtotal, new Decimal(input.coupon.amountOff ?? 0))
    : new Decimal(0);
  return withVat(lines, subtotal, discount, input.vatRate);
}

/** Lines that already have their amounts (a partner's workspaces, a credit note), plus VAT. */
export function withVat(
  lines: InvoiceLine[],
  subtotal: Decimal,
  discount: Decimal,
  vatRate: number,
): Quote {
  const taxable = subtotal.minus(discount);
  const vat = round2(taxable.times(vatRate).dividedBy(100));
  return {
    lines,
    subtotal: money(subtotal),
    discount: money(discount),
    taxable: money(taxable),
    vat: money(vat),
    total: money(taxable.plus(vat)),
  };
}

/**
 * What is still owed: the total less payments received, tax withheld (unless rejected) and
 * credit notes issued against it.
 */
export function balanceOf(
  total: string,
  settlements: { kind: string; status: string; amount: string }[],
  credits: string[],
): Decimal {
  const settled = settlements
    .filter((s) => (s.kind === 'payment' ? s.status === 'succeeded' : s.status !== 'rejected'))
    .reduce((sum, s) => sum.plus(s.amount), new Decimal(0));
  const credited = credits.reduce((sum, c) => sum.plus(c), new Decimal(0));
  return new Decimal(total).minus(settled).minus(credited);
}
