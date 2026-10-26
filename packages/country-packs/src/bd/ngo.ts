import type { LegalReference, ReviewStatus } from '../engine.js';

// NGOs funded from abroad: the Foreign Donations (Voluntary Activities) Regulation Act 2016,
// administered by the NGO Affairs Bureau. Researched on 27 Oct 2026 from the English
// translation of the Act; needs_review until the NGO's counsel confirms it.

const FDVA = (section: string): LegalReference => ({
  act: 'Foreign Donations (Voluntary Activities) Regulation Act 2016',
  section,
});

export interface BdForeignDonationRules {
  from: string;
  /** Foreign money is spent only on projects the Bureau approved (FD-6). */
  approvedProjectsOnly: LegalReference;
  /** At most this share of a project's approved expenditure on administration. */
  adminCapPercent: number;
  adminCapReference: LegalReference;
  /** Years to keep a project's expenditure vouchers after it ends. */
  voucherYears: number;
  voucherReference: LegalReference;
  /** An annual statement of activities, and a declaration of foreign money received and used. */
  annualDeclaration: LegalReference;
  status: ReviewStatus;
}

export const BD_FOREIGN_DONATIONS: readonly BdForeignDonationRules[] = [
  {
    from: '2016-10-13',
    approvedProjectsOnly: FDVA('6'),
    adminCapPercent: 20,
    adminCapReference: FDVA('6'),
    voucherYears: 5,
    voucherReference: FDVA('12'),
    annualDeclaration: FDVA('13'),
    status: 'needs_review',
  },
];

/** The rules in force on a date. */
export function bdForeignDonationsOn(on: string): BdForeignDonationRules {
  const rules = BD_FOREIGN_DONATIONS.filter((r) => r.from <= on).at(-1);
  if (!rules) throw new Error(`No foreign donation rules for ${on}`);
  return rules;
}
