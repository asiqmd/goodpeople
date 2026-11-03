'use client';

import {
  ANOMALY_RULES,
  type AnomalyCatalog,
  type AnomalyDefinition,
  type AnomalyEvidence,
  type AnomalyFinding,
  type AnomalyReview,
  type AnomalyRule,
} from '@gp/shared';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import {
  reviewAnomaly,
  scanAnomaly,
  type AnomalyActionState,
} from '@/app/workspace/analytics/anomalies/actions';
import { anomalyPath } from '@/app/workspace/analytics/anomalies/links';
import { Banner, buttonClass, inputClass } from '@/components/ui';

export function AnomalyFilters({
  catalog,
  definition,
}: {
  catalog: AnomalyCatalog;
  definition: AnomalyDefinition;
}) {
  const t = useTranslations('anomalies');
  const [rule, setRule] = useState<AnomalyRule>(definition.rule);
  const companies =
    rule === 'attendance_processing' || rule === 'attendance_movement' ? catalog.companies : [];
  const rules = ANOMALY_RULES.filter((kind) =>
    kind === 'assignment_coverage'
      ? catalog.assignmentCoverage
      : kind === 'payroll_movement'
        ? catalog.payrollMovement
        : catalog.companies.length > 0,
  );
  return (
    <form action={anomalyPath} method="get" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <label className="min-w-0 text-sm">
        {t('detector')}
        <select
          name="rule"
          value={rule}
          onChange={(e) => setRule(e.target.value as AnomalyRule)}
          className={inputClass + ' mt-1 w-full'}
        >
          {rules.map((kind) => (
            <option key={kind} value={kind}>
              {t('rules.' + kind)}
            </option>
          ))}
        </select>
      </label>
      {!!companies.length && (
        <label className="min-w-0 text-sm">
          {t('company')}
          <select
            name="companyId"
            required
            className={inputClass + ' mt-1 w-full'}
            defaultValue={'companyId' in definition ? definition.companyId : companies[0]?.id}
          >
            {companies.map((company) => (
              <option value={company.id} key={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="min-w-0 text-sm">
        {t('month')}
        <input
          name="month"
          type="month"
          min="2000-01"
          max={catalog.latestMonth}
          defaultValue={definition.month}
          className={inputClass + ' mt-1 w-full'}
          required
        />
      </label>
      <button className={buttonClass.primary + ' self-end'}>{t('apply')}</button>
    </form>
  );
}

export function FindingEvidence({ evidence }: { evidence: AnomalyEvidence }) {
  const t = useTranslations('anomalies');
  if (evidence.kind === 'assignments')
    return (
      <ul className="list-disc space-y-1 ps-5 text-sm">
        {evidence.issues.map((issue) => (
          <li key={issue}>{t('evidence.' + issue)}</li>
        ))}
      </ul>
    );
  if (evidence.kind === 'processing')
    return (
      <p className="text-sm">
        {t('evidence.processing', {
          from: evidence.trackingFrom,
          through: evidence.processedThrough ?? t('notProcessed'),
          expected: evidence.expected,
        })}
      </p>
    );
  if (evidence.kind === 'pending_attendance')
    return <p className="text-sm">{t('evidence.pending_attendance')}</p>;
  const unit = t('units.' + evidence.unit);
  const details = [
    ['observed', evidence.observed + ' ' + unit],
    ['baseline', evidence.baseline + ' ' + unit],
    ['difference', evidence.difference + ' ' + unit],
    ['changePercent', evidence.changePercent + '%'],
  ];
  return (
    <>
      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {details.map(([key, value]) => (
          <div key={key} className="rounded-lg bg-slate-50 p-3">
            <dt className="text-xs text-slate-600">{t('values.' + key)}</dt>
            <dd className="break-words font-medium tabular-nums">
              <bdi>{value}</bdi>
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-slate-600">
        {t('evidence.comparison', {
          from: evidence.baselineFrom,
          through: evidence.baselineThrough,
          absolute: evidence.absoluteThreshold + ' ' + unit,
          relative: evidence.relativeThreshold,
        })}
      </p>
    </>
  );
}

function ActionNotice({ state }: { state: AnomalyActionState | null }) {
  const t = useTranslations('anomalies');
  if (!state) return null;
  if (state.status === 'error') return <Banner tone="amber">{t('errors.' + state.reason)}</Banner>;
  if (state.status === 'reviewed') return <Banner tone="green">{t('reviewSaved')}</Banner>;
  const result = state.evaluation;
  return (
    <div className="space-y-2">
      <Banner tone={result.state === 'clear' ? 'green' : 'amber'}>
        {t('results.' + result.state)}
        {result.state === 'insufficient' && ' ' + t('insufficient.' + result.reason)}
      </Banner>
      {'evidence' in result && result.evidence && <FindingEvidence evidence={result.evidence} />}
      <p className="break-all text-xs text-slate-600">
        <bdi>
          {[result.version, result.sourceVersion, result.measuredAt, result.sourceRevision].join(
            ' · ',
          )}
        </bdi>
      </p>
    </div>
  );
}

export function ScanAnomalyForm({ definition }: { definition: AnomalyDefinition }) {
  const t = useTranslations('anomalies');
  const [state, action, pending] = useActionState(scanAnomaly.bind(null, definition), null);
  return (
    <div className="space-y-3">
      <form action={action}>
        <button className={buttonClass.primary} disabled={pending}>
          {t(pending ? 'running' : 'scan')}
        </button>
      </form>
      <div aria-live="polite">
        <ActionNotice state={state} />
      </div>
    </div>
  );
}

type ReviewAction = AnomalyReview['action'];

export function AnomalyReviewForm({
  finding,
  canRelease,
}: {
  finding: AnomalyFinding;
  canRelease: boolean;
}) {
  const { id, status, ownedByMe, supersededAt } = finding;
  const options: ReviewAction[] = [];
  if (status === 'open') options.push('claim');
  if (status === 'assigned' || status === 'acknowledged') {
    if (ownedByMe) {
      if (!supersededAt && status === 'assigned') options.push('acknowledge');
      options.push('resolve');
      if (!supersededAt) options.push('dismiss');
    }
    if (ownedByMe || canRelease) options.push('release');
  }
  if (!options.length) return null;
  return <ReviewForm key={options.join(':')} id={id} options={options} />;
}

function ReviewForm({ id, options }: { id: string; options: ReviewAction[] }) {
  const t = useTranslations('anomalies');
  const [choice, setChoice] = useState(options[0]!);
  const [state, action, pending] = useActionState(reviewAnomaly.bind(null, id), null);
  return (
    <div className="space-y-3 border-t border-slate-200 pt-3">
      <form action={action} className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-0 text-sm">
            {t('review')}
            <select
              name="action"
              value={choice}
              onChange={(e) => setChoice(e.target.value as ReviewAction)}
              className={inputClass + ' mt-1 block max-w-full'}
            >
              {options.map((option) => (
                <option key={option} value={option}>
                  {t('actions.' + option)}
                </option>
              ))}
            </select>
          </label>
          <button disabled={pending} className={buttonClass.secondary}>
            {t('saveReview')}
          </button>
        </div>
        {choice === 'dismiss' && (
          <label className="block text-sm">
            {t('reasonPrompt')}
            <textarea
              name="reason"
              minLength={5}
              maxLength={300}
              required
              className={inputClass + ' mt-1 block w-full'}
              rows={2}
            />
          </label>
        )}
      </form>
      <div aria-live="polite">
        <ActionNotice state={state} />
      </div>
    </div>
  );
}
