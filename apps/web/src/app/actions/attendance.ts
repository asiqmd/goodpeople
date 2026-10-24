'use server';

import type { EdgeAgentCreated, MyAttendanceToday, RegularizationView } from '@gp/shared';
import { revalidatePath } from 'next/cache';
import { authedFetch, authedUpload } from '@/lib/api';
import { nest, toNumber } from '@/lib/form';
import type { ActionState } from './platform';

const fail = (result: {
  error: { message: string; code?: string; issues?: { path: string; message: string }[] };
}) => ({
  error: result.error.message,
  code: result.error.code,
  issues: result.error.issues,
});

export type PunchState = { error?: string; code?: string; ok?: boolean } | undefined;

/** Punch in or out from the browser, with its position when the user allowed it. */
export async function punch(position: {
  latitude?: number;
  longitude?: number;
  accuracyM?: number;
}): Promise<PunchState> {
  const result = await authedFetch<MyAttendanceToday>('tenant', '/tenant/me/attendance/punch', {
    method: 'POST',
    body: { source: 'web', ...position },
  });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/attendance');
  return { ok: true };
}

/** A punch with a photo, as the workspace asks: the form carries the position and `selfie`. */
export async function punchWithSelfie(form: FormData): Promise<PunchState> {
  const result = await authedUpload<MyAttendanceToday>('/tenant/me/attendance/punch', form);
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/attendance');
  return { ok: true };
}

export async function requestRegularization(
  _: ActionState<RegularizationView>,
  form: FormData,
): Promise<ActionState<RegularizationView>> {
  const data = nest(form);
  const result = await authedFetch<RegularizationView>(
    'tenant',
    '/tenant/me/attendance/regularizations',
    {
      method: 'POST',
      body:
        data.kind === 'on_duty' ? { date: data.date, kind: data.kind, reason: data.reason } : data,
    },
  );
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/attendance');
  return { result: result.data };
}

export async function cancelRegularization(id: string): Promise<void> {
  await authedFetch('tenant', `/tenant/attendance/regularizations/${id}/cancel`, {
    method: 'POST',
  });
  revalidatePath('/workspace/attendance');
}

// ── HR: setup ────────────────────────────────────────────────────────────────

export async function updateAttendanceSettings(
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const data = nest(form);
  const result = await authedFetch('tenant', '/tenant/attendance/settings', {
    method: 'PATCH',
    body: {
      selfPunch: data.selfPunch,
      regularizationChain: form.getAll('regularizationChain'),
      regularizationWindowDays: toNumber(data.regularizationWindowDays),
      trackingFrom: data.trackingFrom,
      requireSelfie: form.has('requireSelfie'),
    },
  });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/attendance', 'layout');
  return { ok: true };
}

const MINUTE_FIELDS = [
  'breakMinutes',
  'lateGraceMinutes',
  'earlyOutGraceMinutes',
  'halfDayMinutes',
  'fullDayMinutes',
  'overtimeMinMinutes',
  'overtimeRoundingMinutes',
] as const;

function shiftBody(form: FormData) {
  const data = nest(form);
  const body: Record<string, unknown> = {
    ...data,
    overtimeEnabled: form.has('overtimeEnabled'),
    isDefault: form.has('isDefault') || undefined,
  };
  for (const key of MINUTE_FIELDS) body[key] = toNumber(data[key]);
  return body;
}

export async function createShift(_: ActionState, form: FormData): Promise<ActionState> {
  const result = await authedFetch('tenant', '/tenant/attendance/shifts', {
    method: 'POST',
    body: shiftBody(form),
  });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/attendance', 'layout');
  return { ok: true };
}

export async function updateShift(
  id: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { code: _code, ...body } = shiftBody(form);
  const result = await authedFetch('tenant', `/tenant/attendance/shifts/${id}`, {
    method: 'PATCH',
    body: { ...body, isActive: form.has('isActive') },
  });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/attendance', 'layout');
  return { ok: true };
}

export async function assignShift(_: ActionState, form: FormData): Promise<ActionState> {
  const data = nest(form);
  const result = await authedFetch('tenant', '/tenant/attendance/shift-assignments', {
    method: 'POST',
    body: {
      employeeIds: form.getAll('employeeIds'),
      shiftId: data.shiftId,
      effectiveFrom: data.effectiveFrom,
    },
  });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/attendance', 'layout');
  revalidatePath('/workspace/employees');
  return { ok: true };
}

/** The pattern is one select per day; "off" is a day off. */
export async function setRoster(_: ActionState, form: FormData): Promise<ActionState> {
  const data = nest(form);
  const pattern = form
    .getAll('pattern')
    .map(String)
    .filter((p) => p !== '')
    .map((p) => (p === 'off' ? null : p));
  const result = await authedFetch('tenant', '/tenant/attendance/roster', {
    method: 'POST',
    body: { employeeIds: form.getAll('employeeIds'), from: data.from, to: data.to, pattern },
  });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/attendance', 'layout');
  return { ok: true };
}

export async function clearRoster(_: ActionState, form: FormData): Promise<ActionState> {
  const data = nest(form);
  const result = await authedFetch('tenant', '/tenant/attendance/roster/clear', {
    method: 'POST',
    body: { employeeIds: form.getAll('employeeIds'), from: data.from, to: data.to },
  });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/attendance', 'layout');
  return { ok: true };
}

export async function createAgent(
  _: ActionState<EdgeAgentCreated>,
  form: FormData,
): Promise<ActionState<EdgeAgentCreated>> {
  const result = await authedFetch<EdgeAgentCreated>('tenant', '/tenant/attendance/agents', {
    method: 'POST',
    body: nest(form),
  });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/attendance/devices');
  return { result: result.data };
}

export async function revokeAgent(id: string): Promise<void> {
  await authedFetch('tenant', `/tenant/attendance/agents/${id}/revoke`, { method: 'POST' });
  revalidatePath('/workspace/attendance/devices');
}

export async function updateDevice(
  id: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const data = nest(form);
  const result = await authedFetch('tenant', `/tenant/attendance/devices/${id}`, {
    method: 'PATCH',
    body: { name: data.name, locationId: data.locationId ?? null },
  });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/attendance/devices');
  return { ok: true };
}

export async function reprocessAttendance(_: ActionState, form: FormData): Promise<ActionState> {
  const result = await authedFetch<{ days: number }>('tenant', '/tenant/attendance/process', {
    method: 'POST',
    body: nest(form),
  });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/attendance', 'layout');
  return { ok: true };
}

// ── HR: one employee ─────────────────────────────────────────────────────────

/** Sets the device PIN; device punches already waiting under it are claimed. */
export async function setAttendancePin(
  employeeId: string,
  _: ActionState<{ linkedPunches: number }>,
  form: FormData,
): Promise<ActionState<{ linkedPunches: number }>> {
  const pin = nest(form).attendancePin ?? null;
  const result = await authedFetch<{ linkedPunches: number }>(
    'tenant',
    `/tenant/employees/${employeeId}/attendance-profile`,
    { method: 'PATCH', body: { attendancePin: pin } },
  );
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/employees');
  revalidatePath('/workspace/attendance', 'layout');
  return { result: result.data };
}

export async function addManualPunch(
  employeeId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const result = await authedFetch('tenant', `/tenant/employees/${employeeId}/attendance/punches`, {
    method: 'POST',
    body: nest(form),
  });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/employees');
  return { ok: true };
}

export async function voidPunch(
  punchId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const result = await authedFetch('tenant', `/tenant/attendance/punches/${punchId}/void`, {
    method: 'POST',
    body: nest(form),
  });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/employees');
  return { ok: true };
}

/** From the unmatched list: this device user is that employee. */
export async function claimDevicePin(
  _: ActionState<{ linkedPunches: number }>,
  form: FormData,
): Promise<ActionState<{ linkedPunches: number }>> {
  const { employeeId } = nest(form);
  if (!employeeId) return { error: 'Choose an employee' };
  return setAttendancePin(employeeId, undefined, form);
}
