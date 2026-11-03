import { notFound } from 'next/navigation';
import type { EnterpriseOverview } from '@gp/shared';
import { authedFetch } from '@/lib/api';
import { EnterpriseConsole } from '@/components/enterprise/enterprise-console';
export default async function EnterprisePage() {
  const result = await authedFetch<EnterpriseOverview>('tenant', '/tenant/enterprise');
  if (!result.ok) notFound();
  return <EnterpriseConsole data={result.data} />;
}
