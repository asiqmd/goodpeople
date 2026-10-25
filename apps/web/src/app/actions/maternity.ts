'use server';

import type { MaternityCaseView } from '@gp/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { authedFetch } from '@/lib/api';
import { fail, nest } from '@/lib/form';
import type { ActionState } from './platform';

const PAGES = '/workspace/leave/maternity';
const API = '/tenant/maternity/cases';

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();
const orNull = (form: FormData, name: string) => text(form, name) || null;

/** Sends a change to a case and refreshes its pages. */
async function write(
  id: string,
  path: string,
  body: unknown,
  method = 'POST',
): Promise<ActionState> {
  const result = await authedFetch<MaternityCaseView>('tenant', `${API}/${id}${path}`, {
    method,
    body,
  });
  if (!result.ok) return fail(result);
  revalidatePath(PAGES);
  revalidatePath(`${PAGES}/${id}`);
  return { ok: true };
}

/** Opens a case at her notice and goes to it. */
export async function openMaternityCase(_: ActionState, form: FormData): Promise<ActionState> {
  const result = await authedFetch<MaternityCaseView>('tenant', API, {
    method: 'POST',
    body: nest(form),
  });
  if (!result.ok) return fail(result);
  revalidatePath(PAGES);
  redirect(`${PAGES}/${result.data.id}`);
}

export async function saveMaternityDates(
  id: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  return write(
    id,
    '/dates',
    {
      expectedDeliveryOn: text(form, 'expectedDeliveryOn'),
      deliveredOn: orNull(form, 'deliveredOn'),
      proofOn: orNull(form, 'proofOn'),
    },
    'PATCH',
  );
}

/** Without an amount, the average is worked out again from locked payroll. */
export async function setMaternityAverage(
  id: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  return write(id, '/average', nest(form));
}

export async function linkMaternityLeave(
  id: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  return write(id, '/leave', { leaveRequestId: orNull(form, 'leaveRequestId') }, 'PUT');
}

export async function recordMaternityPayment(
  id: string,
  part: number,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  return write(id, `/parts/${part}/payment`, nest(form));
}

export async function closeMaternityCase(
  id: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  return write(id, '/close', { note: orNull(form, 'note') });
}

export async function cancelMaternityCase(
  id: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  return write(id, '/cancel', { reason: text(form, 'reason') });
}
