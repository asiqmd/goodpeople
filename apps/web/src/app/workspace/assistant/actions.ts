'use server';
import { assistantRequestSchema } from '@gp/shared';
import { getLocale } from 'next-intl/server';
import { contentLocale } from '@/lib/help/content';
import {
  assistantAccess,
  currentMetric,
  isAssistantAvailabilityError,
  type AssistantFailure,
} from '@/lib/assistant/access';
import {
  searchApprovedHelp,
  type DocumentAnswer,
  type MetricAnswer,
} from '@/lib/assistant/sources';

export type AssistantAnswer =
  | { status: 'documents'; documents: DocumentAnswer[] }
  | { status: 'metric'; metric: MetricAnswer }
  | { status: AssistantFailure };

export async function askAssistant(
  _: AssistantAnswer | null,
  form: FormData,
): Promise<AssistantAnswer> {
  const input = Object.fromEntries(
    [...form.entries()].filter(([key]) => !key.startsWith('$ACTION_')),
  );
  if (
    Object.keys(input).length !==
    [...form.keys()].filter((key) => !key.startsWith('$ACTION_')).length
  )
    return { status: 'invalid' };
  if (input.companyId === '') delete input.companyId;
  const parsed = assistantRequestSchema.safeParse(
    input.kind === 'insight'
      ? {
          kind: input.kind,
          report: Object.fromEntries(
            Object.entries(input)
              .filter(([key]) => key !== 'kind')
              .map(([key, value]) => [key === 'reportKind' ? 'kind' : key, value]),
          ),
        }
      : input,
  );
  if (!parsed.success) return { status: 'invalid' };
  try {
    const actor = await assistantAccess(true);
    if (typeof actor === 'string') return { status: actor };
    if (parsed.data.kind === 'help') {
      const documents = searchApprovedHelp(contentLocale(await getLocale()), parsed.data.question);
      return documents.length ? { status: 'documents', documents } : { status: 'noMatch' };
    }
    const metric = await currentMetric(parsed.data, actor);
    return typeof metric === 'string' ? { status: metric } : { status: 'metric', metric };
  } catch (error) {
    if (!isAssistantAvailabilityError(error)) throw error;
    return { status: 'busy' };
  }
}
