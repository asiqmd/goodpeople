'use server';
import { randomUUID } from 'node:crypto';
import { insightDefinitionSchema, insightJobSchema } from '@gp/shared';
import { redirect } from 'next/navigation';
import { authedFetch } from '@/lib/api';
import { insightLink, insightsPath } from './links';

function definitionOf(form: FormData) {
  const companyId = form.get('companyId');
  const parsed = insightDefinitionSchema.safeParse({
    kind: form.get('kind'),
    month: form.get('month'),
    ...(companyId ? { companyId } : {}),
  });
  if (!parsed.success) redirect(insightsPath + '?notice=failed');
  return parsed.data;
}

export async function saveInsight(form: FormData) {
  const definition = definitionOf(form);
  const result = await authedFetch('tenant', '/tenant/analytics/saved-insights', {
    method: 'POST',
    body: definition,
  });
  redirect(insightLink(definition) + '&notice=' + (result.ok ? 'saved' : 'failed'));
}

export async function removeInsight(form: FormData) {
  const definition = definitionOf(form);
  const report = insightJobSchema.safeParse({ requestId: form.get('reportId') });
  if (!report.success) redirect(insightLink(definition) + '&notice=failed');
  const result = await authedFetch(
    'tenant',
    '/tenant/analytics/saved-insights/' + report.data.requestId,
    { method: 'DELETE' },
  );
  redirect(insightLink(definition) + '&notice=' + (result.ok ? 'removed' : 'failed'));
}

export async function queueInsight(form: FormData) {
  const definition = definitionOf(form);
  const report = insightJobSchema.safeParse({ requestId: form.get('reportId') });
  const request = insightJobSchema.safeParse({ requestId: form.get('requestId') || randomUUID() });
  if (!report.success || !request.success) redirect(insightLink(definition) + '&notice=failed');
  const result = await authedFetch(
    'tenant',
    '/tenant/analytics/saved-insights/' + report.data.requestId + '/jobs',
    {
      method: 'POST',
      body: request.data,
    },
  );
  redirect(insightLink(definition) + '&notice=' + (result.ok ? 'queued' : 'failed'));
}
