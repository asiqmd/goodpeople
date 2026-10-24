'use server';

import type {
  DeliveryView,
  EmployeeListItem,
  MfaEnabled,
  MfaSetup,
  NotificationSettingsInput,
  NotificationTemplateView,
  WorkspaceUserCreated,
  WorkspaceUserView,
} from '@gp/shared';
import { CONFIGURABLE_EVENTS, DELIVERY_CHANNELS } from '@gp/shared';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import QRCode from 'qrcode';
import { authedFetch } from '@/lib/api';
import { fail, nest } from '@/lib/form';
import { cookieNames, type SessionKind } from '@/lib/session';
import type { ActionState } from './platform';

const ACCOUNT = { tenant: '/workspace/account', platform: '/platform/account' } as const;

// ── The signed-in login ──────────────────────────────────────────────────────

export async function changePassword(
  kind: SessionKind,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const keepRefreshToken = (await cookies()).get(cookieNames(kind).refresh)?.value;
  const result = await authedFetch(kind, '/account/password', {
    method: 'POST',
    body: {
      currentPassword: String(form.get('currentPassword') ?? ''),
      newPassword: String(form.get('newPassword') ?? ''),
      keepRefreshToken,
    },
  });
  if (!result.ok) return fail(result);
  return { ok: true };
}

export type MfaSetupState =
  (ActionState & { setup?: { secret: string; qr: string }; recoveryCodes?: string[] }) | undefined;

/** Starts setup (a new key and its QR code), then confirms it with the first code. */
export async function setUpMfa(
  kind: SessionKind,
  state: MfaSetupState,
  form: FormData,
): Promise<MfaSetupState> {
  if (form.get('step') === 'start') {
    const result = await authedFetch<MfaSetup>(kind, '/account/mfa/setup', { method: 'POST' });
    if (!result.ok) return fail(result);
    const qr = await QRCode.toDataURL(result.data.otpauthUrl, { margin: 1, width: 200 });
    return { setup: { secret: result.data.secret, qr } };
  }
  const result = await authedFetch<MfaEnabled>(kind, '/account/mfa/confirm', {
    method: 'POST',
    body: { code: String(form.get('code') ?? '').trim() },
  });
  if (!result.ok) return { ...fail(result), setup: state?.setup };
  // No revalidation here: the page would swap this form out before the codes are seen.
  return { recoveryCodes: result.data.recoveryCodes };
}

export async function disableMfa(
  kind: SessionKind,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const result = await authedFetch(kind, '/account/mfa/disable', {
    method: 'POST',
    body: { password: String(form.get('password') ?? '') },
  });
  if (!result.ok) return fail(result);
  revalidatePath(ACCOUNT[kind]);
  return { ok: true };
}

// ── Workspace logins (admins) ────────────────────────────────────────────────

export async function createUser(
  _: ActionState<WorkspaceUserCreated>,
  form: FormData,
): Promise<ActionState<WorkspaceUserCreated>> {
  const { employeeCode, ...body } = nest(form);
  // The person this login belongs to, found by their employee code.
  if (employeeCode) {
    const found = await authedFetch<{ items: EmployeeListItem[] }>(
      'tenant',
      `/tenant/employees?search=${encodeURIComponent(employeeCode)}&pageSize=20`,
    );
    const employee = found.ok
      ? found.data.items.find((e) => e.employeeCode.toLowerCase() === employeeCode.toLowerCase())
      : undefined;
    if (!employee) {
      return {
        error: 'No employee has this code',
        code: 'employee_not_found',
        issues: [{ path: 'employeeCode', message: 'No employee has this code' }],
      };
    }
    body.employeeId = employee.id;
  }
  const result = await authedFetch<WorkspaceUserCreated>('tenant', '/tenant/users', {
    method: 'POST',
    body,
  });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/users');
  return { result: result.data };
}

export async function updateUser(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  const data = nest(form);
  const result = await authedFetch<WorkspaceUserView>('tenant', `/tenant/users/${id}`, {
    method: 'PATCH',
    body: {
      name: data.name,
      role: data.role,
      // An emptied field removes the email or number.
      email: data.email ?? null,
      phone: data.phone ?? null,
    },
  });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/users');
  return { ok: true };
}

export async function setUserDisabled(id: string, disabled: boolean): Promise<ActionState> {
  const result = await authedFetch('tenant', `/tenant/users/${id}`, {
    method: 'PATCH',
    body: { disabled },
  });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/users');
  return { ok: true };
}

export async function resetUserPassword(
  id: string,
): Promise<ActionState<{ temporaryPassword: string }>> {
  const result = await authedFetch<{ temporaryPassword: string }>(
    'tenant',
    `/tenant/users/${id}/reset-password`,
    { method: 'POST' },
  );
  if (!result.ok) return fail(result);
  return { result: result.data };
}

export async function resetUserMfa(id: string): Promise<ActionState> {
  const result = await authedFetch('tenant', `/tenant/users/${id}/reset-mfa`, { method: 'POST' });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/users');
  return { ok: true };
}

// ── Notifications ────────────────────────────────────────────────────────────

/** Opens a notification: marks it read, then goes where it points. */
export async function openNotification(id: string, link: string | null): Promise<void> {
  await authedFetch('tenant', `/tenant/notifications/${id}/read`, { method: 'POST' });
  revalidatePath('/workspace', 'layout');
  // Only paths inside the app; a link is never sent anywhere else.
  redirect(link?.startsWith('/workspace') ? link : '/workspace/notifications');
}

export async function markAllRead(): Promise<void> {
  await authedFetch('tenant', '/tenant/notifications/read-all', { method: 'POST' });
  revalidatePath('/workspace', 'layout');
}

export async function saveNotificationSettings(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const channels: NotificationSettingsInput['channels'] = {};
  for (const event of CONFIGURABLE_EVENTS) {
    channels[event] = DELIVERY_CHANNELS.filter((c) => form.has(`channels.${event}.${c}`));
  }
  const result = await authedFetch('tenant', '/tenant/notification-settings', {
    method: 'PATCH',
    body: {
      emailEnabled: form.has('emailEnabled'),
      smsEnabled: form.has('smsEnabled'),
      pushEnabled: form.has('pushEnabled'),
      channels,
    } satisfies NotificationSettingsInput,
  });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/notifications');
  return { ok: true };
}

export async function saveNotificationTemplate(
  event: string,
  language: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const result = await authedFetch<NotificationTemplateView>(
    'tenant',
    `/tenant/notification-templates/${event}/${language}`,
    {
      method: 'PUT',
      body: {
        title: String(form.get('title') ?? ''),
        body: String(form.get('body') ?? ''),
        sms: String(form.get('sms') ?? ''),
      },
    },
  );
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/notifications');
  return { ok: true };
}

export async function resetNotificationTemplate(event: string, language: string): Promise<void> {
  await authedFetch('tenant', `/tenant/notification-templates/${event}/${language}`, {
    method: 'DELETE',
  });
  revalidatePath('/workspace/notifications');
}

export async function retryDelivery(id: string): Promise<ActionState<DeliveryView>> {
  const result = await authedFetch<DeliveryView>(
    'tenant',
    `/tenant/notification-deliveries/${id}/retry`,
    { method: 'POST' },
  );
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/notifications');
  return { result: result.data };
}
