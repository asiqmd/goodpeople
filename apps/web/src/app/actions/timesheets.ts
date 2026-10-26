'use server';

import type { TimesheetEntriesResult, TimesheetPrefillResult, TimesheetView } from '@gp/shared';
import { revalidatePath } from 'next/cache';
import { authedFetch } from '@/lib/api';
import { fail } from '@/lib/form';
import type { ActionState } from './platform';

const PAGES = '/workspace/timesheets';

/**
 * Changed cells of my month: the form has an `h.<date>.<projectId>` per cell (`none` for work
 * not charged to a project); an empty cell removes its hours.
 */
export async function saveTimesheetEntries(
  month: string,
  _: ActionState<TimesheetEntriesResult>,
  form: FormData,
): Promise<ActionState<TimesheetEntriesResult>> {
  const entries = [...form.entries()]
    .filter(([key]) => key.startsWith('h.'))
    .map(([key, value]) => {
      const [, date, project] = key.split('.');
      return {
        date,
        projectId: project === 'none' ? null : project,
        hours: String(value).trim(),
      };
    });
  if (entries.length === 0) return { ok: true };
  const result = await authedFetch<TimesheetEntriesResult>(
    'tenant',
    '/tenant/timesheets/me/entries',
    { method: 'PUT', body: { month, entries } },
  );
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true, result: result.data };
}

export async function prefillTimesheet(
  month: string,
): Promise<ActionState<TimesheetPrefillResult>> {
  const result = await authedFetch<TimesheetPrefillResult>(
    'tenant',
    '/tenant/timesheets/me/prefill',
    { method: 'POST', body: { month } },
  );
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true, result: result.data };
}

/** Submits my month; the API refuses it unless the declaration is ticked. */
export async function submitTimesheet(
  month: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const result = await authedFetch<TimesheetView>('tenant', '/tenant/timesheets/me/submit', {
    method: 'POST',
    body: { month, declaration: form.get('declaration') === 'on' },
  });
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true };
}

export async function reopenTimesheet(
  id: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const result = await authedFetch<TimesheetView>('tenant', `/tenant/timesheets/${id}/reopen`, {
    method: 'POST',
    body: { reason: String(form.get('reason') ?? '').trim() },
  });
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true };
}
