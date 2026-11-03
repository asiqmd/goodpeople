'use client';

import {
  ASSISTANT_QUERY_LIMIT,
  INSIGHT_KINDS,
  type AssistantWorkforceCatalog,
  type AssistantInsightCatalog,
  type InsightKind,
} from '@gp/shared';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { askAssistant, type AssistantAnswer } from '@/app/workspace/assistant/actions';
import { Banner, buttonClass, Card, inputClass } from '@/components/ui';
import { DocumentExcerpt, MetricExplanation } from './answer';

export function AssistantForm({
  workforce,
  insight,
}: {
  workforce?: AssistantWorkforceCatalog;
  insight?: AssistantInsightCatalog;
}) {
  const t = useTranslations('assistant');
  const ti = useTranslations('insights');
  const [result, action, pending] = useActionState<AssistantAnswer | null, FormData>(
    askAssistant,
    null,
  );
  const [mode, setMode] = useState<'help' | 'workforce' | 'insight'>('help');
  const reports = INSIGHT_KINDS.filter((kind) =>
    kind === 'payroll'
      ? insight?.payroll
      : insight?.companies.some((company) => company.kinds.includes(kind)),
  );
  const [reportKind, setReportKind] = useState<InsightKind | undefined>(reports[0]);
  const companies =
    reportKind && reportKind !== 'payroll'
      ? (insight?.companies.filter((company) => company.kinds.includes(reportKind)) ?? [])
      : [];
  const metric = result?.status === 'metric' ? result.metric : null;
  const reference = metric?.citation.request;
  const companyName =
    reference?.kind === 'insight' && 'companyId' in reference.report
      ? insight?.companies.find(
          (company) => 'companyId' in reference.report && company.id === reference.report.companyId,
        )?.name
      : undefined;

  return (
    <>
      <Card>
        <fieldset disabled={pending} className="space-y-4">
          <label className="block text-sm font-medium">
            {t('sourceType')}
            <select
              className={inputClass + ' mt-1 w-full sm:max-w-xs'}
              value={mode}
              onChange={(event) => {
                const value = event.target.value;
                if (value === 'help' || value === 'workforce' || value === 'insight')
                  setMode(value);
              }}
            >
              <option value="help">{t('help')}</option>
              {workforce && <option value="workforce">{t('workforce')}</option>}
              {insight && reports.length > 0 && <option value="insight">{t('insight')}</option>}
            </select>
          </label>
          <form action={action} className="space-y-4">
            <input type="hidden" name="kind" value={mode} />
            {mode === 'help' && (
              <label className="block text-sm font-medium">
                {t('question')}
                <input
                  className={inputClass + ' mt-1 w-full'}
                  name="question"
                  required
                  minLength={2}
                  maxLength={ASSISTANT_QUERY_LIMIT}
                  placeholder={t('example')}
                  autoComplete="off"
                />
              </label>
            )}
            {mode === 'workforce' && workforce && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="min-w-0 text-sm font-medium">
                  {t('asOf')}
                  <input
                    className={inputClass + ' mt-1 w-full'}
                    type="date"
                    name="asOf"
                    required
                    defaultValue={workforce.defaultAsOf}
                    max={workforce.maxAsOf}
                  />
                </label>
                <label className="min-w-0 text-sm font-medium">
                  {ti('company')}
                  <select className={inputClass + ' mt-1 w-full'} name="companyId">
                    <option value="">{t('authorizedCompanies')}</option>
                    {workforce.companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
            {mode === 'insight' && insight && (
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="min-w-0 text-sm font-medium">
                  {ti('report')}
                  <select
                    className={inputClass + ' mt-1 w-full'}
                    name="reportKind"
                    value={reportKind}
                    onChange={(event) =>
                      setReportKind(reports.find((kind) => kind === event.target.value))
                    }
                  >
                    {reports.map((kind) => (
                      <option key={kind} value={kind}>
                        {ti('kinds.' + kind)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="min-w-0 text-sm font-medium">
                  {ti('month')}
                  <input
                    className={inputClass + ' mt-1 w-full'}
                    type="month"
                    name="month"
                    required
                    defaultValue={insight.latestMonth}
                    max={insight.latestMonth}
                  />
                </label>
                {reportKind !== 'payroll' && (
                  <label className="min-w-0 text-sm font-medium">
                    {ti('company')}
                    <select
                      key={reportKind}
                      className={inputClass + ' mt-1 w-full'}
                      name="companyId"
                      required
                    >
                      {companies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}
            <button type="submit" className={buttonClass.primary}>
              {pending ? t('working') : t('ask')}
            </button>
          </form>
        </fieldset>
      </Card>
      <section aria-live="polite" aria-busy={pending} className="space-y-4">
        {!pending &&
          result?.status === 'documents' &&
          result.documents.map((document) => (
            <DocumentExcerpt key={document.citation.id} answer={document} />
          ))}
        {!pending && metric && <MetricExplanation answer={metric} companyName={companyName} />}
        {!pending && result && result.status !== 'documents' && result.status !== 'metric' && (
          <Banner tone="amber">{t('errors.' + result.status)}</Banner>
        )}
      </section>
    </>
  );
}
