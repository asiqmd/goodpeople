'use server';

import type {
  CommitteeView,
  RelationsCheckResult,
  TradeUnionView,
  UnionBulkResult,
} from '@gp/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { authedFetch } from '@/lib/api';
import { fail, nest, rows } from '@/lib/form';
import type { ActionState } from './platform';

const COMMITTEES = '/workspace/compliance/committees';
const UNIONS = '/workspace/compliance/unions';

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();
const orNull = (form: FormData, name: string) => text(form, name) || null;

async function send<T>(
  path: string,
  body: unknown,
  method: string,
  revalidate: string,
): Promise<ActionState<T>> {
  const result = await authedFetch<T>('tenant', `/tenant/relations${path}`, { method, body });
  if (!result.ok) return fail(result);
  revalidatePath(revalidate, 'layout');
  return { ok: true, result: result.data };
}

/** Decisions typed into numbered rows; empty rows are dropped. */
const decisionsOf = (form: FormData) =>
  rows(nest(form).decisions)
    .filter((d) => d.text)
    .map((d) => ({ text: d.text, dueOn: d.dueOn ?? null, done: d.done === 'on' }));

// ── Committees ───────────────────────────────────────────────────────────────

export async function runChecks(): Promise<ActionState<RelationsCheckResult>> {
  return send<RelationsCheckResult>('/check', {}, 'POST', '/workspace/compliance');
}

export async function createCommittee(
  _: ActionState<CommitteeView>,
  form: FormData,
): Promise<ActionState<CommitteeView>> {
  const result = await authedFetch<CommitteeView>('tenant', '/tenant/relations/committees', {
    method: 'POST',
    body: {
      kind: text(form, 'kind'),
      legalEntityId: text(form, 'legalEntityId'),
      locationId: orNull(form, 'locationId'),
      name: text(form, 'name'),
      formedOn: text(form, 'formedOn'),
      endsOn: orNull(form, 'endsOn'),
      note: orNull(form, 'note'),
    },
  });
  if (!result.ok) return fail(result);
  revalidatePath(COMMITTEES);
  redirect(`${COMMITTEES}/${result.data.id}`);
}

export async function updateCommittee(
  id: string,
  _: ActionState<CommitteeView>,
  form: FormData,
): Promise<ActionState<CommitteeView>> {
  return send(
    `/committees/${id}`,
    {
      name: text(form, 'name'),
      formedOn: text(form, 'formedOn'),
      endsOn: orNull(form, 'endsOn'),
      note: orNull(form, 'note'),
    },
    'PATCH',
    COMMITTEES,
  );
}

export async function deleteCommittee(id: string): Promise<ActionState> {
  const result = await authedFetch('tenant', `/tenant/relations/committees/${id}`, {
    method: 'DELETE',
  });
  if (!result.ok) return fail(result);
  revalidatePath(COMMITTEES);
  redirect(COMMITTEES);
}

export async function addCommitteeMember(
  id: string,
  _: ActionState<CommitteeView>,
  form: FormData,
): Promise<ActionState<CommitteeView>> {
  const outsider = text(form, 'who') === 'outsider';
  return send(
    `/committees/${id}/members`,
    {
      ...(outsider
        ? { name: text(form, 'name'), gender: text(form, 'gender') || undefined }
        : { employeeCode: text(form, 'employeeCode') || undefined }),
      side: text(form, 'side'),
      role: text(form, 'role'),
      selection: text(form, 'selection'),
      fromOn: text(form, 'fromOn'),
    },
    'POST',
    COMMITTEES,
  );
}

export async function endCommitteeMember(
  id: string,
  memberId: string,
  _: ActionState<CommitteeView>,
  form: FormData,
): Promise<ActionState<CommitteeView>> {
  return send(
    `/committees/${id}/members/${memberId}/end`,
    { toOn: text(form, 'toOn') },
    'POST',
    COMMITTEES,
  );
}

const meetingBody = (form: FormData) => ({
  heldOn: text(form, 'heldOn'),
  attendees: orNull(form, 'attendees'),
  agenda: orNull(form, 'agenda'),
  minutes: orNull(form, 'minutes'),
  minutesSentOn: orNull(form, 'minutesSentOn'),
  decisions: decisionsOf(form),
});

export async function addMeeting(
  id: string,
  _: ActionState<CommitteeView>,
  form: FormData,
): Promise<ActionState<CommitteeView>> {
  return send(`/committees/${id}/meetings`, meetingBody(form), 'POST', COMMITTEES);
}

export async function updateMeeting(
  id: string,
  meetingId: string,
  _: ActionState<CommitteeView>,
  form: FormData,
): Promise<ActionState<CommitteeView>> {
  return send(`/committees/${id}/meetings/${meetingId}`, meetingBody(form), 'PATCH', COMMITTEES);
}

export async function setDecisionDone(
  id: string,
  meetingId: string,
  index: number,
  done: boolean,
): Promise<ActionState> {
  return send(
    `/committees/${id}/meetings/${meetingId}/decisions/${index}`,
    { done },
    'PATCH',
    COMMITTEES,
  );
}

// ── Trade unions ─────────────────────────────────────────────────────────────

const unionBody = (form: FormData) => ({
  name: text(form, 'name'),
  registrationNo: orNull(form, 'registrationNo'),
  registeredOn: orNull(form, 'registeredOn'),
  federation: orNull(form, 'federation'),
  isCba: form.get('isCba') === 'on',
  checkOff: form.get('checkOff') === 'on',
  monthlySubscription: orNull(form, 'monthlySubscription'),
  note: orNull(form, 'note'),
});

export async function createUnion(
  _: ActionState<TradeUnionView>,
  form: FormData,
): Promise<ActionState<TradeUnionView>> {
  const result = await authedFetch<TradeUnionView>('tenant', '/tenant/relations/unions', {
    method: 'POST',
    body: { legalEntityId: text(form, 'legalEntityId'), ...unionBody(form) },
  });
  if (!result.ok) return fail(result);
  revalidatePath(UNIONS);
  redirect(`${UNIONS}/${result.data.id}`);
}

export async function updateUnion(
  id: string,
  _: ActionState<TradeUnionView>,
  form: FormData,
): Promise<ActionState<TradeUnionView>> {
  return send(`/unions/${id}`, unionBody(form), 'PATCH', UNIONS);
}

export async function deleteUnion(id: string): Promise<ActionState> {
  const result = await authedFetch('tenant', `/tenant/relations/unions/${id}`, {
    method: 'DELETE',
  });
  if (!result.ok) return fail(result);
  revalidatePath(UNIONS);
  redirect(UNIONS);
}

export async function addUnionMember(
  id: string,
  _: ActionState<TradeUnionView>,
  form: FormData,
): Promise<ActionState<TradeUnionView>> {
  return send(
    `/unions/${id}/members`,
    {
      employeeCode: text(form, 'employeeCode') || undefined,
      role: text(form, 'role'),
      joinedOn: text(form, 'joinedOn'),
      checkOffConsentOn: orNull(form, 'checkOffConsentOn'),
    },
    'POST',
    UNIONS,
  );
}

/** Employee codes pasted one per line, or separated by commas or spaces. */
export async function addUnionMembers(
  id: string,
  _: ActionState<UnionBulkResult>,
  form: FormData,
): Promise<ActionState<UnionBulkResult>> {
  return send(
    `/unions/${id}/members/bulk`,
    {
      employeeCodes: text(form, 'employeeCodes')
        .split(/[\s,;]+/)
        .filter(Boolean),
      joinedOn: text(form, 'joinedOn'),
      checkOffConsentOn: orNull(form, 'checkOffConsentOn'),
    },
    'POST',
    UNIONS,
  );
}

export async function setUnionConsent(
  id: string,
  memberId: string,
  _: ActionState<TradeUnionView>,
  form: FormData,
): Promise<ActionState<TradeUnionView>> {
  return send(
    `/unions/${id}/members/${memberId}`,
    { checkOffConsentOn: orNull(form, 'checkOffConsentOn') },
    'PATCH',
    UNIONS,
  );
}

export async function endUnionMember(
  id: string,
  memberId: string,
  _: ActionState<TradeUnionView>,
  form: FormData,
): Promise<ActionState<TradeUnionView>> {
  return send(
    `/unions/${id}/members/${memberId}/end`,
    { leftOn: text(form, 'leftOn') },
    'POST',
    UNIONS,
  );
}
