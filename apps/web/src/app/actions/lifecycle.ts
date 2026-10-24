'use server';

import type { DocumentView, ImportBatchView, LetterPreview, SeparationView } from '@gp/shared';
import { revalidatePath } from 'next/cache';
import { authedFetch, authedUpload } from '@/lib/api';
import { fail, nest } from '@/lib/form';
import type { ActionState } from './platform';

/** The same form without its empty text fields, which the API reads as "not given". */
function withoutEmpty(form: FormData): FormData {
  const out = new FormData();
  for (const [key, value] of form.entries()) {
    if (key.startsWith('$')) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    if (typeof value !== 'string' && value.size === 0) continue;
    out.append(key, value);
  }
  return out;
}

// ── Documents ────────────────────────────────────────────────────────────────

export async function uploadDocument(
  employeeId: string,
  _: ActionState<DocumentView>,
  form: FormData,
): Promise<ActionState<DocumentView>> {
  const body = withoutEmpty(form);
  body.set('visibleToEmployee', form.has('visibleToEmployee') ? 'true' : 'false');
  const result = await authedUpload<DocumentView>(
    `/tenant/employees/${employeeId}/documents`,
    body,
  );
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/employees');
  return { result: result.data };
}

export async function setDocumentVisibility(id: string, visibleToEmployee: boolean) {
  await authedFetch('tenant', `/tenant/documents/${id}`, {
    method: 'PATCH',
    body: { visibleToEmployee },
  });
  revalidatePath('/workspace/employees');
}

export async function deleteDocument(id: string) {
  await authedFetch('tenant', `/tenant/documents/${id}`, { method: 'DELETE' });
  revalidatePath('/workspace/employees');
  revalidatePath('/workspace/people');
}

// ── Letters ──────────────────────────────────────────────────────────────────

/** Template id, date and extra.* fields from the letter form. */
function letterBody(form: FormData) {
  const data = nest(form);
  return {
    templateId: data.templateId,
    date: data.date,
    extra: data.extra ?? {},
    visibleToEmployee: form.has('visibleToEmployee'),
  };
}

export async function previewLetter(
  employeeId: string,
  form: FormData,
): Promise<LetterPreview | { error: string }> {
  const result = await authedFetch<LetterPreview>(
    'tenant',
    `/tenant/employees/${employeeId}/letters/preview`,
    { method: 'POST', body: letterBody(form) },
  );
  return result.ok ? result.data : { error: result.error.message };
}

export async function issueLetter(
  employeeId: string,
  _: ActionState<DocumentView>,
  form: FormData,
): Promise<ActionState<DocumentView>> {
  const result = await authedFetch<DocumentView>(
    'tenant',
    `/tenant/employees/${employeeId}/letters`,
    {
      method: 'POST',
      body: letterBody(form),
    },
  );
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/employees');
  return { result: result.data };
}

export async function updateLetterTemplate(
  id: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const data = nest(form);
  const result = await authedFetch('tenant', `/tenant/letter-templates/${id}`, {
    method: 'PATCH',
    body: {
      name: data.name,
      subject: data.subject,
      body: data.body,
      isActive: form.has('isActive'),
    },
  });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/letters');
  return { ok: true };
}

export async function resetLetterTemplate(id: string) {
  await authedFetch('tenant', `/tenant/letter-templates/${id}/reset`, { method: 'POST' });
  revalidatePath('/workspace/letters');
}

// ── Probation, job history and separation ────────────────────────────────────

export async function extendProbation(
  employeeId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const result = await authedFetch('tenant', `/tenant/employees/${employeeId}/probation/extend`, {
    method: 'POST',
    body: nest(form),
  });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/employees');
  revalidatePath('/workspace/people');
  return { ok: true };
}

/** Corrects one job history entry; an empty select clears that field. */
export async function correctJob(
  employeeId: string,
  jobId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const changes: Record<string, string | null> = {};
  for (const key of [
    'locationId',
    'orgUnitId',
    'designationId',
    'gradeId',
    'costCentreId',
    'managerId',
  ]) {
    if (form.has(key)) changes[key] = String(form.get(key)) || null;
  }
  for (const key of ['employmentType', 'workerCategory']) {
    const value = String(form.get(key) ?? '');
    if (value) changes[key] = value;
  }
  const result = await authedFetch('tenant', `/tenant/employees/${employeeId}/jobs/${jobId}`, {
    method: 'PATCH',
    body: { changes, reason: String(form.get('reason') ?? '') },
  });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/employees');
  return { ok: true };
}

export async function recordSeparation(
  employeeId: string,
  _: ActionState<SeparationView>,
  form: FormData,
): Promise<ActionState<SeparationView>> {
  const result = await authedFetch<SeparationView>(
    'tenant',
    `/tenant/employees/${employeeId}/separations`,
    { method: 'POST', body: nest(form) },
  );
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/employees');
  revalidatePath('/workspace/people');
  return { result: result.data };
}

export async function cancelSeparation(id: string) {
  await authedFetch('tenant', `/tenant/separations/${id}/cancel`, { method: 'POST' });
  revalidatePath('/workspace', 'layout');
}

export async function resign(
  _: ActionState<SeparationView>,
  form: FormData,
): Promise<ActionState<SeparationView>> {
  const result = await authedFetch<SeparationView>('tenant', '/tenant/me/resignation', {
    method: 'POST',
    body: nest(form),
  });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/profile');
  return { result: result.data };
}

// ── Import ───────────────────────────────────────────────────────────────────

export async function uploadImport(
  _: ActionState<ImportBatchView>,
  form: FormData,
): Promise<ActionState<ImportBatchView>> {
  const result = await authedUpload<ImportBatchView>(
    '/tenant/imports/employees',
    withoutEmpty(form),
  );
  if (!result.ok) return fail(result);
  return { result: result.data };
}

export async function commitImport(
  batchId: string,
  onlyValid: boolean,
): Promise<ActionState<ImportBatchView>> {
  const result = await authedFetch<ImportBatchView>(
    'tenant',
    `/tenant/imports/employees/${batchId}/commit`,
    { method: 'POST', body: { onlyValid } },
  );
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/employees');
  return { result: result.data };
}
