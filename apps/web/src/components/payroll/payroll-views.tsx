import { fiscalYearOf } from '@gp/shared';
import type {
  CompensationApprovalItem,
  LoanApprovalItem,
  MinimumWageCheck,
  PayBatchApprovalItem,
  PfStatement,
  RunTaxWorking,
  TaxYearView,
  PayLineView,
  PayRecordView,
  PayrollRunApprovalItem,
  RunStatus,
  RunTotals,
} from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { day } from '../leave/leave-views';
import { Badge, Card, type Tone } from '../ui';

type Formatter = Awaited<ReturnType<typeof getFormatter>>;

/** Taka, in the reader's digits: ৳১২,৫০০ or ৳12,500. */
export const taka = (format: Formatter, amount: string) =>
  `৳${format.number(Number(amount), { maximumFractionDigits: 2 })}`;

const STATUS_TONE: Record<PayRecordView['status'], Tone> = {
  pending: 'amber',
  approved: 'green',
  rejected: 'red',
  cancelled: 'slate',
  superseded: 'slate',
};

export async function MinimumWageBadge({ check }: { check: MinimumWageCheck | null }) {
  if (!check) return null;
  const t = await getTranslations('payroll');
  const format = await getFormatter();
  return (
    <Badge tone={check.meets ? 'green' : 'red'}>
      {check.meets
        ? t('pay.meetsMinimum', { grade: check.grade })
        : t('pay.belowMinimum', { grade: check.grade, gross: taka(format, check.minimumGross) })}
    </Badge>
  );
}

/** Earnings counted in gross, other lines, and the gross, as a short table. */
export async function PayBreakdown({ lines, gross }: { lines: PayLineView[]; gross: string }) {
  const t = await getTranslations('payroll');
  const format = await getFormatter();
  const locale = await getLocale();
  const name = (l: PayLineView) => (locale === 'bn' && l.nameBn ? l.nameBn : l.name);
  return (
    <table className="w-full text-sm">
      <tbody className="divide-y divide-slate-100">
        {lines.map((l) => (
          <tr key={l.code}>
            <td className="py-1.5 text-slate-700">
              {name(l)} <span className="font-mono text-xs text-slate-400">{l.code}</span>
              {!l.inGross && (
                <span className="ml-1 text-xs text-slate-400">({t('pay.notInGross')})</span>
              )}
            </td>
            <td className="py-1.5 text-right tabular-nums">{taka(format, l.amount)}</td>
          </tr>
        ))}
        <tr className="font-semibold">
          <td className="py-2">{t('pay.gross')}</td>
          <td className="py-2 text-right tabular-nums">{taka(format, gross)}</td>
        </tr>
      </tbody>
    </table>
  );
}

/** One pay record: its dates, structure, grade, and how it was decided. */
export async function PayRecordSummary({ record }: { record: PayRecordView }) {
  const t = await getTranslations('payroll');
  const format = await getFormatter();
  return (
    <div className="space-y-1 text-sm">
      <p className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[record.status]}>{t(`statuses.${record.status}`)}</Badge>
        <span className="font-medium">
          {record.effectiveTo
            ? t('pay.between', {
                from: day(format, record.effectiveFrom),
                to: day(format, record.effectiveTo),
              })
            : t('pay.from', { from: day(format, record.effectiveFrom) })}
        </span>
        <span className="font-semibold tabular-nums">{taka(format, record.gross)}</span>
      </p>
      <p className="text-slate-600">
        {record.structure.name} · {record.payGroup.name}
        {record.wageGrade && ` · ${t('pay.grade', { grade: record.wageGrade })}`}
      </p>
      <p className="text-slate-500">
        {record.reason}
        {record.requestedBy && ` · ${t('pay.proposedBy', { name: record.requestedBy })}`}
        {record.decidedBy &&
          record.status !== 'pending' &&
          ` · ${t('pay.decidedBy', { name: record.decidedBy })}`}
      </p>
    </div>
  );
}

/** A pay change in the approvals inbox, beside the pay it replaces. */
export async function CompensationItem({ item }: { item: CompensationApprovalItem }) {
  const t = await getTranslations('payroll');
  const tl = await getTranslations('leave');
  const format = await getFormatter();
  const { change, previous } = item;
  const before = new Map(previous?.lines.map((l) => [l.code, l.amount]) ?? []);
  return (
    <div className="min-w-0 flex-1 space-y-3">
      <div className="space-y-1">
        <p className="font-medium text-slate-900">
          {change.employee.fullName}{' '}
          <span className="font-mono text-xs text-slate-400">{change.employee.employeeCode}</span>
        </p>
        <p className="text-sm text-slate-700">
          {t('pay.from', { from: day(format, change.effectiveFrom) })} · {change.structure.name}
          {change.wageGrade && ` · ${t('pay.grade', { grade: change.wageGrade })}`}
        </p>
        <p className="text-sm text-slate-600">
          {change.reason}
          {change.requestedBy && ` · ${t('pay.proposedBy', { name: change.requestedBy })}`}
        </p>
      </div>
      <table className="w-full max-w-md text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="py-1 font-medium" />
            <th className="py-1 text-right font-medium">{t('pay.now')}</th>
            <th className="py-1 text-right font-medium">{t('pay.proposed')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {change.lines.map((l) => (
            <tr key={l.code}>
              <td className="py-1 text-slate-700">{l.name}</td>
              <td className="py-1 text-right tabular-nums text-slate-500">
                {before.has(l.code) ? taka(format, before.get(l.code)!) : '—'}
              </td>
              <td className="py-1 text-right tabular-nums">{taka(format, l.amount)}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="py-1.5">{t('pay.gross')}</td>
            <td className="py-1.5 text-right tabular-nums text-slate-500">
              {previous ? taka(format, previous.gross) : '—'}
            </td>
            <td className="py-1.5 text-right tabular-nums">{taka(format, change.gross)}</td>
          </tr>
        </tbody>
      </table>
      <div className="flex flex-wrap gap-2">
        <Badge tone="violet">{t('pay.changeBadge')}</Badge>
        <Badge tone="blue">{tl('step.payroll')}</Badge>
        <MinimumWageBadge check={change.minimumWage} />
      </div>
    </div>
  );
}

// ── Runs ─────────────────────────────────────────────────────────────────────

const SETUP_TABS = ['structures', 'components', 'groups', 'wages', 'settings'] as const;
export type SetupTab = (typeof SETUP_TABS)[number];

const WORK_TABS = ['runs', 'loans', 'pf', 'tax', 'increments'] as const;
export type WorkTab = (typeof WORK_TABS)[number];

/** The day-to-day pages first (runs, loans, the fund, tax, increments), then the setup tabs. */
export async function PayrollTabs({ current }: { current: WorkTab | SetupTab }) {
  const t = await getTranslations('payroll');
  const tabs = [
    ...WORK_TABS.map((key) => ({ key, href: `/workspace/payroll/${key}` })),
    ...SETUP_TABS.map((key) => ({ key, href: `/workspace/payroll?tab=${key}` })),
  ];
  return (
    <nav className="flex flex-wrap gap-2 text-sm">
      {tabs.map(({ key, href }) => (
        <Link
          key={key}
          href={href}
          aria-current={current === key ? 'page' : undefined}
          className={`rounded-lg px-3 py-1.5 font-medium ${
            current === key
              ? 'bg-white shadow-sm ring-1 ring-slate-200'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {t(`tabs.${key}`)}
        </Link>
      ))}
    </nav>
  );
}

export const isSetupTab = (tab: unknown): tab is SetupTab => SETUP_TABS.includes(tab as never);

const RUN_TONE: Record<RunStatus, Tone> = {
  draft: 'slate',
  computed: 'blue',
  pending: 'amber',
  locked: 'green',
  cancelled: 'slate',
};

export async function RunStatusBadge({ status }: { status: RunStatus }) {
  const t = await getTranslations('payroll.runs');
  return <Badge tone={RUN_TONE[status]}>{t(`statuses.${status}`)}</Badge>;
}

/** A run's name: its festival for a bonus run, else its period. */
export function runTitle(
  format: Formatter,
  locale: string,
  run: Pick<PayrollRunApprovalItem['run'], 'bonus' | 'periodStart' | 'periodEnd'>,
) {
  if (run.bonus)
    return locale === 'bn' && run.bonus.festivalBn ? run.bonus.festivalBn : run.bonus.festival;
  return runPeriod(format, run.periodStart, run.periodEnd);
}

/** "October 2026" for a whole month, else the two dates. */
export function runPeriod(format: Formatter, start: string, end: string) {
  const first = new Date(`${start}T00:00:00Z`);
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
  return start.endsWith('-01') && last.toISOString().slice(0, 10) === end
    ? format.dateTime(first, { month: 'long', year: 'numeric', timeZone: 'UTC' })
    : `${day(format, start)} – ${day(format, end)}`;
}

/** Earnings, deductions and net, beside last month's when there was one. */
export async function RunTotalsTable({
  totals,
  previous,
}: {
  totals: RunTotals;
  previous?: RunTotals | null;
}) {
  const t = await getTranslations('payroll.runs');
  const format = await getFormatter();
  const rows = [
    ['earnings', totals.earnings, previous?.earnings],
    ['deductions', totals.deductions, previous?.deductions],
    ['net', totals.net, previous?.net],
  ] as const;
  return (
    <table className="w-full max-w-md self-start text-sm">
      {previous && (
        <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="py-1 font-medium" />
            <th className="py-1 text-right font-medium">{t('lastMonth')}</th>
            <th className="py-1 text-right font-medium">{t('thisRun')}</th>
          </tr>
        </thead>
      )}
      <tbody className="divide-y divide-slate-100">
        {rows.map(([key, now, before]) => (
          <tr key={key} className={key === 'net' ? 'font-semibold' : undefined}>
            <td className="py-1.5 text-slate-700">{t(`totals.${key}`)}</td>
            {previous && (
              <td className="py-1.5 text-right tabular-nums text-slate-500">
                {before ? taka(format, before) : '—'}
              </td>
            )}
            <td className="py-1.5 text-right tabular-nums">{taka(format, now)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A payroll run in the approvals inbox, with last month's totals beside it. */
export async function RunApprovalItem({ item }: { item: PayrollRunApprovalItem }) {
  const t = await getTranslations('payroll.runs');
  const tl = await getTranslations('leave');
  const format = await getFormatter();
  const { run } = item;
  return (
    <div className="min-w-0 flex-1 space-y-3">
      <div className="space-y-1">
        <p className="font-medium text-slate-900">
          {run.payGroup.name} · {runTitle(format, await getLocale(), run)}
        </p>
        <p className="text-sm text-slate-700">
          {t('people', { count: run.headcount })} ·{' '}
          {t('payOn', { date: day(format, run.paymentDate) })}
          {run.submittedBy && ` · ${t('submittedBy', { name: run.submittedBy })}`}
        </p>
      </div>
      {run.totals && <RunTotalsTable totals={run.totals} previous={item.previousTotals} />}
      <div className="flex flex-wrap items-center gap-2">
        {run.kind !== 'regular' && <Badge tone="violet">{t(`kinds.${run.kind}`)}</Badge>}
        <Badge tone="blue">{tl('step.payroll')}</Badge>
        {run.warnings > 0 && <Badge tone="amber">{t('warnings', { count: run.warnings })}</Badge>}
        {run.flagged > 0 && <Badge tone="amber">{t('flagged', { count: run.flagged })}</Badge>}
        <Link
          href={`/workspace/payroll/runs/${run.id}`}
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          {t('review')}
        </Link>
      </div>
    </div>
  );
}

// ── Loans and increments in the inbox ────────────────────────────────────────

/** An advance or loan waiting for approval. */
export async function LoanApprovalCard({ item }: { item: LoanApprovalItem }) {
  const t = await getTranslations('payroll.loans');
  const tl = await getTranslations('leave');
  const format = await getFormatter();
  const { loan } = item;
  return (
    <div className="min-w-0 flex-1 space-y-2">
      <p className="font-medium text-slate-900">
        {loan.employee.fullName}{' '}
        <span className="font-mono text-xs text-slate-400">{loan.employee.employeeCode}</span>
      </p>
      <p className="text-sm text-slate-700">
        {t(`kinds.${loan.kind}`)}: {taka(format, loan.principal)} ·{' '}
        {t('perMonth', { amount: taka(format, loan.installment) })} ·{' '}
        {t('from', { month: monthName(format, loan.startMonth) })}
      </p>
      <p className="text-sm text-slate-600">
        {loan.reason}
        {loan.requestedBy && ` · ${t('requestedBy', { name: loan.requestedBy })}`}
      </p>
      <Badge tone="blue">{tl('step.payroll')}</Badge>
    </div>
  );
}

/** An increment for many people waiting for approval, with the first of them and totals. */
export async function PayBatchApprovalCard({ item }: { item: PayBatchApprovalItem }) {
  const t = await getTranslations('payroll.increments');
  const tl = await getTranslations('leave');
  const format = await getFormatter();
  const { batch, preview } = item;
  return (
    <div className="min-w-0 flex-1 space-y-3">
      <div className="space-y-1">
        <p className="font-medium text-slate-900">
          {t('title')}:{' '}
          {t(`summary.${batch.basis}`, { percent: format.number(Number(batch.percent)) })}
        </p>
        <p className="text-sm text-slate-700">
          {t('people', { count: batch.people })} ·{' '}
          {t('from', { date: day(format, batch.effectiveFrom) })}
          {batch.requestedBy && ` · ${t('requestedBy', { name: batch.requestedBy })}`}
        </p>
        <p className="text-sm text-slate-600">{batch.reason}</p>
      </div>
      <BatchLines preview={preview} compact />
      <Badge tone="blue">{tl('step.payroll')}</Badge>
    </div>
  );
}

/** People before and after an increment, with the totals of everyone in it. */
export async function BatchLines({
  preview,
  compact = false,
}: {
  preview: PayBatchApprovalItem['preview'];
  /** Gross before and after only, for the narrow inbox. */
  compact?: boolean;
}) {
  const t = await getTranslations('payroll.increments');
  const format = await getFormatter();
  return (
    <div className="overflow-x-auto">
      <table className={`w-full text-sm ${compact ? '' : 'min-w-[32rem]'}`}>
        <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="py-1 font-medium">{t('person')}</th>
            {!compact && <th className="py-1 text-right font-medium">{t('basicBefore')}</th>}
            {!compact && <th className="py-1 text-right font-medium">{t('basicAfter')}</th>}
            <th className="py-1 text-right font-medium">{t('grossBefore')}</th>
            <th className="py-1 text-right font-medium">{t('grossAfter')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {preview.lines.map((l) => (
            <tr key={l.employee.id}>
              <td className="py-1 text-slate-700">
                {l.employee.fullName}{' '}
                <span className="font-mono text-xs text-slate-400">{l.employee.employeeCode}</span>
              </td>
              {!compact && (
                <td className="py-1 text-right tabular-nums text-slate-500">
                  {taka(format, l.basicBefore)}
                </td>
              )}
              {!compact && (
                <td className="py-1 text-right tabular-nums">{taka(format, l.basicAfter)}</td>
              )}
              <td className="py-1 text-right tabular-nums text-slate-500">
                {taka(format, l.grossBefore)}
              </td>
              <td className="py-1 text-right tabular-nums">{taka(format, l.grossAfter)}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="py-1.5">{t('everyone')}</td>
            {!compact && <td />}
            {!compact && <td />}
            <td className="py-1.5 text-right tabular-nums text-slate-500">
              {taka(format, preview.grossBefore)}
            </td>
            <td className="py-1.5 text-right tabular-nums">{taka(format, preview.grossAfter)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** "November 2026" from "2026-11". */
export const monthName = (format: Formatter, month: string) =>
  format.dateTime(new Date(`${month}-01T00:00:00Z`), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

// ── The provident fund and tax, for HR and for the employee ──────────────────

/** A member's balances and every movement in their fund. */
export async function FundStatement({ statement }: { statement: PfStatement }) {
  const t = await getTranslations('payroll.pf');
  const format = await getFormatter();
  const b = statement.balance;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ['accounts.own', b.own],
          ['accounts.employer', b.employer],
          ['total', b.total],
          ['payable', b.payable],
        ].map(([key, amount]) => (
          <Card key={key}>
            <p className="text-xs uppercase tracking-wide text-slate-500">{t(key!)}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{taka(format, amount!)}</p>
            {key === 'payable' && !statement.leftOn && (
              <p className="mt-1 text-xs text-slate-500">
                {t('vested', { percent: format.number(b.vestedPercent) })}
              </p>
            )}
          </Card>
        ))}
      </div>
      <Card
        title={t('entries')}
        action={
          <span className="text-sm text-slate-500">
            {t('since', { date: day(format, statement.joinedOn) })}
            {statement.leftOn && ` · ${t('left', { date: day(format, statement.leftOn) })}`}
          </span>
        }
      >
        {statement.entries.length === 0 ? (
          <p className="text-sm text-slate-500">{t('noEntries')}</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="min-w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {statement.entries.map((e) => (
                  <tr key={e.id}>
                    <td className="px-5 py-2 text-slate-500">{day(format, e.date)}</td>
                    <td className="px-5 py-2">{t(`kinds.${e.kind}`)}</td>
                    <td className="px-5 py-2 text-slate-600">{t(`accounts.${e.account}`)}</td>
                    <td
                      className={`px-5 py-2 text-right tabular-nums ${Number(e.amount) < 0 ? 'text-red-700' : ''}`}
                    >
                      {taka(format, e.amount)}
                    </td>
                    <td className="px-5 py-2 text-slate-500">{e.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

/** How a month's tax was worked out: the year projected, the rebate and what is left. */
export async function TaxWorking({ working }: { working: RunTaxWorking }) {
  const t = await getTranslations('payroll.tax.working');
  const format = await getFormatter();
  const n = (v: number) => taka(format, String(v));
  const rows: [string, string][] = [
    ['salary', n(working.salary)],
    ['exemption', `− ${n(working.exemption)}`],
    ['taxableIncome', n(working.taxableIncome)],
    ['threshold', n(working.threshold)],
    ['grossTax', n(working.grossTax)],
    ['rebate', `− ${n(working.rebate)}`],
    ['tax', n(working.tax)],
    ['deductedBefore', `− ${taka(format, working.deductedBefore)}`],
  ];
  return (
    <div className="text-sm">
      <table className="w-full max-w-sm">
        <tbody className="divide-y divide-slate-200/70">
          {rows.map(([key, value]) => (
            <tr key={key} className={key === 'tax' ? 'font-semibold' : undefined}>
              <td className="py-1 text-slate-600">{t(key)}</td>
              <td className="py-1 text-right tabular-nums">{value}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="py-1.5">
              {t('thisMonth', { months: format.number(working.monthsLeft) })}
            </td>
            <td className="py-1.5 text-right tabular-nums">{taka(format, working.thisMonth)}</td>
          </tr>
        </tbody>
      </table>
      {working.minimumTax > 0 && working.tax === working.minimumTax && (
        <p className="mt-1 text-xs text-slate-500">
          {t('minimum', { amount: n(working.minimumTax) })}
        </p>
      )}
      {working.investment > 0 && (
        <p className="mt-1 text-xs text-slate-500">
          {t('investment', { amount: n(working.investment) })}
        </p>
      )}
    </div>
  );
}

/** A year of salary tax: paid so far, the latest projection, and each run. */
export async function TaxYear({ year, certificate }: { year: TaxYearView; certificate: string }) {
  const t = await getTranslations('payroll.tax');
  const tr = await getTranslations('payroll.runs');
  const format = await getFormatter();
  const locale = await getLocale();
  const languages = locale === 'bn' ? (['bn', 'en'] as const) : (['en', 'bn'] as const);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">{t('salarySoFar')}</p>
          <p className="text-lg font-semibold tabular-nums">{taka(format, year.salary)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">{t('taxSoFar')}</p>
          <p className="text-lg font-semibold tabular-nums">{taka(format, year.tax)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">{t('tin')}</p>
          <p className="text-lg font-semibold">{year.employee.tin ?? '—'}</p>
        </div>
      </div>
      {year.latest && (
        <div>
          <p className="mb-1 font-medium text-slate-800">{t('latest')}</p>
          <TaxWorking working={year.latest} />
        </div>
      )}
      {(year.months.length > 0 || year.opening) && (
        <table className="w-full max-w-xl text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-1 font-medium">{tr('period')}</th>
              <th className="py-1 text-right font-medium">{t('salary')}</th>
              <th className="py-1 text-right font-medium">{t('taxColumn')}</th>
              <th className="py-1 pl-4 font-medium">{t('challan')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {year.opening && (
              <tr>
                <td className="py-1 text-slate-600">{t('openingRow')}</td>
                <td className="py-1 text-right tabular-nums">
                  {taka(format, year.opening.salary)}
                </td>
                <td className="py-1 text-right tabular-nums">{taka(format, year.opening.tax)}</td>
                <td />
              </tr>
            )}
            {year.months.map((m) => (
              <tr key={m.runId}>
                <td className="py-1">
                  {runPeriod(format, m.month, m.periodEnd)}
                  {m.kind !== 'regular' && (
                    <span className="ml-1 text-xs text-slate-500">({tr(`kinds.${m.kind}`)})</span>
                  )}
                </td>
                <td className="py-1 text-right tabular-nums">{taka(format, m.salary)}</td>
                <td className="py-1 text-right tabular-nums">{taka(format, m.tax)}</td>
                <td className="py-1 pl-4 text-slate-500">{m.challanNo ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="flex flex-wrap gap-4 text-sm">
        {languages.map((language) => (
          <a
            key={language}
            href={`${certificate}${certificate.includes('?') ? '&' : '?'}fiscalYear=${year.fiscalYear}&language=${language}`}
            className="font-medium text-brand-700 hover:underline"
          >
            {t(`certificate.${language}`)}
          </a>
        ))}
      </p>
    </div>
  );
}

/** This fiscal year and the one before, e.g. 2026-27 and 2025-26. */
export const recentYears = (today: string) => {
  const current = fiscalYearOf(today);
  const start = Number(current.slice(0, 4)) - 1;
  return [current, `${start}-${String((start + 1) % 100).padStart(2, '0')}`];
};
