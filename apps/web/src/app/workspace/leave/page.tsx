import {
  todayIn,
  type LeaveBalanceView,
  type LeaveRequestView,
  type LeaveTypeView,
} from '@gp/shared';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { ApplyLeaveForm } from '@/components/leave/leave-forms';
import { BalanceCards, RequestList } from '@/components/leave/leave-views';
import { Card } from '@/components/ui';
import { authedFetch, load } from '@/lib/api';

export default async function MyLeavePage({ searchParams }: PageProps<'/workspace/leave'>) {
  const t = await getTranslations('leave');
  const today = todayIn();
  const thisYear = Number(today.slice(0, 4));
  const requested = Number((await searchParams).year);
  const year = requested >= 2000 && requested <= 2100 ? requested : thisYear;

  const balances = await authedFetch<LeaveBalanceView[]>(
    'tenant',
    `/tenant/me/leave/balances?year=${year}`,
  );
  if (!balances.ok) {
    return (
      <Card title={t('my.title')}>
        <p className="text-sm text-slate-600">
          {balances.status === 404 ? t('my.noEmployee') : balances.error.message}
        </p>
      </Card>
    );
  }
  const [types, requests] = await Promise.all([
    load<LeaveTypeView[]>('tenant', '/tenant/leave/types'),
    load<LeaveRequestView[]>('tenant', `/tenant/me/leave/requests?year=${year}`),
  ]);
  const yearLink = (y: number) => (
    <Link
      key={y}
      href={`/workspace/leave?year=${y}`}
      aria-current={y === year ? 'page' : undefined}
      className={`rounded-md px-2.5 py-1 text-sm ${y === year ? 'bg-white font-medium shadow-sm ring-1 ring-slate-200' : 'text-slate-600'}`}
    >
      {y}
    </Link>
  );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t('my.title')}</h1>
        <div className="flex items-center gap-4">
          <div className="flex gap-1">{[thisYear - 1, thisYear, thisYear + 1].map(yearLink)}</div>
          <Link
            href="/workspace/leave/calendar"
            className="text-sm font-medium text-brand-700 hover:underline"
          >
            {t('nav.calendar')} →
          </Link>
        </div>
      </div>
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-slate-500">{t('my.balances', { year })}</h2>
        <BalanceCards balances={balances.data} />
      </section>
      <Card title={t('my.apply')}>
        <ApplyLeaveForm types={types} />
      </Card>
      <Card title={t('my.requests')}>
        {requests.length === 0 ? (
          <p className="text-sm text-slate-500">{t('my.noRequests')}</p>
        ) : (
          <RequestList requests={requests} canCancel today={today} />
        )}
      </Card>
    </>
  );
}
