'use server';

import type { AssignCompanyResult, TenantWithAccess } from '@gp/shared';
import { revalidatePath } from 'next/cache';
import { authedFetch } from '@/lib/api';
import { fail } from '@/lib/form';

export type ActionState<T = undefined> =
  | {
      error?: string;
      code?: string;
      issues?: { path: string; message: string }[];
      result?: T;
      ok?: boolean;
    }
  | undefined;

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();
const optional = (form: FormData, name: string) => text(form, name) || undefined;
const optionalInt = (form: FormData, name: string) => {
  const value = text(form, name);
  return value ? Number.parseInt(value, 10) : undefined;
};

/**
 * A date picker gives a calendar day; access ends at the end of that day in Dhaka.
 * Country packs will own this when other time zones arrive.
 */
const endOfDayDhaka = (day: string | undefined) =>
  day ? new Date(`${day}T23:59:59+06:00`).toISOString() : null;

export async function assignCompany(
  _: ActionState<AssignCompanyResult>,
  form: FormData,
): Promise<ActionState<AssignCompanyResult>> {
  const limits = {
    max_employees: optionalInt(form, 'maxEmployees'),
    max_legal_entities: optionalInt(form, 'maxLegalEntities'),
  };
  const result = await authedFetch<AssignCompanyResult>('platform', '/platform/tenants', {
    method: 'POST',
    body: {
      name: text(form, 'name'),
      slug: text(form, 'slug').toLowerCase(),
      industryTemplate: text(form, 'industryTemplate'),
      billingMode: text(form, 'billingMode'),
      planCode: text(form, 'planCode'),
      accessExpiresAt: endOfDayDhaka(optional(form, 'accessExpiresAt')),
      limits,
      reason: text(form, 'reason'),
      admin: {
        name: text(form, 'adminName'),
        email: text(form, 'adminEmail'),
        password: optional(form, 'adminPassword'),
      },
    },
  });
  if (!result.ok) return fail(result);
  revalidatePath('/platform');
  return { result: result.data };
}

export async function updateBilling(
  tenantId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const result = await authedFetch<TenantWithAccess>(
    'platform',
    `/platform/tenants/${tenantId}/billing`,
    {
      method: 'PATCH',
      body: {
        billingMode: text(form, 'billingMode'),
        planCode: text(form, 'planCode'),
        accessExpiresAt: endOfDayDhaka(optional(form, 'accessExpiresAt')),
        reason: text(form, 'reason'),
      },
    },
  );
  if (!result.ok) return fail(result);
  revalidatePath(`/platform/tenants/${tenantId}`);
  return { ok: true };
}

export async function addGrant(
  tenantId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const result = await authedFetch<TenantWithAccess>(
    'platform',
    `/platform/tenants/${tenantId}/grants`,
    {
      method: 'POST',
      body: {
        kind: 'feature',
        key: text(form, 'key'),
        endsAt: endOfDayDhaka(optional(form, 'endsAt')),
        reason: text(form, 'reason'),
      },
    },
  );
  if (!result.ok) return fail(result);
  revalidatePath(`/platform/tenants/${tenantId}`);
  return { ok: true };
}
