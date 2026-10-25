import type { LegalReference, ReviewStatus } from '../engine.js';

// Salary income tax under the Income Tax Act 2023, one entry per fiscal year (July to June).
// Amounts are whole taka; rates are percentages. Every year is checked by the tax consultant
// against the Finance Act before payroll uses it in a release.

export type TaxArea = 'dhaka_chattogram_city' | 'other_city' | 'elsewhere';

export interface TaxSlab {
  /** The band's width in taka; null for the last, open band. */
  width: number | null;
  rate: number;
}

export interface BdSalaryTaxYear {
  /** e.g. "2026-27". */
  fiscalYear: string;
  /** Income on which no tax is paid, by taxpayer. */
  thresholds: {
    general: number;
    /** Women and people aged 65 or more. */
    femaleOrSenior: number;
    disabled: number;
    thirdGender: number;
    /** Gazetted war-wounded freedom fighters (and the July uprising's injured, where added). */
    freedomFighter: number;
  };
  /** Added to a parent's or guardian's threshold for each dependant with a disability. */
  guardianOfDisabledExtra: number;
  /** The bands above the threshold, lowest first. */
  slabs: readonly TaxSlab[];
  /** Salary income less the lesser of this fraction of it and the cap. */
  salaryExemption: { fraction: number; cap: number };
  /** The rebate: the least of these percentages and the cap. */
  rebate: { ofTaxableIncome: number; ofInvestment: number; cap: number };
  /** The least tax a taxpayer above the threshold pays, by where they live. */
  minimumTax: Record<TaxArea, number>;
  reference: LegalReference;
  status: ReviewStatus;
  note?: string;
  sources: readonly string[];
}

export interface Taxpayer {
  female: boolean;
  /** 65 or older. */
  senior: boolean;
  disabled: boolean;
  thirdGender: boolean;
  freedomFighter: boolean;
  /** Dependants with a disability the taxpayer claims for (one parent claims, not both). */
  disabledDependants: number;
  area: TaxArea;
}

/** How a year's tax on salary was worked out, line by line, for payslips and certificates. */
export interface SalaryTaxBreakdown {
  salary: number;
  exemption: number;
  taxableIncome: number;
  threshold: number;
  grossTax: number;
  investment: number;
  rebate: number;
  minimumTax: number;
  tax: number;
}

const ITA = (section: string): LegalReference => ({ act: 'Income Tax Act 2023', section });

/** The bands above the threshold since the Finance Ordinance 2025 removed the 5% band. */
const SLABS_2025: readonly TaxSlab[] = [
  { width: 300_000, rate: 10 },
  { width: 400_000, rate: 15 },
  { width: 500_000, rate: 20 },
  { width: 2_000_000, rate: 25 },
  { width: null, rate: 30 },
];

const THRESHOLDS_2026 = {
  general: 400_000,
  femaleOrSenior: 450_000,
  disabled: 525_000,
  thirdGender: 525_000,
  freedomFighter: 550_000,
};

/**
 * Income years, not assessment years: "2026-27" is salary paid from July 2026 to June 2027,
 * assessed in 2027-28. Checked against the gazettes by the research on 25 Oct 2026; the tax
 * consultant signs off before release.
 */
export const BD_SALARY_TAX: readonly BdSalaryTaxYear[] = [
  {
    fiscalYear: '2025-26',
    thresholds: THRESHOLDS_2026,
    guardianOfDisabledExtra: 50_000,
    slabs: SLABS_2025,
    salaryExemption: { fraction: 1 / 3, cap: 500_000 },
    rebate: { ofTaxableIncome: 3, ofInvestment: 15, cap: 1_000_000 },
    minimumTax: { dhaka_chattogram_city: 5_000, other_city: 5_000, elsewhere: 5_000 },
    reference: ITA(
      'Second Schedule (Finance Ordinance 2025, Finance Act 2026); s.78; Sixth Schedule',
    ),
    status: 'needs_review',
    note:
      'The Finance Ordinance 2025 set a Tk 375,000 threshold; the Finance Act 2026 raised the ' +
      'thresholds for this income year after it ended, so deductions made during the year used ' +
      'the lower ones. New taxpayers pay a minimum of Tk 1,000.',
    sources: [
      'https://nbr.gov.bd/uploads/acts/Finance_Act_2026.pdf',
      'https://nbr.gov.bd/uploads/acts/5722-Ordinance-28-Law-02_June.pdf',
    ],
  },
  {
    fiscalYear: '2026-27',
    thresholds: THRESHOLDS_2026,
    guardianOfDisabledExtra: 50_000,
    slabs: SLABS_2025,
    salaryExemption: { fraction: 1 / 3, cap: 500_000 },
    rebate: { ofTaxableIncome: 3, ofInvestment: 10, cap: 750_000 },
    minimumTax: { dhaka_chattogram_city: 5_000, other_city: 5_000, elsewhere: 5_000 },
    reference: ITA('Second Schedule (Finance Act 2026); s.78; Sixth Schedule'),
    status: 'needs_review',
    note:
      'The rebate cut to 10% of investment and Tk 7.5 lakh is reported from 1 July 2026; ' +
      'whether it applies from this income year needs the Finance Act page on s.78. New ' +
      'taxpayers pay a minimum of Tk 1,000.',
    sources: [
      'https://nbr.gov.bd/uploads/acts/Finance_Act_2026.pdf',
      'https://assets.kpmg.com/content/dam/kpmg/bd/pdf/Tax/Bangladesh_Tax_2026.pdf',
    ],
  },
];

/** Investments that count for the rebate only up to a yearly amount (Sixth Schedule, Part 3). */
export const BD_INVESTMENT_CAPS: Readonly<Record<string, number>> = {
  dps: 120_000,
  savings_certificate: 500_000,
  mutual_fund: 500_000,
};

/** The tax year's rules, or undefined when the pack has none for it yet. */
export const bdTaxYear = (fiscalYear: string) =>
  BD_SALARY_TAX.find((y) => y.fiscalYear === fiscalYear);

/** The threshold that applies: the highest of the taxpayer's, plus a guardian's extra. */
export function thresholdFor(year: BdSalaryTaxYear, who: Taxpayer): number {
  const t = year.thresholds;
  const base = Math.max(
    t.general,
    who.female || who.senior ? t.femaleOrSenior : 0,
    who.disabled ? t.disabled : 0,
    who.thirdGender ? t.thirdGender : 0,
    who.freedomFighter ? t.freedomFighter : 0,
  );
  return base + who.disabledDependants * year.guardianOfDisabledExtra;
}

/** A year's tax on salary income, after the salary exemption, rebate and minimum tax. */
export function bdSalaryTax(
  year: BdSalaryTaxYear,
  input: { salary: number; investment: number; taxpayer: Taxpayer },
): SalaryTaxBreakdown {
  const salary = Math.max(0, Math.round(input.salary));
  const exemption = Math.min(
    Math.round(salary * year.salaryExemption.fraction),
    year.salaryExemption.cap,
  );
  const taxableIncome = salary - exemption;
  const threshold = thresholdFor(year, input.taxpayer);
  let rest = Math.max(0, taxableIncome - threshold);
  let grossTax = 0;
  for (const slab of year.slabs) {
    if (rest <= 0) break;
    const band = slab.width === null ? rest : Math.min(rest, slab.width);
    grossTax += (band * slab.rate) / 100;
    rest -= band;
  }
  grossTax = Math.round(grossTax);
  const investment = Math.max(0, Math.round(input.investment));
  const rebate = Math.min(
    grossTax,
    Math.round(
      Math.min(
        (taxableIncome * year.rebate.ofTaxableIncome) / 100,
        (investment * year.rebate.ofInvestment) / 100,
        year.rebate.cap,
      ),
    ),
  );
  const above = taxableIncome > threshold;
  const minimumTax = above ? year.minimumTax[input.taxpayer.area] : 0;
  return {
    salary,
    exemption,
    taxableIncome,
    threshold,
    grossTax,
    investment,
    rebate,
    minimumTax,
    tax: above ? Math.max(grossTax - rebate, minimumTax) : 0,
  };
}

/** Tax deducted at source from a worker's participation fund payout (s.88), by payment date. */
export const BD_WPPF_TDS: readonly {
  from: string;
  percent: number;
  reference: LegalReference;
  status: ReviewStatus;
  note: string;
}[] = [
  {
    from: '2023-07-01',
    percent: 5,
    reference: ITA('88'),
    status: 'needs_review',
    note: 'As enacted, continuing the 5% of the 1984 Ordinance (s.52DD).',
  },
  {
    from: '2025-07-01',
    percent: 10,
    reference: ITA('88'),
    status: 'needs_review',
    note:
      'Substituted by the Finance Act 2026 (Act 89 of 2026) notwithstanding Labour Act s.246. ' +
      'Confirm the date it applies from and whether it is the final tax.',
  },
];

export const bdWppfTdsPercent = (on: string) =>
  BD_WPPF_TDS.filter((v) => v.from <= on).at(-1)?.percent ?? 0;
