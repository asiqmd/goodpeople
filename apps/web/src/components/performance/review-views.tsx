import {
  PEER_QUESTIONS,
  type Competency,
  type PeerFeedbackItem,
  type PeerSummary,
  type ReviewAnswersView,
  type ReviewGoal,
  type ReviewStatus,
} from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { personName } from '../recruitment/opening-views';
import { Badge, type Tone } from '../ui';

const STATUS_TONE: Record<ReviewStatus, Tone> = {
  self: 'blue',
  manager: 'amber',
  calibration: 'violet',
  released: 'green',
  acknowledged: 'slate',
};

export async function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  const t = await getTranslations('reviews.status');
  return <Badge tone={STATUS_TONE[status]}>{t(status)}</Badge>;
}

/** A rating with its words, never the number alone: "4 · Above expectations". */
export async function RatingText({ rating }: { rating: number | null }) {
  const t = await getTranslations('reviews');
  const format = await getFormatter();
  if (rating === null) return <span className="text-slate-500">{t('noRating')}</span>;
  return (
    <span>
      <span className="font-semibold tabular-nums">{format.number(rating)}</span>
      {' · '}
      {t(`ratings.${rating}` as 'ratings.1')}
    </span>
  );
}

/** A competency's name in the reader's language. */
export const competencyName = (c: Competency, locale: string) => (locale === 'bn' ? c.bn : c.en);

/** A bar from 0 to 100 with the number beside it. */
export async function ProgressBar({ value }: { value: number }) {
  const format = await getFormatter();
  return (
    <span className="flex items-center gap-2">
      <span className="h-2 w-24 overflow-hidden rounded-full bg-slate-100" aria-hidden>
        <span className="block h-full bg-brand-600" style={{ width: `${value}%` }} />
      </span>
      <span className="text-xs text-slate-600 tabular-nums">
        {format.number(value / 100, { style: 'percent' })}
      </span>
    </span>
  );
}

/** The goals a review rates, with their weights and progress. */
export async function ReviewGoals({ goals }: { goals: ReviewGoal[] }) {
  const t = await getTranslations('reviews.goals');
  const format = await getFormatter();
  if (goals.length === 0) return <p className="text-sm text-slate-500">{t('none')}</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {goals.map((g) => (
        <li key={g.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium text-slate-900">{g.title}</p>
            {g.description && <p className="text-sm text-slate-600">{g.description}</p>}
            <p className="text-xs text-slate-500">
              {[
                g.weight !== null &&
                  t('weight', {
                    weight: format.number(Number(g.weight) / 100, { style: 'percent' }),
                  }),
                g.kind === 'kpi' &&
                  g.target !== null &&
                  t('target', {
                    current: g.currentValue === null ? '–' : format.number(Number(g.currentValue)),
                    target: format.number(Number(g.target)),
                    unit: g.measureUnit ?? '',
                  }),
                g.status === 'completed' && t('completed'),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <ProgressBar value={g.progress} />
        </li>
      ))}
    </ul>
  );
}

/** One part of a review read back: each goal's and competency's rating and comment. */
export async function AnswersView({
  answers,
  goals,
  competencies,
}: {
  answers: ReviewAnswersView | null;
  goals: ReviewGoal[];
  competencies: Competency[];
}) {
  const t = await getTranslations('reviews.answers');
  const locale = await getLocale();
  if (!answers) return <p className="text-sm text-slate-500">{t('empty')}</p>;
  const rows = [
    ...goals.map((g) => ({ key: g.id, label: g.title, answer: answers.goals[g.id] })),
    ...competencies.map((c) => ({
      key: c.key,
      label: competencyName(c, locale),
      answer: answers.competencies[c.key],
    })),
  ];
  return (
    <div className="space-y-3 text-sm">
      <dl className="divide-y divide-slate-100">
        {rows.map((r) => (
          <div key={r.key} className="py-2">
            <dt className="font-medium text-slate-800">{r.label}</dt>
            <dd className="mt-0.5 text-slate-700">
              <RatingText rating={r.answer?.rating ?? null} />
              {r.answer?.comment && <p className="mt-0.5 text-slate-600">“{r.answer.comment}”</p>}
            </dd>
          </div>
        ))}
      </dl>
      {answers.overall && (
        <div>
          <p className="font-medium text-slate-800">{t('overall')}</p>
          <p className="whitespace-pre-line text-slate-700">{answers.overall}</p>
        </div>
      )}
    </div>
  );
}

/** Peer feedback with names, for the manager and HR. */
export async function PeerFeedbackList({ peers }: { peers: PeerFeedbackItem[] }) {
  const t = await getTranslations('reviews.peers');
  const locale = await getLocale();
  if (peers.length === 0) return <p className="text-sm text-slate-500">{t('noneNamed')}</p>;
  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {peers.map((p) => (
        <li key={p.id} className="space-y-1 py-2.5">
          <p className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-slate-800">{personName(p.peer, locale)}</span>
            <Badge
              tone={
                p.status === 'submitted' ? 'green' : p.status === 'declined' ? 'slate' : 'amber'
              }
            >
              {t(`status.${p.status}`)}
            </Badge>
          </p>
          {p.status === 'submitted' && (
            <>
              <p>
                <RatingText rating={p.rating} />
              </p>
              {PEER_QUESTIONS.map((q) =>
                p.answers?.[q] ? (
                  <p key={q} className="text-slate-700">
                    <span className="text-slate-500">{t(`questions.${q}`)} </span>
                    {p.answers[q]}
                  </p>
                ) : null,
              )}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Peer feedback as the person reads it: together, never who wrote what. */
export async function PeerSummaryView({ summary }: { summary: PeerSummary }) {
  const t = await getTranslations('reviews.peers');
  const format = await getFormatter();
  if (!summary.shown) return <p className="text-sm text-slate-500">{t('tooFew')}</p>;
  return (
    <div className="space-y-3 text-sm">
      <p>
        {t('average')}{' '}
        <span className="font-semibold tabular-nums">
          {summary.averageRating === null ? '–' : format.number(summary.averageRating)}
        </span>
      </p>
      {PEER_QUESTIONS.map((q) => (
        <div key={q}>
          <p className="font-medium text-slate-800">{t(`questions.${q}`)}</p>
          <ul className="mt-1 list-disc space-y-1 ps-5 text-slate-700">
            {summary.answers[q].map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      ))}
      <p className="text-xs text-slate-500">{t('together')}</p>
    </div>
  );
}
