import type { useFormatter } from 'next-intl';

// Names and amounts as production pages show them, on the server and in the browser.

/** A unit's, operation's or designation's name in the reader's language. */
export const localName = (item: { name: string; nameBn: string | null }, locale: string) =>
  locale === 'bn' && item.nameBn ? item.nameBn : item.name;

/** A person's name in the reader's language. */
export const personName = (e: { fullName: string; fullNameBn: string | null }, locale: string) =>
  locale === 'bn' && e.fullNameBn ? e.fullNameBn : e.fullName;

type NumberFormat = Pick<ReturnType<typeof useFormatter>, 'number'>;

/** Taka in the reader's digits, with paisa when there are any. */
export const taka = (format: NumberFormat, amount: string | number) =>
  `৳${format.number(Number(amount), { maximumFractionDigits: 2 })}`;

/** A rate per piece, which may run to four decimals. */
export const rate = (format: NumberFormat, amount: string | number) =>
  `৳${format.number(Number(amount), { maximumFractionDigits: 4 })}`;
