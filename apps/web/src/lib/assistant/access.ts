import 'server-only';
import {
  assistantAdmissionSchema,
  type AssistantAdmission,
  type AssistantMetric,
} from '@gp/shared';
import { authedFetch } from '../api';
import { readAuthorizedMetric, type MetricAnswer } from './sources';

export type AssistantFailure =
  'invalid' | 'unavailable' | 'denied' | 'busy' | 'limited' | 'noMatch';

export async function assistantAccess(
  reserve: boolean,
): Promise<AssistantAdmission | AssistantFailure> {
  const result = await authedFetch<unknown>(
    'tenant',
    reserve ? '/tenant/assistant/read' : '/tenant/assistant',
    { ...(reserve ? { method: 'POST', body: {} } : {}), signal: AbortSignal.timeout(4000) },
  );
  if (!result.ok)
    return result.status === 429 ? 'limited' : result.status === 403 ? 'denied' : 'busy';
  const parsed = assistantAdmissionSchema.safeParse(result.data);
  return parsed.success ? parsed.data : 'busy';
}

export async function currentMetric(
  request: AssistantMetric,
  actor: AssistantAdmission,
): Promise<MetricAnswer | AssistantFailure> {
  let failure: AssistantFailure = 'unavailable';
  const answer = await readAuthorizedMetric(request, actor, async (path) => {
    const result = await authedFetch<unknown>('tenant', path, {
      signal: AbortSignal.timeout(6500),
    });
    if (result.ok) return result.data;
    failure =
      result.status === 403 || result.status === 404
        ? 'denied'
        : result.status >= 500
          ? 'busy'
          : 'unavailable';
    return null;
  });
  return answer ?? failure;
}

export function isAssistantAvailabilityError(error: unknown) {
  return (
    error instanceof TypeError ||
    (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))
  );
}
