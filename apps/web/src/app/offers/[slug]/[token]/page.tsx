import type { PublicOfferView } from '@gp/shared';
import { createFormatter, createTranslator } from 'next-intl';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { LanguageToggle } from '@/components/forms';
import { messagesFor } from '@/components/grievances/intl';
import { OfferAnswerForms } from '@/components/recruitment/offer-answer-forms';
import { loadPublicOffer, offerLocale } from '@/components/recruitment/offer-public';
import { Banner, buttonClass } from '@/components/ui';

function Shell({
  company,
  title,
  children,
}: {
  company?: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto min-h-screen max-w-2xl space-y-5 px-4 py-6 sm:py-10">
      <header className="flex items-start justify-between gap-3">
        <div>
          {company && <p className="text-sm font-medium text-slate-500">{company}</p>}
          <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        </div>
        <div className="shrink-0">
          <LanguageToggle />
        </div>
      </header>
      {children}
    </main>
  );
}

/**
 * A candidate's offer through their private link: the letter's content and the PDF, the
 * accept and decline forms while it is open, and the outcome afterwards.
 */
export default async function OfferPage({ params }: PageProps<'/offers/[slug]/[token]'>) {
  const { slug, token } = await params;
  const result = await loadPublicOffer(slug, token);
  if (!result.ok && result.status === 404) notFound();
  const locale = await offerLocale(result.ok ? result.data.language : undefined);
  const messages = await messagesFor(locale);
  const t = createTranslator({ locale, messages, namespace: 'offers.public' });
  const th = createTranslator({ locale, messages, namespace: 'hr' });
  if (!result.ok) {
    return (
      <Shell title={t('title')}>
        <Banner tone="red">{t(result.status === 429 ? 'busy' : 'unavailable')}</Banner>
      </Shell>
    );
  }
  const offer: PublicOfferView = result.data;
  const format = createFormatter({ locale });
  const day = (iso: string) =>
    format.dateTime(new Date(`${iso}T00:00:00Z`), { dateStyle: 'long', timeZone: 'UTC' });
  // Bangla has no AM/PM of its own, so a 24-hour clock, as clockOptions() gives the workspace.
  const when = (iso: string) =>
    format.dateTime(new Date(iso), {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'Asia/Dhaka',
      ...(locale === 'bn' ? { hourCycle: 'h23' as const } : {}),
    });
  const rows: [string, string][] = [
    [t('position'), offer.position[locale]],
    ...(offer.orgUnit ? [[t('unit'), offer.orgUnit[locale]] as [string, string]] : []),
    ...(offer.location ? [[t('location'), offer.location] as [string, string]] : []),
    ...(offer.grade ? [[t('grade'), offer.grade] as [string, string]] : []),
    [t('employmentType'), th(`employmentTypes.${offer.employmentType}`)],
    [t('joiningOn'), day(offer.joiningOn)],
    [
      t('monthlyGross'),
      t('money', {
        amount: format.number(Number(offer.monthlyGross), { maximumFractionDigits: 2 }),
      }),
    ],
    [
      t('probation'),
      offer.probationMonths
        ? t('probationMonths', { count: offer.probationMonths })
        : t('noProbation'),
    ],
    [t('expiresOn'), day(offer.expiresOn)],
  ];

  return (
    <Shell company={offer.company.name} title={t('title')}>
      {offer.status === 'sent' && (
        <Banner tone="blue">{t('validUntil', { date: day(offer.expiresOn) })}</Banner>
      )}
      {offer.status === 'accepted' && offer.decidedAt && (
        <Banner tone="green">{t('accepted', { when: when(offer.decidedAt) })}</Banner>
      )}
      {offer.status === 'declined' && offer.decidedAt && (
        <Banner tone="slate">{t('declined', { when: when(offer.decidedAt) })}</Banner>
      )}
      {offer.status === 'expired' && (
        <Banner tone="amber">{t('expired', { date: day(offer.expiresOn) })}</Banner>
      )}
      {offer.status === 'withdrawn' && <Banner tone="slate">{t('withdrawn')}</Banner>}

      <section className="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div>
          <p className="font-semibold text-slate-900">{offer.company.name}</p>
          {offer.company.address && (
            <p className="text-xs text-slate-500">{offer.company.address[locale]}</p>
          )}
        </div>
        <p className="text-slate-800">{t('dear', { name: offer.candidate.fullName })}</p>
        <p className="text-slate-800">{t('intro', { company: offer.company.name })}</p>
        <dl className="divide-y divide-slate-100 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 py-2">
              <dt className="text-slate-500">{label}</dt>
              <dd className="text-right font-medium text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
        {offer.terms && (
          <div className="text-sm">
            <h2 className="font-semibold text-slate-900">{t('otherTerms')}</h2>
            <p className="mt-1 whitespace-pre-line text-slate-700">{offer.terms}</p>
          </div>
        )}
        <a
          href={`/offers/${encodeURIComponent(slug)}/${encodeURIComponent(token)}/letter`}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass.secondary}
        >
          {offer.status === 'accepted' ? t('acceptedLetter') : t('letter')}
        </a>
      </section>

      {offer.status === 'sent' && <OfferAnswerForms slug={slug} token={token} />}

      <p className="text-xs text-slate-500">{t('record')}</p>
    </Shell>
  );
}
