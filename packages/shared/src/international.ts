import { z } from 'zod';
export const INTERNATIONAL_CHECKOUT_ENABLED = false as const;
export const JURISDICTIONS = ['BD', 'AE', 'SA'] as const;
export const PAYROLL_CURRENCIES = ['BDT', 'AED', 'SAR'] as const;
export const COMMERCIAL_CURRENCIES = ['BDT', 'USD', 'AED'] as const;
export type PayrollCurrency = (typeof PAYROLL_CURRENCIES)[number];
export const COUNTRY_DEFAULTS = {
  BD: { regime: 'BD_PRIVATE', currency: 'BDT', zone: 'Asia/Dhaka' },
  AE: { regime: 'AE_FEDERAL_PRIVATE', currency: 'AED', zone: 'Asia/Dubai' },
  SA: { regime: 'SA_PRIVATE', currency: 'SAR', zone: 'Asia/Riyadh' },
} as const;
export const timeZoneSchema = z
  .string()
  .max(80)
  .refine((zone) => {
    try {
      if (!/^(?:[A-Za-z_]+\/[^\s]+|UTC)$/.test(zone)) return false;
      return !!new Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions().timeZone;
    } catch {
      return false;
    }
  }, 'Use an IANA time zone');
export const legalProfileInputSchema = z
  .object({
    legalEntityId: z.uuid(),
    countryCode: z.enum(JURISDICTIONS),
    regime: z.enum(['BD_PRIVATE', 'AE_FEDERAL_PRIVATE', 'SA_PRIVATE']),
    currency: z.enum(PAYROLL_CURRENCIES),
    effectiveFrom: z.iso.date(),
    businessTimeZone: timeZoneSchema,
    calendar: z.enum(['gregorian', 'hijri_required']),
    registrations: z.record(z.string().max(40), z.string().max(160)).default({}),
    reason: z.string().trim().min(10).max(1000),
  })
  .strict()
  .refine(
    (p) =>
      COUNTRY_DEFAULTS[p.countryCode].currency === p.currency &&
      COUNTRY_DEFAULTS[p.countryCode].regime === p.regime,
    'Country, regime and payroll currency must agree',
  );
export type LegalProfileInput = z.infer<typeof legalProfileInputSchema>;
export const statutoryProfileInputSchema = z
  .object({
    employeeId: z.uuid(),
    effectiveFrom: z.iso.date(),
    citizenship: z.string().regex(/^[A-Z]{2}$/),
    insuranceClass: z.string().min(2).max(80),
    contractClass: z.string().min(2).max(80),
    originalName: z.string().min(2).max(200),
    translatedName: z.string().max(200).optional(),
    suppliedHijriDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    calendarProvenance: z.string().min(10).max(500).optional(),
    reason: z.string().min(10).max(1000),
  })
  .strict()
  .refine(
    (p) => !p.suppliedHijriDate || !!p.calendarProvenance,
    'Preserve the source and conversion provenance of a supplied Hijri date',
  );
export const identifierInputSchema = z
  .object({
    employeeId: z.uuid(),
    kind: z.enum(['passport', 'national_id', 'tax_id', 'visa', 'residency']),
    issuer: z.string().regex(/^[A-Z]{2}$/),
    value: z.string().trim().min(3).max(100),
    validFrom: z.iso.date().optional(),
    validTo: z.iso.date().optional(),
  })
  .strict()
  .refine(
    (p) => !p.validFrom || !p.validTo || p.validFrom <= p.validTo,
    'Validity end must follow start',
  );
export const commercialPriceInputSchema = z
  .object({
    planCode: z.enum(['starter', 'growth', 'business', 'enterprise']),
    currency: z.enum(['USD', 'AED']),
    seatPrice: z.string().regex(/^\d{1,10}\.\d{2}$/),
    effectiveFrom: z.iso.date(),
    merchantProduct: z.string().min(1).max(100),
    merchantPrice: z.string().min(1).max(100),
    reason: z.string().min(10).max(1000),
  })
  .strict();
export function sumByCurrency(rows: readonly { currency: string; amount: string }[]) {
  const grouped = new Map<string, bigint>();
  for (const row of rows) {
    if (
      !['BDT', 'AED', 'SAR', 'USD'].includes(row.currency) ||
      !/^-?\d+(?:\.\d{1,2})?$/.test(row.amount)
    )
      throw new Error('Explicit supported currency and decimal amount required');
    const negative = row.amount.startsWith('-'),
      [units, fraction = ''] = row.amount.replace('-', '').split('.'),
      minor = BigInt(units!) * 100n + BigInt(fraction.padEnd(2, '0'));
    grouped.set(row.currency, (grouped.get(row.currency) ?? 0n) + (negative ? -minor : minor));
  }
  return [...grouped]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([currency, minor]) => ({
      currency,
      amount:
        (minor < 0n ? '-' : '') +
        (minor < 0n ? -minor : minor) / 100n +
        '.' +
        ((minor < 0n ? -minor : minor) % 100n).toString().padStart(2, '0'),
    }));
}
export const bankIdentifierSchema = z
  .object({
    country: z.enum(JURISDICTIONS),
    currency: z.enum(PAYROLL_CURRENCIES),
    iban: z.string().optional(),
    accountNumber: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.currency !== COUNTRY_DEFAULTS[v.country].currency)
      ctx.addIssue({ code: 'custom', message: 'Cross-currency employee payment is unsupported' });
    if (v.country === 'BD') {
      if (!v.accountNumber || !/^\d{6,30}$/.test(v.accountNumber))
        ctx.addIssue({ code: 'custom', message: 'A BD account number is required' });
      return;
    }
    const iban = (v.iban ?? '').replaceAll(' ', '').toUpperCase(),
      length = v.country === 'AE' ? 23 : 24;
    if (!iban.startsWith(v.country) || iban.length !== length || !/^[A-Z0-9]+$/.test(iban))
      return ctx.addIssue({ code: 'custom', message: 'Invalid country IBAN' });
    const rearranged = iban.slice(4) + iban.slice(0, 4);
    let remainder = 0;
    for (const c of rearranged) {
      for (const digit of /[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c)
        remainder = (remainder * 10 + Number(digit)) % 97;
    }
    if (remainder !== 1) ctx.addIssue({ code: 'custom', message: 'IBAN checksum is invalid' });
  });
export interface LegalProfileView {
  id: string;
  legalEntityId: string;
  companyName?: string;
  countryCode: string;
  regime: string;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  businessTimeZone: string;
  calendar: string;
  reviewStatus: string;
}
export interface InternationalOverview {
  profiles: LegalProfileView[];
  commercialGate: { enabled: false; reason: string };
  reconciliation: { legacyBdCompanies: number; legacyLockedRuns: number };
}

export const internationalBankInputSchema = z
  .object({
    employeeId: z.uuid(),
    legalEntityId: z.uuid(),
    provider: z.string().min(2).max(100),
    accountName: z.string().min(2).max(200),
    destination: bankIdentifierSchema,
  })
  .strict();
