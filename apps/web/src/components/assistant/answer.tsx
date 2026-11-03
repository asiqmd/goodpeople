'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Card } from '@/components/ui';
import { citationLink } from '@/lib/assistant/links';
import type { DocumentAnswer, MetricAnswer } from '@/lib/assistant/sources';

export function DocumentExcerpt({
  answer,
  resolved = false,
}: {
  answer: DocumentAnswer;
  resolved?: boolean;
}) {
  const t = useTranslations('assistant');
  return (
    <Card title={answer.title}>
      <p className="text-xs font-medium text-slate-600">
        {t(answer.classification === 'policy' ? 'policyExcerpt' : 'helpExcerpt')}
      </p>
      <blockquote
        lang={answer.locale}
        dir={answer.locale === 'ar' ? 'rtl' : 'ltr'}
        className="my-3 break-words border-s-2 border-brand-300 ps-3 text-sm leading-relaxed"
      >
        {answer.quote}
      </blockquote>
      <p className="text-xs text-slate-600">
        {t('documentDetails', {
          date: answer.updated,
          version: answer.version,
          locale: t('languages.' + answer.locale),
        })}
      </p>
      <Link
        className="mt-3 inline-block text-sm text-brand-700 underline"
        href={resolved ? answer.href : citationLink(answer.citation)}
        prefetch={false}
      >
        {t(resolved ? 'openDocument' : 'verifyCitation')}
      </Link>
    </Card>
  );
}

export function MetricExplanation({
  answer,
  resolved = false,
  companyName,
}: {
  answer: MetricAnswer;
  resolved?: boolean;
  companyName?: string;
}) {
  const t = useTranslations('assistant');
  const workforce = useTranslations('analytics');
  const insight = useTranslations('insights');
  const scope = answer.companyName ?? companyName ?? t('scopes.' + answer.scope);
  const title = answer.reportKind ? insight('kinds.' + answer.reportKind) : t('workforce');
  return (
    <Card title={title}>
      <p className="text-sm font-medium">{scope}</p>
      <p className="mt-1 text-sm text-slate-600">
        <bdi>
          {answer.from === answer.through ? answer.from : answer.from + ' — ' + answer.through}
        </bdi>
      </p>
      {answer.reportKind && (
        <p className="mt-2 text-sm text-slate-600">{insight('definitions.' + answer.reportKind)}</p>
      )}
      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        {answer.readings.map((reading) => (
          <div key={reading.id} className="min-w-0 rounded-lg bg-slate-50 p-3">
            <dt className="text-sm font-medium">
              {answer.kind === 'workforce'
                ? workforce('metrics.' + reading.id)
                : insight('metrics.' + reading.id)}
            </dt>
            <dd className="mt-1 break-all text-lg font-semibold tabular-nums">
              <bdi>
                {reading.value === null
                  ? '—'
                  : [reading.value, answer.currency].filter(Boolean).join(' ')}
              </bdi>
            </dd>
            <dd className="mt-1 text-xs text-slate-600">
              {answer.kind === 'workforce'
                ? workforce('states.' + reading.state)
                : insight('states.' + reading.state)}
            </dd>
            {answer.kind === 'workforce' && (
              <dd className="mt-2 text-xs text-slate-600">
                {workforce('definitions.' + reading.id)}
              </dd>
            )}
          </div>
        ))}
      </dl>
      {answer.issue && (
        <p className="mt-3 text-sm text-slate-600">{insight('issues.' + answer.issue)}</p>
      )}
      <p className="mt-4 text-xs text-slate-600">
        {t('metricDetails', { version: answer.version })} <bdi>{answer.dataAsOf}</bdi>
      </p>
      <Link
        className="mt-3 inline-block text-sm text-brand-700 underline"
        href={resolved ? answer.href : citationLink(answer.citation)}
        prefetch={false}
      >
        {t(resolved ? 'openReport' : 'verifyCitation')}
      </Link>
    </Card>
  );
}
