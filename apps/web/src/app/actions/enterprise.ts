'use server';
import { revalidatePath } from 'next/cache';
import { authedFetch, apiFetch } from '@/lib/api';
import { fail } from '@/lib/form';
export type EnterpriseState =
  { ok?: boolean; error?: string; code?: string; diagnostics?: string } | undefined;
export async function enterpriseChange(_: EnterpriseState, f: FormData): Promise<EnterpriseState> {
  const op = String(f.get('op') ?? '');
  let path = '',
    body: unknown = {};
  if (op === 'mfa') {
    path = '/tenant/identity/step-up';
    body = { code: String(f.get('code') ?? '').trim() };
  } else if (op === 'license') {
    path = '/tenant/enterprise/license';
    body = { envelope: String(f.get('envelope') ?? '').trim() };
  } else if (op === 'clock') path = '/tenant/enterprise/clock-acknowledgement';
  else if (op === 'recovery') {
    path = '/tenant/enterprise/recovery-acknowledgement';
    body = {
      reason: String(f.get('reason') ?? '').trim(),
      reconciled: f.get('reconciled') === 'on',
    };
  } else if (op === 'diagnostics') path = '/tenant/enterprise/diagnostics';
  else return { error: 'Unknown action' };
  const result = await authedFetch<unknown>('tenant', path, { method: 'POST', body });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace', 'layout');
  return {
    ok: true,
    ...(op === 'diagnostics' ? { diagnostics: JSON.stringify(result.data, null, 2) } : {}),
  };
}
export async function claimInstallation(_: EnterpriseState, f: FormData): Promise<EnterpriseState> {
  const result = await apiFetch('/installation/claim', {
    method: 'POST',
    body: { token: String(f.get('token') ?? '').trim(), password: String(f.get('password') ?? '') },
  });
  return result.ok ? { ok: true } : fail(result);
}
