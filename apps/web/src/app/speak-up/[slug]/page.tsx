import type { SpeakUpInfo } from '@gp/shared';
import { notFound } from 'next/navigation';
import { intlFor, speakUpLocale } from '@/components/grievances/intl';
import { localDigits } from '@/components/grievances/parts';
import { SpeakUpShell } from '@/components/grievances/shell';
import { SpeakUpForm } from '@/components/grievances/speak-up-form';
import { Banner } from '@/components/ui';
import { apiFetch } from '@/lib/api';

/** Any worker raises a grievance here without signing in; a kiosk opens it with ?channel=kiosk. */
export default async function SpeakUpPage({ params, searchParams }: PageProps<'/speak-up/[slug]'>) {
  const { slug } = await params;
  const kiosk = (await searchParams).channel === 'kiosk';
  const { t, locale } = await intlFor(await speakUpLocale());
  const result = await apiFetch<SpeakUpInfo>(`/speak-up/${encodeURIComponent(slug)}`);
  if (!result.ok && result.status === 404) notFound();
  if (!result.ok) {
    return (
      <SpeakUpShell title={t('speakUp.title')}>
        <Banner tone="red">{t('speakUp.unavailable')}</Banner>
      </SpeakUpShell>
    );
  }
  const info = result.data;
  return (
    <SpeakUpShell workspace={info.workspace.name} title={t('speakUp.title')}>
      <p className="text-lg text-slate-800">
        {t('speakUp.subtitle', { workspace: info.workspace.name })}
      </p>
      <section className="flex gap-3 rounded-2xl bg-brand-50 p-4 ring-1 ring-inset ring-brand-600/20">
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          className="mt-0.5 size-7 shrink-0 text-brand-700"
        >
          <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
          <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
        </svg>
        <div className="space-y-2 text-base text-slate-800">
          <h2 className="font-semibold text-brand-900">{t('speakUp.privacyTitle')}</h2>
          <p>{t('speakUp.privacy')}</p>
          <p className="font-medium">{t('speakUp.privacyName')}</p>
        </div>
      </section>
      <SpeakUpForm info={info} kiosk={kiosk} />
      <p className="text-sm text-slate-600">
        {t('speakUp.deadline', {
          days: info.deadline.days,
          section: localDigits(info.deadline.reference.section, locale),
        })}
      </p>
    </SpeakUpShell>
  );
}
