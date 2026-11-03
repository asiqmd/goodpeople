import { describe, it, expect } from 'vitest';
import { workforceQuerySchema, PLAN_CATALOG, WORKFORCE_DEFINITIONS, can } from './index.js';
describe('analytics opt-in and bounded query contract', () => {
  it('keeps existing plans free of automatic analytics activation', () =>
    expect(
      PLAN_CATALOG.every(
        (p) =>
          !p.features.includes('analytics') &&
          !p.features.includes('analytics_insights') &&
          !p.features.includes('workspace_assistant') &&
          !p.features.includes('anomaly_review'),
      ),
    ).toBe(true));
  it('deliberately permits template administrators while ordinary employees have no analytics right', () => {
    expect(can('tenant_admin', 'analytics.view')).toBe(true);
    expect(can('hr_admin', 'analytics.view')).toBe(true);
    expect(can('employee', 'analytics.view')).toBe(false);
  });
  it('versions exactly the three non-financial people metrics', () =>
    expect(WORKFORCE_DEFINITIONS.map((m) => [m.id, m.version])).toEqual([
      ['headcount', 'workforce.v1'],
      ['joiners', 'workforce.v1'],
      ['leavers', 'workforce.v1'],
    ]));
  it.each([
    { asOf: '2026-02-30' },
    { companyIds: 'not-a-company' },
    { employeeId: 'exclude-someone' },
    { sql: 'select 1' },
    { locationId: 'x' },
    { asOf: ['2026-01-01', '2026-02-01'] },
  ])('rejects invalid or arbitrary query input %j', (q) =>
    expect(workforceQuerySchema.safeParse(q).success).toBe(false),
  );
});
