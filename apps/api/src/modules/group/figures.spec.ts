import { companyOn, dashboardFigures, trendMonths, type DashboardPerson } from './figures.js';

const job = (legalEntityId: string, effectiveFrom: string) => ({ legalEntityId, effectiveFrom });

describe('companyOn', () => {
  const jobs = [job('A', '2024-01-01'), job('B', '2026-07-01')];

  it('is the latest job started by the date', () => {
    expect(companyOn(jobs, '2026-06-30')).toBe('A');
    expect(companyOn(jobs, '2026-07-01')).toBe('B');
  });

  it('is the first job before someone starts, and none without a job', () => {
    expect(companyOn(jobs, '2023-12-31')).toBe('A');
    expect(companyOn([], '2026-01-01')).toBeNull();
  });
});

describe('dashboardFigures', () => {
  const person = (
    id: string,
    gender: 'male' | 'female',
    joinedOn: string,
    jobs: ReturnType<typeof job>[],
    separatedOn: string | null = null,
  ): DashboardPerson => ({ id, gender, joinedOn, separatedOn, jobs });
  const people = [
    person('p1', 'female', '2020-01-01', [job('A', '2020-01-01')]),
    // Joined in October.
    person('p2', 'male', '2026-10-05', [job('A', '2026-10-05')]),
    // Left A in October.
    person('p3', 'female', '2019-06-01', [job('A', '2019-06-01')], '2026-10-20'),
    // Moved from A to B in July.
    person('p4', 'male', '2022-01-01', [job('A', '2022-01-01'), job('B', '2026-07-01')]),
    // Left B at the end of March.
    person('p5', 'male', '2021-01-01', [job('B', '2021-01-01')], '2026-03-31'),
    // A company the viewer does not see.
    person('p6', 'female', '2021-01-01', [job('C', '2021-01-01')]),
  ];
  const input = {
    month: '2026-10',
    companies: ['A', 'B'],
    people,
    attendance: new Map([
      ['p1', { overtimeMinutes: 90, workingDays: 20, absentDays: 1 }],
      ['p3', { overtimeMinutes: 30, workingDays: 14, absentDays: 2 }],
      ['p4', { overtimeMinutes: 120, workingDays: 21, absentDays: 0 }],
      ['p6', { overtimeMinutes: 600, workingDays: 22, absentDays: 5 }],
    ]),
    alerts: new Map([
      ['A', 2],
      ['C', 5],
    ]),
    pay: new Map([
      ['p1', { gross: '20000', employerCost: '1400' }],
      ['p4', { gross: '30000', employerCost: '2100' }],
      ['p6', { gross: '99999', employerCost: '9999' }],
    ]),
  };

  it('ends the trend with the month', () => {
    expect(trendMonths('2026-02')).toEqual([
      '2025-03',
      '2025-04',
      '2025-05',
      '2025-06',
      '2025-07',
      '2025-08',
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  it('counts each company’s month from where people worked at its end', () => {
    const { companies } = dashboardFigures(input);
    expect(companies.get('A')).toEqual({
      headcount: 2,
      joiners: 1,
      leavers: 1,
      // One leaver over an average of 32 / 12 people at the month ends.
      attritionPercent: 37.5,
      womenPercent: 50,
      // (2495 + 26) days of service over two people.
      averageServiceYears: 3.5,
      overtimeHours: 2,
      workingDays: 34,
      absentDays: 3,
      absencePercent: 8.8,
      openAlerts: 2,
      payrollCost: { gross: '20000.00', employerCost: '1400.00', total: '21400.00' },
      trend: [3, 3, 3, 3, 3, 3, 3, 3, 2, 2, 2, 2],
    });
    expect(companies.get('B')).toEqual({
      headcount: 1,
      joiners: 0,
      leavers: 0,
      attritionPercent: 150,
      womenPercent: 0,
      averageServiceYears: 4.8,
      overtimeHours: 2,
      workingDays: 21,
      absentDays: 0,
      absencePercent: 0,
      openAlerts: 0,
      payrollCost: { gross: '30000.00', employerCost: '2100.00', total: '32100.00' },
      trend: [1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1],
    });
  });

  it('adds the companies shown up for the group, leaving others out', () => {
    const { group, months } = dashboardFigures(input);
    expect(months.at(-1)).toBe('2026-10');
    expect(group).toEqual({
      headcount: 3,
      joiners: 1,
      leavers: 1,
      attritionPercent: 60,
      womenPercent: 33.3,
      averageServiceYears: 3.9,
      overtimeHours: 4,
      workingDays: 55,
      absentDays: 3,
      absencePercent: 5.5,
      openAlerts: 2,
      payrollCost: { gross: '50000.00', employerCost: '3500.00', total: '53500.00' },
      trend: [4, 4, 4, 4, 3, 3, 3, 3, 3, 3, 3, 3],
    });
  });

  it('hides pay from those who may not see it, and has no ratios without people', () => {
    const { group, companies } = dashboardFigures({ ...input, pay: null, companies: ['A', 'E'] });
    expect(group.payrollCost).toBeNull();
    expect(companies.get('E')).toMatchObject({
      headcount: 0,
      attritionPercent: null,
      womenPercent: null,
      averageServiceYears: null,
      absencePercent: null,
      payrollCost: null,
    });
  });
});
