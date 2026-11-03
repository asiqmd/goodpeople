'use server';
import {
  anomalyDefinitionSchema,
  anomalyFindingIdSchema,
  anomalyReviewSchema,
  type AnomalyDefinition,
  type AnomalyEvaluation,
} from '@gp/shared';
import { revalidatePath } from 'next/cache';
import { authedFetch, type ApiResult } from '@/lib/api';
import { anomalyApi, anomalyPath } from './links';

export type AnomalyActionState =
  | { status: 'error'; reason: 'invalid' | 'unavailable' | 'changed' | 'correction' | 'limited' }
  | { status: 'reviewed' }
  | { status: 'scanned'; evaluation: AnomalyEvaluation };

function failed(result: Extract<ApiResult<unknown>, { ok: false }>): AnomalyActionState {
  return {
    status: 'error',
    reason:
      result.error.code === 'anomaly_correction'
        ? 'correction'
        : result.status === 409
          ? 'changed'
          : result.status === 429
            ? 'limited'
            : 'unavailable',
  };
}

async function write<T>(path: string, body: unknown) {
  try {
    return await authedFetch<T>('tenant', path, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(25_000),
    });
  } catch (error) {
    if (error instanceof TypeError || (error instanceof Error && error.name === 'TimeoutError'))
      return null;
    throw error;
  }
}

export async function scanAnomaly(
  definition: AnomalyDefinition,
  _state: AnomalyActionState | null,
): Promise<AnomalyActionState> {
  const parsed = anomalyDefinitionSchema.safeParse(definition);
  if (!parsed.success) return { status: 'error', reason: 'invalid' };
  const result = await write<{ evaluation: AnomalyEvaluation }>(anomalyApi + '/scan', parsed.data);
  if (!result) return { status: 'error', reason: 'unavailable' };
  if (!result.ok) return failed(result);
  revalidatePath(anomalyPath);
  return { status: 'scanned', evaluation: result.data.evaluation };
}

export async function reviewAnomaly(
  id: string,
  _state: AnomalyActionState | null,
  form: FormData,
): Promise<AnomalyActionState> {
  const action = form.get('action');
  const parsed = anomalyReviewSchema.safeParse({
    action,
    ...(action === 'dismiss' ? { reason: form.get('reason') } : {}),
  });
  if (!anomalyFindingIdSchema.safeParse(id).success || !parsed.success)
    return { status: 'error', reason: 'invalid' };
  const result = await write(anomalyApi + '/' + id + '/review', parsed.data);
  if (!result) return { status: 'error', reason: 'unavailable' };
  if (!result.ok) return failed(result);
  revalidatePath(anomalyPath);
  return { status: 'reviewed' };
}
