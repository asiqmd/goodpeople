import type { OrgUnitView } from '@gp/shared';

export { divisionName, formatAddress } from '@gp/shared';

/** Org units in tree order (parents before children), each with its depth. */
export function treeOrder(units: OrgUnitView[]): { unit: OrgUnitView; depth: number }[] {
  const out: { unit: OrgUnitView; depth: number }[] = [];
  const visit = (parentId: string | null, depth: number) => {
    for (const unit of units.filter((u) => u.parentId === parentId)) {
      out.push({ unit, depth });
      visit(unit.id, depth + 1);
    }
  };
  visit(null, 0);
  return out;
}

/** "Production › Sewing › Line 1". */
export function unitPath(units: OrgUnitView[], id: string): string {
  const parts: string[] = [];
  for (let at = units.find((u) => u.id === id); at; at = units.find((u) => u.id === at!.parentId)) {
    parts.unshift(at.name);
  }
  return parts.join(' › ');
}
