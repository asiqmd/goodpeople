import type { OutcomeRow } from '@gp/shared';
import { outcomesCsv, outcomesFileName } from './outcomes.js';

const row = (over: Partial<OutcomeRow> = {}): OutcomeRow => ({
  reviewId: 'r1',
  employee: {
    id: 'e1',
    employeeCode: 'MG-0007',
    fullName: 'Rahima Akter',
    fullNameBn: 'রহিমা আক্তার',
  },
  company: { id: 'c1', name: 'My Garments Ltd' },
  orgUnit: { id: 'u1', name: 'Line 1' },
  designation: { id: 'd1', name: 'Sewing Operator' },
  grade: { id: 'g1', name: 'Worker grade 5' },
  finalRating: 4,
  goalScore: '3.75',
  recommendations: {
    increment: true,
    promotionDesignation: { id: 'd2', name: 'Senior Sewing Operator' },
    plan: false,
  },
  // 20:00 UTC is the next morning in Dhaka.
  releasedAt: '2026-12-14T20:00:00.000Z',
  acknowledgedAt: null,
  ...over,
});

describe('outcomes CSV', () => {
  it('has one line per released review, with Dhaka dates', () => {
    const file = outcomesCsv([row()]);
    expect(file.startsWith('\uFEFF')).toBe(true);
    const [header, line] = file.slice(1).trimEnd().split('\n');
    expect(header).toBe(
      'employee_code,name,name_bn,company,unit,designation,grade,final_rating,goal_score,increment,promotion_to,improvement_plan,released_on,acknowledged_on',
    );
    expect(line).toBe(
      'MG-0007,Rahima Akter,রহিমা আক্তার,My Garments Ltd,Line 1,Sewing Operator,Worker grade 5,4,3.75,yes,Senior Sewing Operator,no,2026-12-15,',
    );
  });

  it('neutralises text a spreadsheet would run as a formula', () => {
    const csv = outcomesCsv([
      row({
        employee: { id: 'e2', employeeCode: 'X1', fullName: '=HYPERLINK("x")', fullNameBn: null },
        orgUnit: null,
        grade: null,
        recommendations: { increment: false, promotionDesignation: null, plan: true },
      }),
    ]);
    expect(csv).toContain(
      `X1,"'=HYPERLINK(""x"")",,My Garments Ltd,,Sewing Operator,,4,3.75,no,,yes`,
    );
  });

  it('names the file after the cycle', () => {
    expect(outcomesFileName('Annual review 2026')).toBe('outcomes-annual-review-2026.csv');
    expect(outcomesFileName('বার্ষিক')).toBe('outcomes-cycle.csv');
  });
});
