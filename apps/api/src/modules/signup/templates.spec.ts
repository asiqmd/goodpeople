import { INDUSTRY_TEMPLATE_DATA } from '@gp/db';
import { INDUSTRY_TEMPLATES } from '@gp/shared';

describe('industry templates', () => {
  it.each(INDUSTRY_TEMPLATES)('%s is internally consistent', (template) => {
    const t = INDUSTRY_TEMPLATE_DATA[template];
    const units = t.units.map((u) => u.code);
    expect(new Set(units).size).toBe(units.length);
    // A unit's parent comes before it, so it exists when the child is created.
    t.units.forEach((u, i) => {
      if (u.parent) expect(units.slice(0, i)).toContain(u.parent);
    });
    const designations = t.designations.map(([code]) => code);
    expect(new Set(designations).size).toBe(designations.length);
    expect(new Set(t.sites.map((s) => s.code)).size).toBe(t.sites.length);
    for (const [, name, nameBn] of t.designations) {
      expect(name).not.toBe('');
      expect(nameBn).toMatch(/[ঀ-৿]/);
    }
  });

  it('gives RMG a factory, so the Labour Act’s factory rules apply there', () => {
    expect(INDUSTRY_TEMPLATE_DATA.rmg.sites.some((s) => s.kind === 'factory')).toBe(true);
  });
});
