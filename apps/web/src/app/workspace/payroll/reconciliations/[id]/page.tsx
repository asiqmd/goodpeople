import {
  can,
  RECONCILE_TOTALS,
  type PayComponentView,
  type PayrollRunView,
  type ReconciliationView,
} from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ReconciliationMappingForm } from '@/components/payroll/report-forms';
import { PayrollTabs } from '@/components/payroll/payroll-views';
import { Badge, Card } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

const TONE = { draft: 'slate', matched: 'green', differences: 'amber' } as const;
const STATUS_TONE = { differs: 'amber', only_ours: 'blue', only_theirs: 'violet' } as const;

export default async function ReconciliationPage({
  params,
}: PageProps<'/workspace/payroll/reconciliations/[id]'>) {
  const accessPrincipal = await currentTenantUser();
  if (!can(accessPrincipal, 'payroll.view')) redirect('/workspace');
  const canManage = can(accessPrincipal, 'payroll.manage');
  const { id } = await params;
  const t = await getTranslations('payroll');
  const tr = await getTranslations('payroll.reconcile');
  const format = await getFormatter();
  const bn = (await getLocale()) === 'bn';
  const view = await load<ReconciliationView>('tenant', `/tenant/payroll/reconciliations/${id}`);
  const [run, components] = await Promise.all([
    load<PayrollRunView>('tenant', `/tenant/payroll/runs/${view.runId}`),
    load<PayComponentView[]>('tenant', '/tenant/payroll/components'),
  ]);
  const name = (code: string) => {
    const c = components.find((x) => x.code === code);
    return c
      ? bn && c.nameBn
        ? c.nameBn
        : c.name
      : tr.has(`totals.${code}`)
        ? tr(`totals.${code}`)
        : code;
  };
  const targets = [
    ...RECONCILE_TOTALS.map((key) => ({ key, label: tr(`totals.${key}`) })),
    ...components
      .filter((c) => c.isActive && c.kind !== 'info')
      .map((c) => ({ key: c.code, label: bn && c.nameBn ? c.nameBn : c.name })),
  ];
  const num = (v: string) => format.number(Number(v), { maximumFractionDigits: 2 });
  const compared = view.summary !== null;

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <PayrollTabs current="parallel" />
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/workspace/payroll/runs/${run.id}`}
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          ← {run.payGroup.name} ·{' '}
          {format.dateTime(new Date(`${run.periodStart}T00:00:00Z`), {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          })}
        </Link>
        <Badge tone={TONE[view.status]}>{tr(`statuses.${view.status}`)}</Badge>
      </div>
      <p className="text-sm text-slate-600">
        {tr('fileLine', { file: view.fileName, rows: view.rows })}
      </p>

      {view.summary && (
        <Card
          title={tr('resultTitle')}
          action={
            <a
              href={`/workspace/files/reconciliation/${view.id}`}
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              {tr('download')}
            </a>
          }
        >
          <div className="grid gap-4 sm:grid-cols-5">
            {(['people', 'matched', 'differing', 'onlyOurs', 'onlyTheirs'] as const).map((k) => (
              <div key={k}>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  {tr(`summary.${k}`)}
                </p>
                <p className="text-lg font-semibold tabular-nums">
                  {format.number(view.summary![k])}
                </p>
              </div>
            ))}
          </div>
          <div className="-mx-5 mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-start text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2 font-medium">{tr('column')}</th>
                  <th className="px-5 py-2 text-end font-medium">{tr('summary.matched')}</th>
                  <th className="px-5 py-2 text-end font-medium">{tr('summary.differing')}</th>
                  <th className="px-5 py-2 text-end font-medium">{tr('ours')}</th>
                  <th className="px-5 py-2 text-end font-medium">{tr('theirs')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {view.columns.map((c) => (
                  <tr key={c.key}>
                    <td className="px-5 py-2">{name(c.key)}</td>
                    <td className="px-5 py-2 text-end tabular-nums">{format.number(c.matched)}</td>
                    <td
                      className={`px-5 py-2 text-end tabular-nums ${c.differing ? 'font-semibold text-amber-700' : ''}`}
                    >
                      {format.number(c.differing)}
                    </td>
                    <td className="px-5 py-2 text-end tabular-nums">{num(c.ours)}</td>
                    <td className="px-5 py-2 text-end tabular-nums">{num(c.theirs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {view.differences.length > 0 && (
        <Card title={tr('differencesTitle', { count: view.differences.length })}>
          <ul className="-mx-5 divide-y divide-slate-100 text-sm">
            {view.differences.map((d) => (
              <li key={`${d.status}-${d.employeeCode}`} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{d.name ?? '—'}</span>
                  <span className="font-mono text-xs text-slate-400">{d.employeeCode}</span>
                  <Badge tone={STATUS_TONE[d.status]}>{tr(`people.${d.status}`)}</Badge>
                </div>
                {d.status === 'differs' && (
                  <table className="mt-2 w-full max-w-xl">
                    <tbody>
                      {d.lines.map((l) => (
                        <tr key={l.key}>
                          <td className="py-0.5 text-slate-600">{name(l.key)}</td>
                          <td className="py-0.5 text-end tabular-nums">
                            {tr('oursValue', { value: num(l.ours ?? '0') })}
                          </td>
                          <td className="py-0.5 text-end tabular-nums">
                            {tr('theirsValue', { value: num(l.theirs ?? '0') })}
                          </td>
                          <td className="py-0.5 text-end font-medium tabular-nums">
                            {num(l.difference)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {canManage && !compared && (
        <Card title={tr('mappingTitle')}>
          <ReconciliationMappingForm
            id={view.id}
            headers={view.headers}
            mapping={view.mapping}
            targets={targets}
            compared={false}
          />
        </Card>
      )}
      {canManage && compared && (
        <details className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <summary className="cursor-pointer text-sm font-medium text-brand-700">
            {tr('mappingAgain')}
          </summary>
          <div className="mt-4">
            <ReconciliationMappingForm
              id={view.id}
              headers={view.headers}
              mapping={view.mapping}
              targets={targets}
              compared
            />
          </div>
        </details>
      )}
    </>
  );
}
