import { notFound } from 'next/navigation';
import type { IntegrationsOverview } from '@gp/shared';
import { authedFetch } from '@/lib/api';
import { IntegrationsConsole } from '@/components/integrations/integrations-console';
export default async function IntegrationsPage() {
  const result = await authedFetch<IntegrationsOverview>('tenant', '/tenant/integrations');
  if (!result.ok) notFound();
  return <IntegrationsConsole data={result.data} />;
}
