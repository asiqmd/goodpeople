'use server';

import type { PlatformSession, TenantSession } from '@gp/shared';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { cookieNames, writeSessionCookies, type SessionKind } from '@/lib/session';

export type FormState =
  { error?: string; issues?: { path: string; message: string }[] } | undefined;

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

export async function signInWorkspace(_: FormState, form: FormData): Promise<FormState> {
  const result = await apiFetch<TenantSession>('/auth/login', {
    method: 'POST',
    body: {
      tenant: text(form, 'tenant').toLowerCase(),
      email: text(form, 'email'),
      password: String(form.get('password') ?? ''),
    },
  });
  if (!result.ok) return { error: result.error.message, issues: result.error.issues };
  writeSessionCookies(await cookies(), 'tenant', result.data);
  redirect('/workspace');
}

export async function signInPlatform(_: FormState, form: FormData): Promise<FormState> {
  const result = await apiFetch<PlatformSession>('/platform/auth/login', {
    method: 'POST',
    body: { email: text(form, 'email'), password: String(form.get('password') ?? '') },
  });
  if (!result.ok) return { error: result.error.message, issues: result.error.issues };
  writeSessionCookies(await cookies(), 'platform', result.data);
  redirect('/platform');
}

export async function signOut(kind: SessionKind): Promise<void> {
  const jar = await cookies();
  const names = cookieNames(kind);
  const refreshToken = jar.get(names.refresh)?.value;
  if (refreshToken) {
    await apiFetch('/auth/logout', { method: 'POST', body: { refreshToken } });
  }
  jar.delete(names.access);
  jar.delete(names.refresh);
  redirect(kind === 'platform' ? '/platform/login' : '/login');
}
