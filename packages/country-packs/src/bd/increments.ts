/**
 * RMG annual basic increment. The 2023 wage award provides 5%; the 2024 tripartite
 * decision adds 4% from 1 December 2024. Eligibility and application need counsel review.
 * BGMEA circular 30 December 2024, enclosing the Ministry's decision:
 * https://bgmea.com.bd/uploads/circulars/attachments/circular_attachment_Circular_regarding_annual_increment_for_garment_industry_workers__1735622009.pdf
 */
export const BD_RMG_INCREMENT_RULES = [
  {
    effectiveFrom: '2023-12-01',
    percentOfBasic: '5',
    minServiceMonths: 12,
    reviewStatus: 'needs_review',
  },
  {
    effectiveFrom: '2024-12-01',
    percentOfBasic: '9',
    minServiceMonths: 12,
    reviewStatus: 'needs_review',
  },
] as const;

export function bdRmgIncrement(on: string) {
  return BD_RMG_INCREMENT_RULES.findLast((rule) => rule.effectiveFrom <= on) ?? null;
}
