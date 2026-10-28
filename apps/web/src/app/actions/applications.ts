'use server';

import type {
  ApplicationDetail,
  CandidateAdded,
  CandidateDetail,
  CvContacts,
  EmployeeListItem,
  EmployeeRef,
  Page,
} from '@gp/shared';
import { revalidatePath } from 'next/cache';
import { authedFetch, authedUpload } from '@/lib/api';
import { fail } from '@/lib/form';
import type { ActionState } from './platform';

const RECRUITMENT = '/workspace/recruitment';

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();
const orNull = (form: FormData, name: string) => text(form, name) || null;

/** The form as multipart, without empty fields or the empty file a file input sends. */
function withoutEmpty(form: FormData): FormData {
  const out = new FormData();
  for (const [key, value] of form.entries()) {
    if (key.startsWith('$')) continue;
    if (typeof value === 'string' ? value.trim() === '' : value.size === 0) continue;
    out.append(key, value);
  }
  return out;
}

/** Moves an application to another stage; a reason goes with rejecting or withdrawing. */
export async function moveApplication(
  id: string,
  _: ActionState<ApplicationDetail>,
  form: FormData,
): Promise<ActionState<ApplicationDetail>> {
  const stage = text(form, 'stage');
  const closing = stage === 'rejected' || stage === 'withdrawn';
  const result = await authedFetch<ApplicationDetail>(
    'tenant',
    `/tenant/recruitment/applications/${id}/stage`,
    {
      method: 'POST',
      body: {
        stage,
        ...(closing ? { reason: text(form, 'reason') || undefined } : {}),
        emailCandidate: stage === 'rejected' && form.get('emailCandidate') === 'on',
      },
    },
  );
  if (!result.ok) return fail(result);
  revalidatePath(RECRUITMENT, 'layout');
  return { ok: true, result: result.data };
}

export async function addApplicationNote(
  id: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const result = await authedFetch('tenant', `/tenant/recruitment/applications/${id}/notes`, {
    method: 'POST',
    body: { note: text(form, 'note') },
  });
  if (!result.ok) return fail(result);
  revalidatePath(`${RECRUITMENT}/applications/${id}`);
  return { ok: true };
}

/** Adds a person to an opening by hand, with their CV. */
export async function addCandidate(
  _: ActionState<CandidateAdded>,
  form: FormData,
): Promise<ActionState<CandidateAdded>> {
  const result = await authedUpload<CandidateAdded>(
    '/tenant/recruitment/candidates',
    withoutEmpty(form),
  );
  if (!result.ok) return fail(result);
  revalidatePath(RECRUITMENT, 'layout');
  return { ok: true, result: result.data };
}

/** What a CV says about the person, to fill the form; nothing when it cannot be read. */
export async function readCvContacts(
  form: FormData,
): Promise<{ ok: true; contacts: CvContacts } | { ok: false; code?: string; error: string }> {
  const cv = form.get('cv');
  if (!(cv instanceof File) || cv.size === 0) return { ok: false, error: 'No file' };
  const upload = new FormData();
  upload.append('cv', cv);
  const result = await authedUpload<CvContacts>('/tenant/recruitment/cv/parse', upload);
  return result.ok
    ? { ok: true, contacts: result.data }
    : { ok: false, code: result.error.code, error: result.error.message };
}

/** Employees by name or code, to name the one who referred a candidate. */
export async function findEmployees(search: string): Promise<EmployeeRef[]> {
  const query = new URLSearchParams({ status: 'active', pageSize: '10', search: search.trim() });
  const result = await authedFetch<Page<EmployeeListItem>>('tenant', `/tenant/employees?${query}`);
  return result.ok
    ? result.data.items.map((e) => ({
        id: e.id,
        employeeCode: e.employeeCode,
        fullName: e.fullName,
        fullNameBn: e.fullNameBn,
      }))
    : [];
}

export async function updateCandidate(
  id: string,
  _: ActionState<CandidateDetail>,
  form: FormData,
): Promise<ActionState<CandidateDetail>> {
  const result = await authedFetch<CandidateDetail>(
    'tenant',
    `/tenant/recruitment/candidates/${id}`,
    {
      method: 'PATCH',
      body: {
        fullName: text(form, 'fullName'),
        email: orNull(form, 'email'),
        phone: orNull(form, 'phone'),
        notes: orNull(form, 'notes'),
        talentPool: form.get('talentPool') === 'on',
        language: text(form, 'language'),
      },
    },
  );
  if (!result.ok) return fail(result);
  revalidatePath(RECRUITMENT, 'layout');
  return { ok: true, result: result.data };
}

/** Erases a candidate at their request: the person, their CV and what was written about them. */
export async function eraseCandidate(id: string): Promise<ActionState> {
  const result = await authedFetch('tenant', `/tenant/recruitment/candidates/${id}/erase`, {
    method: 'POST',
  });
  if (!result.ok) return fail(result);
  revalidatePath(RECRUITMENT, 'layout');
  return { ok: true };
}
