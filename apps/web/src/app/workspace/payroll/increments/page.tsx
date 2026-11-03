import {
  can,
  todayIn,
  type PayBatchView,
  type PayGroupView,
  type SalaryStructureView,
} from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { day } from '@/components/leave/leave-views';
import { CancelIncrementButton, IncrementForm } from '@/components/payroll/benefit-forms';
import { PayrollTabs } from '@/components/payroll/payroll-views';
import { Badge, Card, type Tone } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

const TONE: Record<PayBatchView['status'], Tone> = {
  pending: 'amber',
  approved: 'green',
  rejected: 'red',
  cancelled: 'slate',
};

export default async function IncrementsPage() {
  const accessPrincipal = await currentTenantUser();
  if (!can(accessPrincipal, 'payroll.view')) redirect('/workspace');
  const canManage = can(accessPrincipal, 'payroll.manage');
  const t = await getTranslations('payroll');
  const ti = await getTranslations('payroll.increments');
  const format = await getFormatter();
  const [batches, groups, structures] = await Promise.all([
    load<PayBatchView[]>('tenant', '/tenant/payroll/increments'),
    load<PayGroupView[]>('tenant', '/tenant/payroll/pay-groups'),
    load<SalaryStructureView[]>('tenant', '/tenant/payroll/structures'),
  ]);
  // Increments usually start on the first of next month.
  const today = todayIn();
  const [y, m] = today.split('-').map(Number) as [number, number];
  const firstOfNext = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <PayrollTabs current="increments" />
      {canManage && (
        <Card title={ti('new')}>
          <p className="mb-4 text-sm text-slate-600">{ti('intro')}</p>
          <IncrementForm
            groups={groups.filter((g) => g.isActive)}
            structures={structures.filter((s) => s.isActive)}
            defaultDate={firstOfNext}
          />
        </Card>
      )}
      <Card title={ti('batches')}>
        {batches.length === 0 ? (
          <p className="text-sm text-slate-500">{ti('none')}</p>
        ) : (
          <ul className="-mx-5 divide-y divide-slate-100 text-sm">
            {batches.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <span>
                  <span className="font-medium">
                    {ti(`summary.${b.basis}`, { percent: format.number(Number(b.percent)) })}
                  </span>{' '}
                  · {ti('from', { date: day(format, b.effectiveFrom) })} ·{' '}
                  {ti('people', { count: b.people })}
                  <span className="block text-slate-500">
                    {b.reason}
                    {b.requestedBy && ` · ${ti('requestedBy', { name: b.requestedBy })}`}
                    {b.decidedBy && ` · ${ti('decidedBy', { name: b.decidedBy })}`}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <Badge tone={TONE[b.status]}>{ti(`statuses.${b.status}`)}</Badge>
                  {canManage && b.status === 'pending' && <CancelIncrementButton id={b.id} />}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
