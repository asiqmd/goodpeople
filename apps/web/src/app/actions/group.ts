'use server';

import { POLICY_FIELDS, type PolicyArea } from '@gp/shared';
import { revalidatePath } from 'next/cache';
import { authedFetch } from '@/lib/api';
import { fail } from '@/lib/form';
import type { ActionState } from './platform';

const PAGES = '/workspace/group';

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();
/** Caps are typed in hours; the API keeps minutes. */
const IN_HOURS = new Set([
  'overtimeDailyCapMinutes',
  'overtimeWeeklyCapMinutes',
  'overtimeMonthlyCapMinutes',
]);
const DAYS = new Set(['daysPerYear', 'carryForwardMax', 'maxDaysPerRequest']);

/** A field from the override form: empty follows the group, "none" lifts a limit. */
function valueOf(form: FormData, field: string): unknown {
  if (form.get(`${field}.none`) === 'on') return null;
  const raw = text(form, field);
  if (raw === '') return undefined;
  if (field === 'requireSelfie') return raw === 'true';
  if (IN_HOURS.has(field)) return Math.round(Number(raw) * 60);
  return DAYS.has(field) ? Number(raw) : raw;
}

/** What a company does differently in one area (for leave, one leave type). */
export async function savePolicy(
  legalEntityId: string,
  area: PolicyArea,
  subjectId: string | null,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const values = Object.fromEntries(
    POLICY_FIELDS[area]
      .map((field) => [field, valueOf(form, field)] as const)
      .filter(([, value]) => value !== undefined),
  );
  const result = await authedFetch('tenant', `/tenant/group/policies/${legalEntityId}/${area}`, {
    method: 'PUT',
    body: { ...(subjectId ? { subjectId } : {}), values },
  });
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true };
}

/** The company follows the group's policy again. */
export async function followGroupPolicy(
  legalEntityId: string,
  area: PolicyArea,
  subjectId: string | null,
): Promise<ActionState> {
  const query = subjectId ? `?subjectId=${subjectId}` : '';
  const result = await authedFetch(
    'tenant',
    `/tenant/group/policies/${legalEntityId}/${area}${query}`,
    { method: 'DELETE' },
  );
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true };
}
