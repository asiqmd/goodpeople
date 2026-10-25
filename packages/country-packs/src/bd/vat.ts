import type { VatServiceCode } from '@gp/shared';
import type { LegalReference, ReviewStatus } from '../engine.js';

// VAT on what Good People itself sells: a subscription billed to Bangladeshi businesses. The
// VAT and Supplementary Duty Act 2012 and its rules, as amended to the Finance Act 2026 (Act 96
// of 2026), researched on 25 Oct 2026. Every value is needs_review until the tax consultant
// signs it off, and the service code is a setting because NBR has not ruled on it for SaaS.

const VAT = (section: string): LegalReference => ({
  act: 'VAT and Supplementary Duty Act 2012',
  section,
});

export interface VatService {
  label: string;
  /** VAT on the value of the supply, in percent. */
  rate: number;
  /** What a withholding customer deducts at source (VDS), in percent of the value. */
  vdsRate: number;
}

export interface BdVatYear {
  from: string;
  services: Record<VatServiceCode, VatService>;
  /** The buyer's name, address and BIN go on a tax invoice above this value (rule 40). */
  buyerDetailsAbove: number;
  /** On a credit or debit note, above this VAT effect (rule 40(1)(g)). */
  noteBuyerDetailsAbove: number;
  /** A supply above this not paid through a bank or MFS costs the buyer its input credit (s.46). */
  bankPaymentAbove: number;
  /** Months of tax periods a seller has to take credit for VAT withheld (VDS rule 8). */
  vdsCreditPeriods: number;
  reference: LegalReference;
  status: ReviewStatus;
  note: string;
}

export const BD_VAT: readonly BdVatYear[] = [
  {
    from: '2025-07-01',
    services: {
      'S099.10': { label: 'IT-enabled services (ITES)', rate: 5, vdsRate: 5 },
      'S099.20': { label: 'Other miscellaneous services', rate: 15, vdsRate: 15 },
    },
    buyerDetailsAbove: 25_000,
    noteBuyerDetailsAbove: 5_000,
    bankPaymentAbove: 100_000,
    vdsCreditPeriods: 6,
    reference: VAT('15'),
    status: 'needs_review',
    note:
      'Standard rate 15% (s.15). S099.10 at 5% under the VDS Rules 2025, rule 3 (kept by SRO ' +
      '140/2026). Whether a SaaS subscription is S099.10 or S099.20 needs a written NBR ruling.',
  },
];

/**
 * Registered startups are exempt from local VAT and from VAT withheld at source (SRO
 * 147-Ain/2026, 1 Jul 2026 – 30 Jun 2035), when NBR has registered the company as a startup.
 */
export const BD_VAT_STARTUP_EXEMPTION = {
  from: '2026-07-01',
  to: '2035-06-30',
  reference: { act: 'SRO 147-Ain/2026', section: '1' } as LegalReference,
};

/** Tax a customer deducts at source from a service fee (ITA 2023, s.90; TDS Rules rule 4). */
export const BD_SERVICE_TDS = {
  percent: 10,
  /** IT-enabled services income, which names SaaS, is exempt until this date (Sixth Schedule). */
  itesExemptUntil: '2027-06-30',
  reference: { act: 'Income Tax Act 2023', section: '90' } as LegalReference,
  status: 'needs_review' as ReviewStatus,
};

/** The VAT year in force on a date. */
export function bdVatOn(on: string): BdVatYear {
  const year = BD_VAT.filter((y) => y.from <= on).at(-1);
  if (!year) throw new Error(`No VAT rules for ${on}`);
  return year;
}

/** VAT and VDS for a supply on a date, with a registered startup's exemption. */
export function bdVatFor(
  code: VatServiceCode,
  on: string,
  options: { startup: boolean },
): VatService & { exempt: boolean } {
  const service = bdVatOn(on).services[code];
  const exempt =
    options.startup && on >= BD_VAT_STARTUP_EXEMPTION.from && on <= BD_VAT_STARTUP_EXEMPTION.to;
  return exempt ? { ...service, rate: 0, vdsRate: 0, exempt } : { ...service, exempt };
}
