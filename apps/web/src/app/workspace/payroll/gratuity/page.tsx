import {
  addDays,
  can,
  todayIn,
  type GratuityProvision,
  type PayrollSettingsView,
} from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { day } from '@/components/leave/leave-views';
import { PayrollTabs, taka } from '@/components/payroll/payroll-views';
import { Banner, buttonClass, Card, inputClass } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

/** The last day of the month before today's: the latest closed month. */
const lastMonthEnd = () => addDays(`${todayIn().slice(0, 8)}01`, -1);

export default async function GratuityPage({
  searchParams,
}: PageProps<'/workspace/payroll/gratuity'>) {
  const role = (await currentTenantUser())?.role;
  if (!can(role, 'payroll.view')) redirect('/workspace');
  const t = await getTranslations('payroll');
  const tg = await getTranslations('payroll.gratuity');
  const format = await getFormatter();
  const query = await searchParams;
  const asOf =
    typeof query.asOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(query.asOf)
      ? query.asOf
      : lastMonthEnd();
  const page = Math.max(1, Number(query.page) || 1);
  const settings = await load<PayrollSettingsView>('tenant', '/tenant/payroll/settings');
  if (!settings.gratuityEnabled) {
    return (
      <>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <PayrollTabs current="gratuity" />
        <Banner tone="slate">
          {tg('off')}{' '}
          <Link href="/workspace/payroll?tab=settings" className="underline">
            {tg('toSettings')}
          </Link>
        </Banner>
      </>
    );
  }
  const provision = await load<GratuityProvision>(
    'tenant',
    `/tenant/payroll/gratuity?asOf=${asOf}&page=${page}`,
  );
  const pages = Math.max(1, Math.ceil(provision.people / provision.size));
  const href = (p: number) => `/workspace/payroll/gratuity?asOf=${asOf}&page=${p}`;

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <PayrollTabs current="gratuity" />
      <p className="text-sm text-slate-600">{tg('intro')}</p>
      <Card
        title={tg('title', { date: day(format, provision.asOf) })}
        action={
          <form className="flex gap-2" action="/workspace/payroll/gratuity">
            <input
              type="date"
              name="asOf"
              defaultValue={asOf}
              aria-label={tg('asOf')}
              className={`${inputClass} w-44`}
            />
            <button type="submit" className={buttonClass.secondary}>
              {tg('show')}
            </button>
          </form>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">{tg('total')}</p>
            <p className="text-lg font-semibold tabular-nums">{taka(format, provision.total)}</p>
            <p className="text-xs text-slate-500">{tg('people', { count: provision.people })}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {tg('previous', { date: day(format, provision.previousAsOf) })}
            </p>
            <p className="text-lg font-semibold tabular-nums">
              {taka(format, provision.previousTotal)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">{tg('change')}</p>
            <p className="text-lg font-semibold tabular-nums">{taka(format, provision.change)}</p>
            <p className="text-xs text-slate-500">
              {tg('entry', {
                expense: settings.glAccounts.gratuityExpense,
                provision: settings.glAccounts.gratuityProvision,
              })}
            </p>
          </div>
        </div>
        <p className="mt-4 text-sm">
          <a
            href={`/workspace/files/gratuity?asOf=${asOf}`}
            className="font-medium text-brand-700 hover:underline"
          >
            {tg('download')}
          </a>
        </p>
      </Card>
      <Card title={tg('lines')}>
        {provision.lines.length === 0 ? (
          <p className="text-sm text-slate-500">{tg('none')}</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2 font-medium">{tg('person')}</th>
                  <th className="px-5 py-2 font-medium">{tg('joined')}</th>
                  <th className="px-5 py-2 text-right font-medium">{tg('years')}</th>
                  <th className="px-5 py-2 text-right font-medium">{tg('basic')}</th>
                  <th className="px-5 py-2 text-right font-medium">{tg('days')}</th>
                  <th className="px-5 py-2 text-right font-medium">{tg('liability')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {provision.lines.map((l) => (
                  <tr key={l.employee.id}>
                    <td className="px-5 py-2.5">
                      <span className="font-medium">{l.employee.fullName}</span>{' '}
                      <span className="font-mono text-xs text-slate-400">
                        {l.employee.employeeCode}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 text-slate-600">{day(format, l.joinedOn)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">
                      {format.number(l.serviceYears)}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">
                      {taka(format, l.monthlyWage)}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{format.number(l.days)}</td>
                    <td className="px-5 py-2.5 text-right font-medium tabular-nums">
                      {taka(format, l.liability)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="mt-4 flex justify-end gap-2">
            {page > 1 && (
              <Link href={href(page - 1)} className={buttonClass.secondary}>
                {t('runs.previous')}
              </Link>
            )}
            {page < pages && (
              <Link href={href(page + 1)} className={buttonClass.secondary}>
                {t('runs.nextPage')}
              </Link>
            )}
          </div>
        )}
      </Card>
    </>
  );
}
