'use server';

import type { SupportAccessGrantView, TokenPair } from '@gp/shared';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { apiFetch, authedFetch } from '@/lib/api';
import { fail } from '@/lib/form';
import { cookieNames, writeSessionCookies } from '@/lib/session';
import type { ActionState } from './platform';

const PAGE = '/workspace/support/access';
const CONSOLE = '/platform/support/access';

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

export async function grantSupportAccess(_: ActionState, form: FormData): Promise<ActionState> {
  const result = await authedFetch<SupportAccessGrantView>('tenant', '/tenant/support/access', {
    method: 'POST',
    body: {
      days: text(form, 'days'),
      ticketId: text(form, 'ticketId') || undefined,
      note: text(form, 'note') || undefined,
    },
  });
  if (!result.ok) return fail(result);
  revalidatePath(PAGE);
  return { ok: true };
}

export async function revokeSupportAccess(grantId: string): Promise<ActionState> {
  const result = await authedFetch('tenant', `/tenant/support/access/${grantId}/revoke`, {
    method: 'POST',
  });
  if (!result.ok) return fail(result);
  revalidatePath(PAGE);
  return { ok: true };
}

/**
 * Opens a workspace that let support in. Its read-only session is set exactly as a workspace
 * sign-in sets one, so it replaces any workspace session this browser had.
 */
export async function openSupportWorkspace(
  tenantId: string,
  grantId: string,
): Promise<ActionState> {
  const result = await authedFetch<TokenPair>('platform', '/platform/support/access/sessions', {
    method: 'POST',
    body: { tenantId, grantId },
  });
  if (!result.ok) return fail(result);
  writeSessionCookies(await cookies(), 'tenant', result.data);
  redirect('/workspace');
}

/** From the banner: signing the support login out ends its session, then back to the console. */
export async function endSupportSession(): Promise<void> {
  const jar = await cookies();
  const names = cookieNames('tenant');
  const refreshToken = jar.get(names.refresh)?.value;
  if (refreshToken) {
    await apiFetch('/auth/logout', { method: 'POST', body: { refreshToken } });
  }
  jar.delete(names.access);
  jar.delete(names.refresh);
  redirect(CONSOLE);
}

/** From the console: ends someone's session, wherever it is open. */
export async function endSupportSessionFromConsole(sessionId: string): Promise<ActionState> {
  const result = await authedFetch(
    'platform',
    `/platform/support/access/sessions/${sessionId}/end`,
    {
      method: 'POST',
    },
  );
  if (!result.ok) return fail(result);
  revalidatePath(CONSOLE);
  return { ok: true };
}
