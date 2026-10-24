import { BD_DIVISIONS, type Address, type OrgUnitView } from '@gp/shared';

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

export function divisionName(code: string, locale: string): string {
  const division = BD_DIVISIONS.find((d) => d.code === code);
  return division ? (locale === 'bn' ? division.nameBn : division.name) : code;
}

export function formatAddress(address: Address, locale: string): string {
  return [
    address.line,
    address.upazila,
    address.district,
    divisionName(address.division, locale),
    address.postcode,
  ]
    .filter(Boolean)
    .join(', ');
}
