'use server';

import type { ComplianceCheckResult } from '@gp/shared';
import { revalidatePath } from 'next/cache';
import { authedFetch } from '@/lib/api';
import { fail } from '@/lib/form';
import type { ActionState } from './platform';

const PAGES = '/workspace/compliance';

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();
/** Hours typed in the form, as the API's minutes ("" stays empty for "no cap"). */
const minutes = (form: FormData, name: string) => {
  const hours = text(form, name);
  return hours === '' ? null : Math.round(Number(hours) * 60);
};
/** The API names cap fields in minutes; the form asks for hours. */
const asHours = (issues?: { path: string; message: string }[]) =>
  issues?.map((i) => ({ ...i, path: i.path.replace(/Minutes$/, 'Hours') }));

export async function acknowledgeAlert(
  alertId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const result = await authedFetch('tenant', `/tenant/compliance/alerts/${alertId}/acknowledge`, {
    method: 'POST',
    body: { note: text(form, 'note') },
  });
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true };
}

export async function saveComplianceSettings(_: ActionState, form: FormData): Promise<ActionState> {
  const result = await authedFetch('tenant', '/tenant/compliance/settings', {
    method: 'PUT',
    body: {
      overtimeDailyCapMinutes: minutes(form, 'overtimeDailyCapHours'),
      overtimeWeeklyCapMinutes: minutes(form, 'overtimeWeeklyCapHours'),
      overtimeMonthlyCapMinutes: minutes(form, 'overtimeMonthlyCapHours'),
      warnAtPercent: text(form, 'warnAtPercent'),
    },
  });
  if (!result.ok) return { ...fail(result), issues: asHours(result.error.issues) };
  revalidatePath(PAGES, 'layout');
  return { ok: true };
}

/** Records a woman's written consent to work at night from a date, or clears it. */
export async function setNightConsent(
  employeeId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const clear = form.get('clear') === '1';
  const result = await authedFetch('tenant', `/tenant/compliance/night-work/${employeeId}`, {
    method: 'PUT',
    body: { consentFrom: clear ? null : text(form, 'consentFrom') || null },
  });
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true };
}

/** Checks the given dates now instead of waiting for the hourly check. */
export async function runComplianceCheck(
  _: ActionState<ComplianceCheckResult>,
  form: FormData,
): Promise<ActionState<ComplianceCheckResult>> {
  const result = await authedFetch<ComplianceCheckResult>('tenant', '/tenant/compliance/check', {
    method: 'POST',
    body: { from: text(form, 'from'), to: text(form, 'to') },
  });
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { result: result.data };
}
