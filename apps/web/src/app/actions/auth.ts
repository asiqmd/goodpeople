'use server';

import type {
  MfaChallenge,
  MfaSetup,
  MfaSetupRequired,
  PlatformSession,
  TenantSession,
  TokenPair,
} from '@gp/shared';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { apiFetch } from '@/lib/api';
import { fail } from '@/lib/form';
import { cookieNames, writeSessionCookies, type SessionKind } from '@/lib/session';

/** Where a sign-in is: each step's form sends `step` and what the step needs. */
export type LoginStep = 'password' | 'mfa' | 'mfa_setup' | 'recovery' | 'otp_request' | 'otp_code';

export type LoginState =
  | {
      step?: LoginStep;
      error?: string;
      code?: string;
      issues?: { path: string; message: string }[];
      mfaToken?: string;
      /** Setting up two-step sign-in during sign-in: the key and its QR code. */
      setup?: { secret: string; qr: string };
      recoveryCodes?: string[];
      tenant?: string;
      phone?: string;
    }
  | undefined;

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();
const HOME = { tenant: '/workspace', platform: '/platform' } as const;

async function signedIn(kind: SessionKind, tokens: TokenPair): Promise<never> {
  writeSessionCookies(await cookies(), kind, tokens);
  redirect(HOME[kind]);
}

async function setupStep(mfaToken: string): Promise<LoginState> {
  const started = await apiFetch<MfaSetup>('/auth/mfa/enroll/start', {
    method: 'POST',
    body: { mfaToken },
  });
  if (!started.ok) return { ...fail(started), step: 'password' };
  const qr = await QRCode.toDataURL(started.data.otpauthUrl, { margin: 1, width: 200 });
  return { step: 'mfa_setup', mfaToken, setup: { secret: started.data.secret, qr } };
}

/**
 * Every step of signing in, for workspace and platform logins: a password, then a code from
 * an authenticator app when the login has one (or must set one up), or for employees a code
 * sent by SMS instead of a password.
 */
export async function signIn(
  kind: SessionKind,
  state: LoginState,
  form: FormData,
): Promise<LoginState> {
  const step = text(form, 'step') as LoginStep;

  if (step === 'mfa') {
    const mfaToken = text(form, 'mfaToken');
    const result = await apiFetch<TenantSession | PlatformSession>('/auth/mfa/verify', {
      method: 'POST',
      body: { mfaToken, code: text(form, 'code') },
    });
    if (!result.ok) return { ...fail(result), step: 'mfa', mfaToken };
    return signedIn(kind, result.data);
  }

  if (step === 'mfa_setup') {
    const mfaToken = text(form, 'mfaToken');
    const result = await apiFetch<TokenPair & { recoveryCodes: string[] }>('/auth/mfa/enroll', {
      method: 'POST',
      body: { mfaToken, code: text(form, 'code') },
    });
    if (!result.ok) return { ...fail(result), step: 'mfa_setup', mfaToken, setup: state?.setup };
    writeSessionCookies(await cookies(), kind, result.data);
    // Signed in; the recovery codes are shown once before going on.
    return { step: 'recovery', recoveryCodes: result.data.recoveryCodes };
  }

  if (step === 'otp_request') {
    const tenant = text(form, 'tenant').toLowerCase();
    const phone = text(form, 'phone');
    const result = await apiFetch('/auth/otp/request', {
      method: 'POST',
      body: { tenant, phone },
    });
    if (!result.ok) return { ...fail(result), step: 'otp_request', tenant, phone };
    return { step: 'otp_code', tenant, phone };
  }

  if (step === 'otp_code') {
    const tenant = text(form, 'tenant');
    const phone = text(form, 'phone');
    const result = await apiFetch<TenantSession>('/auth/otp/verify', {
      method: 'POST',
      body: { tenant, phone, code: text(form, 'code') },
    });
    if (!result.ok) return { ...fail(result), step: 'otp_code', tenant, phone };
    return signedIn('tenant', result.data);
  }

  const result =
    kind === 'tenant'
      ? await apiFetch<TenantSession | MfaChallenge | MfaSetupRequired>('/auth/login', {
          method: 'POST',
          body: {
            tenant: text(form, 'tenant').toLowerCase(),
            email: text(form, 'email'),
            password: String(form.get('password') ?? ''),
          },
        })
      : await apiFetch<PlatformSession | MfaChallenge | MfaSetupRequired>('/platform/auth/login', {
          method: 'POST',
          body: { email: text(form, 'email'), password: String(form.get('password') ?? '') },
        });
  if (!result.ok) return { ...fail(result), step: 'password' };
  if ('mfaRequired' in result.data) return { step: 'mfa', mfaToken: result.data.mfaToken };
  if ('mfaSetupRequired' in result.data) return setupStep(result.data.mfaToken);
  return signedIn(kind, result.data);
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
