'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { authedFetch } from '@/lib/api';
import { fail, nest } from '@/lib/form';
import type { ActionState } from './platform';
export type ServiceAction =
  | 'survey'
  | 'publishSurvey'
  | 'closeSurvey'
  | 'respond'
  | 'announcement'
  | 'publishAnnouncement'
  | 'retireAnnouncement'
  | 'acknowledge'
  | 'recognition'
  | 'hideRecognition'
  | 'request'
  | 'reply'
  | 'updateRequest'
  | 'asset'
  | 'issue'
  | 'return'
  | 'acknowledgeAsset'
  | 'retireAsset';
const number = (value: string | undefined) => (value ? Number(value) : null);
export async function saveEmployeeService(
  kind: ServiceAction,
  id: string | undefined,
  _: ActionState<unknown>,
  form: FormData,
): Promise<ActionState<unknown>> {
  const d = nest(form);
  let path: string,
    body: unknown = {},
    method = 'POST';
  switch (kind) {
    case 'survey': {
      const en = form.getAll('question').map(String),
        bn = form.getAll('questionBn').map(String);
      body = {
        legalEntityId: d.legalEntityId,
        title: d.title,
        titleBn: d.titleBn,
        description: d.description,
        descriptionBn: d.descriptionBn,
        closesAt: `${d.closesAt}:00+06:00`,
        threshold: number(d.threshold),
        questions: en
          .map((text, i) => ({ text, textBn: bn[i] ?? '' }))
          .filter((q) => q.text || q.textBn),
      };
      path = `/engagement/surveys${id ? `/${id}` : ''}`;
      if (id) method = 'PATCH';
      break;
    }
    case 'publishSurvey':
      path = `/engagement/surveys/${id}/publish`;
      break;
    case 'closeSurvey':
      path = `/engagement/surveys/${id}/close`;
      body = { reason: d.reason };
      break;
    case 'respond':
      path = `/engagement/surveys/${id}/respond`;
      body = { enps: number(d.enps), scores: form.getAll('score').map((v) => number(String(v))) };
      break;
    case 'announcement':
      path = `/engagement/announcements${id ? `/${id}` : ''}`;
      if (id) method = 'PATCH';
      body = {
        legalEntityId: d.legalEntityId,
        title: d.title,
        titleBn: d.titleBn,
        body: d.body,
        bodyBn: d.bodyBn,
        requiresAcknowledgement: d.requiresAcknowledgement === 'on',
        dueOn: d.dueOn || null,
        expiresOn: d.expiresOn || null,
      };
      break;
    case 'publishAnnouncement':
      path = `/engagement/announcements/${id}/publish`;
      break;
    case 'retireAnnouncement':
      path = `/engagement/announcements/${id}/retire`;
      body = { reason: d.reason };
      break;
    case 'acknowledge':
      path = `/engagement/announcements/${id}/acknowledge`;
      break;
    case 'recognition':
      path = '/engagement/recognition';
      body = { employeeCode: d.employeeCode, value: d.value, message: d.message };
      break;
    case 'hideRecognition':
      path = `/engagement/recognition/${id}/hide`;
      body = { reason: d.reason };
      break;
    case 'request':
      path = '/employee-services/requests';
      body = { category: d.category, priority: d.priority, subject: d.subject, body: d.body };
      break;
    case 'reply':
      path = `/employee-services/requests/${id}/replies`;
      body = { body: d.body, internal: d.internal === 'on' };
      break;
    case 'updateRequest':
      path = `/employee-services/requests/${id}`;
      method = 'PATCH';
      body = {
        ...(d.status ? { status: d.status } : {}),
        ...(d.assigneeId
          ? { assigneeId: d.assigneeId === '__unassign' ? null : d.assigneeId }
          : {}),
        reason: d.reason,
      };
      break;
    case 'asset':
      path = '/employee-services/assets';
      body = { ...d };
      break;
    case 'issue':
      path = `/employee-services/assets/${id}/issue`;
      body = {
        employeeCode: d.employeeCode,
        issuedOn: d.issuedOn,
        dueOn: d.dueOn || null,
        condition: d.condition,
      };
      break;
    case 'return':
      path = `/employee-services/issues/${id}/return`;
      body = { returnedOn: d.returnedOn, condition: d.condition };
      break;
    case 'acknowledgeAsset':
      path = `/employee-services/issues/${id}/acknowledge`;
      break;
    case 'retireAsset':
      path = `/employee-services/assets/${id}/retire`;
      body = { reason: d.reason };
      break;
    default:
      throw new Error('Unknown employee service action');
  }
  const result = await authedFetch<{ id?: string }>('tenant', `/tenant${path}`, { method, body });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/engagement', 'layout');
  revalidatePath('/workspace/employee-services', 'layout');
  if (result.data?.id && ['survey', 'announcement', 'request', 'asset'].includes(kind)) {
    const destination = {
      survey: '/engagement/surveys',
      announcement: '/engagement/announcements',
      request: '/employee-services/requests',
      asset: '/employee-services/assets',
    }[kind as 'survey' | 'announcement' | 'request' | 'asset'];
    redirect(`/workspace${destination}/${result.data.id}`);
  }
  return { ok: true, result: result.data };
}
