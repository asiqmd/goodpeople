import type { PeerInbox } from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { day } from '@/components/leave/leave-views';
import { PeerDecision } from '@/components/performance/peer-forms';
import { personName } from '@/components/recruitment/opening-views';
import { Badge, Banner, Card } from '@/components/ui';
import { authedFetch } from '@/lib/api';

/** Peers waiting for the manager's approval, and feedback the login is asked to give. */
export default async function PeersPage() {
  const t = await getTranslations('reviews');
  const format = await getFormatter();
  const locale = await getLocale();
  const result = await authedFetch<PeerInbox>('tenant', '/tenant/performance/peers');
  const header = (
    <div className="space-y-1">
      <Link href="/workspace/performance" className="text-sm text-slate-500 hover:underline">
        ← {t('title')}
      </Link>
      <h1 className="text-2xl font-semibold">{t('peers.title')}</h1>
      <p className="text-sm text-slate-600">{t('peers.intro')}</p>
    </div>
  );
  if (!result.ok) {
    return (
      <>
        {header}
        <Banner tone="amber">
          {result.error.code === 'feature_not_in_plan' ? t('notInPlan') : result.error.message}
        </Banner>
      </>
    );
  }
  const { toAnswer, toApprove } = result.data;
  return (
    <>
      {header}
      {toApprove.length > 0 && (
        <Card title={t('peers.toApprove')}>
          <ul className="divide-y divide-slate-100">
            {toApprove.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="space-y-0.5 text-sm">
                  <p>
                    {t('peers.approveLine', {
                      peer: personName(p.peer, locale),
                      person: personName(p.person, locale),
                    })}
                  </p>
                  <p className="text-xs text-slate-500">
                    <Link
                      href={`/workspace/performance/reviews/${p.reviewId}`}
                      className="hover:underline"
                    >
                      {p.cycle.name}
                    </Link>
                  </p>
                </div>
                <PeerDecision peerId={p.id} />
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card title={t('peers.toAnswer')}>
        {toAnswer.length === 0 ? (
          <p className="text-sm text-slate-500">{t('peers.noneToAnswer')}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {toAnswer.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="space-y-0.5">
                  <Link
                    href={`/workspace/performance/peers/${p.id}`}
                    className="text-sm font-medium text-brand-700 hover:underline"
                  >
                    {t('peers.feedbackOn', { person: personName(p.person, locale) })}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {[
                      p.cycle.name,
                      p.open && p.dueOn && t('tasks.due', { date: day(format, p.dueOn) }),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <Badge tone={p.status === 'submitted' ? 'green' : p.open ? 'amber' : 'slate'}>
                  {p.status === 'submitted'
                    ? t('peers.status.submitted')
                    : p.open
                      ? t('peers.waiting')
                      : t('peers.closed')}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
