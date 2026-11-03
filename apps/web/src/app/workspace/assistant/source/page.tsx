import { assistantCitationSchema, type AssistantCitation } from '@gp/shared';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { DocumentExcerpt, MetricExplanation } from '@/components/assistant/answer';
import { Banner } from '@/components/ui';
import {
  assistantAccess,
  currentMetric,
  isAssistantAvailabilityError,
  type AssistantFailure,
} from '@/lib/assistant/access';
import { ASSISTANT_PATH } from '@/lib/assistant/links';
import { resolveDocument, type DocumentAnswer, type MetricAnswer } from '@/lib/assistant/sources';

function parseReference(ref: unknown) {
  if (typeof ref !== 'string' || ref.length > 800) return null;
  try {
    const parsed = assistantCitationSchema.safeParse(JSON.parse(ref));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function verify(citation: AssistantCitation | null): Promise<
  | {
      document: DocumentAnswer;
    }
  | { metric: MetricAnswer }
  | AssistantFailure
  | null
> {
  if (!citation) return null;
  try {
    const actor = await assistantAccess(true);
    if (typeof actor === 'string') return actor;
    if (citation.kind === 'document') {
      const document = resolveDocument(citation);
      return document ? { document } : null;
    }
    const metric = await currentMetric(citation.request, actor);
    if (typeof metric === 'string') return metric === 'busy' ? metric : null;
    return metric.citation.revision === citation.revision ? { metric } : null;
  } catch (error) {
    if (!isAssistantAvailabilityError(error)) throw error;
    return 'busy';
  }
}

export default async function AssistantSourcePage({
  searchParams,
}: PageProps<'/workspace/assistant/source'>) {
  const t = await getTranslations('assistant');
  const result = await verify(parseReference((await searchParams).ref));
  return (
    <>
      <Link href={ASSISTANT_PATH} className="text-sm text-brand-700 underline">
        {t('back')}
      </Link>
      <h1 className="text-2xl font-semibold">{t('sourceTitle')}</h1>
      {typeof result === 'string' ? (
        <Banner tone="amber">{t('errors.' + result)}</Banner>
      ) : !result ? (
        <Banner tone="amber">{t('sourceUnavailable')}</Banner>
      ) : 'document' in result ? (
        <DocumentExcerpt answer={result.document} resolved />
      ) : (
        <MetricExplanation answer={result.metric} resolved />
      )}
    </>
  );
}
