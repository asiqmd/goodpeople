'use server';

import type { EmployeeRef, InterviewView, MyInterviewDetail } from '@gp/shared';
import { revalidatePath } from 'next/cache';
import { authedFetch } from '@/lib/api';
import { fail } from '@/lib/form';
import type { ActionState } from './platform';

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

/** Bangladesh keeps one offset all year (no daylight saving). */
const dhaka = (date: string, time: string) => (date && time ? `${date}T${time}:00+06:00` : '');

/** An interview's fields from its form: a day and times in Dhaka, the panel's ids. */
function interviewBody(form: FormData) {
  const date = text(form, 'date');
  const kind = text(form, 'kind');
  return {
    kind,
    startsAt: dhaka(date, text(form, 'from')),
    endsAt: dhaka(date, text(form, 'to')),
    location: text(form, 'location') || null,
    meetingUrl: kind === 'video' ? text(form, 'meetingUrl') || null : null,
    interviewerIds: form.getAll('interviewerIds').map(String),
    notes: text(form, 'notes') || null,
  };
}

/** Field issues as the form names its fields: the day and times are one input each. */
const onForm = (state: ReturnType<typeof fail>) => ({
  ...state,
  issues: state.issues?.map((i) => ({
    ...i,
    path: i.path === 'startsAt' ? 'from' : i.path === 'endsAt' ? 'to' : i.path.split('.')[0]!,
  })),
});

const refresh = (applicationId: string) => {
  revalidatePath(`/workspace/recruitment/applications/${applicationId}`);
  revalidatePath('/workspace/interviews', 'layout');
};

export async function scheduleInterview(
  applicationId: string,
  _: ActionState<InterviewView>,
  form: FormData,
): Promise<ActionState<InterviewView>> {
  const result = await authedFetch<InterviewView>(
    'tenant',
    `/tenant/recruitment/applications/${applicationId}/interviews`,
    { method: 'POST', body: interviewBody(form) },
  );
  if (!result.ok) return onForm(fail(result));
  refresh(applicationId);
  return { ok: true, result: result.data };
}

export async function rescheduleInterview(
  id: string,
  applicationId: string,
  _: ActionState<InterviewView>,
  form: FormData,
): Promise<ActionState<InterviewView>> {
  const result = await authedFetch<InterviewView>('tenant', `/tenant/interviews/${id}`, {
    method: 'PATCH',
    body: interviewBody(form),
  });
  if (!result.ok) return onForm(fail(result));
  refresh(applicationId);
  return { ok: true, result: result.data };
}

export async function cancelInterview(
  id: string,
  applicationId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const result = await authedFetch('tenant', `/tenant/interviews/${id}/cancel`, {
    method: 'POST',
    body: { reason: text(form, 'reason') || null },
  });
  if (!result.ok) return fail(result);
  refresh(applicationId);
  return { ok: true };
}

export async function completeInterview(id: string, applicationId: string): Promise<ActionState> {
  const result = await authedFetch('tenant', `/tenant/interviews/${id}/complete`, {
    method: 'POST',
  });
  if (!result.ok) return fail(result);
  refresh(applicationId);
  return { ok: true };
}

/** Employees with logins, to put on the panel. */
export async function findInterviewers(
  applicationId: string,
  search: string,
): Promise<EmployeeRef[]> {
  const query = new URLSearchParams({ search: search.trim() });
  const result = await authedFetch<EmployeeRef[]>(
    'tenant',
    `/tenant/recruitment/applications/${applicationId}/interviewers?${query}`,
  );
  return result.ok ? result.data : [];
}

/** The interviewer's scorecard: a rating per criterion (in the opening's order), and notes. */
export async function submitScorecard(
  id: string,
  criteria: string[],
  _: ActionState<MyInterviewDetail>,
  form: FormData,
): Promise<ActionState<MyInterviewDetail>> {
  const ratings = Object.fromEntries(
    criteria.flatMap((c, i) => {
      const value = Number(form.get(`rating.${i}`));
      return value ? [[c, value]] : [];
    }),
  );
  const result = await authedFetch<MyInterviewDetail>(
    'tenant',
    `/tenant/interviews/${id}/scorecard`,
    {
      method: 'PUT',
      body: {
        ratings,
        recommendation: text(form, 'recommendation') || undefined,
        feedback: text(form, 'feedback') || null,
      },
    },
  );
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/interviews', 'layout');
  return { ok: true, result: result.data };
}
