import {
  can,
  RUN_ITEM_FILTERS,
  todayIn,
  type DisbursementView,
  type PayComponentView,
  type PayLineView,
  type PayrollRunItemPage,
  type PayrollRunItemView,
  type PaymentCheckView,
  type PayrollRunView,
  type ReconciliationListItem,
} from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { day } from '@/components/leave/leave-views';
import {
  RunStatusBadge,
  RunTotalsTable,
  runTitle,
  SettlementBox,
  taka,
  TaxWorking,
} from '@/components/payroll/payroll-views';
import { MarkPaidForm, TaxDepositForm } from '@/components/payroll/benefit-forms';
import { PaymentCheckForm, ReconcileUploadForm } from '@/components/payroll/report-forms';
import { RemoveInputButton, RunActions, RunInputForm } from '@/components/payroll/run-forms';
import { Badge, Banner, buttonClass, Card, inputClass } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

const SIZE = 50;

const DUE_HINT: Partial<Record<string, string>> = {
  bonus: 'paymentDueBonus',
  settlement: 'paymentDueSettlement',
  wppf: 'paymentDueWppf',
};

export default async function PayrollRunPage({
  params,
  searchParams,
}: PageProps<'/workspace/payroll/runs/[id]'>) {
  const role = (await currentTenantUser())?.role;
  if (!can(role, 'payroll.view')) redirect('/workspace');
  const canManage = can(role, 'payroll.manage');
  const { id } = await params;
  const query = await searchParams;
  const show = RUN_ITEM_FILTERS.includes(query.show as never)
    ? (query.show as (typeof RUN_ITEM_FILTERS)[number])
    : 'all';
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  const page = Math.max(1, Number(query.page) || 1);
  const t = await getTranslations('payroll.runs');
  const format = await getFormatter();
  const locale = await getLocale();

  const run = await load<PayrollRunView>('tenant', `/tenant/payroll/runs/${id}`);
  const list = new URLSearchParams({ show, page: String(page), size: String(SIZE) });
  if (search) list.set('search', search);
  const [items, components] = await Promise.all([
    load<PayrollRunItemPage>('tenant', `/tenant/payroll/runs/${id}/items?${list}`),
    load<PayComponentView[]>('tenant', '/tenant/payroll/components'),
  ]);
  const entered = components.filter((c) => c.calculation === 'run' && c.isActive);
  const editable = canManage && (run.status === 'draft' || run.status === 'computed');
  const acting = canManage && run.status !== 'cancelled';
  const href = (next: Record<string, string | number>) => {
    const p = new URLSearchParams({ show, ...(search ? { search } : {}), page: '1' });
    for (const [k, v] of Object.entries(next)) p.set(k, String(v));
    return `/workspace/payroll/runs/${id}?${p}`;
  };
  const pages = Math.max(1, Math.ceil(items.total / SIZE));

  return (
    <>
      <div className="space-y-1">
        <Link href="/workspace/payroll/runs" className="text-sm text-slate-500 hover:underline">
          ← {t('title')}
        </Link>
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold">
          {run.payGroup.name} · {runTitle(format, locale, run)}
          <RunStatusBadge status={run.status} />
          {run.kind !== 'regular' && <Badge tone="violet">{t(`kinds.${run.kind}`)}</Badge>}
          {run.publishedAt && <Badge tone="green">{t('published')}</Badge>}
        </h1>
      </div>

      {run.kind === 'adjustment' && run.parentRunId && (
        <Banner tone="violet">
          {t('adjustmentHint')}{' '}
          <Link href={`/workspace/payroll/runs/${run.parentRunId}`} className="underline">
            {t('parentLink')}
          </Link>
        </Banner>
      )}
      {run.status === 'pending' && <Banner tone="amber">{t('pendingHint')}</Banner>}
      {run.status === 'draft' && run.computedAt && <Banner tone="amber">{t('changedHint')}</Banner>}

      <div className={`grid gap-6 ${acting ? 'lg:grid-cols-[2fr_1fr]' : ''}`}>
        <Card title={t('summary')}>
          <div className="grid gap-6 xl:grid-cols-2">
            {run.totals ? (
              <RunTotalsTable totals={run.totals} />
            ) : (
              <p className="text-sm text-slate-500">{t('notComputed')}</p>
            )}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-slate-500">{t('headcount')}</dt>
              <dd className="tabular-nums">{format.number(run.headcount)}</dd>
              <dt className="text-slate-500">{t('paymentDate')}</dt>
              <dd>{day(format, run.paymentDate)}</dd>
              <dt className="text-slate-500">{t('paymentDue')}</dt>
              <dd>
                {day(format, run.paymentDue)}
                <span className="block text-xs text-slate-500">
                  {t(DUE_HINT[run.kind] ?? 'paymentDueHint')}
                </span>
              </dd>
              {run.totals && (
                <>
                  <dt className="text-slate-500">{t('totals.employerCost')}</dt>
                  <dd className="tabular-nums">{taka(format, run.totals.employerCost)}</dd>
                </>
              )}
              {run.computedAt && (
                <>
                  <dt className="text-slate-500">{t('computedAt')}</dt>
                  <dd>
                    {format.dateTime(new Date(run.computedAt), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </dd>
                </>
              )}
              {run.submittedBy && (
                <>
                  <dt className="text-slate-500">{t('submittedByLabel')}</dt>
                  <dd>{run.submittedBy}</dd>
                </>
              )}
              {run.decidedBy && run.status === 'locked' && (
                <>
                  <dt className="text-slate-500">{t('approvedBy')}</dt>
                  <dd>{run.decidedBy}</dd>
                </>
              )}
            </dl>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {run.errors > 0 && <Badge tone="red">{t('errors', { count: run.errors })}</Badge>}
            {run.warnings > 0 && (
              <Badge tone="amber">{t('warnings', { count: run.warnings })}</Badge>
            )}
            {run.flagged > 0 && <Badge tone="amber">{t('flagged', { count: run.flagged })}</Badge>}
          </div>
        </Card>
        {acting && (
          <Card title={t('next')}>
            <p className="mb-3 text-sm text-slate-600">
              {t(`nextHint.${run.publishedAt ? 'published' : run.status}`)}
            </p>
            <RunActions run={run} canManage={canManage} />
          </Card>
        )}
      </div>

      {run.status === 'locked' && <Payments runId={run.id} canManage={canManage} />}
      {run.status === 'locked' && run.kind !== 'bonus' && run.kind !== 'wppf' && (
        <TaxDeposit runId={run.id} canManage={canManage} />
      )}
      {run.status !== 'draft' && run.status !== 'cancelled' && (
        <Reports runId={run.id} canManage={canManage} />
      )}

      <Card title={t('people', { count: run.headcount })}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <nav className="flex flex-wrap gap-2 text-sm">
            {RUN_ITEM_FILTERS.map((key) => (
              <Link
                key={key}
                href={href({ show: key })}
                aria-current={show === key ? 'page' : undefined}
                className={`rounded-lg px-3 py-1.5 font-medium ${
                  show === key
                    ? 'bg-slate-100 ring-1 ring-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t(`filters.${key}`)}
              </Link>
            ))}
          </nav>
          <form className="flex gap-2" action={`/workspace/payroll/runs/${id}`}>
            <input type="hidden" name="show" value={show} />
            <input
              type="search"
              name="search"
              defaultValue={search}
              placeholder={t('search')}
              aria-label={t('search')}
              className={`${inputClass} w-56`}
            />
            <button type="submit" className={buttonClass.secondary}>
              {t('find')}
            </button>
          </form>
        </div>
        {items.items.length === 0 ? (
          <p className="text-sm text-slate-500">
            {run.computedAt ? t('nobody') : t('notComputed')}
          </p>
        ) : (
          <ul className="-mx-5 divide-y divide-slate-100 border-t border-slate-100">
            {items.items.map((item) => (
              <li key={item.id} className="px-5 py-3">
                <ItemRow
                  item={item}
                  runId={run.id}
                  editable={editable}
                  entered={entered}
                  regular={run.kind === 'regular'}
                />
              </li>
            ))}
          </ul>
        )}
        {pages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
            <span>
              {t('pageOf', {
                from: format.number((page - 1) * SIZE + 1),
                to: format.number(Math.min(page * SIZE, items.total)),
                total: format.number(items.total),
              })}
            </span>
            <span className="flex gap-2">
              {page > 1 && (
                <Link href={href({ page: page - 1 })} className={buttonClass.secondary}>
                  {t('previous')}
                </Link>
              )}
              {page < pages && (
                <Link href={href({ page: page + 1 })} className={buttonClass.secondary}>
                  {t('nextPage')}
                </Link>
              )}
            </span>
          </div>
        )}
      </Card>
    </>
  );
}

async function ItemRow({
  item,
  runId,
  editable,
  entered,
  regular,
}: {
  item: PayrollRunItemView;
  runId: string;
  editable: boolean;
  entered: PayComponentView[];
  regular: boolean;
}) {
  const t = await getTranslations('payroll.runs');
  const format = await getFormatter();
  const locale = await getLocale();
  const name = (l: PayLineView) => (locale === 'bn' && l.nameBn ? l.nameBn : l.name);
  const v = item.variables;
  const errors = item.problems.filter((p) => p.severity === 'error');
  const warnings = item.problems.filter((p) => p.severity === 'warning');
  const lines = (kind: PayLineView['kind']) => item.lines.filter((l) => l.kind === kind);
  const enteredName = new Map(
    entered.map((c) => [c.code, locale === 'bn' && c.nameBn ? c.nameBn : c.name]),
  );
  return (
    <details>
      <summary className="grid cursor-pointer grid-cols-2 items-center gap-x-4 gap-y-1 text-sm sm:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_minmax(0,1.2fr)]">
        <span className="min-w-0">
          <span className="font-medium text-slate-900">
            {locale === 'bn' && item.employee.fullNameBn
              ? item.employee.fullNameBn
              : item.employee.fullName}
          </span>{' '}
          <span className="font-mono text-xs text-slate-400">{item.employee.employeeCode}</span>
          {item.employee.designation && (
            <span className="block truncate text-xs text-slate-500">
              {item.employee.designation}
              {item.employee.orgUnit && ` · ${item.employee.orgUnit}`}
            </span>
          )}
        </span>
        <span className="text-slate-600">
          {/* Bonus and fund payouts are not counted in days. */}
          {v.periodDays > 0 &&
            t('paidDays', { days: format.number(v.paidDays), of: format.number(v.periodDays) })}
        </span>
        <span className="text-slate-600">
          {v.absentDays > 0 && t('absentDays', { days: format.number(v.absentDays) })}
          {v.otHours > 0 && (
            <span className="block">{t('otHours', { hours: format.number(v.otHours) })}</span>
          )}
        </span>
        <span className="text-right font-semibold tabular-nums">{taka(format, item.net)}</span>
        <span className="flex flex-wrap justify-end gap-1.5">
          {regular && item.variance && item.variance !== 'same' && (
            <Badge tone={item.flagged ? 'amber' : 'slate'}>
              {item.variance === 'new'
                ? t('variance.new')
                : t('variance.change', {
                    percent: format.number(item.variancePercent ?? 0, { signDisplay: 'always' }),
                  })}
            </Badge>
          )}
          {item.accountChangedAt && (
            <Badge tone="amber">
              {t('accountChanged', { date: format.dateTime(new Date(item.accountChangedAt)) })}
            </Badge>
          )}
          {errors.length > 0 && (
            <Badge tone="red">{t('problemCount', { count: errors.length })}</Badge>
          )}
          {warnings.length > 0 && (
            <Badge tone="amber">{t('warningCount', { count: warnings.length })}</Badge>
          )}
        </span>
      </summary>
      <div className="mt-3 space-y-4 rounded-lg bg-slate-50 p-4">
        {item.problems.length > 0 && (
          <ul className="space-y-1 text-sm">
            {item.problems.map((p) => (
              <li
                key={p.code}
                className={p.severity === 'error' ? 'text-red-700' : 'text-amber-700'}
              >
                {t.has(`problems.${p.code}`)
                  ? t(`problems.${p.code}`, { count: p.count ?? 0 })
                  : p.message}
              </li>
            ))}
          </ul>
        )}
        {item.lines.length > 0 && (
          <div className="grid gap-6 md:grid-cols-2">
            {(['earning', 'deduction'] as const).map((kind) => (
              <table key={kind} className="w-full self-start text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-1 font-medium">{t(`totals.${kind}s`)}</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/70">
                  {lines(kind).map((l) => (
                    <tr key={l.code}>
                      <td className="py-1 text-slate-700">
                        {name(l)}
                        {l.code in item.inputs && (
                          <span className="ml-1 text-xs text-slate-400">({t('entered')})</span>
                        )}
                      </td>
                      <td className="py-1 text-right tabular-nums">{taka(format, l.amount)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="py-1.5">{t(`totals.${kind}s`)}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {taka(format, kind === 'earning' ? item.earnings : item.deductions)}
                    </td>
                  </tr>
                </tbody>
              </table>
            ))}
          </div>
        )}
        <p className="text-xs text-slate-500">
          {t('daysLine', {
            period: format.number(v.periodDays),
            employed: format.number(v.employedDays),
            worked: format.number(v.workedDays),
            absent: format.number(v.absentDays),
            unpaid: format.number(v.unpaidLeaveDays),
            ot: format.number(v.otHours),
          })}
          {item.previousNet && ` · ${t('lastNet', { amount: taka(format, item.previousNet) })}`}
        </p>
        {Object.keys(item.inputs).length > 0 && (
          <ul className="space-y-1 text-sm">
            {Object.entries(item.inputs).map(([code, amount]) => (
              <li key={code} className="flex flex-wrap items-center gap-3">
                <span>
                  {enteredName.get(code) ?? code}:{' '}
                  <span className="tabular-nums">{taka(format, amount)}</span>
                </span>
                {editable && (
                  <RemoveInputButton runId={runId} employeeId={item.employee.id} component={code} />
                )}
              </li>
            ))}
          </ul>
        )}
        {editable && entered.length > 0 && (
          <RunInputForm runId={runId} employeeId={item.employee.id} components={entered} />
        )}
        {item.settlement && <SettlementBox working={item.settlement} />}
        {item.tax && (
          <details>
            <summary className="cursor-pointer text-sm font-medium text-slate-700">
              {t('taxHow', { amount: taka(format, item.tax.thisMonth) })}
            </summary>
            <div className="mt-2">
              <TaxWorking working={item.tax} />
            </div>
          </details>
        )}
        {item.status === 'ok' && (
          <p className="flex gap-4 text-sm">
            <a
              href={`/workspace/files/run-payslip/${runId}/${item.id}?language=en`}
              className="font-medium text-brand-700 hover:underline"
            >
              {t('payslipEn')}
            </a>
            <a
              href={`/workspace/files/run-payslip/${runId}/${item.id}?language=bn`}
              className="font-medium text-brand-700 hover:underline"
            >
              {t('payslipBn')}
            </a>
          </p>
        )}
      </div>
    </details>
  );
}

/** The tax a locked run deducted, and the challan that deposited it. */
async function TaxDeposit({ runId, canManage }: { runId: string; canManage: boolean }) {
  const tt = await getTranslations('payroll.tax.deposit');
  const format = await getFormatter();
  const tax = await load<{
    tax: string;
    people: number;
    deposit: { challanNo: string; depositedOn: string; amount: string } | null;
  }>('tenant', `/tenant/payroll/runs/${runId}/tax`);
  if (tax.people === 0 && !tax.deposit) return null;
  return (
    <Card
      title={tt('title')}
      action={
        <span className="text-sm text-slate-600">
          {tt('deducted', { amount: taka(format, tax.tax), count: tax.people })}
        </span>
      }
    >
      {tax.deposit && (
        <p className="mb-3 text-sm text-slate-700">
          {tt('deposited', {
            challan: tax.deposit.challanNo,
            date: day(format, tax.deposit.depositedOn),
            amount: taka(format, tax.deposit.amount),
          })}
        </p>
      )}
      {canManage ? (
        <>
          <p className="mb-3 text-xs text-slate-500">{tt('hint')}</p>
          <TaxDepositForm runId={runId} amount={tax.deposit?.amount ?? tax.tax} today={todayIn()} />
        </>
      ) : (
        !tax.deposit && <p className="text-sm text-slate-500">{tt('notYet')}</p>
      )}
    </Card>
  );
}

const CHANNEL_FILES: Record<string, string> = {
  bank: 'bank',
  bkash: 'wallet/bkash',
  nagad: 'wallet/nagad',
  rocket: 'wallet/rocket',
  upay: 'wallet/upay',
};

/** How a locked run is paid: by channel, the files for each, the cash sheet and the journal. */
async function Payments({ runId, canManage }: { runId: string; canManage: boolean }) {
  const t = await getTranslations('payroll.payments');
  const format = await getFormatter();
  const view = await load<DisbursementView>('tenant', `/tenant/payroll/runs/${runId}/disbursement`);
  const file = (path: string, language?: 'en' | 'bn') =>
    `/workspace/files/run-files/${runId}/${path}${language ? `?language=${language}` : ''}`;
  return (
    <Card
      title={t('title')}
      action={
        view.paidOn ? (
          <Badge tone={view.late ? 'red' : 'green'}>
            {t(view.late ? 'paidLate' : 'paid', { date: day(format, view.paidOn) })}
          </Badge>
        ) : (
          <Badge tone="amber">{t('notPaid', { date: day(format, view.paymentDue) })}</Badge>
        )
      }
    >
      <div className="-mx-5 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-2 font-medium">{t('channel')}</th>
              <th className="px-5 py-2 text-right font-medium">{t('people')}</th>
              <th className="px-5 py-2 text-right font-medium">{t('amount')}</th>
              <th className="px-5 py-2 font-medium">{t('file')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {view.channels.map((c) => (
              <tr key={c.channel}>
                <td className="px-5 py-2">
                  {t.has(`channels.${c.channel}`) ? t(`channels.${c.channel}`) : c.channel}
                </td>
                <td className="px-5 py-2 text-right tabular-nums">{format.number(c.people)}</td>
                <td className="px-5 py-2 text-right tabular-nums">{taka(format, c.amount)}</td>
                <td className="px-5 py-2">
                  {c.channel === 'cash' ? (
                    <span className="flex gap-3">
                      <a
                        href={file('cash-sheet', 'en')}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {t('cashSheet')} (EN)
                      </a>
                      <a
                        href={file('cash-sheet', 'bn')}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {t('cashSheet')} (বাংলা)
                      </a>
                    </span>
                  ) : canManage && CHANNEL_FILES[c.channel] ? (
                    <a
                      href={file(CHANNEL_FILES[c.channel]!)}
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {t('download')}
                    </a>
                  ) : null}
                </td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="px-5 py-2">{t('total')}</td>
              <td className="px-5 py-2 text-right tabular-nums">{format.number(view.people)}</td>
              <td className="px-5 py-2 text-right tabular-nums">{taka(format, view.total)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      {(['bank_incomplete', 'wallet_incomplete', 'wallet_over_limit'] as const).map((issue) => {
        const people = view.problems.filter((p) => p.issue === issue);
        return (
          people.length > 0 && (
            <Banner key={issue} tone="amber">
              {t(`issues.${issue}`, { count: people.length })}{' '}
              {people
                .slice(0, 10)
                .map((p) => p.employee.employeeCode)
                .join(', ')}
            </Banner>
          )
        );
      })}
      <p className="mt-4 flex flex-wrap gap-4 text-sm">
        <a href={file('bank-advice', 'en')} className="font-medium text-brand-700 hover:underline">
          {t('advice')} (EN)
        </a>
        <a href={file('bank-advice', 'bn')} className="font-medium text-brand-700 hover:underline">
          {t('advice')} (বাংলা)
        </a>
        <a href={file('journal')} className="font-medium text-brand-700 hover:underline">
          {t('journal')}
        </a>
      </p>
      {canManage && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <MarkPaidForm runId={runId} today={todayIn()} />
        </div>
      )}
      <PaymentChecks runId={runId} canManage={canManage} />
    </Card>
  );
}

/** What the bank and wallet providers reported back: anything returned, and why. */
async function PaymentChecks({ runId, canManage }: { runId: string; canManage: boolean }) {
  const t = await getTranslations('payroll.payments.check');
  const format = await getFormatter();
  const checks = await load<PaymentCheckView[]>(
    'tenant',
    `/tenant/payroll/runs/${runId}/payment-checks`,
  );
  const latest = checks[0];
  return (
    <div className="mt-4 space-y-3 border-t border-slate-100 pt-4 text-sm">
      <p className="font-medium">{t('title')}</p>
      {latest ? (
        <>
          <p className="text-slate-600">
            {t(latest.summary.full ? 'summary' : 'summaryReturns', {
              file: latest.fileName,
              payments: latest.summary.payments,
              credited: latest.summary.credited,
              returned: latest.summary.returned,
            })}
            {latest.summary.notReported > 0 &&
              ` ${t('notReported', { count: latest.summary.notReported })}`}
            {latest.summary.unknown > 0 && ` ${t('unknown', { count: latest.summary.unknown })}`}
          </p>
          {latest.returned.length > 0 && (
            <>
              <table className="w-full max-w-2xl">
                <tbody className="divide-y divide-slate-100">
                  {latest.returned.map((r, i) => (
                    <tr key={i}>
                      <td className="py-1">
                        {r.employee?.fullName ?? '—'}{' '}
                        <span className="font-mono text-xs text-slate-400">
                          {r.employee?.employeeCode}
                        </span>
                      </td>
                      <td className="py-1 text-slate-600">{r.account}</td>
                      <td className="py-1 text-right tabular-nums">{taka(format, r.amount)}</td>
                      <td className="py-1 pl-3 text-slate-600">{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {canManage && (
                <a
                  href={`/workspace/files/payment-check/${runId}/${latest.id}`}
                  className="font-medium text-brand-700 hover:underline"
                >
                  {t('download')}
                </a>
              )}
            </>
          )}
        </>
      ) : (
        <p className="text-slate-600">{t('none')}</p>
      )}
      {canManage && <PaymentCheckForm runId={runId} />}
    </div>
  );
}

/** The run's register, and comparing it with the payroll it replaces (a parallel run). */
async function Reports({ runId, canManage }: { runId: string; canManage: boolean }) {
  const t = await getTranslations('payroll.reconcile');
  const tr = await getTranslations('payroll.reports');
  const format = await getFormatter();
  const compared = await load<ReconciliationListItem[]>(
    'tenant',
    `/tenant/payroll/runs/${runId}/reconciliations`,
  );
  const file = (query: string) => `/workspace/files/register/${runId}?${query}`;
  const TONE = { draft: 'slate', matched: 'green', differences: 'amber' } as const;
  return (
    <Card title={t('title')}>
      <div className="mb-3 space-y-1 text-sm">
        {(['register', 'wage', 'overtime'] as const).map((kind) => (
          <p key={kind} className="flex flex-wrap gap-4">
            <span className="text-slate-600">{tr(`registers.${kind}`)}:</span>
            <a
              href={file(`kind=${kind}&format=csv`)}
              className="font-medium text-brand-700 hover:underline"
            >
              CSV
            </a>
            <a
              href={file(`kind=${kind}&format=pdf&language=en`)}
              className="font-medium text-brand-700 hover:underline"
            >
              PDF (EN)
            </a>
            <a
              href={file(`kind=${kind}&format=pdf&language=bn`)}
              className="font-medium text-brand-700 hover:underline"
            >
              PDF (বাংলা)
            </a>
          </p>
        ))}
      </div>
      <div id="compare" className="space-y-3 border-t border-slate-100 pt-3">
        <p className="text-sm text-slate-600">{t('intro')}</p>
        {compared.length > 0 && (
          <ul className="space-y-1 text-sm">
            {compared.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/workspace/payroll/reconciliations/${c.id}`}
                  className="font-medium text-brand-700 hover:underline"
                >
                  {c.fileName}
                </Link>
                <Badge tone={TONE[c.status]}>{t(`statuses.${c.status}`)}</Badge>
                {c.summary && (
                  <span className="text-slate-500">
                    {t('summaryLine', {
                      matched: c.summary.matched,
                      people: c.summary.people,
                    })}
                  </span>
                )}
                <span className="text-slate-400">
                  {format.dateTime(new Date(c.comparedAt ?? c.createdAt), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
        {canManage && <ReconcileUploadForm runId={runId} />}
      </div>
    </Card>
  );
}
