import { designationStart } from './coverage.js';
describe('continuous designation service', () => {
  const old = {
    effectiveFrom: '2024-01-01',
    effectiveTo: '2025-12-31',
    legalEntityId: 'a',
    designationId: 'operator',
  };
  const current = { ...old, effectiveFrom: '2026-01-01', effectiveTo: null };
  it('does not restart grace for an unrelated change in the same position', () =>
    expect(designationStart(current, [current, old])).toBe('2024-01-01'));
  it('restarts for a transfer, new designation or a break in job history', () => {
    expect(designationStart({ ...current, legalEntityId: 'b' }, [old])).toBe('2026-01-01');
    expect(designationStart({ ...current, designationId: 'supervisor' }, [old])).toBe('2026-01-01');
    expect(designationStart(current, [{ ...old, effectiveTo: '2025-12-30' }])).toBe('2026-01-01');
  });
});
