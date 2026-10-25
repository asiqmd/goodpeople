import type {
  CompensationApprovalItem,
  MinimumWageCheck,
  PayLineView,
  PayRecordView,
  PayrollRunApprovalItem,
  RunStatus,
  RunTotals,
} from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { day } from '../leave/leave-views';
import { Badge, type Tone } from '../ui';

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

/** Runs first, then the setup tabs. */
export async function PayrollTabs({ current }: { current: 'runs' | SetupTab }) {
  const t = await getTranslations('payroll');
  const tabs = [
    { key: 'runs', href: '/workspace/payroll/runs' },
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
          {run.payGroup.name} · {runPeriod(format, run.periodStart, run.periodEnd)}
        </p>
        <p className="text-sm text-slate-700">
          {t('people', { count: run.headcount })} ·{' '}
          {t('payOn', { date: day(format, run.paymentDate) })}
          {run.submittedBy && ` · ${t('submittedBy', { name: run.submittedBy })}`}
        </p>
      </div>
      {run.totals && <RunTotalsTable totals={run.totals} previous={item.previousTotals} />}
      <div className="flex flex-wrap items-center gap-2">
        {run.kind === 'adjustment' && <Badge tone="violet">{t('kinds.adjustment')}</Badge>}
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
