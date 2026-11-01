'use server';

import type { GoalDetail, GoalSubmitResult, GoalView } from '@gp/shared';
import { revalidatePath } from 'next/cache';
import { authedFetch } from '@/lib/api';
import { fail, nest, rows } from '@/lib/form';
import type { ActionState } from './platform';

const BASE = '/tenant/performance/goals';
const PAGES = '/workspace/performance';

/**
 * The goal form as the API takes it. Empty optional fields are sent as null so an edit can
 * clear them; only the fields of the goal's kind are sent.
 */
function goalBody(form: FormData) {
  const f = nest(form);
  const kpi = f.kind === 'kpi';
  const fromRecords = kpi && f.source && f.source !== 'manual';
  return {
    title: f.title,
    description: f.description ?? null,
    kind: f.kind,
    ...(kpi
      ? {
          source: f.source ?? 'manual',
          target: f.target ?? null,
          ...(fromRecords
            ? {}
            : { measureUnit: f.measureUnit ?? null, direction: f.direction ?? null }),
        }
      : {
          keyResults: rows(f.keyResults)
            .map((k) => ({ text: k.text }))
            .filter((k) => k.text),
        }),
    // Unit goals carry no weight; their form has no such field.
    ...(form.has('weight') ? { weight: f.weight ?? null } : {}),
    startsOn: f.startsOn ?? null,
    dueOn: f.dueOn ?? null,
    cycleId: f.cycleId ?? null,
    parentGoalId: f.parentGoalId ?? null,
  };
}

export async function createGoal(
  _: ActionState<GoalDetail>,
  form: FormData,
): Promise<ActionState<GoalDetail>> {
  const { employeeId, orgUnitId } = nest(form);
  const result = await authedFetch<GoalDetail>('tenant', BASE, {
    method: 'POST',
    body: { ...goalBody(form), employeeId, orgUnitId },
  });
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true, result: result.data };
}

export async function updateGoal(
  id: string,
  _: ActionState<GoalDetail>,
  form: FormData,
): Promise<ActionState<GoalDetail>> {
  const result = await authedFetch<GoalDetail>('tenant', `${BASE}/${id}`, {
    method: 'PATCH',
    body: goalBody(form),
  });
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true, result: result.data };
}

/**
 * A check-in: the key results done (every box is sent, so unticking counts), the progress or
 * the value, and a note.
 */
export async function checkinGoal(
  id: string,
  withKeyResults: boolean,
  _: ActionState<GoalDetail>,
  form: FormData,
): Promise<ActionState<GoalDetail>> {
  const { progress, value, note } = nest(form);
  const result = await authedFetch<GoalDetail>('tenant', `${BASE}/${id}/checkins`, {
    method: 'POST',
    body: {
      progress,
      value,
      note,
      ...(withKeyResults ? { done: form.getAll('done').map(Number) } : {}),
    },
  });
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true, result: result.data };
}

/** Agree a draft, or mark an agreed goal completed. */
export async function moveGoal(id: string, step: 'agree' | 'complete'): Promise<ActionState> {
  const result = await authedFetch<GoalDetail>('tenant', `${BASE}/${id}/${step}`, {
    method: 'POST',
    body: {},
  });
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true };
}

export async function dropGoal(
  id: string,
  _: ActionState<GoalDetail>,
  form: FormData,
): Promise<ActionState<GoalDetail>> {
  const result = await authedFetch<GoalDetail>('tenant', `${BASE}/${id}/drop`, {
    method: 'POST',
    body: { note: nest(form).note ?? '' },
  });
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true, result: result.data };
}

/** The login's drafts for a cycle (null: outside any cycle), sent to their manager. */
export async function submitGoals(cycleId: string | null): Promise<ActionState<GoalSubmitResult>> {
  const result = await authedFetch<GoalSubmitResult>('tenant', `${BASE}/submit`, {
    method: 'POST',
    body: { cycleId },
  });
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true, result: result.data };
}

/** Every draft of one person for a cycle, agreed at once. */
export async function agreeAllGoals(
  employeeId: string,
  cycleId: string | null,
): Promise<ActionState<GoalView[]>> {
  const result = await authedFetch<GoalView[]>('tenant', `${BASE}/agree`, {
    method: 'POST',
    body: { employeeId, cycleId },
  });
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true, result: result.data };
}
