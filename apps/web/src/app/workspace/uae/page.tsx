import { notFound } from 'next/navigation';
import type { UaeOverview } from '@gp/shared';
import { authedFetch } from '@/lib/api';
import { UaeConsole } from '@/components/uae-console';
export default async function UaePage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  const { company } = await searchParams;
  if (company && !/^[a-f0-9-]{36}$/i.test(company)) notFound();
  const result = await authedFetch<UaeOverview>(
    'tenant',
    '/tenant/uae' + (company ? '?legalEntityId=' + company : ''),
  );
  if (!result.ok) notFound();
  return <UaeConsole data={result.data} />;
}
