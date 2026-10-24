'use server';

import type {
  HolidayChangeResult,
  LeavePreview,
  LeavePreviewInput,
  LeaveRequestView,
} from '@gp/shared';
import { revalidatePath } from 'next/cache';
import { authedFetch } from '@/lib/api';
import { fail, nest, toNumber } from '@/lib/form';
import type { ActionState } from './platform';

/** Live day count and problems for the apply form. Never writes. */
export async function previewLeave(
  input: LeavePreviewInput & { employeeId?: string },
): Promise<LeavePreview | { error: string }> {
  const { employeeId, ...body } = input;
  const path = employeeId
    ? `/tenant/employees/${employeeId}/leave/preview`
    : '/tenant/me/leave/preview';
  const result = await authedFetch<LeavePreview>('tenant', path, { method: 'POST', body });
  return result.ok ? result.data : { error: result.error.message };
}

export async function applyLeave(
  _: ActionState<LeaveRequestView>,
  form: FormData,
): Promise<ActionState<LeaveRequestView>> {
  const { halfDay, ...data } = nest(form);
  const result = await authedFetch<LeaveRequestView>('tenant', '/tenant/me/leave/requests', {
    method: 'POST',
    body: { ...data, halfDay: halfDay || null },
  });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/leave');
  return { result: result.data };
}

export async function cancelLeave(requestId: string): Promise<void> {
  await authedFetch('tenant', `/tenant/leave/requests/${requestId}/cancel`, { method: 'POST' });
  revalidatePath('/workspace/leave');
  revalidatePath('/workspace/employees');
}

export async function decideApproval(
  stepId: string,
  outcome: 'approve' | 'reject',
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { comment } = nest(form);
  const result = await authedFetch('tenant', `/tenant/approvals/${stepId}/${outcome}`, {
    method: 'POST',
    body: { comment },
  });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/approvals');
  revalidatePath('/workspace', 'layout');
  return { ok: true };
}

// ── Settings (HR) ────────────────────────────────────────────────────────────

/** Checkbox groups and number fields from a leave type form. */
function leaveTypeBody(form: FormData) {
  const data = nest(form);
  const numberOrNull = (key: string) => (data[key] === undefined ? null : toNumber(data[key]));
  return {
    ...data,
    paid: form.has('paid'),
    countsOffDays: form.has('countsOffDays'),
    allowHalfDay: form.has('allowHalfDay'),
    isActive: form.has('isActive') ? true : undefined,
    approvalChain: form.getAll('approvalChain').map(String),
    daysPerYear: numberOrNull('daysPerYear'),
    workedDaysPerLeaveDay: numberOrNull('workedDaysPerLeaveDay'),
    maxDaysPerRequest: numberOrNull('maxDaysPerRequest'),
    carryForwardMax: toNumber(data.carryForwardMax) ?? 0,
    minServiceDays: toNumber(data.minServiceDays) ?? 0,
    requiresDocumentAfterDays: numberOrNull('requiresDocumentAfterDays'),
    gender: data.gender ?? null,
  };
}

export async function updateLeaveType(
  id: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const body = { ...leaveTypeBody(form), isActive: form.has('isActive') };
  const result = await authedFetch('tenant', `/tenant/leave/types/${id}`, {
    method: 'PATCH',
    body,
  });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/leave/settings');
  return { ok: true };
}

export async function createLeaveType(_: ActionState, form: FormData): Promise<ActionState> {
  const { isActive: _active, ...body } = leaveTypeBody(form);
  const result = await authedFetch('tenant', '/tenant/leave/types', { method: 'POST', body });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/leave/settings');
  return { ok: true };
}

export async function provisionLeaveDefaults(): Promise<void> {
  await authedFetch('tenant', '/tenant/leave/types/defaults', { method: 'POST' });
  revalidatePath('/workspace/leave/settings');
}

export async function createCalendar(_: ActionState, form: FormData): Promise<ActionState> {
  const result = await authedFetch('tenant', '/tenant/holiday-calendars', {
    method: 'POST',
    body: { name: String(form.get('name') ?? '').trim(), isDefault: form.has('isDefault') },
  });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/leave/settings');
  return { ok: true };
}

export async function makeDefaultCalendar(id: string): Promise<void> {
  await authedFetch('tenant', `/tenant/holiday-calendars/${id}`, {
    method: 'PATCH',
    body: { isDefault: true },
  });
  revalidatePath('/workspace/leave/settings');
}

export type HolidayState = ActionState<{ recalculated?: number; added?: number; skipped?: number }>;

export async function addHoliday(
  calendarId: string,
  _: HolidayState,
  form: FormData,
): Promise<HolidayState> {
  const result = await authedFetch<HolidayChangeResult>(
    'tenant',
    `/tenant/holiday-calendars/${calendarId}/holidays`,
    {
      method: 'POST',
      body: { ...nest(form), isTentative: form.has('isTentative') },
    },
  );
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/leave/settings');
  return { ok: true, result: { recalculated: result.data.recalculatedRequests } };
}

/** Confirming a tentative date: optionally move it, then clear the tentative flag. */
export async function confirmHoliday(
  id: string,
  _: HolidayState,
  form: FormData,
): Promise<HolidayState> {
  const date = String(form.get('date') ?? '');
  const result = await authedFetch<HolidayChangeResult>('tenant', `/tenant/holidays/${id}`, {
    method: 'PATCH',
    body: { ...(date ? { date } : {}), isTentative: false },
  });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/leave/settings');
  return { ok: true, result: { recalculated: result.data.recalculatedRequests } };
}

export async function deleteHoliday(id: string): Promise<void> {
  await authedFetch('tenant', `/tenant/holidays/${id}`, { method: 'DELETE' });
  revalidatePath('/workspace/leave/settings');
}

export async function importHolidays(calendarId: string, year: number): Promise<HolidayState> {
  const result = await authedFetch<{
    added: number;
    skipped: number;
    recalculatedRequests: number;
  }>('tenant', `/tenant/holiday-calendars/${calendarId}/import-bd`, {
    method: 'POST',
    body: { year },
  });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/leave/settings');
  return { ok: true, result: { added: result.data.added, skipped: result.data.skipped } };
}

export async function updateLocationCalendar(
  locationId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const calendar = String(form.get('holidayCalendarId') ?? '');
  const result = await authedFetch('tenant', `/tenant/locations/${locationId}`, {
    method: 'PATCH',
    body: {
      holidayCalendarId: calendar || null,
      weeklyOffDays: form.getAll('weeklyOffDays').map(Number),
    },
  });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/leave/settings');
  return { ok: true };
}

export async function adjustLeave(
  employeeId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const data = nest(form);
  const result = await authedFetch('tenant', `/tenant/employees/${employeeId}/leave/adjustments`, {
    method: 'POST',
    body: { ...data, year: toNumber(data.year), days: toNumber(data.days) },
  });
  if (!result.ok) return fail(result);
  revalidatePath(`/workspace/employees/${employeeId}`);
  return { ok: true };
}
