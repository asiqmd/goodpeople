import type { OfferApprovalItem, OfferStatus, OfferView } from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { clockOptions } from '@/lib/clock';
import { Badge, Banner, type Tone } from '../ui';

type Formatter = Awaited<ReturnType<typeof getFormatter>>;

const STATUS_TONE: Record<OfferStatus, Tone> = {
  draft: 'slate',
  pending_approval: 'amber',
  approved: 'blue',
  rejected: 'red',
  sent: 'violet',
  accepted: 'green',
  declined: 'red',
  expired: 'slate',
  withdrawn: 'slate',
};

export async function OfferStatusBadge({ status }: { status: OfferStatus }) {
  const t = await getTranslations('offers.status');
  return <Badge tone={STATUS_TONE[status]}>{t(status)}</Badge>;
}

export const day = (format: Formatter, iso: string) =>
  format.dateTime(new Date(`${iso}T00:00:00Z`), { dateStyle: 'medium', timeZone: 'UTC' });

export const money = (format: Formatter, amount: string) =>
  format.number(Number(amount), { maximumFractionDigits: 2 });

/** A moment in Bangladesh time, on a 24-hour clock in Bangla. */
export async function moment(format: Formatter, iso: string) {
  return format.dateTime(new Date(iso), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Dhaka',
    ...(await clockOptions()),
  });
}

/** The offer's job, pay and dates, as a list. */
export async function OfferTerms({ offer }: { offer: OfferView }) {
  const t = await getTranslations('offers.terms');
  const th = await getTranslations('hr');
  const format = await getFormatter();
  const locale = await getLocale();
  const named = (ref: { name: string; nameBn: string | null } | null) =>
    ref ? (locale === 'bn' && ref.nameBn ? ref.nameBn : ref.name) : '—';
  const rows: [string, string][] = [
    [t('company'), offer.legalEntity.name],
    [t('unit'), named(offer.orgUnit)],
    [t('location'), named(offer.location)],
    [t('designation'), named(offer.designation)],
    [t('grade'), named(offer.grade)],
    [t('employmentType'), th(`employmentTypes.${offer.employmentType}`)],
    [t('joiningOn'), day(format, offer.joiningOn)],
    [t('monthlyGross'), t('money', { amount: money(format, offer.monthlyGross) })],
    [
      t('probation'),
      offer.probationMonths
        ? t('probationMonths', { count: offer.probationMonths })
        : t('noProbation'),
    ],
    [t('expiresOn'), day(format, offer.expiresOn)],
    [t('language'), t(`languages.${offer.language}`)],
  ];
  return (
    <div className="space-y-3">
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 border-b border-slate-100 pb-1">
            <dt className="text-slate-500">{label}</dt>
            <dd className="text-right font-medium text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
      {offer.terms && (
        <div className="text-sm">
          <p className="font-medium text-slate-800">{t('otherTerms')}</p>
          <p className="mt-1 whitespace-pre-line text-slate-700">{offer.terms}</p>
        </div>
      )}
    </div>
  );
}

/** Where a live offer stands: its approval, the candidate's link and their answer. */
export async function OfferNotes({ offer }: { offer: OfferView }) {
  const t = await getTranslations('offers.notes');
  const format = await getFormatter();
  const rejected = offer.steps.findLast((s) => s.status === 'rejected');
  const budget = offer.opening.budgetMax;
  return (
    <div className="space-y-2">
      {offer.aboveBudget && budget && (
        <Banner tone={offer.status === 'pending_approval' ? 'amber' : 'slate'}>
          {t('aboveBudget', {
            amount: money(format, offer.monthlyGross),
            budget: money(format, budget),
          })}
        </Banner>
      )}
      {offer.status === 'rejected' && (
        <Banner tone="red">
          {t('rejected', { name: rejected?.decidedBy ?? '' })}
          {rejected?.comment && <span className="mt-1 block">“{rejected.comment}”</span>}
        </Banner>
      )}
      {offer.status === 'approved' && !offer.candidate.email && (
        <Banner tone="amber">{t('noEmail')}</Banner>
      )}
      {offer.status === 'sent' && offer.sentAt && (
        <Banner tone="blue">
          {t('sent', {
            when: await moment(format, offer.sentAt),
            date: day(format, offer.expiresOn),
          })}
        </Banner>
      )}
      {offer.status === 'accepted' && offer.decidedAt && (
        <Banner tone="green">
          {t('accepted', {
            name: offer.acceptedName ?? '',
            when: await moment(format, offer.decidedAt),
            ip: offer.acceptedIp ?? '—',
          })}
          {offer.letterSha256 && (
            <span className="mt-1 block text-xs">
              {t('fingerprint')}: <code className="break-all font-mono">{offer.letterSha256}</code>
            </span>
          )}
        </Banner>
      )}
      {offer.status === 'declined' && offer.decidedAt && (
        <Banner tone="red">
          {t('declined', { when: await moment(format, offer.decidedAt) })}
          {offer.declineReason && <span className="mt-1 block">“{offer.declineReason}”</span>}
        </Banner>
      )}
      {offer.status === 'expired' && (
        <Banner tone="slate">{t('expired', { date: day(format, offer.expiresOn) })}</Banner>
      )}
    </div>
  );
}

/** An offer above its opening's budget, in the approvals inbox. */
export async function OfferApprovalCard({ item: { kind, offer } }: { item: OfferApprovalItem }) {
  const t = await getTranslations('offers.approval');
  const tl = await getTranslations('leave');
  const format = await getFormatter();
  return (
    <div className="min-w-0 space-y-1">
      <p className="font-medium text-slate-900">
        {t('summary', { name: offer.candidate.fullName, opening: offer.opening.title })}
      </p>
      <p className="text-sm text-slate-700">
        {t('pay', {
          amount: money(format, offer.monthlyGross),
          budget: money(format, offer.opening.budgetMax ?? '0'),
        })}
      </p>
      <p className="text-sm text-slate-500">
        {t('joining', { date: day(format, offer.joiningOn), by: offer.createdBy ?? '' })}
      </p>
      <p className="flex gap-4 text-sm">
        <Link
          href={`/workspace/recruitment/applications/${offer.applicationId}`}
          className="font-medium text-brand-700 hover:underline"
        >
          {t('open')}
        </Link>
        <a
          href={`/workspace/files/offers/${offer.id}/letter`}
          className="font-medium text-brand-700 hover:underline"
        >
          {t('letter')}
        </a>
      </p>
      <div className="flex gap-2">
        <Badge tone="violet">{t('badge')}</Badge>
        <Badge tone="blue">{tl(`step.${kind}`)}</Badge>
      </div>
    </div>
  );
}
