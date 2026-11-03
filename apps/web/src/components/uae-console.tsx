'use client';
import Link from 'next/link';
import { useActionState, useState, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { UaeOverview } from '@gp/shared';
import { uaeChange } from '@/app/actions/uae';
import { Banner, Card } from '@/components/ui';
const control = 'mt-1 w-full min-w-0 rounded-lg border border-slate-300 bg-white p-2';
const button = 'rounded-lg bg-emerald-700 px-4 py-2 text-white disabled:opacity-50';
function Field({
  label,
  name,
  type = 'text',
  value,
  required = true,
  step,
}: {
  label: string;
  name: string;
  type?: string;
  value?: string | number;
  required?: boolean;
  step?: string;
}) {
  return (
    <label className="min-w-0 text-sm">
      {label}
      <input
        className={control}
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        step={step}
        dir={['number', 'date'].includes(type) ? 'ltr' : undefined}
      />
    </label>
  );
}
function Select({ label, name, children }: { label: string; name: string; children: ReactNode }) {
  return (
    <label className="min-w-0 text-sm">
      {label}
      <select className={control} name={name} required>
        <option value="">—</option>
        {children}
      </select>
    </label>
  );
}
export function UaeConsole({ data }: { data: UaeOverview }) {
  const t = useTranslations('uae'),
    locale = useLocale(),
    [tab, setTab] = useState('coverage');
  const [state, action, pending] = useActionState(uaeChange, undefined);
  const [overtimeCount, setOvertimeCount] = useState(0),
    [deductionCount, setDeductionCount] = useState(0);
  const [comparisonRun, setComparisonRun] = useState('');
  const company = data.selectedCompanyId;
  const hidden = (op: string) => (
    <>
      <input type="hidden" name="op" value={op} />
      <input type="hidden" name="legalEntityId" value={company ?? ''} />
    </>
  );
  const reason = (
    <label className="text-sm sm:col-span-2">
      {t('reason')}
      <textarea name="reason" className={control} minLength={10} maxLength={1000} required />
    </label>
  );
  const save = (label = 'save') => (
    <button className={button + ' justify-self-start sm:col-span-2'} disabled={pending}>
      {pending ? t('saving') : t(label)}
    </button>
  );
  const workerSelect = (
    <Select label={t('worker')} name="workerCoverageId">
      {data.workers
        .filter((w) => !w.effectiveTo)
        .map((w) => (
          <option key={w.id} value={w.id}>
            {w.name} · {w.definition.scheme} · {w.supported ? t('candidate') : t('blocked')}
          </option>
        ))}
    </Select>
  );
  const options = (values: string[]) =>
    values.map((value) => (
      <option key={value} value={value}>
        {t('options.' + value)}
      </option>
    ));
  const amount = (name: string) => <Field label={t(name)} name={name} type="number" step="0.01" />;
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-emerald-700">{t('eyebrow')}</p>
        <h1 className="mt-1 text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-2 text-slate-600">{t('intro')}</p>
      </div>
      <Banner tone="amber">{t('notice')}</Banner>
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 text-sm">
          {t('company')}
          <select name="company" defaultValue={company ?? ''} className={control}>
            {data.companies.map((c) => (
              <option value={c.id} key={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button className={button}>{t('open')}</button>
      </form>
      {state?.error && (
        <div role="alert">
          <Banner tone="red">{state.error}</Banner>
        </div>
      )}
      {state?.ok && (
        <div role="status">
          <Banner tone="green">{t('saved')}</Banner>
        </div>
      )}
      {!company ? (
        <Card>
          <p>{t('noCompany')}</p>
          <Link className="underline" href="/workspace/international">
            {t('international')}
          </Link>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              [t('coverage'), data.workers.filter((w) => !w.effectiveTo).length],
              [t('pilots'), data.pilots.length],
              [t('independent'), data.qualification.independentConsecutivePeriods],
            ].map(([label, value]) => (
              <Card key={label}>
                <p className="text-sm text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-semibold">
                  <bdi>{value}</bdi>
                </p>
              </Card>
            ))}
          </div>
          <div className="flex flex-wrap gap-2" aria-label={t('sections')}>
            {['coverage', 'leave', 'pilots', 'qualification', 'sources'].map((key) => (
              <button
                type="button"
                aria-pressed={tab === key}
                key={key}
                onClick={() => setTab(key)}
                className={
                  'rounded-lg border px-4 py-2 text-sm ' +
                  (tab === key
                    ? 'border-emerald-700 bg-emerald-50 text-emerald-900'
                    : 'border-slate-200 bg-white')
                }
              >
                {t(key)}
              </button>
            ))}
          </div>
          {tab === 'coverage' && (
            <>
              <Card>
                <h2 className="text-lg font-semibold">{t('employer')}</h2>
                <p className="mt-2 text-sm text-slate-600">{t('employerHelp')}</p>
                {data.employers.length > 0 && (
                  <ul className="mt-3 space-y-2 text-sm">
                    {data.employers.map((e) => (
                      <li key={e.id}>
                        <bdi>
                          {e.effectiveFrom} — {e.effectiveTo ?? '…'} · {e.definition.regime} ·{' '}
                          {e.definition.workModel}
                        </bdi>
                      </li>
                    ))}
                  </ul>
                )}
                {data.capabilities.employer && (
                  <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
                    {hidden('employer')}
                    <Field label={t('from')} name="effectiveFrom" type="date" />
                    <Select label={t('regime')} name="regime">
                      {options([
                        'mohre_federal_private',
                        'difc',
                        'adgm',
                        'government',
                        'domestic',
                        'other_free_zone',
                      ])}
                    </Select>
                    <Select label={t('workModel')} name="workModel">
                      {options(['full_time', 'part_time', 'other'])}
                    </Select>
                    <Select label={t('endOfService')} name="endOfService">
                      {options(['statutory_gratuity', 'alternative_savings', 'other'])}
                    </Select>
                    <Select label={t('workingTime')} name="workingTime">
                      {options(['standard', 'excluded'])}
                    </Select>
                    <Field label={t('dailyMinutes')} name="dailyMinutes" type="number" />
                    <Field label={t('noticeDays')} name="noticeDays" type="number" />
                    <Field label={t('probationMonths')} name="probationMonths" type="number" />
                    <fieldset className="sm:col-span-2">
                      <legend className="text-sm">{t('restDays')}</legend>
                      <div className="mt-2 flex flex-wrap gap-4">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
                          <label key={day} className="flex items-center gap-2 text-sm">
                            <input name="weeklyRestDays" type="checkbox" value={i} />
                            {t('days.' + day)}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <p className="text-sm text-slate-500 sm:col-span-2">{t('conventions')}</p>
                    {reason}
                    {save()}
                  </form>
                )}
              </Card>
              <Card>
                <h2 className="text-lg font-semibold">{t('workerCoverage')}</h2>
                <p className="mt-2 text-sm text-slate-600">{t('workerHelp')}</p>
                <Link href="/workspace/international" className="text-sm underline">
                  {t('international')}
                </Link>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr>
                        {['worker', 'scheme', 'from', 'status'].map((k) => (
                          <th key={k} className="p-2 text-start">
                            {t(k)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.workers.map((w) => (
                        <tr className="border-t" key={w.id}>
                          <td className="p-2" dir="auto">
                            {w.name}
                          </td>
                          <td className="p-2">{t('options.' + w.definition.scheme)}</td>
                          <td className="p-2">
                            <bdi>
                              {w.effectiveFrom} — {w.effectiveTo ?? '…'}
                            </bdi>
                          </td>
                          <td className="p-2">{w.supported ? t('candidate') : t('blocked')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {data.capabilities.worker && (
                  <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
                    {hidden('worker')}
                    <Select label={t('worker')} name="employeeId">
                      {data.employees.map((e) => (
                        <option value={e.id} key={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </Select>
                    <Field label={t('from')} name="effectiveFrom" type="date" />
                    <Select label={t('scheme')} name="scheme">
                      {options([
                        'expatriate_none',
                        'gpssa_1999',
                        'gpssa_2023',
                        'gcc_extension',
                        'other_authority',
                        'unknown',
                      ])}
                    </Select>
                    <Select label={t('authority')} name="authority">
                      {options(['none_confirmed', 'gpssa', 'other', 'unknown'])}
                    </Select>
                    <Select label={t('priorParticipation')} name="priorParticipation">
                      {options([
                        'none',
                        'law_1999',
                        'law_2023',
                        'pensioner_1999',
                        'gratuity_1999',
                        'unknown',
                      ])}
                    </Select>
                    <Select label={t('workLocation')} name="workLocation">
                      {options(['AE_onshore', 'cross_border', 'unknown'])}
                    </Select>
                    <Select label={t('contractTerm')} name="contractTerm">
                      {options(['fixed_term', 'unknown', 'other'])}
                    </Select>
                    <Field
                      label={t('contractEndOn')}
                      name="contractEndOn"
                      type="date"
                      required={false}
                    />
                    <Field label={t('noticeDays')} name="noticeDays" type="number" />
                    <Field label={t('probationMonths')} name="probationMonths" type="number" />
                    <Field
                      label={t('firstContributionOn')}
                      name="firstContributionOn"
                      type="date"
                      required={false}
                    />
                    <Field
                      label={t('contributionSalary')}
                      name="contributionSalary"
                      type="number"
                      step="0.01"
                      required={false}
                    />
                    <Field
                      label={t('contributionBasisOn')}
                      name="contributionBasisOn"
                      type="date"
                      required={false}
                    />
                    <Field label={t('evidenceReference')} name="evidenceReference" />
                    {reason}
                    {save()}
                  </form>
                )}
              </Card>
            </>
          )}
          {tab === 'leave' && (
            <Card>
              <h2 className="text-lg font-semibold">{t('leave')}</h2>
              <p className="mt-2 text-sm text-slate-600">{t('leaveHelp')}</p>
              <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
                {hidden('leave')}
                {workerSelect}
                <Field label={t('onDate')} name="onDate" type="date" />
                <Select label={t('leaveKind')} name="kind">
                  {options([
                    'annual',
                    'sick',
                    'maternity',
                    'parental',
                    'bereavement_spouse',
                    'bereavement_family',
                    'study',
                  ])}
                </Select>
                <Field label={t('usedBefore')} name="usedBefore" type="number" value={0} />
                <Field label={t('requestedDays')} name="requestedDays" type="number" />
                <label className="flex items-center gap-2 text-sm">
                  <input name="probationCompleted" type="checkbox" />
                  {t('probationCompleted')}
                </label>
                <Field label={t('eventDate')} name="eventDate" type="date" required={false} />
                <label className="flex items-start gap-2 text-sm sm:col-span-2">
                  <input name="eligibilityAttested" type="checkbox" required />
                  {t('eligibilityAttested')}
                </label>
                {save('calculate')}
              </form>
              {state?.leave && (
                <dl className="mt-4 grid grid-cols-3 gap-3 rounded-lg bg-emerald-50 p-3">
                  {['fullDays', 'halfDays', 'unpaidDays'].map((k) => (
                    <div key={k}>
                      <dt className="text-sm">{t(k)}</dt>
                      <dd className="text-xl">
                        <bdi>{state.leave![k as 'fullDays' | 'halfDays' | 'unpaidDays']}</bdi>
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </Card>
          )}
          {tab === 'pilots' && (
            <>
              <Card>
                <h2 className="text-lg font-semibold">{t('monthly')}</h2>
                <p className="mt-2 text-sm text-slate-600">{t('monthlyHelp')}</p>
                {data.capabilities.prepare && (
                  <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
                    {hidden('payroll')}
                    {workerSelect}
                    <Field label={t('periodStart')} name="periodStart" type="date" />
                    <Field label={t('periodEnd')} name="periodEnd" type="date" />
                    {amount('basic')}
                    {amount('allowances')}
                    {['unpaidDays', 'sickDaysBefore', 'sickDays'].map((k) => (
                      <Field label={t(k)} name={k} key={k} type="number" value={0} />
                    ))}
                    <label className="flex items-center gap-2 text-sm">
                      <input name="probationCompleted" type="checkbox" />
                      {t('probationCompleted')}
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input name="shiftWorker" type="checkbox" />
                      {t('shiftWorker')}
                    </label>
                    <details className="sm:col-span-2">
                      <summary className="cursor-pointer text-sm underline">
                        {t('advanced')}
                      </summary>
                      <p className="mt-2 text-sm">{t('advancedHelp')}</p>
                      {Array.from({ length: overtimeCount }, (_, i) => (
                        <fieldset
                          className="mt-3 grid gap-3 rounded-lg border p-3 sm:grid-cols-2"
                          key={i}
                        >
                          <legend className="text-sm">
                            {t('overtime')} {i + 1}
                          </legend>
                          <Field label={t('onDate')} name="overtimeDate" type="date" />
                          <Field label={t('minutes')} name="overtimeMinutes" type="number" />
                          <Select label={t('overtimeKind')} name="overtimeKind">
                            {options(['day', 'night', 'rest', 'holiday'])}
                          </Select>
                          <Select label={t('ramadan')} name="overtimeRamadan">
                            {options(['yes', 'no'])}
                          </Select>
                          <Field
                            label={t('scheduledMinutes')}
                            name="scheduledMinutes"
                            type="number"
                          />
                          <Field
                            label={t('threeWeekWorkedMinutes')}
                            name="threeWeekWorkedMinutes"
                            type="number"
                          />
                        </fieldset>
                      ))}
                      <button
                        type="button"
                        className="mt-3 text-sm underline"
                        disabled={overtimeCount >= 20}
                        onClick={() => setOvertimeCount((n) => n + 1)}
                      >
                        {t('addOvertime')}
                      </button>
                      {overtimeCount > 0 && (
                        <button
                          type="button"
                          className="ms-4 text-sm underline"
                          onClick={() => setOvertimeCount((n) => n - 1)}
                        >
                          {t('removeLast')}
                        </button>
                      )}
                      {Array.from({ length: deductionCount }, (_, i) => (
                        <fieldset
                          className="mt-3 grid gap-3 rounded-lg border p-3 sm:grid-cols-2"
                          key={i}
                        >
                          <legend className="text-sm">
                            {t('deductions')} {i + 1}
                          </legend>
                          <Select label={t('deductionKind')} name="deductionKind">
                            {options(['overpayment', 'disciplinary', 'court_debt', 'loan'])}
                          </Select>
                          <Field
                            label={t('amount')}
                            name="deductionAmount"
                            type="number"
                            step="0.01"
                          />
                          <Select label={t('writtenConsent')} name="writtenConsent">
                            {options(['yes', 'no'])}
                          </Select>
                          <Field label={t('reference')} name="deductionReference" />
                        </fieldset>
                      ))}
                      <button
                        type="button"
                        className="mt-3 text-sm underline"
                        disabled={deductionCount >= 20}
                        onClick={() => setDeductionCount((n) => n + 1)}
                      >
                        {t('addDeduction')}
                      </button>
                      {deductionCount > 0 && (
                        <button
                          type="button"
                          className="ms-4 text-sm underline"
                          onClick={() => setDeductionCount((n) => n - 1)}
                        >
                          {t('removeLast')}
                        </button>
                      )}
                    </details>
                    {reason}
                    {save('calculate')}
                  </form>
                )}
              </Card>
              <Card>
                <h2 className="text-lg font-semibold">{t('settlement')}</h2>
                <p className="mt-2 text-sm text-slate-600">{t('settlementHelp')}</p>
                {data.capabilities.prepare && (
                  <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
                    {hidden('settlement')}
                    {workerSelect}
                    <Field label={t('lastWorkingDay')} name="lastWorkingDay" type="date" />
                    {amount('basic')}
                    {amount('allowances')}
                    {['unpaidServiceDays', 'unusedAnnualDays', 'noticePayDays'].map((k) => (
                      <Field
                        label={t(k)}
                        name={k}
                        key={k}
                        type="number"
                        value={0}
                        step={k === 'unusedAnnualDays' ? '0.5' : '1'}
                      />
                    ))}
                    {amount('unpaidSalary')}
                    <Select label={t('terminationReason')} name="terminationReason">
                      {options(['resignation', 'contract_end', 'employer_termination'])}
                    </Select>
                    {reason}
                    {save('calculate')}
                  </form>
                )}
              </Card>
              {data.pilots.map((p) => (
                <Card key={p.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="font-semibold">
                      {t(p.kind === 'payroll' ? 'monthly' : 'settlement')} ·{' '}
                      <bdi>
                        {p.periodStart} — {p.periodEnd}
                      </bdi>
                    </h2>
                    <a
                      className="text-sm underline"
                      href={`/api/uae-preview?id=${p.id}&kind=pdf&language=${locale}`}
                    >
                      {t('pdf')}
                    </a>
                  </div>
                  {!p.contextCurrent && <Banner tone="amber">{t('stale')}</Banner>}
                  <p className="mt-2 break-all font-mono text-xs text-slate-500" dir="ltr">
                    {p.id}
                  </p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[600px] text-sm">
                      <thead>
                        <tr>
                          {[
                            'worker',
                            'gross',
                            'employeeContribution',
                            'employerContribution',
                            'net',
                          ].map((k) => (
                            <th className="p-2 text-start" key={k}>
                              {t(k)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {p.result.lines.map((l) => (
                          <tr className="border-t" key={l.employeeId}>
                            <td className="p-2" dir="auto">
                              {data.employees.find((e) => e.id === l.employeeId)?.name ??
                                l.employeeId}
                            </td>
                            {[l.gross, l.employeeContribution, l.employerContribution, l.net].map(
                              (a, i) => (
                                <td className="p-2" key={i}>
                                  <bdi>AED {a}</bdi>
                                </td>
                              ),
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm underline">{t('details')}</summary>
                    {p.result.lines.map((l) => (
                      <div className="mt-3 text-sm" key={l.employeeId}>
                        <p dir="auto">{data.employees.find((e) => e.id === l.employeeId)?.name}</p>
                        <ul>
                          {l.components.map((c) => (
                            <li key={c.code}>
                              <bdi>
                                {c.code} · AED {c.amount}
                              </bdi>
                            </li>
                          ))}
                        </ul>
                        <dl>
                          {Object.entries(l.facts).map(([k, v]) => (
                            <div key={k} className="flex flex-wrap gap-2">
                              <dt>
                                <bdi>{k}</bdi>
                              </dt>
                              <dd>
                                <bdi>{String(v)}</bdi>
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ))}
                    <p className="mt-2 break-all font-mono text-xs" dir="ltr">
                      {p.manifestHash}
                      <br />
                      {p.calculationHash}
                    </p>
                  </details>
                  <p className="mt-3 text-sm">
                    {p.comparisons.length
                      ? p.comparisons
                          .map((c) => `${c.evidenceKind}: ${c.outcome} (${c.differences.length})`)
                          .join(' · ')
                      : t('notCompared')}
                  </p>
                  {p.kind === 'payroll' && data.capabilities.prepare && (
                    <form action={action} className="mt-3">
                      {hidden('wps')}
                      <input name="runId" type="hidden" value={p.id} />
                      <button
                        className={button}
                        disabled={
                          pending ||
                          !p.contextCurrent ||
                          !p.comparisons.some((c) => c.outcome === 'matched')
                        }
                      >
                        {t('makeWps')}
                      </button>
                    </form>
                  )}
                </Card>
              ))}
              <Card>
                <h2 className="text-lg font-semibold">{t('comparison')}</h2>
                <p className="mt-2 text-sm text-slate-600">{t('comparisonHelp')}</p>
                {data.capabilities.compare && (
                  <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
                    {hidden('compare')}
                    <label className="text-sm">
                      {t('pilot')}
                      <select
                        className={control}
                        name="runId"
                        value={comparisonRun}
                        onChange={(e) => setComparisonRun(e.target.value)}
                        required
                      >
                        <option value="">—</option>
                        {data.pilots.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.kind} · {p.periodStart} · {p.id.slice(0, 8)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Select label={t('evidenceKind')} name="evidenceKind">
                      {options(['synthetic', 'independent'])}
                    </Select>
                    <Field label={t('preparedBy')} name="preparedBy" />
                    <Field label={t('reference')} name="reference" />
                    <Field label={t('documentHash')} name="documentHash" />

                    {data.pilots
                      .find((p) => p.id === comparisonRun)
                      ?.result.lines.map((line) => (
                        <fieldset
                          className="grid gap-3 rounded-lg border p-3 sm:col-span-2 sm:grid-cols-2"
                          key={line.employeeId}
                        >
                          <legend className="px-1 text-sm" dir="auto">
                            {data.employees.find((e) => e.id === line.employeeId)?.name ??
                              line.employeeId}
                          </legend>
                          <input name="expectedEmployeeId" type="hidden" value={line.employeeId} />
                          {[
                            'gross',
                            'employeeContribution',
                            'employerContribution',
                            'governmentContribution',
                            'deductions',
                            'net',
                          ].map((key) => (
                            <Field
                              key={key}
                              label={t(key)}
                              name={key + ':' + line.employeeId}
                              type="number"
                              step="0.01"
                            />
                          ))}
                        </fieldset>
                      ))}
                    {reason}
                    {save('compare')}
                  </form>
                )}
              </Card>
            </>
          )}
          {tab === 'qualification' && (
            <>
              <Card>
                <h2 className="text-lg font-semibold">{t('releaseGates')}</h2>
                <p className="mt-2 text-sm">{t('qualificationHelp')}</p>
                <ul className="ms-5 mt-3 list-disc space-y-2 text-sm">
                  {data.qualification.open.map((k) => (
                    <li key={k}>{k}</li>
                  ))}
                </ul>
              </Card>
              <Card>
                <h2 className="text-lg font-semibold">{t('evidence')}</h2>
                {data.evidence.map((e) => (
                  <p className="mt-2 text-sm" key={e.id}>
                    <bdi>
                      {e.kind} · {e.reviewedOn}
                    </bdi>{' '}
                    · {e.reviewer} · {e.synthetic ? t('options.synthetic') : t('attestation')}
                  </p>
                ))}
                {data.capabilities.evidence && (
                  <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
                    {hidden('evidence')}
                    <input name="manifestHash" type="hidden" value={data.manifest.manifestHash} />
                    <Select label={t('evidenceKind')} name="kind">
                      {options([
                        'law_and_cohorts',
                        'privacy',
                        'hosting_transfer',
                        'documents_en',
                        'documents_ar',
                        'bank_format',
                      ])}
                    </Select>
                    <Field label={t('reviewer')} name="reviewer" />
                    <Field label={t('reviewedOn')} name="reviewedOn" type="date" />
                    <Field label={t('reference')} name="reference" />
                    <Field label={t('documentHash')} name="documentHash" />
                    <fieldset className="sm:col-span-2">
                      <legend className="text-sm">{t('ruleKeys')}</legend>
                      <div className="mt-2 flex flex-wrap gap-3">
                        {data.manifest.rules.map((rule) => (
                          <label className="flex items-center gap-2 text-sm" key={rule.key}>
                            <input type="checkbox" name="ruleKeys" value={rule.key} />
                            <bdi>{rule.key}</bdi>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <label className="text-sm sm:col-span-2">
                      {t('coveredScenarios')}
                      <textarea className={control} name="coveredScenarios" />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="synthetic" defaultChecked />
                      {t('synthetic')}
                    </label>
                    {reason}
                    {save()}
                  </form>
                )}
              </Card>
              <Card>
                <h2 className="text-lg font-semibold">{t('wps')}</h2>
                <p className="mt-2 text-sm">{t('wpsHelp')}</p>
                {data.wps.map((b) => (
                  <div className="mt-4 space-y-2 rounded-lg border p-3 text-sm" key={b.id}>
                    <p>
                      <bdi>
                        {b.id} · {b.state} · AED {b.total}
                      </bdi>
                    </p>
                    <p className="break-all font-mono text-xs" dir="ltr">
                      {b.fileHash}
                    </p>
                    <a className="underline" href={`/api/uae-preview?kind=wps&id=${b.id}`}>
                      {t('downloadSandbox')}
                    </a>
                    {data.capabilities.prepare && (
                      <form action={action} className="grid gap-3 pt-3 sm:grid-cols-2">
                        {hidden('event')}
                        <input name="batchId" type="hidden" value={b.id} />
                        <input name="fileHash" type="hidden" value={b.fileHash} />
                        <Field label={t('eventId')} name="eventId" />
                        <Select label={t('eventKind')} name="kind">
                          {options(['uploaded', 'accepted', 'rejected', 'reconciled'])}
                        </Select>
                        <Field label={t('reference')} name="reference" />
                        <Field
                          label={t('acceptedCount')}
                          name="acceptedCount"
                          type="number"
                          value={0}
                        />
                        <Field
                          label={t('rejectedCount')}
                          name="rejectedCount"
                          type="number"
                          value={0}
                        />
                        {amount('returnedTotal')}
                        {reason}
                        {save('simulate')}
                      </form>
                    )}
                  </div>
                ))}
              </Card>
            </>
          )}
          {tab === 'sources' && (
            <Card>
              <h2 className="text-lg font-semibold">{t('sources')}</h2>
              <p className="mt-2 text-sm text-slate-600">{t('sourcesHelp')}</p>
              <p className="mt-2 text-sm">
                <bdi>
                  {data.manifest.implementationVersion} · {data.manifest.previewFrom} —{' '}
                  {data.manifest.previewThrough}
                </bdi>
              </p>
              <p className="mt-2 break-all font-mono text-xs" dir="ltr">
                {data.manifest.manifestHash}
              </p>
              <div className="mt-4 space-y-4">
                {data.manifest.rules.map((r) => (
                  <section className="rounded-lg border p-3" key={r.key}>
                    <h3 className="font-medium">
                      <bdi>{r.key}</bdi> · {t('reviewRequired')}
                    </h3>
                    <p className="mt-1 text-sm">{r.reference}</p>
                    {r.source.startsWith('https://') ? (
                      <a
                        href={r.source}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block text-sm underline"
                      >
                        {t('officialSource')}
                      </a>
                    ) : (
                      <p className="mt-2 text-sm">{t('conventions')}</p>
                    )}
                    <p className="mt-2 break-all font-mono text-xs" dir="ltr">
                      {r.definitionHash}
                    </p>
                  </section>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
