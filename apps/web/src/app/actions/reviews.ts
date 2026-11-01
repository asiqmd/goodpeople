'use server';

import {
  RATINGS,
  type CycleDetail,
  type CycleLaunchResult,
  type EmployeeListItem,
  type Page,
  type PeerRequestView,
  type PerformanceSettingsView,
  type ReviewDetail,
} from '@gp/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { authedFetch } from '@/lib/api';
import { fail, nest, rows } from '@/lib/form';
import type { ActionState } from './platform';

const PAGES = '/workspace/performance';

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();
const orNull = (form: FormData, name: string) => text(form, name) || null;
const checked = (form: FormData, name: string) => form.get(name) === 'on';
const refresh = () => revalidatePath(PAGES, 'layout');

/** Each rated (or commented) item of a group, its rating a number. */
const entries = (group: Record<string, { rating?: string; comment?: string }> | undefined) =>
  Object.fromEntries(
    Object.entries(group ?? {})
      .filter(([, a]) => a.rating || a.comment)
      .map(([key, a]) => [
        key,
        { rating: a.rating ? Number(a.rating) : undefined, comment: a.comment },
      ]),
  );

/** Ratings and comments as the review forms name them: `goals.<id>.rating`, and so on. */
function answersOf(form: FormData) {
  const data = nest(form);
  return {
    goals: entries(data.goals),
    competencies: entries(data.competencies),
    overall: data.overall,
  };
}

/** Which button sent the form: save as a draft, or submit. */
const submitting = (form: FormData) => form.get('intent') === 'submit';

// ── Settings ─────────────────────────────────────────────────────────────────

export async function savePerformanceSettings(
  _: ActionState<PerformanceSettingsView>,
  form: FormData,
): Promise<ActionState<PerformanceSettingsView>> {
  const data = nest(form);
  const result = await authedFetch<PerformanceSettingsView>(
    'tenant',
    '/tenant/performance/settings',
    {
      method: 'PUT',
      body: {
        competencies: rows(data.competencies).filter((c) => c.key || c.en || c.bn),
        ratingGuide: Object.fromEntries(
          RATINGS.map((r) => [r, Number(data.ratingGuide?.[r] ?? 0)]),
        ),
      },
    },
  );
  if (!result.ok) return fail(result);
  refresh();
  return { ok: true, result: result.data };
}

// ── Cycles ───────────────────────────────────────────────────────────────────

function cycleBody(form: FormData) {
  const data = nest(form);
  return {
    name: text(form, 'name'),
    periodStart: text(form, 'periodStart'),
    periodEnd: text(form, 'periodEnd'),
    legalEntityIds: form.getAll('legalEntityIds').map(String),
    joinedOnOrBefore: orNull(form, 'joinedOnOrBefore'),
    selfReview: checked(form, 'selfReview'),
    peerReview: checked(form, 'peerReview'),
    competencies: rows(data.competencies).filter((c) => c.key || c.en || c.bn),
    ...datesOf(form),
  };
}

const datesOf = (form: FormData) => ({
  goalsDueOn: orNull(form, 'goalsDueOn'),
  selfDueOn: orNull(form, 'selfDueOn'),
  peerDueOn: orNull(form, 'peerDueOn'),
  managerDueOn: orNull(form, 'managerDueOn'),
  calibrationDueOn: orNull(form, 'calibrationDueOn'),
});

export async function createCycle(
  _: ActionState<CycleDetail>,
  form: FormData,
): Promise<ActionState<CycleDetail>> {
  const result = await authedFetch<CycleDetail>('tenant', '/tenant/performance/cycles', {
    method: 'POST',
    body: cycleBody(form),
  });
  if (!result.ok) return fail(result);
  refresh();
  redirect(`${PAGES}/cycles/${result.data.id}`);
}

export async function updateCycle(
  id: string,
  _: ActionState<CycleDetail>,
  form: FormData,
): Promise<ActionState<CycleDetail>> {
  const result = await authedFetch<CycleDetail>('tenant', `/tenant/performance/cycles/${id}`, {
    method: 'PATCH',
    body: cycleBody(form),
  });
  if (!result.ok) return fail(result);
  refresh();
  return { ok: true, result: result.data };
}

/** A launched cycle's name and step dates. */
export async function saveCycleDates(
  id: string,
  _: ActionState<CycleDetail>,
  form: FormData,
): Promise<ActionState<CycleDetail>> {
  const result = await authedFetch<CycleDetail>(
    'tenant',
    `/tenant/performance/cycles/${id}/dates`,
    { method: 'PUT', body: { name: text(form, 'name'), ...datesOf(form) } },
  );
  if (!result.ok) return fail(result);
  refresh();
  return { ok: true, result: result.data };
}

/** Launches a draft, or adds the people who have come into an active cycle since. */
export async function launchCycle(id: string): Promise<ActionState<CycleLaunchResult>> {
  const result = await authedFetch<CycleLaunchResult>(
    'tenant',
    `/tenant/performance/cycles/${id}/launch`,
    { method: 'POST' },
  );
  if (!result.ok) return fail(result);
  refresh();
  return { ok: true, result: result.data };
}

/** Adds one person to an active cycle, found by their employee code. */
export async function addCyclePerson(
  id: string,
  _: ActionState<CycleLaunchResult>,
  form: FormData,
): Promise<ActionState<CycleLaunchResult>> {
  const code = text(form, 'employeeCode');
  const found = await authedFetch<Page<EmployeeListItem>>(
    'tenant',
    `/tenant/employees?search=${encodeURIComponent(code)}&pageSize=20`,
  );
  const employee = found.ok
    ? found.data.items.find((e) => e.employeeCode.toLowerCase() === code.toLowerCase())
    : undefined;
  if (!employee) {
    return {
      error: 'No employee has this code',
      code: 'employee_not_found',
      issues: [{ path: 'employeeCode', message: 'No employee has this code' }],
    };
  }
  const result = await authedFetch<CycleLaunchResult>(
    'tenant',
    `/tenant/performance/cycles/${id}/people`,
    { method: 'POST', body: { employeeId: employee.id } },
  );
  if (!result.ok) return fail(result);
  refresh();
  return { ok: true, result: result.data };
}

/** Moves the cycle to calibration, with a note while manager reviews are missing. */
export async function calibrateCycle(
  id: string,
  _: ActionState<CycleDetail>,
  form: FormData,
): Promise<ActionState<CycleDetail>> {
  const result = await authedFetch<CycleDetail>(
    'tenant',
    `/tenant/performance/cycles/${id}/calibration`,
    { method: 'POST', body: { note: text(form, 'note') || undefined } },
  );
  if (!result.ok) return fail(result);
  refresh();
  return { ok: true, result: result.data };
}

export async function moveCycle(
  id: string,
  move: 'release' | 'close',
): Promise<ActionState<CycleDetail>> {
  const result = await authedFetch<CycleDetail>(
    'tenant',
    `/tenant/performance/cycles/${id}/${move}`,
    { method: 'POST' },
  );
  if (!result.ok) return fail(result);
  refresh();
  return { ok: true, result: result.data };
}

// ── Reviews ──────────────────────────────────────────────────────────────────

export async function saveSelfReview(
  id: string,
  _: ActionState<ReviewDetail>,
  form: FormData,
): Promise<ActionState<ReviewDetail>> {
  const result = await authedFetch<ReviewDetail>(
    'tenant',
    `/tenant/performance/reviews/${id}/self`,
    { method: 'PUT', body: { answers: answersOf(form), submit: submitting(form) } },
  );
  if (!result.ok) return fail(result);
  refresh();
  return { ok: true, result: result.data };
}

export async function saveManagerReview(
  id: string,
  _: ActionState<ReviewDetail>,
  form: FormData,
): Promise<ActionState<ReviewDetail>> {
  const proposed = text(form, 'proposedRating');
  const result = await authedFetch<ReviewDetail>(
    'tenant',
    `/tenant/performance/reviews/${id}/manager`,
    {
      method: 'PUT',
      body: {
        answers: answersOf(form),
        proposedRating: proposed ? Number(proposed) : null,
        recommendations: {
          increment: checked(form, 'increment'),
          promotionDesignationId: orNull(form, 'promotionDesignationId'),
          plan: checked(form, 'plan'),
        },
        submit: submitting(form),
      },
    },
  );
  if (!result.ok) return fail(result);
  refresh();
  return { ok: true, result: result.data };
}

export async function setFinalRating(
  id: string,
  _: ActionState<ReviewDetail>,
  form: FormData,
): Promise<ActionState<ReviewDetail>> {
  const result = await authedFetch<ReviewDetail>(
    'tenant',
    `/tenant/performance/reviews/${id}/final-rating`,
    {
      method: 'PUT',
      body: {
        finalRating: Number(text(form, 'finalRating')),
        note: text(form, 'note') || undefined,
      },
    },
  );
  if (!result.ok) return fail(result);
  refresh();
  return { ok: true, result: result.data };
}

export async function acknowledgeReview(
  id: string,
  _: ActionState<ReviewDetail>,
  form: FormData,
): Promise<ActionState<ReviewDetail>> {
  const result = await authedFetch<ReviewDetail>(
    'tenant',
    `/tenant/performance/reviews/${id}/acknowledge`,
    {
      method: 'POST',
      body: { agrees: text(form, 'agrees') === 'yes', comment: text(form, 'comment') || undefined },
    },
  );
  if (!result.ok) return fail(result);
  refresh();
  return { ok: true, result: result.data };
}

// ── Peers ────────────────────────────────────────────────────────────────────

export async function proposePeers(
  reviewId: string,
  _: ActionState<ReviewDetail>,
  form: FormData,
): Promise<ActionState<ReviewDetail>> {
  const result = await authedFetch<ReviewDetail>(
    'tenant',
    `/tenant/performance/reviews/${reviewId}/peers`,
    { method: 'POST', body: { employeeIds: form.getAll('employeeIds').map(String) } },
  );
  if (!result.ok) return fail(result);
  refresh();
  return { ok: true, result: result.data };
}

export async function decidePeer(peerId: string, approve: boolean): Promise<ActionState> {
  const result = await authedFetch('tenant', `/tenant/performance/peers/${peerId}/decision`, {
    method: 'POST',
    body: { approve },
  });
  if (!result.ok) return fail(result);
  refresh();
  return { ok: true };
}

export async function answerPeer(
  peerId: string,
  _: ActionState<PeerRequestView>,
  form: FormData,
): Promise<ActionState<PeerRequestView>> {
  const rating = text(form, 'rating');
  const result = await authedFetch<PeerRequestView>(
    'tenant',
    `/tenant/performance/peers/${peerId}`,
    {
      method: 'PUT',
      body: {
        answers: { strengths: text(form, 'strengths'), improvements: text(form, 'improvements') },
        rating: rating ? Number(rating) : undefined,
      },
    },
  );
  if (!result.ok) return fail(result);
  refresh();
  return { ok: true, result: result.data };
}
