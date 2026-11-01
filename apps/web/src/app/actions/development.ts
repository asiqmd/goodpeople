'use server';

import type { EmployeeRef, PlanView, ProbationReviewView } from '@gp/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { authedFetch } from '@/lib/api';
import { fail, nest, rows, toNumber } from '@/lib/form';
import type { ActionState } from './platform';

const PLANS = '/tenant/performance/plans';
const PAGES = '/workspace/performance';

/** The plan form's fields as the API takes them: objectives in order, blank rows left out. */
function planBody(form: FormData) {
  const { objectives, support, reviewId, ...fields } = nest(form);
  return {
    ...fields,
    objectives: rows(objectives).filter((o) => o.text || o.measure),
    support: support ?? null,
    reviewId: reviewId ?? null,
  };
}

/** People the signed-in login may draft a plan for, by name or code. */
export async function findPlanPeople(search: string): Promise<EmployeeRef[]> {
  const query = new URLSearchParams({ search });
  const result = await authedFetch<EmployeeRef[]>('tenant', `${PLANS}/people?${query}`);
  return result.ok ? result.data : [];
}

export async function createPlan(
  _: ActionState<PlanView>,
  form: FormData,
): Promise<ActionState<PlanView>> {
  const result = await authedFetch<PlanView>('tenant', PLANS, {
    method: 'POST',
    body: planBody(form),
  });
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  redirect(`${PAGES}/plans/${result.data.id}`);
}

export async function updatePlan(
  id: string,
  _: ActionState<PlanView>,
  form: FormData,
): Promise<ActionState<PlanView>> {
  const result = await authedFetch<PlanView>('tenant', `${PLANS}/${id}`, {
    method: 'PATCH',
    body: planBody(form),
  });
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true, result: result.data };
}

/** Starts a draft: the person is told and can read it. */
export async function startPlan(id: string): Promise<ActionState> {
  const result = await authedFetch<PlanView>('tenant', `${PLANS}/${id}/start`, {
    method: 'POST',
  });
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true };
}

export async function deletePlan(id: string): Promise<ActionState> {
  const result = await authedFetch('tenant', `${PLANS}/${id}`, { method: 'DELETE' });
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  redirect(`${PAGES}/plans`);
}

/** A check-in, an extension, a close or the person's acknowledgement. */
export async function planStep(
  id: string,
  step: 'checkins' | 'extend' | 'close' | 'acknowledge',
  _: ActionState<PlanView>,
  form: FormData,
): Promise<ActionState<PlanView>> {
  const result = await authedFetch<PlanView>('tenant', `${PLANS}/${id}/${step}`, {
    method: 'POST',
    body: nest(form),
  });
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true, result: result.data };
}

export async function submitProbationReview(
  id: string,
  _: ActionState<ProbationReviewView>,
  form: FormData,
): Promise<ActionState<ProbationReviewView>> {
  const { ratings, ...rest } = nest(form);
  const result = await authedFetch<ProbationReviewView>(
    'tenant',
    `/tenant/performance/probation/${id}/submit`,
    {
      method: 'POST',
      body: {
        ...rest,
        ratings: Object.fromEntries(
          Object.entries((ratings ?? {}) as Record<string, string>).map(([k, v]) => [
            k,
            toNumber(v),
          ]),
        ),
      },
    },
  );
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true, result: result.data };
}
