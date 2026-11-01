import { todayIn, type OutcomeRow } from '@gp/shared';
import { csv } from '../payroll/disbursement.js';

// A cycle's released reviews as M3's increment round reads them, and as HR downloads them.

const HEADER = [
  'employee_code',
  'name',
  'name_bn',
  'company',
  'unit',
  'designation',
  'grade',
  'final_rating',
  'goal_score',
  'increment',
  'promotion_to',
  'improvement_plan',
  'released_on',
  'acknowledged_on',
];

const yesNo = (value: boolean) => (value ? 'yes' : 'no');
const day = (iso: string | null) => (iso ? todayIn('Asia/Dhaka', new Date(iso)) : '');

/**
 * One line per released review; text a spreadsheet would run as a formula is neutralised. It
 * starts with a byte-order mark: without one, Excel reads the Bangla names as Latin-1.
 */
export function outcomesCsv(rows: OutcomeRow[]): string {
  return `\uFEFF${csv([
    HEADER,
    ...rows.map((r) => [
      r.employee.employeeCode,
      r.employee.fullName,
      r.employee.fullNameBn ?? '',
      r.company.name,
      r.orgUnit?.name ?? '',
      r.designation?.name ?? '',
      r.grade?.name ?? '',
      String(r.finalRating),
      r.goalScore ?? '',
      yesNo(r.recommendations.increment),
      r.recommendations.promotionDesignation?.name ?? '',
      yesNo(r.recommendations.plan),
      day(r.releasedAt),
      day(r.acknowledgedAt),
    ]),
  ])}`;
}

/** A file name from the cycle's name, in plain letters. */
export const outcomesFileName = (cycleName: string) => {
  const slug = cycleName
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
  return `outcomes-${slug || 'cycle'}.csv`;
};
