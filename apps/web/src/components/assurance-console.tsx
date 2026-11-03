'use client';
import Link from 'next/link';
import { useActionState, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { AssuranceOverview } from '@gp/shared';
import { assuranceChange } from '@/app/actions/assurance';
import { Banner, Card } from '@/components/ui';
const css = 'mt-1 w-full min-w-0 rounded-lg border border-slate-300 bg-white p-2';
function Field({
  name,
  label,
  type = 'text',
  required = true,
  value,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  value?: string | number;
}) {
  return (
    <label className="min-w-0 text-sm">
      {label}
      <input
        className={css}
        name={name}
        type={type}
        required={required}
        defaultValue={value}
        dir={['number', 'date', 'datetime-local'].includes(type) ? 'ltr' : undefined}
      />
    </label>
  );
}
function Select({
  name,
  label,
  children,
  required = true,
}: {
  name: string;
  label: string;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="min-w-0 text-sm">
      {label}
      <select name={name} className={css} required={required}>
        <option value="">—</option>
        {children}
      </select>
    </label>
  );
}
export function AssuranceConsole({ data }: { data: AssuranceOverview }) {
  const t = useTranslations('assurance'),
    [state, action, pending] = useActionState(assuranceChange, undefined),
    [tab, setTab] = useState('release');
  const p = data.selected;
  const area = (name: string, required = true) => (
    <label className="text-sm sm:col-span-2">
      {t(name)}
      <textarea className={css} name={name} minLength={10} maxLength={2000} required={required} />
    </label>
  );
  const box = (name: string) => (
    <label className="flex items-start gap-2 text-sm">
      <input name={name} type="checkbox" />
      {t(name)}
    </label>
  );
  const options = (keys: string[]) =>
    keys.map((k) => (
      <option key={k} value={k}>
        {t('options.' + k)}
      </option>
    ));
  const owners = (name = 'ownerId', required = true) => (
    <Select label={t(name)} name={name} required={required}>
      {data.people.map((x) => (
        <option value={x.id} key={x.id}>
          {x.name} · {x.role}
        </option>
      ))}
    </Select>
  );
  const controls = (version = false, waivable = false) => (
    <Select label={t('controlId')} name={version ? 'controlVersion' : 'controlId'}>
      {(p?.evaluation.controls ?? [])
        .filter((c) => !waivable || data.catalog.find((x) => x.id === c.id)?.waivable)
        .map((c) => {
          const cfg = p?.events
            .filter((e) => e.input.kind === 'control' && e.input.controlId === c.id)
            .at(-1);
          return (
            <option
              value={version ? c.id + ':' + (cfg?.id ?? '') : c.id}
              key={c.id}
              disabled={version && !cfg}
            >
              {t('controlTitles.' + c.id)}
            </option>
          );
        })}
    </Select>
  );
  const evidence = (required = true) => (
    <Select label={t('evidenceId')} name="evidenceId" required={required}>
      {p?.events
        .filter((e) => e.input.kind === 'evidence')
        .map((e) => (
          <option value={e.id} key={e.id}>
            {e.sequence} ·{' '}
            {e.input.kind === 'evidence' ? e.input.controlId + ' · ' + e.input.outcome : ''}
          </option>
        ))}
    </Select>
  );
  const findings = () => (
    <Select label={t('findingId')} name="findingId">
      {p?.evaluation.findings.map((f) => (
        <option key={f.id} value={f.id}>
          {f.title} · {f.state}
        </option>
      ))}
    </Select>
  );
  const hidden = (op: string) => (
    <>
      <input type="hidden" name="op" value={op} />
      <input type="hidden" name="programId" value={p?.id ?? ''} />
      <input type="hidden" name="expectedVersion" value={p?.version ?? 0} />
    </>
  );
  const save = (label = 'record') => (
    <button
      className="justify-self-start rounded-lg bg-emerald-700 px-4 py-2 text-white disabled:opacity-50 sm:col-span-2"
      disabled={pending}
    >
      {pending ? t('saving') : t(label)}
    </button>
  );
  const form = (op: string, children: ReactNode) => (
    <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
      {hidden(op)}
      {children}
      {area('reason')}
      {save()}
    </form>
  );
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-emerald-700">{t('eyebrow')}</p>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-2 text-slate-600">{t('intro')}</p>
      </div>
      <Banner tone="amber">{t('notice')}</Banner>
      {state?.error && <Banner tone="red">{state.error}</Banner>}
      {state?.ok && <Banner tone="green">{t('saved')}</Banner>}
      {state?.createdId && (
        <Link href={'/platform/assurance?program=' + state.createdId} className="underline">
          {t('openCreated')}
        </Link>
      )}
      <Card>
        <h2 className="font-semibold">{t('mfa')}</h2>
        <p className="mt-2 text-sm text-slate-600">{t('mfaHelp')}</p>
        <Link href="/platform/account" className="text-sm underline">
          {t('account')}
        </Link>
        <form action={action} className="mt-3 flex flex-wrap items-end gap-3">
          {hidden('mfa')}
          <Field name="code" label={t('code')} />
          {save('confirm')}
        </form>
      </Card>
      {data.recentMfa && (
        <>
          <Card>
            <form method="get" className="flex flex-wrap items-end gap-3">
              <label className="min-w-0 flex-1 text-sm">
                {t('program')}
                <select name="program" className={css} defaultValue={p?.id ?? ''}>
                  <option value="">—</option>
                  {data.programs.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name} · {x.releaseVersion} · {x.mode}
                    </option>
                  ))}
                </select>
              </label>
              <button className="rounded-lg border px-4 py-2">{t('open')}</button>
            </form>
          </Card>
          {data.runtime && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Card>
                <p className="text-sm text-slate-500">{t('backup')}</p>
                <p className="mt-2 font-semibold">
                  {t(data.runtime.backup.staleBackup ? 'stale' : 'current')}
                </p>
                <p className="mt-1 break-all text-xs">
                  <bdi>{data.runtime.backup.lastBackupAt ?? '—'}</bdi>
                </p>
              </Card>
              <Card>
                <p className="text-sm text-slate-500">{t('restore')}</p>
                <p className="mt-2 font-semibold">
                  {t(data.runtime.backup.staleVerify ? 'stale' : 'current')}
                </p>
                <p className="mt-1 break-all text-xs">
                  <bdi>{data.runtime.backup.lastVerifyAt ?? '—'}</bdi>
                </p>
              </Card>
              <Card>
                <p className="text-sm text-slate-500">{t('worker')}</p>
                <p className="mt-2 font-semibold">
                  <bdi>
                    {data.runtime.worker.healthy} / {data.runtime.worker.registered}
                  </bdi>
                </p>
                <p className="mt-1 text-xs">{t('runtimeHelp')}</p>
              </Card>
            </div>
          )}
          <details className="rounded-xl border bg-white p-5">
            <summary className="cursor-pointer font-semibold">{t('newProgram')}</summary>
            <p className="mt-2 text-sm text-slate-600">{t('programHelp')}</p>
            {form(
              'program',
              <>
                <Field name="name" label={t('name')} />
                <Select name="mode" label={t('mode')}>
                  {options(['readiness', 'synthetic'])}
                </Select>
                <Field name="releaseVersion" label={t('releaseVersion')} />
                <Field name="sourceDigest" label={t('sourceDigest')} />
                {box('sourceDirty')}
                <Select name="deployment" label={t('deployment')}>
                  {options(['managed', 'dedicated', 'self_hosted'])}
                </Select>
                <fieldset>
                  <legend className="text-sm">{t('countries')}</legend>
                  <div className="mt-2 flex gap-4">
                    {['BD', 'AE', 'SA'].map((c) => (
                      <label key={c} className="text-sm">
                        <input name="countries" value={c} type="checkbox" /> <bdi>{c}</bdi>
                      </label>
                    ))}
                  </div>
                </fieldset>
                {box('arabic')}
                {box('merchantCheckout')}
                {area('systemBoundary')}
                {area('customerResponsibilities')}
                {area('exclusions')}
                {area('subserviceOrganizations')}
                <Field name="criteriaVersion" label={t('criteriaVersion')} />
                <Field name="descriptionCriteriaVersion" label={t('descriptionCriteriaVersion')} />
                {box('criteriaConfirmed')}
                <Select name="reportClaim" label={t('reportClaim')}>
                  {options(['none', 'type1', 'type2'])}
                </Select>
                <Field name="periodFrom" label={t('periodFrom')} type="date" />
                <Field name="periodThrough" label={t('periodThrough')} type="date" />
                <Field
                  name="targetIncidentSeconds"
                  label={t('targetIncidentSeconds')}
                  type="number"
                />
                {box('targetsConfirmed')}
                <Field name="targetRtoSeconds" label={t('targetRtoSeconds')} type="number" />
                <Field name="targetRpoSeconds" label={t('targetRpoSeconds')} type="number" />
              </>,
            )}
          </details>
          {p && (
            <>
              <div className="flex flex-wrap gap-2" aria-label={t('sections')}>
                {['release', 'controls', 'evidence', 'findings', 'exceptions', 'reports'].map(
                  (k) => (
                    <button
                      type="button"
                      key={k}
                      aria-pressed={tab === k}
                      onClick={() => setTab(k)}
                      className={
                        'rounded-lg border px-4 py-2 text-sm ' +
                        (tab === k ? 'border-emerald-700 bg-emerald-50' : 'bg-white')
                      }
                    >
                      {t(k)}
                    </button>
                  ),
                )}
              </div>
              {tab === 'release' && (
                <>
                  <Card>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-semibold">{p.definition.name}</h2>
                        <p className="mt-2 font-medium">{t(p.evaluation.status)}</p>
                      </div>
                      <a
                        className="rounded-lg border px-4 py-2 text-sm"
                        href={'/api/assurance-export?id=' + p.id}
                      >
                        {t('export')}
                      </a>
                    </div>
                    <p className="mt-3 text-sm">{t('releaseHelp')}</p>
                    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                      {[
                        ['releaseVersion', p.definition.releaseVersion],
                        ['mode', p.definition.mode],
                        ['periodFrom', p.definition.periodFrom],
                        ['periodThrough', p.definition.periodThrough],
                        ['deployment', p.definition.deployment],
                        ['countries', p.definition.countries.join(', ')],
                      ].map(([k, v]) => (
                        <div key={k}>
                          <dt className="text-slate-500">{t(k!)}</dt>
                          <dd>
                            <bdi>{v}</bdi>
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <p className="mt-4 text-sm">{p.definition.systemBoundary}</p>
                    <dl className="mt-4 space-y-3 text-sm">
                      {(
                        [
                          'customerResponsibilities',
                          'exclusions',
                          'subserviceOrganizations',
                          'criteriaVersion',
                          'descriptionCriteriaVersion',
                        ] as const
                      ).map((k) => (
                        <div key={k}>
                          <dt className="text-slate-500">{t(k)}</dt>
                          <dd dir="auto">{p.definition[k]}</dd>
                        </div>
                      ))}
                    </dl>
                    {form(
                      'release_review',
                      <>
                        <input type="hidden" name="reviewedHeadHash" value={p.headHash} />
                        <Select name="decision" label={t('decision')}>
                          {options(['recommend', 'reject'])}
                        </Select>
                      </>,
                    )}
                    <p className="mt-2 break-all text-xs">
                      <bdi>{p.headHash}</bdi>
                    </p>
                  </Card>
                  <Card>
                    <h2 className="font-semibold">{t('blockers')}</h2>
                    <ul className="mt-3 list-disc space-y-2 ps-5 text-sm">
                      {p.evaluation.blockers.map((b, i) => (
                        <li key={i} dir="auto">
                          {b}
                        </li>
                      ))}
                    </ul>
                  </Card>
                </>
              )}
              {tab === 'controls' && (
                <>
                  <Card>
                    <h2 className="font-semibold">{t('controls')}</h2>
                    <p className="mt-2 text-sm">{t('controlHelp')}</p>
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[700px] text-sm">
                        <thead>
                          <tr>
                            {['controlId', 'ownerId', 'status', 'gap'].map((k) => (
                              <th key={k} className="p-2 text-start">
                                {t(k)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {p.evaluation.controls.map((c) => (
                            <tr key={c.id} className="border-t">
                              <td className="p-2">{t('controlTitles.' + c.id)}</td>
                              <td className="p-2">
                                {data.people.find((x) => x.id === c.ownerId)?.name ??
                                  t('unassigned')}
                              </td>
                              <td className="p-2">{t(c.state)}</td>
                              <td className="p-2" dir="auto">
                                {c.gaps.join('; ')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                  <Card>
                    <h2 className="font-semibold">{t('configureControl')}</h2>
                    {form(
                      'control',
                      <>
                        {controls()}
                        {owners()}
                        <Field name="cadenceDays" label={t('cadenceDays')} type="number" />
                        {area('procedure')}
                        <Select name="classification" label={t('classification')}>
                          {options(['internal', 'restricted'])}
                        </Select>
                        <Field name="retentionDays" label={t('retentionDays')} type="number" />
                        {box('retentionApproved')}
                        <Field name="nextDueOn" label={t('nextDueOn')} type="date" />
                      </>,
                    )}
                  </Card>
                </>
              )}
              {tab === 'evidence' && (
                <>
                  <Card>
                    <h2 className="font-semibold">{t('recordEvidence')}</h2>
                    <p className="mt-2 text-sm">{t('evidenceHelp')}</p>
                    {form(
                      'evidence',
                      <>
                        {controls(true)}
                        <Select name="evidenceKind" label={t('evidenceKind')}>
                          {options(['operating', 'external', 'synthetic'])}
                        </Select>
                        <Field name="sourceReference" label={t('sourceReference')} />
                        <Field name="documentHash" label={t('documentHash')} />
                        <Field name="executedAt" label={t('executedAt')} type="datetime-local" />
                        <Field name="coverFrom" label={t('coverFrom')} type="date" />
                        <Field name="coverThrough" label={t('coverThrough')} type="date" />
                        <Select name="outcome" label={t('outcome')}>
                          {options(['passed', 'failed'])}
                        </Select>
                        {area('notes')}
                        <details className="sm:col-span-2">
                          <summary className="cursor-pointer text-sm underline">
                            {t('drill')}
                          </summary>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            {box('includeDrill')}
                            <Select name="environment" label={t('environment')} required={false}>
                              {options(['native_same_host', 'production_like', 'production'])}
                            </Select>
                            <Field
                              name="sourceHostReference"
                              label={t('sourceHostReference')}
                              required={false}
                            />
                            <Field
                              name="targetHostReference"
                              label={t('targetHostReference')}
                              required={false}
                            />
                            <Field
                              name="responseSeconds"
                              label={t('responseSeconds')}
                              type="number"
                              required={false}
                            />
                            <Field
                              name="serviceRtoSeconds"
                              label={t('serviceRtoSeconds')}
                              type="number"
                              required={false}
                            />
                            <Field
                              name="rpoSeconds"
                              label={t('rpoSeconds')}
                              type="number"
                              required={false}
                            />
                            <Field name="scenario" label={t('scenario')} required={false} />
                          </div>
                        </details>
                      </>,
                    )}
                  </Card>
                  <Card>
                    <h2 className="font-semibold">{t('reviewEvidence')}</h2>
                    <div className="mt-3 space-y-3">
                      {p.events
                        .filter((e) => e.input.kind === 'evidence')
                        .toReversed()
                        .map((e) => {
                          const v = e.input;
                          if (v.kind !== 'evidence') return null;
                          const review = p.events
                            .filter(
                              (x) =>
                                x.input.kind === 'evidence_review' && x.input.evidenceId === e.id,
                            )
                            .at(-1);
                          return (
                            <div key={e.id} className="rounded-lg border p-3 text-sm">
                              <p className="font-semibold">
                                <bdi>
                                  {e.sequence} · {v.controlId} · {v.evidenceKind} · {v.outcome}
                                </bdi>
                              </p>
                              <p dir="auto">{v.sourceReference}</p>
                              <p className="break-all text-xs">
                                <bdi>{v.documentHash}</bdi>
                              </p>
                              <p>
                                <bdi>
                                  {v.executedAt} · {v.coverFrom} — {v.coverThrough}
                                </bdi>
                              </p>
                              <p dir="auto">{v.notes}</p>
                              {v.drill && (
                                <p>
                                  <bdi>
                                    {v.drill.environment} · RTO {v.drill.serviceRtoSeconds}s · RPO{' '}
                                    {v.drill.rpoSeconds}s · {v.drill.sourceHostReference} →{' '}
                                    {v.drill.targetHostReference}
                                  </bdi>
                                </p>
                              )}
                              <p>
                                {data.people.find((x) => x.id === e.actorId)?.name} ·{' '}
                                {review?.input.kind === 'evidence_review'
                                  ? review.input.decision
                                  : '—'}{' '}
                                · {data.people.find((x) => x.id === review?.actorId)?.name ?? '—'}
                              </p>
                            </div>
                          );
                        })}
                    </div>
                    {form(
                      'evidence_review',
                      <>
                        {evidence()}
                        <Select name="decision" label={t('decision')}>
                          {options(['accept', 'reject'])}
                        </Select>
                      </>,
                    )}
                  </Card>
                </>
              )}
              {tab === 'findings' && (
                <>
                  <Card>
                    <h2 className="font-semibold">{t('findings')}</h2>
                    <ul className="mt-3 space-y-3 text-sm">
                      {p.evaluation.findings.map((f) => (
                        <li key={f.id} className="rounded-lg border p-3">
                          <strong>{f.title}</strong>
                          <p>
                            <bdi>
                              {f.severity} · {f.state} · {f.dueOn}
                            </bdi>
                          </p>
                          <p>
                            {data.people.find((x) => x.id === f.ownerId)?.name ?? t('unassigned')}
                          </p>
                        </li>
                      ))}
                    </ul>
                    {form(
                      'finding',
                      <>
                        {controls()}
                        <Field name="title" label={t('findingTitle')} />
                        <Select name="severity" label={t('severity')}>
                          {options(['critical', 'high', 'moderate', 'low'])}
                        </Select>
                        <Field name="sourceReference" label={t('sourceReference')} />
                        {owners('ownerId', false)}
                        <Field name="dueOn" label={t('dueOn')} type="date" />
                      </>,
                    )}
                  </Card>
                  <Card>
                    <h2 className="font-semibold">{t('assignFinding')}</h2>
                    {form(
                      'finding_assignment',
                      <>
                        {findings()}
                        {owners()}
                        <Field name="dueOn" label={t('dueOn')} type="date" />
                      </>,
                    )}
                  </Card>
                  <Card>
                    <h2 className="font-semibold">{t('decideFinding')}</h2>
                    <p className="mt-2 text-sm">{t('riskHelp')}</p>
                    {form(
                      'finding_decision',
                      <>
                        {findings()}
                        <Select name="decision" label={t('decision')}>
                          {options(['remediated', 'risk_accepted', 'reopen'])}
                        </Select>
                        {evidence(false)}
                        <Field
                          name="expiresOn"
                          label={t('expiresOn')}
                          type="date"
                          required={false}
                        />
                        {area('compensatingControls', false)}
                      </>,
                    )}
                  </Card>
                </>
              )}
              {tab === 'exceptions' && (
                <>
                  <Card>
                    <h2 className="font-semibold">{t('exceptions')}</h2>
                    <p className="mt-2 text-sm">{t('exceptionHelp')}</p>
                    <ul className="mt-3 space-y-2 text-sm">
                      {p.events
                        .filter((e) => e.input.kind === 'exception')
                        .map((e) => {
                          const x = e.input;
                          if (x.kind !== 'exception') return null;
                          const review = p.events
                            .filter(
                              (v) =>
                                v.input.kind === 'exception_review' && v.input.exceptionId === e.id,
                            )
                            .at(-1);
                          return (
                            <li key={e.id} className="rounded-lg border p-3">
                              <p>
                                <bdi>
                                  {e.sequence} · {x.controlId} · {x.expiresOn}
                                </bdi>
                              </p>
                              <p>{data.people.find((v) => v.id === x.ownerId)?.name}</p>
                              <p dir="auto">{x.compensatingControls}</p>
                              <p>
                                <bdi>
                                  {review?.input.kind === 'exception_review'
                                    ? review.input.decision
                                    : '—'}
                                </bdi>
                              </p>
                            </li>
                          );
                        })}
                    </ul>
                    {form(
                      'exception',
                      <>
                        {controls(true, true)}
                        {owners()}
                        <Field name="expiresOn" label={t('expiresOn')} type="date" />
                        {evidence()}
                        {area('compensatingControls')}
                      </>,
                    )}
                  </Card>
                  <Card>
                    <h2 className="font-semibold">{t('reviewException')}</h2>
                    {form(
                      'exception_review',
                      <>
                        <Select name="exceptionId" label={t('exceptionId')}>
                          {p.events
                            .filter((e) => e.input.kind === 'exception')
                            .map((e) => (
                              <option key={e.id} value={e.id}>
                                {e.sequence} ·{' '}
                                {e.input.kind === 'exception'
                                  ? e.input.controlId + ' · ' + e.input.expiresOn
                                  : ''}
                              </option>
                            ))}
                        </Select>
                        <Select name="decision" label={t('decision')}>
                          {options(['accept', 'reject'])}
                        </Select>
                      </>,
                    )}
                  </Card>
                </>
              )}
              {tab === 'reports' && (
                <Card>
                  <h2 className="font-semibold">{t('reports')}</h2>
                  <p className="mt-2 text-sm">{t('reportHelp')}</p>
                  {p.evaluation.report && (
                    <p className="mt-3 text-sm">
                      <bdi>
                        {p.evaluation.report.firm} · {p.evaluation.report.type} ·{' '}
                        {p.evaluation.report.opinion} · {p.evaluation.report.distribution}
                      </bdi>
                    </p>
                  )}
                  {form(
                    'report',
                    <>
                      <Field name="firm" label={t('firm')} />
                      <Select name="type" label={t('reportType')}>
                        {options(['type1', 'type2'])}
                      </Select>
                      <Field name="periodFrom" label={t('periodFrom')} type="date" />
                      <Field name="periodThrough" label={t('periodThrough')} type="date" />
                      <Select name="opinion" label={t('opinion')}>
                        {options(['unmodified', 'qualified', 'adverse', 'disclaimer'])}
                      </Select>
                      <Select name="distribution" label={t('distribution')}>
                        {options(['restricted', 'public_summary_only'])}
                      </Select>
                      <Field name="sourceReference" label={t('sourceReference')} />
                      <Field name="documentHash" label={t('documentHash')} />
                      {evidence()}
                    </>,
                  )}
                </Card>
              )}
              <Card>
                <h2 className="font-semibold">{t('history')}</h2>
                <p className="mt-2 text-sm">{t('historyHelp')}</p>
                <ol className="mt-3 space-y-2 text-sm">
                  {p.events
                    .slice(-30)
                    .toReversed()
                    .map((e) => (
                      <li key={e.id}>
                        <bdi>
                          {e.sequence} · {e.input.kind} · {e.createdAt}
                        </bdi>{' '}
                        · {data.people.find((x) => x.id === e.actorId)?.name ?? '—'}
                      </li>
                    ))}
                </ol>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
