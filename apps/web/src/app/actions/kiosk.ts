'use server';

import type {
  KioskCreated,
  KioskDeviceView,
  KioskMeView,
  KioskPinRequestResult,
  KioskSession,
  LeaveRequestView,
} from '@gp/shared';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { KIOSK_COOKIES, kioskCookie, kioskFetch } from '@/app/kiosk/kiosk-api';
import { authedFetch, type ApiResult } from '@/lib/api';
import { fail, nest } from '@/lib/form';
import type { ActionState } from './platform';

const STAFF_PAGE = '/workspace/attendance/kiosks';
const YEAR_SECONDS = 365 * 24 * 60 * 60;

// ── HR ───────────────────────────────────────────────────────────────────────

export async function createKiosk(
  _: ActionState<KioskCreated>,
  form: FormData,
): Promise<ActionState<KioskCreated>> {
  const result = await authedFetch<KioskCreated>('tenant', '/tenant/kiosks', {
    method: 'POST',
    body: nest(form),
  });
  if (!result.ok) return fail(result);
  revalidatePath(STAFF_PAGE);
  return { result: result.data };
}

export async function revokeKiosk(id: string): Promise<void> {
  await authedFetch('tenant', `/tenant/kiosks/${id}/revoke`, { method: 'POST' });
  revalidatePath(STAFF_PAGE);
}

// ── The tablet ───────────────────────────────────────────────────────────────

/** A kiosk action's answer: its data, or why the API said no, for the screen to explain. */
export type KioskReply<T = undefined> =
  { ok: true; data: T } | { ok: false; code: string; message: string; retryAfterSeconds?: number };

async function reply<T>(result: ApiResult<T>): Promise<KioskReply<T>> {
  if (result.ok) return { ok: true, data: result.data };
  const {
    code = 'failed',
    message,
    retryAfterSeconds,
  } = result.error as typeof result.error & {
    retryAfterSeconds?: number;
  };
  // A session the API no longer accepts is of no use to keep.
  if (code === 'kiosk_session_ended' || code === 'kiosk_employee_inactive') {
    (await cookies()).delete({ name: KIOSK_COOKIES.session, path: '/kiosk' });
  }
  return { ok: false, code, message, retryAfterSeconds };
}

/** A staff member pastes the token once; it is checked, then kept on this tablet only. */
export async function setUpKiosk(_: ActionState, form: FormData): Promise<ActionState> {
  const token = String(form.get('token') ?? '').trim();
  const result = await kioskFetch<KioskDeviceView>('/device', { tokens: { device: token } });
  if (!result.ok) return fail(result);
  const jar = await cookies();
  jar.set(KIOSK_COOKIES.device, token, kioskCookie(YEAR_SECONDS));
  jar.delete({ name: KIOSK_COOKIES.session, path: '/kiosk' });
  revalidatePath('/kiosk');
  return { ok: true };
}

export async function setKioskLanguage(locale: 'en' | 'bn'): Promise<void> {
  (await cookies()).set(
    KIOSK_COOKIES.locale,
    locale === 'en' ? 'en' : 'bn',
    kioskCookie(YEAR_SECONDS),
  );
}

export async function requestPinCode(
  employeeCode: string,
): Promise<KioskReply<KioskPinRequestResult>> {
  return reply(
    await kioskFetch<KioskPinRequestResult>('/pin/request', {
      method: 'POST',
      body: { employeeCode },
    }),
  );
}

export async function setKioskPin(
  employeeCode: string,
  code: string,
  pin: string,
): Promise<KioskReply> {
  return reply(
    await kioskFetch<undefined>('/pin', { method: 'POST', body: { employeeCode, code, pin } }),
  );
}

/** Signs the worker in and returns their screen. */
export async function signInWorker(
  employeeCode: string,
  pin: string,
): Promise<KioskReply<KioskMeView>> {
  const session = await kioskFetch<KioskSession>('/sessions', {
    method: 'POST',
    body: { employeeCode, pin },
  });
  if (!session.ok) return reply(session);
  const { sessionToken, expiresInSeconds } = session.data;
  (await cookies()).set(KIOSK_COOKIES.session, sessionToken, kioskCookie(expiresInSeconds));
  return reply(
    await kioskFetch<KioskMeView>('/me', { session: true, tokens: { session: sessionToken } }),
  );
}

export async function loadWorker(): Promise<KioskReply<KioskMeView>> {
  return reply(await kioskFetch<KioskMeView>('/me', { session: true }));
}

export async function applyKioskLeave(input: {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason: string;
}): Promise<KioskReply<LeaveRequestView>> {
  return reply(
    await kioskFetch<LeaveRequestView>('/leave', { method: 'POST', body: input, session: true }),
  );
}

/** "Done", or the screen left idle: the session ends at the API and on the tablet. */
export async function endWorkerSession(): Promise<void> {
  const jar = await cookies();
  if (!jar.has(KIOSK_COOKIES.session)) return;
  await kioskFetch('/sessions/end', { method: 'POST', session: true }).catch(() => undefined);
  jar.delete({ name: KIOSK_COOKIES.session, path: '/kiosk' });
}
