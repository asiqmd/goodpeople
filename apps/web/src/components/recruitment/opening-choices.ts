import 'server-only';
import type { EmployeeListItem, LegalEntityView, OrgSnapshot, Page } from '@gp/shared';
import { load } from '@/lib/api';

const label = (e: EmployeeListItem) => `${e.fullName} (${e.employeeCode})`;

/**
 * What the opening form chooses from. A line manager (not HR) sees the companies only: they
 * are the hiring manager, and HR fills in the rest.
 */
export async function openingChoices(manage: boolean) {
  const entities = (await load<LegalEntityView[]>('tenant', '/tenant/legal-entities'))
    .filter((e) => e.isActive)
    .map((e) => ({ id: e.id, name: e.name }));
  if (!manage) return { entities, org: null, managers: null, people: null };
  const [org, active, everyone] = await Promise.all([
    load<OrgSnapshot>('tenant', '/tenant/org'),
    load<Page<EmployeeListItem>>('tenant', '/tenant/employees?status=active&pageSize=100'),
    load<Page<EmployeeListItem>>('tenant', '/tenant/employees?pageSize=100'),
  ]);
  return {
    entities,
    org,
    managers: active.items.map((e) => ({ id: e.id, label: label(e) })),
    // Whom an opening replaces has often left already.
    people: everyone.items.map((e) => ({ id: e.id, label: label(e) })),
  };
}
