import type { IdentityOverview } from '@gp/shared';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { IdentityConsole } from '@/components/identity/identity-console';
import { authedFetch } from '@/lib/api';
import { Banner } from '@/components/ui';
export default async function IdentityPage({ searchParams }: PageProps<'/workspace/identity'>) {
  const result = await authedFetch<IdentityOverview>('tenant', '/tenant/identity');
  if (!result.ok) notFound();
  const t = await getTranslations('identity'),
    query = await searchParams;
  return (
    <div className="space-y-5">
      {query.sso && (
        <Banner tone={query.sso === 'linked' ? 'green' : 'red'}>
          {t(query.sso === 'linked' ? 'linked' : 'ssoFailed')}
        </Banner>
      )}
      <IdentityConsole data={result.data} />
    </div>
  );
}
