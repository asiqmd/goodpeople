import type { SpeakUpInfo } from '@gp/shared';
import { notFound } from 'next/navigation';
import { FollowUpPanel } from '@/components/grievances/follow-up-panel';
import { intlFor, speakUpLocale } from '@/components/grievances/intl';
import { SpeakUpShell } from '@/components/grievances/shell';
import { Banner } from '@/components/ui';
import { apiFetch } from '@/lib/api';

/** The reporter reads the answers with their reference and PIN, and replies. */
export default async function FollowUpPage({
  params,
  searchParams,
}: PageProps<'/speak-up/[slug]/follow-up'>) {
  const { slug } = await params;
  const kiosk = (await searchParams).channel === 'kiosk';
  const { t } = await intlFor(await speakUpLocale());
  const result = await apiFetch<SpeakUpInfo>(`/speak-up/${encodeURIComponent(slug)}`);
  if (!result.ok && result.status === 404) notFound();
  if (!result.ok) {
    return (
      <SpeakUpShell title={t('followUp.title')}>
        <Banner tone="red">{t('speakUp.unavailable')}</Banner>
      </SpeakUpShell>
    );
  }
  return (
    <SpeakUpShell workspace={result.data.workspace.name} title={t('followUp.title')}>
      <FollowUpPanel slug={result.data.workspace.slug} kiosk={kiosk} />
    </SpeakUpShell>
  );
}
