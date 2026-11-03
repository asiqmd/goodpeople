import { notFound } from 'next/navigation';
import type { PlacementView } from '@gp/shared';
import { authedFetch } from '@/lib/api';
import { PlacementsConsole } from '@/components/enterprise/placements-console';
export default async function Placements() {
  const result = await authedFetch<PlacementView[]>('platform', '/platform/placements');
  if (!result.ok) notFound();
  return <PlacementsConsole rows={result.data} />;
}
