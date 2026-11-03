import { can, todayIn, type LoanView } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { day } from '@/components/leave/leave-views';
import { CancelLoanButton, LoanForm, RepayForm } from '@/components/payroll/benefit-forms';
import { monthName, PayrollTabs, taka } from '@/components/payroll/payroll-views';
import { Badge, Card, type Tone } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

const TONE: Record<LoanView['status'], Tone> = {
  pending: 'amber',
  active: 'blue',
  closed: 'green',
  rejected: 'red',
  cancelled: 'slate',
};

export default async function LoansPage({ searchParams }: PageProps<'/workspace/payroll/loans'>) {
  const accessPrincipal = await currentTenantUser();
  if (!can(accessPrincipal, 'payroll.view')) redirect('/workspace');
  const canManage = can(accessPrincipal, 'payroll.manage');
  const t = await getTranslations('payroll');
  const tl = await getTranslations('payroll.loans');
  const format = await getFormatter();
  const all = (await searchParams).show === 'all';
  const loans = await load<LoanView[]>('tenant', `/tenant/payroll/loans${all ? '' : '?open=true'}`);
  const today = todayIn();
  const next = today.slice(8) > '20' ? nextMonth(today.slice(0, 7)) : today.slice(0, 7);

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <PayrollTabs current="loans" />
      {canManage && (
        <Card title={tl('new')}>
          <p className="mb-4 text-sm text-slate-600">{tl('intro')}</p>
          <LoanForm month={next} />
        </Card>
      )}
      <Card
        title={all ? tl('all') : tl('open')}
        action={
          <Link
            href={all ? '/workspace/payroll/loans' : '/workspace/payroll/loans?show=all'}
            className="text-sm font-medium text-brand-700 hover:underline"
          >
            {all ? tl('showOpen') : tl('showAll')}
          </Link>
        }
      >
        {loans.length === 0 ? (
          <p className="text-sm text-slate-500">{tl('none')}</p>
        ) : (
          <ul className="-mx-5 divide-y divide-slate-100">
            {loans.map((loan) => (
              <li key={loan.id} className="px-5 py-3">
                <details>
                  <summary className="grid cursor-pointer grid-cols-2 items-center gap-2 text-sm sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                    <span>
                      <span className="font-medium text-slate-900">{loan.employee.fullName}</span>{' '}
                      <span className="font-mono text-xs text-slate-400">
                        {loan.employee.employeeCode}
                      </span>
                    </span>
                    <span className="text-slate-600">{tl(`kinds.${loan.kind}`)}</span>
                    <span className="tabular-nums">{taka(format, loan.principal)}</span>
                    <span className="tabular-nums text-slate-600">
                      {tl('left', { amount: taka(format, loan.outstanding) })}
                    </span>
                    <Badge tone={TONE[loan.status]}>{tl(`statuses.${loan.status}`)}</Badge>
                  </summary>
                  <div className="mt-3 space-y-3 rounded-lg bg-slate-50 p-4 text-sm">
                    <p className="text-slate-700">
                      {tl('perMonth', { amount: taka(format, loan.installment) })} ·{' '}
                      {tl('from', { month: monthName(format, loan.startMonth) })} · {loan.reason}
                    </p>
                    <p className="text-slate-500">
                      {loan.requestedBy && tl('requestedBy', { name: loan.requestedBy })}
                      {loan.decidedBy && ` · ${tl('decidedBy', { name: loan.decidedBy })}`}
                    </p>
                    {loan.repayments.length > 0 && (
                      <ul className="space-y-1">
                        {loan.repayments.map((r, i) => (
                          <li key={i} className="flex gap-3">
                            <span className="w-32 text-slate-500">{day(format, r.date)}</span>
                            <span className="tabular-nums">{taka(format, r.amount)}</span>
                            <span className="text-slate-500">
                              {r.runId ? tl('fromRun') : (r.note ?? tl('paidIn'))}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {canManage && loan.status === 'active' && (
                      <RepayForm id={loan.id} today={today} />
                    )}
                    {canManage && loan.status === 'pending' && <CancelLoanButton id={loan.id} />}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function nextMonth(month: string) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}
