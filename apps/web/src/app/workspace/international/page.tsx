import { notFound } from 'next/navigation';
import type { InternationalOverview } from '@gp/shared';
import { authedFetch } from '@/lib/api';
import { InternationalConsole } from '@/components/international-console';
export default async function InternationalPage() {
  const r = await authedFetch<InternationalOverview>('tenant', '/tenant/international');
  if (!r.ok) notFound();
  return <InternationalConsole data={r.data} />;
}
