'use server';
import { revalidatePath } from 'next/cache';
import { authedFetch } from '@/lib/api';
import { fail } from '@/lib/form';
export type PlacementState =
  { ok?: boolean; error?: string; code?: string; details?: string } | undefined;
const text = (f: FormData, key: string) => String(f.get(key) ?? '').trim();
export async function placementChange(_: PlacementState, f: FormData): Promise<PlacementState> {
  const op = text(f, 'op'),
    id = text(f, 'id');
  if (id && !/^[0-9a-f-]{36}$/.test(id)) return { error: 'Invalid placement reference' };
  let path = '/platform/placements',
    body: unknown;
  if (op === 'mfa') {
    path += '/step-up';
    body = { code: text(f, 'code') };
  } else if (op === 'create') {
    body = {
      name: text(f, 'name'),
      slug: text(f, 'slug'),
      customerId: text(f, 'customerId'),
      installationId: text(f, 'installationId'),
      region: text(f, 'region'),
      routeKey: text(f, 'routeKey'),
      apiOrigin: text(f, 'apiOrigin'),
      webOrigin: text(f, 'webOrigin'),
      proofPublicKey: text(f, 'proofPublicKey'),
      reason: text(f, 'reason'),
      residency: Object.fromEntries(
        ['primary', 'replicas', 'backups', 'logs', 'support', 'notifications', 'integrations'].map(
          (key) => [key, text(f, 'residency_' + key)],
        ),
      ),
    };
  } else if (['challenge', 'activate', 'disable'].includes(op) && id) {
    path += '/' + id + '/' + op;
    body = {
      reason: text(f, 'reason'),
      ...(op === 'activate' ? { receipt: text(f, 'receipt') } : {}),
    };
  } else return { error: 'Unknown action' };
  const result = await authedFetch<unknown>('platform', path, { method: 'POST', body });
  if (!result.ok) return fail(result);
  revalidatePath('/platform/placements');
  return {
    ok: true,
    ...(['create', 'challenge'].includes(op)
      ? { details: JSON.stringify(result.data, null, 2) }
      : {}),
  };
}
