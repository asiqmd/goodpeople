import { notFound } from 'next/navigation';
import type { SaudiOverview } from '@gp/shared';
import { authedFetch } from '@/lib/api';
import { SaudiConsole } from '@/components/saudi-console';
export default async function SaudiPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const { company } = await searchParams;
  if (company && !/^[a-f0-9-]{36}$/i.test(company)) notFound();
  const result = await authedFetch<SaudiOverview>(
    'tenant',
    '/tenant/saudi' + (company ? '?legalEntityId=' + company : ''),
  );
  if (!result.ok) notFound();
  return <SaudiConsole data={result.data} />;
}
