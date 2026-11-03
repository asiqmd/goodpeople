import { notFound } from 'next/navigation';
import type { AssuranceOverview } from '@gp/shared';
import { authedFetch } from '@/lib/api';
import { AssuranceConsole } from '@/components/assurance-console';
export default async function AssurancePage({
  searchParams,
}: {
  searchParams: Promise<{ program?: string }>;
}) {
  const { program } = await searchParams;
  if (program && !/^[a-f0-9-]{36}$/i.test(program)) notFound();
  const r = await authedFetch<AssuranceOverview>(
    'platform',
    '/platform/assurance' + (program ? '?program=' + program : ''),
  );
  if (!r.ok) notFound();
  return <AssuranceConsole data={r.data} />;
}
