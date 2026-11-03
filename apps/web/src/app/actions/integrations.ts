'use server';
import { revalidatePath } from 'next/cache';
import { authedFetch } from '@/lib/api';
import { fail } from '@/lib/form';
export type IntegrationState =
  | {
      ok?: boolean;
      error?: string;
      code?: string;
      secret?: string;
      keyId?: string;
      clientId?: string;
    }
  | undefined;
const text = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
export async function integrationChange(
  _: IntegrationState,
  f: FormData,
): Promise<IntegrationState> {
  const op = text(f, 'op'),
    id = text(f, 'id');
  if (id && !/^[0-9a-f-]{36}$/.test(id)) return { error: 'Invalid reference' };
  let path = '',
    method = 'POST',
    body: unknown;
  if (op === 'mfa') {
    path = '/tenant/identity/step-up';
    body = { code: text(f, 'code') };
  } else if (op === 'client') {
    path = '/tenant/integrations/clients' + (id ? '/' + id : '');
    method = id ? 'PATCH' : 'POST';
    const scope = text(f, 'scope');
    body = {
      name: text(f, 'name'),
      ownerId: text(f, 'ownerId'),
      days: Number(f.get('days')),
      scopes: f.getAll('scopeKey'),
      fields: f.getAll('field'),
      scope,
      companyIds: scope === 'selected' ? f.getAll('companyId') : [],
      ...(id ? { version: Number(f.get('version')) } : {}),
    };
  } else if (op === 'revoke-client' || op === 'revoke-credential') {
    path = `/tenant/integrations/${op === 'revoke-client' ? 'clients' : 'credentials'}/${id}`;
    method = 'DELETE';
  } else if (op === 'rotate-client') {
    path = `/tenant/integrations/clients/${id}/rotate`;
    body = { overlapSeconds: Number(f.get('overlapSeconds')) };
  } else if (op === 'webhook') {
    path = '/tenant/integrations/webhooks';
    body = {
      clientId: text(f, 'clientId'),
      name: text(f, 'name'),
      url: text(f, 'url'),
      events: f.getAll('event'),
    };
  } else if (op === 'webhook-state') {
    path = `/tenant/integrations/webhooks/${id}/enabled`;
    method = 'PUT';
    body = { enabled: text(f, 'enabled') === 'true' };
  } else if (op === 'rotate-webhook' || op === 'activate-webhook') {
    path = `/tenant/integrations/webhooks/${id}/${op === 'rotate-webhook' ? 'rotate' : 'activate-key'}`;
  } else if (op === 'replay') {
    path = `/tenant/integrations/deliveries/${id}/replay`;
    body = { reason: text(f, 'reason') };
  } else return { error: 'Unsupported change' };
  const result = await authedFetch<Record<string, unknown>>('tenant', path, {
    method,
    ...(body === undefined ? {} : { body }),
  });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/integrations');
  return {
    ok: true,
    ...(typeof result.data.secret === 'string' ? { secret: result.data.secret } : {}),
    ...(typeof result.data.keyId === 'string' ? { keyId: result.data.keyId } : {}),
    ...(typeof result.data.clientId === 'string' ? { clientId: result.data.clientId } : {}),
  };
}
