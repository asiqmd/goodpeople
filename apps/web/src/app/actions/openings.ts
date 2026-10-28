'use server';

import {
  DEFAULT_CANDIDATE_RETENTION_MONTHS,
  type OpeningDetail,
  type RecruitmentSettingsView,
} from '@gp/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { authedFetch } from '@/lib/api';
import { fail } from '@/lib/form';
import type { ActionState } from './platform';

const PAGES = '/workspace/recruitment';

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();
const orNull = (form: FormData, name: string) => text(form, name) || null;

/** The scorecard's criteria, one a line. */
const criteria = (form: FormData) =>
  text(form, 'scorecardCriteria')
    .split('\n')
    .map((c) => c.trim())
    .filter(Boolean);

/** An opening's fields from its form; an empty optional field clears it. */
function openingBody(form: FormData) {
  const reason = text(form, 'reason') || 'new_position';
  return {
    legalEntityId: text(form, 'legalEntityId'),
    orgUnitId: orNull(form, 'orgUnitId'),
    locationId: orNull(form, 'locationId'),
    designationId: orNull(form, 'designationId'),
    gradeId: orNull(form, 'gradeId'),
    title: text(form, 'title'),
    employmentType: text(form, 'employmentType'),
    headcount: text(form, 'headcount') || '1',
    reason,
    replacesEmployeeId: reason === 'replacement' ? orNull(form, 'replacesEmployeeId') : null,
    budgetMin: orNull(form, 'budgetMin'),
    budgetMax: orNull(form, 'budgetMax'),
    justification: orNull(form, 'justification'),
    scorecardCriteria: criteria(form),
    // A line manager's form has no choice here: they are the hiring manager.
    ...(form.has('hiringManagerEmployeeId')
      ? { hiringManagerEmployeeId: orNull(form, 'hiringManagerEmployeeId') }
      : {}),
  };
}

/** Drafts an opening and opens it. */
export async function createOpening(
  _: ActionState<OpeningDetail>,
  form: FormData,
): Promise<ActionState<OpeningDetail>> {
  const result = await authedFetch<OpeningDetail>('tenant', '/tenant/recruitment/openings', {
    method: 'POST',
    body: openingBody(form),
  });
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  redirect(`${PAGES}/openings/${result.data.id}`);
}

export async function updateOpening(
  id: string,
  _: ActionState<OpeningDetail>,
  form: FormData,
): Promise<ActionState<OpeningDetail>> {
  const result = await authedFetch<OpeningDetail>('tenant', `/tenant/recruitment/openings/${id}`, {
    method: 'PATCH',
    body: openingBody(form),
  });
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true, result: result.data };
}

/** The job post in English and Bangla, its closing date and whether the salary shows. */
export async function saveOpeningPost(
  id: string,
  _: ActionState<OpeningDetail>,
  form: FormData,
): Promise<ActionState<OpeningDetail>> {
  const result = await authedFetch<OpeningDetail>(
    'tenant',
    `/tenant/recruitment/openings/${id}/post`,
    {
      method: 'PUT',
      body: {
        postTitleEn: orNull(form, 'postTitleEn'),
        postTitleBn: orNull(form, 'postTitleBn'),
        descriptionEn: orNull(form, 'descriptionEn'),
        descriptionBn: orNull(form, 'descriptionBn'),
        showSalary: form.get('showSalary') === 'on',
        closesOn: text(form, 'closesOn'),
      },
    },
  );
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true, result: result.data };
}

export type OpeningMove = 'submit' | 'publish' | 'close' | 'reopen' | 'cancel';

export async function moveOpening(id: string, move: OpeningMove): Promise<ActionState> {
  const result = await authedFetch('tenant', `/tenant/recruitment/openings/${id}/${move}`, {
    method: 'POST',
  });
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true };
}

export async function saveRecruitmentSettings(
  _: ActionState<RecruitmentSettingsView>,
  form: FormData,
): Promise<ActionState<RecruitmentSettingsView>> {
  const result = await authedFetch<RecruitmentSettingsView>(
    'tenant',
    '/tenant/recruitment/settings',
    {
      method: 'PUT',
      body: {
        careersEnabled: form.get('careersEnabled') === 'on',
        introEn: orNull(form, 'introEn'),
        introBn: orNull(form, 'introBn'),
        retentionMonths: text(form, 'retentionMonths') || DEFAULT_CANDIDATE_RETENTION_MONTHS,
        privacyEmail: orNull(form, 'privacyEmail'),
      },
    },
  );
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true, result: result.data };
}
