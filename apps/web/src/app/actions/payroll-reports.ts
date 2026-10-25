'use server';

import type { ReconciliationView } from '@gp/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { authedFetch, authedUpload } from '@/lib/api';
import { fail } from '@/lib/form';
import type { ActionState } from './platform';

const PAYROLL = '/workspace/payroll';

/** Uploads the current payroll's sheet for a run, then opens it to map and compare. */
export async function uploadReconciliation(
  runId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const result = await authedUpload<ReconciliationView>(
    `/tenant/payroll/runs/${runId}/reconciliations`,
    form,
  );
  if (!result.ok) return fail(result);
  redirect(`${PAYROLL}/reconciliations/${result.data.id}`);
}

/** Compares with the columns chosen: `employeeCode`, `name` and `col.<KEY>` fields. */
export async function compareReconciliation(
  id: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const text = (key: string) => {
    const v = form.get(key);
    return typeof v === 'string' && v !== '' ? v : undefined;
  };
  const columns = Object.fromEntries(
    [...form.keys()]
      .filter((k) => k.startsWith('col.'))
      .flatMap((k) => (text(k) ? [[k.slice(4), text(k)!]] : [])),
  );
  const result = await authedFetch('tenant', `/tenant/payroll/reconciliations/${id}/compare`, {
    method: 'POST',
    body: { employeeCode: text('employeeCode') ?? '', name: text('name'), columns },
  });
  if (!result.ok) return fail(result);
  revalidatePath(`${PAYROLL}/reconciliations/${id}`);
  revalidatePath(`${PAYROLL}/parallel`);
  return { ok: true };
}

/** Uploads the bank's or wallet provider's report on a paid run's payments. */
export async function checkRunPayments(
  runId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const result = await authedUpload(`/tenant/payroll/runs/${runId}/payment-checks`, form);
  if (!result.ok) return fail(result);
  revalidatePath(`${PAYROLL}/runs/${runId}`);
  return { ok: true };
}
