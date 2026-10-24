import {
  todayIn,
  type EmployeeDetail,
  type EmployeeListItem,
  type JobAssignmentView,
  type LeaveBalanceView,
  type LeaveLedgerEntryView,
  type LeaveRequestView,
  type LeaveTypeView,
  type OrgSnapshot,
  type Page,
} from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmployeeForm } from '@/components/hr/employee-form';
import {
  AccountList,
  EmployeeHeader,
  JobHistory,
  JobSummary,
  NomineeList,
  PersonalDetails,
} from '@/components/hr/employee-views';
import { JobChangeForm } from '@/components/hr/job-change-form';
import { NomineesForm } from '@/components/hr/nominees-form';
import { PaymentAccountsForm } from '@/components/hr/payment-accounts-form';
import { BalanceCards, day, RequestList } from '@/components/leave/leave-views';
import { AdjustLeaveForm } from '@/components/leave/settings-forms';
import { buttonClass, Card } from '@/components/ui';
import { authedFetch, load } from '@/lib/api';

const TABS = ['profile', 'job', 'nominees', 'payment', 'leave'] as const;

export default async function EmployeePage({
  params,
  searchParams,
}: PageProps<'/workspace/employees/[id]'>) {
  const { id } = await params;
  const tabParam = (await searchParams).tab;
  const tab = typeof tabParam === 'string' ? tabParam : 'profile';
  const result = await authedFetch<EmployeeDetail>('tenant', `/tenant/employees/${id}`);
  if (!result.ok) notFound();
  const employee = result.data;
  const t = await getTranslations('hr');
  const tl = await getTranslations('leave');

  return (
    <>
      <div>
        <Link href="/workspace/employees" className="text-sm text-slate-500 hover:text-slate-900">
          ← {t('employees.title')}
        </Link>
        <div className="mt-2">
          <EmployeeHeader employee={employee} />
        </div>
      </div>

      <nav className="flex gap-1 border-b border-slate-200">
        {TABS.map((name) => (
          <Link
            key={name}
            href={`/workspace/employees/${id}?tab=${name}`}
            aria-current={
              tab === name || (tab === 'edit' && name === 'profile') ? 'page' : undefined
            }
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === name || (tab === 'edit' && name === 'profile')
                ? 'border-brand-600 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            {name === 'leave' ? tl('employee.tab') : t(`detail.${name}`)}
          </Link>
        ))}
      </nav>

      {tab === 'profile' && (
        <>
          <div className="flex justify-end">
            <Link href={`/workspace/employees/${id}?tab=edit`} className={buttonClass.secondary}>
              {t('detail.edit')}
            </Link>
          </div>
          <PersonalDetails employee={employee} />
        </>
      )}
      {tab === 'edit' && <EmployeeForm mode="edit" employee={employee} />}
      {tab === 'job' && <JobTab employee={employee} />}
      {tab === 'nominees' && (
        <Card title={t('detail.nominees')}>
          <NomineesForm employeeId={id} nominees={employee.nominees} />
        </Card>
      )}
      {tab === 'payment' && (
        <Card title={t('detail.payment')}>
          <PaymentAccountsForm employeeId={id} accounts={employee.paymentAccounts} />
        </Card>
      )}
      {tab === 'leave' && <LeaveTab employeeId={id} />}
      {tab === 'profile' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <NomineeList employee={employee} />
          <AccountList employee={employee} />
        </div>
      )}
    </>
  );
}

async function JobTab({ employee }: { employee: EmployeeDetail }) {
  const [history, org, people] = await Promise.all([
    load<JobAssignmentView[]>('tenant', `/tenant/employees/${employee.id}/job-history`),
    load<OrgSnapshot>('tenant', '/tenant/org'),
    load<Page<EmployeeListItem>>('tenant', '/tenant/employees?status=active&pageSize=100'),
  ]);
  const t = await getTranslations('hr.detail');
  const managers = people.items.map((e) => ({
    id: e.id,
    name: `${e.fullName} (${e.employeeCode})`,
  }));
  return (
    <>
      <div className="grid gap-6 lg:grid-cols-2">
        <JobSummary employee={employee} />
        <JobHistory history={history} />
      </div>
      <Card title={t('recordChange')}>
        <JobChangeForm
          employeeId={employee.id}
          current={employee.currentJob}
          org={org}
          managers={managers}
        />
      </Card>
    </>
  );
}

async function LeaveTab({ employeeId }: { employeeId: string }) {
  const today = todayIn();
  const year = Number(today.slice(0, 4));
  const [summary, types] = await Promise.all([
    load<{
      balances: LeaveBalanceView[];
      requests: LeaveRequestView[];
      ledger: LeaveLedgerEntryView[];
    }>('tenant', `/tenant/employees/${employeeId}/leave?year=${year}`),
    load<LeaveTypeView[]>('tenant', '/tenant/leave/types'),
  ]);
  const t = await getTranslations('leave');
  const format = await getFormatter();
  return (
    <>
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-slate-500">{t('my.balances', { year })}</h2>
        <BalanceCards balances={summary.balances} />
      </section>
      <Card title={t('employee.requests')}>
        {summary.requests.length === 0 ? (
          <p className="text-sm text-slate-500">{t('my.noRequests')}</p>
        ) : (
          <RequestList requests={summary.requests} canCancel today={today} />
        )}
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t('employee.ledger')}>
          {summary.ledger.length === 0 ? (
            <p className="text-sm text-slate-500">{t('employee.noLedger')}</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {summary.ledger.map((e) => (
                <li key={e.id} className="flex justify-between gap-3 py-2">
                  <span>
                    <span className="font-mono text-xs text-slate-400">{e.leaveType.code}</span>{' '}
                    {t(`employee.ledgerKinds.${e.kind}`)}
                    {e.note && <span className="block text-xs text-slate-500">{e.note}</span>}
                  </span>
                  <span className="text-right">
                    <span className="font-medium">
                      {format.number(e.days, { signDisplay: 'always' })}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {day(format, e.createdAt.slice(0, 10))}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={t('employee.adjust')}>
          <AdjustLeaveForm employeeId={employeeId} types={types} year={year} />
        </Card>
      </div>
    </>
  );
}
