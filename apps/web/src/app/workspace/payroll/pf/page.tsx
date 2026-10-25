import { can, todayIn, type PayrollSettingsView, type PfMemberView } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { day } from '@/components/leave/leave-views';
import { InterestForm, JoinFundForm } from '@/components/payroll/benefit-forms';
import { PayrollTabs, taka } from '@/components/payroll/payroll-views';
import { Badge, Banner, buttonClass, Card, inputClass } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

export default async function FundPage({ searchParams }: PageProps<'/workspace/payroll/pf'>) {
  const role = (await currentTenantUser())?.role;
  if (!can(role, 'payroll.view')) redirect('/workspace');
  const canManage = can(role, 'payroll.manage');
  const t = await getTranslations('payroll');
  const tp = await getTranslations('payroll.pf');
  const format = await getFormatter();
  const query = await searchParams;
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  const page = Math.max(1, Number(query.page) || 1);
  const params = new URLSearchParams({ page: String(page), ...(search ? { search } : {}) });
  const [members, settings] = await Promise.all([
    load<{ items: PfMemberView[]; total: number; page: number; size: number }>(
      'tenant',
      `/tenant/payroll/pf/members?${params}`,
    ),
    load<PayrollSettingsView>('tenant', '/tenant/payroll/settings'),
  ]);
  const today = todayIn();
  const pages = Math.max(1, Math.ceil(members.total / members.size));
  const href = (p: number) =>
    `/workspace/payroll/pf?${new URLSearchParams({ page: String(p), ...(search ? { search } : {}) })}`;

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <PayrollTabs current="pf" />
      {!settings.pfEnabled && (
        <Banner tone={settings.pfRequired.required ? 'amber' : 'slate'}>
          {settings.pfRequired.required
            ? t('settings.pfRequired', {
                count: settings.pfRequired.permanentWorkers,
                threshold: settings.pfRequired.threshold ?? 0,
              })
            : tp('off')}{' '}
          <Link href="/workspace/payroll?tab=settings" className="underline">
            {tp('toSettings')}
          </Link>
        </Banner>
      )}
      {settings.pfEnabled && (
        <p className="text-sm text-slate-600">
          {tp('rates', {
            employee: format.number(Number(settings.pfEmployeeRate)),
            employer: format.number(Number(settings.pfEmployerRate)),
          })}
        </p>
      )}
      {canManage && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title={tp('joinTitle')}>
            <JoinFundForm today={today} />
          </Card>
          <Card title={tp('interestTitle')}>
            <p className="mb-3 text-sm text-slate-600">{tp('interestHint')}</p>
            <InterestForm today={today} />
          </Card>
        </div>
      )}
      <Card
        title={tp('members', { count: members.total })}
        action={
          <form className="flex gap-2" action="/workspace/payroll/pf">
            <input
              type="search"
              name="search"
              defaultValue={search}
              placeholder={tp('search')}
              aria-label={tp('search')}
              className={`${inputClass} w-48`}
            />
            <button type="submit" className={buttonClass.secondary}>
              {tp('find')}
            </button>
          </form>
        }
      >
        {members.items.length === 0 ? (
          <p className="text-sm text-slate-500">{tp('none')}</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2 font-medium">{tp('member')}</th>
                  <th className="px-5 py-2 font-medium">{tp('memberSince')}</th>
                  <th className="px-5 py-2 text-right font-medium">{tp('accounts.own')}</th>
                  <th className="px-5 py-2 text-right font-medium">{tp('accounts.employer')}</th>
                  <th className="px-5 py-2 text-right font-medium">{tp('payable')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.items.map((m) => (
                  <tr key={m.employee.id}>
                    <td className="px-5 py-2.5">
                      <Link
                        href={`/workspace/payroll/pf/${m.employee.id}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {m.employee.fullName}
                      </Link>{' '}
                      <span className="font-mono text-xs text-slate-400">
                        {m.employee.employeeCode}
                      </span>
                      {m.leftOn && (
                        <span className="ml-2">
                          <Badge tone="slate">{tp('left', { date: day(format, m.leftOn) })}</Badge>
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-slate-600">{day(format, m.joinedOn)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">
                      {taka(format, m.balance.own)}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums">
                      {taka(format, m.balance.employer)}
                    </td>
                    <td className="px-5 py-2.5 text-right tabular-nums font-medium">
                      {taka(format, m.balance.payable)}
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
