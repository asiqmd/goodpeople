'use server';

import type {
  ProductionBatchResult,
  ProductionImportResult,
  ProductionOperationView,
} from '@gp/shared';
import { revalidatePath } from 'next/cache';
import { authedFetch, authedUpload } from '@/lib/api';
import { fail } from '@/lib/form';
import type { ActionState } from './platform';

const PAGES = '/workspace/production';

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();
const orNull = (form: FormData, name: string) => text(form, name) || null;

/** An operation's fields from its form; an empty rate or target means none. */
const operationBody = (form: FormData) => ({
  code: text(form, 'code'),
  name: text(form, 'name'),
  nameBn: orNull(form, 'nameBn'),
  style: orNull(form, 'style'),
  pieceRate: orNull(form, 'pieceRate'),
  dailyTarget: orNull(form, 'dailyTarget'),
  incentiveRate: orNull(form, 'incentiveRate'),
});

export async function createOperation(
  _: ActionState<ProductionOperationView>,
  form: FormData,
): Promise<ActionState<ProductionOperationView>> {
  const result = await authedFetch<ProductionOperationView>(
    'tenant',
    '/tenant/production/operations',
    { method: 'POST', body: operationBody(form) },
  );
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true, result: result.data };
}

export async function updateOperation(
  id: string,
  _: ActionState<ProductionOperationView>,
  form: FormData,
): Promise<ActionState<ProductionOperationView>> {
  const result = await authedFetch<ProductionOperationView>(
    'tenant',
    `/tenant/production/operations/${id}`,
    { method: 'PATCH', body: operationBody(form) },
  );
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true, result: result.data };
}

export async function setOperationActive(id: string, active: boolean): Promise<ActionState> {
  const result = await authedFetch(
    'tenant',
    `/tenant/production/operations/${id}/${active ? 'activate' : 'deactivate'}`,
    { method: 'POST' },
  );
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true };
}

/** One operation's pieces for a line's workers: the form has a `q.<employeeId>` per worker. */
export async function saveProduction(
  _: ActionState<ProductionBatchResult>,
  form: FormData,
): Promise<ActionState<ProductionBatchResult>> {
  const entries = [...form.entries()]
    .filter(([key]) => key.startsWith('q.'))
    .map(([key, value]) => ({ employeeId: key.slice(2), quantity: String(value).trim() }));
  if (entries.length === 0) return { ok: true, result: { saved: 0, removed: 0, unchanged: 0 } };
  const result = await authedFetch<ProductionBatchResult>('tenant', '/tenant/production/entries', {
    method: 'PUT',
    body: { date: text(form, 'date'), operationId: text(form, 'operationId'), entries },
  });
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true, result: result.data };
}

export async function importProduction(
  _: ActionState<ProductionImportResult>,
  form: FormData,
): Promise<ActionState<ProductionImportResult>> {
  const result = await authedUpload<ProductionImportResult>('/tenant/production/import', form);
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true, result: result.data };
}
