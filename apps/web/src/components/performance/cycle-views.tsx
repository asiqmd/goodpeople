import { REVIEW_STATUSES, type CycleProgress, type CycleStatus } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Badge, type Tone } from '../ui';

const STATUS_TONE: Record<CycleStatus, Tone> = {
  draft: 'slate',
  active: 'blue',
  calibration: 'violet',
  released: 'green',
  closed: 'slate',
};

export async function CycleStatusBadge({ status }: { status: CycleStatus }) {
  const t = await getTranslations('reviews.cycle.status');
  return <Badge tone={STATUS_TONE[status]}>{t(status)}</Badge>;
}

/** Reviews by where they are, and the steps past their dates. */
export async function CycleProgressView({
  progress,
  href,
}: {
  progress: CycleProgress;
  /** The people list, filtered by a status. */
  href: (status: string) => string;
}) {
  const t = await getTranslations('reviews.cycle.progress');
  const ts = await getTranslations('reviews.status');
  const format = await getFormatter();
  const overdue = [
    ['self', progress.overdue.self],
    ['peer', progress.overdue.peer],
    ['manager', progress.overdue.manager],
  ] as const;
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        <div className="rounded-lg bg-slate-50 p-3">
          <dt className="text-xs text-slate-500">{t('total')}</dt>
          <dd className="text-xl font-semibold tabular-nums">{format.number(progress.total)}</dd>
        </div>
        {REVIEW_STATUSES.map((s) => (
          <div key={s} className="rounded-lg bg-slate-50 p-3">
            <dt className="text-xs text-slate-500">
              <Link href={href(s)} className="hover:underline">
                {ts(s)}
              </Link>
            </dt>
            <dd className="text-xl font-semibold tabular-nums">
              {format.number(progress.byStatus[s])}
            </dd>
          </div>
        ))}
      </dl>
      <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
        {overdue.map(([step, n]) => (
          <li key={step} className={n > 0 ? 'font-medium text-red-700' : ''}>
            {t(`overdue.${step}`, { count: n, n: format.number(n) })}
          </li>
        ))}
        <li>
          {t('noManager', { count: progress.noManager, n: format.number(progress.noManager) })}
        </li>
        <li>
          {t('finalRatings', {
            done: format.number(progress.withFinalRating),
            total: format.number(progress.total),
          })}
        </li>
        {progress.peers.proposed + progress.peers.approved + progress.peers.submitted > 0 && (
          <li>
            {t('peers', {
              submitted: format.number(progress.peers.submitted),
              asked: format.number(progress.peers.approved + progress.peers.submitted),
            })}
          </li>
        )}
      </ul>
    </div>
  );
}
