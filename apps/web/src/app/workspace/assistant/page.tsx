import { assistantInsightCatalogSchema, assistantWorkforceCatalogSchema } from '@gp/shared';
import { getTranslations } from 'next-intl/server';
import { AssistantForm } from '@/components/assistant/assistant-form';
import { Banner } from '@/components/ui';
import { authedFetch } from '@/lib/api';
import { assistantAccess, isAssistantAvailabilityError } from '@/lib/assistant/access';

export default async function AssistantPage() {
  const t = await getTranslations('assistant');
  const access = await assistantAccess(false).catch((error: unknown) => {
    if (!isAssistantAvailabilityError(error)) throw error;
    return 'busy' as const;
  });
  const header = (
    <div>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">{t('intro')}</p>
    </div>
  );
  if (typeof access === 'string')
    return (
      <>
        {header}
        <Banner tone="amber">{t('errors.' + access)}</Banner>
      </>
    );
  const [workforce, insight] = await Promise.all(
    [
      authedFetch<unknown>('tenant', '/tenant/analytics/catalog', {
        signal: AbortSignal.timeout(4000),
      }),
      authedFetch<unknown>('tenant', '/tenant/analytics/insight-catalog', {
        signal: AbortSignal.timeout(4000),
      }),
    ].map((read) =>
      read.catch((error: unknown) => {
        if (!isAssistantAvailabilityError(error)) throw error;
        return null;
      }),
    ),
  );
  const workforceCatalog = assistantWorkforceCatalogSchema.safeParse(
    workforce?.ok ? workforce.data : null,
  );
  const insightCatalog = assistantInsightCatalogSchema.safeParse(insight?.ok ? insight.data : null);
  return (
    <>
      {header}
      <AssistantForm workforce={workforceCatalog.data} insight={insightCatalog.data} />
    </>
  );
}
