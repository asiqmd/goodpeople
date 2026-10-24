'use server';

import type { EmployeeDetail, HireResult } from '@gp/shared';
import { revalidatePath } from 'next/cache';
import { authedFetch } from '@/lib/api';
import { nest, rows, toNumber } from '@/lib/form';
import type { ActionState } from './platform';

const CLEAR = '__clear';

const fail = (result: {
  error: { message: string; issues?: { path: string; message: string }[] };
}) => ({
  error: result.error.message,
  issues: result.error.issues,
});

/** Personal, contact, identity and address fields shared by the hire and edit forms. */
function personBody(data: Record<string, any>) {
  const { sameAsPresent, portalEnabled, portalAccess, job, ...person } = data;
  return {
    person: {
      ...person,
      identity: person.identity ?? {},
      permanentAddress: sameAsPresent ? person.presentAddress : person.permanentAddress,
    },
    job,
    portalAccess: portalEnabled ? portalAccess : undefined,
  };
}

export async function hireEmployee(
  _: ActionState<HireResult>,
  form: FormData,
): Promise<ActionState<HireResult>> {
  const data = nest(form);
  const { person, job, portalAccess } = personBody(data);
  const result = await authedFetch<HireResult>('tenant', '/tenant/employees', {
    method: 'POST',
    body: { ...person, job, portalAccess },
  });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/employees');
  return { result: result.data };
}

export async function updateEmployee(
  id: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { person } = personBody(nest(form));
  const { employeeCode: _code, joinedOn: _joined, ...editable } = person as Record<string, unknown>;
  const result = await authedFetch<EmployeeDetail>('tenant', `/tenant/employees/${id}`, {
    method: 'PATCH',
    body: editable,
  });
  if (!result.ok) return fail(result);
  revalidatePath(`/workspace/employees/${id}`);
  return { ok: true };
}

export async function changeJob(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { event, effectiveFrom, reason, changes = {} } = nest(form);
  // "No change" options submit nothing; "remove" submits null.
  const cleaned = Object.fromEntries(
    Object.entries(changes as Record<string, string>).map(([k, v]) => [k, v === CLEAR ? null : v]),
  );
  const result = await authedFetch<EmployeeDetail>(
    'tenant',
    `/tenant/employees/${id}/job-changes`,
    {
      method: 'POST',
      body: { event, effectiveFrom, reason, changes: cleaned },
    },
  );
  if (!result.ok) return fail(result);
  revalidatePath(`/workspace/employees/${id}`);
  return { ok: true };
}

export async function saveNominees(
  id: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const body = rows(nest(form).rows).map((r) => ({
    ...r,
    sharePercent: toNumber(r.sharePercent),
  }));
  const result = await authedFetch('tenant', `/tenant/employees/${id}/nominees`, {
    method: 'PUT',
    body,
  });
  if (!result.ok) return fail(result);
  revalidatePath(`/workspace/employees/${id}`);
  return { ok: true };
}

export async function savePaymentAccounts(
  id: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const data = nest(form);
  const body = rows(data.rows).map((r, i) => ({ ...r, isPrimary: String(i) === data.primary }));
  const result = await authedFetch('tenant', `/tenant/employees/${id}/payment-accounts`, {
    method: 'PUT',
    body,
  });
  if (!result.ok) return fail(result);
  revalidatePath(`/workspace/employees/${id}`);
  return { ok: true };
}

export type OrgKind =
  'legal-entities' | 'locations' | 'org-units' | 'designations' | 'grades' | 'cost-centres';

export async function createOrgItem(
  kind: OrgKind,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const data = nest(form);
  for (const key of ['rank', 'latitude', 'longitude', 'geofenceRadiusM']) {
    if (key in data) data[key] = toNumber(data[key]);
  }
  const result = await authedFetch('tenant', `/tenant/${kind}`, { method: 'POST', body: data });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/organization');
  return { ok: true };
}

export async function setOrgItemActive(
  kind: OrgKind,
  id: string,
  isActive: boolean,
): Promise<void> {
  await authedFetch('tenant', `/tenant/${kind}/${id}`, { method: 'PATCH', body: { isActive } });
  revalidatePath('/workspace/organization');
}
