'use server';
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
import { ACCESS_FIELDS, PERMISSIONS } from '@gp/shared';
import { apiFetch, authedFetch } from '@/lib/api';
import { fail } from '@/lib/form';
export type IdentityState =
  { ok?: boolean; error?: string; code?: string; token?: string } | undefined;
const text = (f: FormData, key: string) => String(f.get(key) ?? '').trim();
export async function identityChange(_: IdentityState, form: FormData): Promise<IdentityState> {
  const op = text(form, 'op'),
    id = text(form, 'id');
  if (id && !UUID.test(id)) return { error: 'Invalid reference' };
  let path = '',
    method = 'POST',
    body: unknown;
  if (op === 'step-up') {
    path = '/step-up';
    body = { code: text(form, 'code') };
  } else if (op === 'role') {
    path = `/roles${id ? `/${id}` : ''}`;
    method = id ? 'PUT' : 'POST';
    body = {
      name: text(form, 'name'),
      permissions: form
        .getAll('permission')
        .filter((v) => PERMISSIONS.includes(v as (typeof PERMISSIONS)[number])),
      deniedPermissions: form.getAll('deniedPermission'),
      fields: Object.fromEntries(
        ACCESS_FIELDS.map((field) => [
          field,
          Object.fromEntries(
            ['read', 'write', 'export'].map((action) => [action, form.has(`${field}.${action}`)]),
          ),
        ]),
      ),
      ...(id ? { version: Number(form.get('version')) } : {}),
    };
  } else if (op === 'assign') {
    path = `/users/${id}/assignments`;
    body = {
      roleId: text(form, 'roleId'),
      scope: text(form, 'scope'),
      companyIds: form.getAll('companyId'),
      relationship: text(form, 'relationship'),
    };
  } else if (op === 'revoke') {
    path = `/assignments/${id}`;
    method = 'DELETE';
  } else if (op === 'template') {
    path = `/users/${id}/template`;
    method = 'PUT';
  } else if (op === 'emergency') {
    path = `/users/${id}/emergency`;
    method = 'PUT';
    body = { enabled: form.get('enabled') === 'true' };
  } else if (op === 'connection') {
    path = `/connections${id ? `/${id}` : ''}`;
    method = id ? 'PUT' : 'POST';
    body = {
      name: text(form, 'name'),
      issuer: text(form, 'issuer'),
      clientId: text(form, 'clientId'),
      enabled: form.has('enabled'),
      provisioningClaim: text(form, 'provisioningClaim'),
      ...(text(form, 'clientSecret') ? { clientSecret: text(form, 'clientSecret') } : {}),
    };
  } else if (op === 'enforcement') {
    path = `/connections/${id}/enforcement`;
    method = 'PUT';
    body = { enabled: form.get('enabled') === 'true' };
  } else if (op === 'credential') {
    path = '/credentials';
    body = {
      connectionId: text(form, 'connectionId'),
      name: text(form, 'name'),
      days: Number(form.get('days')),
    };
  } else if (op === 'credential-revoke') {
    path = `/credentials/${id}`;
    method = 'DELETE';
  } else if (op === 'mapping') {
    path = `/groups/${id}/mappings`;
    method = 'PUT';
    body = {
      roleId: text(form, 'roleId'),
      scope: text(form, 'scope'),
      companyIds: form.getAll('companyId'),
      relationship: 'all',
    };
  } else if (op === 'unmap') {
    path = `/mappings/${id}`;
    method = 'DELETE';
  } else if (op === 'restore-managed') {
    path = `/provisioned/${id}/restore`;
    method = 'PUT';
  } else if (op === 'employee-link') {
    path = `/users/${id}/employee`;
    method = 'PUT';
    body = { employeeId: text(form, 'employeeId') };
  } else return { error: 'Unknown action' };
  const result = await authedFetch<{ token?: string }>('tenant', `/tenant/identity${path}`, {
    method,
    body,
  });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/identity');
  revalidatePath('/workspace/users');
  return { ok: true, ...(result.data?.token ? { token: result.data.token } : {}) };
}
/** The verifier stays in an httpOnly same-site cookie; only its digest enters the API flow. */
export async function startSso(form: FormData) {
  const verifier = randomBytes(32).toString('base64url'),
    binding = createHash('sha256').update(verifier).digest('base64url');
  const mode = text(form, 'mode'),
    id = text(form, 'id');
  const result =
    mode === 'test' && UUID.test(id)
      ? await authedFetch<{ url: string; flowId: string }>(
          'tenant',
          `/tenant/identity/connections/${id}/test`,
          { method: 'POST', body: { binding } },
        )
      : mode === 'link'
        ? await authedFetch<{ url: string; flowId: string }>('tenant', '/account/sso/link', {
            method: 'POST',
            body: { binding },
          })
        : await apiFetch<{ url: string; flowId: string }>('/auth/sso/start', {
            method: 'POST',
            body: { tenant: text(form, 'tenant').toLowerCase(), binding, client: 'web' },
          });
  if (!result.ok)
    redirect(mode === 'test' ? '/workspace/identity?sso=failed' : '/login?sso=failed');
  (await cookies()).set(`gp_sso_${result.data.flowId}`, verifier, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/auth/sso/complete',
    maxAge: 300,
  });
  redirect(result.data.url);
}

export async function findIdentityEmployees(search: string) {
  const result = await authedFetch<
    import('@gp/shared').Page<import('@gp/shared').EmployeeListItem>
  >('tenant', `/tenant/employees?search=${encodeURIComponent(search.slice(0, 100))}&pageSize=20`);
  return result.ok
    ? result.data.items.map((p) => ({ id: p.id, employeeCode: p.employeeCode, name: p.fullName }))
    : [];
}
