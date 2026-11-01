import {
  can,
  fiscalYearOf,
  todayIn,
  type Permission,
  type EmployeeDetail,
  type EmployeeListItem,
  type JobAssignmentView,
  type LeaveBalanceView,
  type LeaveLedgerEntryView,
  type LeaveRequestView,
  type LeaveTypeView,
  type OrgSnapshot,
  type Page,
  type DocumentView,
  type EmployeeAttendanceView,
  type LetterTemplateView,
  type SeparationView,
  type TenantAccessView,
  type EmployeePayView,
  type PayComponentView,
  type PayGroupView,
  type SalaryStructureView,
  type TaxYearView,
  type WageBoardView,
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
import { ManualPunchForm, PinForm } from '@/components/attendance/attendance-forms';
import { DaysTable, PunchList, TotalsBar } from '@/components/attendance/attendance-views';
import {
  ExtendProbationForm,
  IssueLetterForm,
  RecordSeparationForm,
  UploadDocumentForm,
} from '@/components/lifecycle/lifecycle-forms';
import { DocumentList, SeparationList } from '@/components/lifecycle/lifecycle-views';
import { EmployeePerformanceTab } from '@/components/performance/record-views';
import {
  DeclarationForm,
  TaxOpeningForm,
  TaxProfileForm,
  VerifyDeclarationForm,
} from '@/components/payroll/benefit-forms';
import { CancelPayChangeButton, PayChangeForm } from '@/components/payroll/payroll-forms';
import {
  MinimumWageBadge,
  PayBreakdown,
  PayRecordSummary,
  taka,
  TaxYear,
} from '@/components/payroll/payroll-views';
import { Badge, buttonClass, Card } from '@/components/ui';
import { authedFetch, currentTenantUser, load } from '@/lib/api';
import { MONTH, monthRange, shiftMonth } from '@/lib/month';

const TABS = [
  'profile',
  'job',
  'pay',
  'documents',
  'nominees',
  'payment',
  'leave',
  'attendance',
  'performance',
] as const;

/** What each tab needs: read-only roles (attendance officer, auditor) see the profile only. */
const TAB_PERMISSION: Record<(typeof TABS)[number] | 'edit', Permission> = {
  profile: 'employees.read',
  edit: 'employees.write',
  job: 'employees.write',
  pay: 'payroll.view',
  documents: 'documents.manage',
  nominees: 'employees.write',
  payment: 'employees.write',
  leave: 'leave.manage',
  attendance: 'attendance.manage',
  performance: 'performance.manage',
};

export default async function EmployeePage({
  params,
  searchParams,
}: PageProps<'/workspace/employees/[id]'>) {
  const { id } = await params;
  const sp = await searchParams;
  const role = (await currentTenantUser())?.role;
  const { access } = await load<TenantAccessView>('tenant', '/tenant/access');
  const tabs = TABS.filter(
    (name) =>
      can(role, TAB_PERMISSION[name]) &&
      (name !== 'pay' || access.features.includes('payroll')) &&
      (name !== 'performance' || access.features.includes('performance')),
  );
  const tabParam = sp.tab;
  const asked = (
    typeof tabParam === 'string' ? tabParam : 'profile'
  ) as keyof typeof TAB_PERMISSION;
  const tab =
    (tabs as string[]).includes(asked) || (asked === 'edit' && can(role, 'employees.write'))
      ? asked
      : 'profile';
  const result = await authedFetch<EmployeeDetail>('tenant', `/tenant/employees/${id}`);
  if (!result.ok) notFound();
  const employee = result.data;
  const t = await getTranslations('hr');
  const tl = await getTranslations('leave');
  const ta = await getTranslations('attendance');
  const tlc = await getTranslations('lifecycle');
  const tp = await getTranslations('payroll');
  const td = await getTranslations('development.record');

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
        {tabs.map((name) => (
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
            {name === 'pay'
              ? tp('tab')
              : name === 'leave'
                ? tl('employee.tab')
                : name === 'attendance'
                  ? ta('employee.tab')
                  : name === 'documents'
                    ? tlc('documents.tab')
                    : name === 'performance'
                      ? td('tab')
                      : t(`detail.${name}`)}
          </Link>
        ))}
      </nav>

      {tab === 'profile' && (
        <>
          {can(role, 'employees.write') && (
            <div className="flex justify-end">
              <Link href={`/workspace/employees/${id}?tab=edit`} className={buttonClass.secondary}>
                {t('detail.edit')}
              </Link>
            </div>
          )}
          <PersonalDetails employee={employee} />
        </>
      )}
      {tab === 'edit' && <EmployeeForm mode="edit" employee={employee} />}
      {tab === 'job' && <JobTab employee={employee} />}
      {tab === 'pay' && <PayTab employee={employee} canEdit={can(role, 'payroll.manage')} />}
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
      {tab === 'documents' && <DocumentsTab employeeId={id} />}
      {tab === 'performance' && <EmployeePerformanceTab employeeId={id} />}
      {tab === 'attendance' && (
        <AttendanceTab employeeId={id} month={typeof sp.month === 'string' ? sp.month : null} />
      )}
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
  const [history, org, people, separations] = await Promise.all([
    load<JobAssignmentView[]>('tenant', `/tenant/employees/${employee.id}/job-history`),
    load<OrgSnapshot>('tenant', '/tenant/org'),
    load<Page<EmployeeListItem>>('tenant', '/tenant/employees?status=active&pageSize=100'),
    load<SeparationView[]>('tenant', `/tenant/employees/${employee.id}/separations`),
  ]);
  const t = await getTranslations('hr.detail');
  const tl = await getTranslations('lifecycle');
  const format = await getFormatter();
  const today = todayIn();
  const managers = people.items.map((e) => ({
    id: e.id,
    name: `${e.fullName} (${e.employeeCode})`,
  }));
  const onProbation =
    employee.status === 'active' &&
    !employee.confirmedOn &&
    employee.currentJob?.employmentType === 'probationer';
  const open = separations.some((s) => s.status === 'pending' || s.status === 'approved');
  return (
    <>
      <div className="grid gap-6 lg:grid-cols-2">
        <JobSummary employee={employee} />
        <JobHistory history={history} correction={{ employeeId: employee.id, org, managers }} />
      </div>
      {onProbation && (
        <Card title={tl('probation.title')}>
          <p className="mb-3 text-sm text-slate-600">
            {employee.probationEndsOn
              ? tl('probation.endsOn', { date: day(format, employee.probationEndsOn) })
              : tl('probation.noDate')}
            {employee.probationEndsOn && employee.probationEndsOn < today && (
              <span className="block text-amber-700">{tl('probation.deemed')}</span>
            )}
          </p>
          <ExtendProbationForm
            employeeId={employee.id}
            current={employee.probationEndsOn ?? today}
          />
        </Card>
      )}
      {employee.status === 'active' && (
        <Card title={t('recordChange')}>
          <JobChangeForm
            employeeId={employee.id}
            current={employee.currentJob}
            org={org}
            managers={managers}
          />
          <p className="mt-2 text-xs text-slate-500">{tl('job.backDatedHint')}</p>
        </Card>
      )}
      <Card title={tl('separation.title')}>
        <SeparationList
          separations={separations}
          cancellable={(s) => s.status === 'pending' || s.status === 'approved'}
        />
        {employee.status === 'active' && !open && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-brand-700">
              {tl('separation.recordTitle')}
            </summary>
            <div className="mt-4">
              <RecordSeparationForm employeeId={employee.id} today={today} />
            </div>
          </details>
        )}
      </Card>
    </>
  );
}

async function DocumentsTab({ employeeId }: { employeeId: string }) {
  const [documents, templates] = await Promise.all([
    load<DocumentView[]>('tenant', `/tenant/employees/${employeeId}/documents`),
    load<LetterTemplateView[]>('tenant', '/tenant/letter-templates'),
  ]);
  const t = await getTranslations('lifecycle');
  return (
    <>
      <Card
        title={t('documents.heading')}
        action={
          <span className="flex gap-3 text-sm">
            <a
              href={`/workspace/files/service-book/${employeeId}?language=en`}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-brand-700 hover:underline"
            >
              {t('documents.serviceBook')}
            </a>
            <a
              href={`/workspace/files/service-book/${employeeId}?language=bn`}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-brand-700 hover:underline"
            >
              {t('documents.serviceBookBn')}
            </a>
          </span>
        }
      >
        <DocumentList documents={documents} today={todayIn()} manage />
      </Card>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title={t('documents.uploadTitle')}>
          <UploadDocumentForm employeeId={employeeId} />
        </Card>
        <Card title={t('letters.issueTitle')}>
          <IssueLetterForm employeeId={employeeId} templates={templates} />
        </Card>
      </div>
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

async function AttendanceTab({
  employeeId,
  month: asked,
}: {
  employeeId: string;
  month: string | null;
}) {
  const t = await getTranslations('attendance');
  const format = await getFormatter();
  const today = todayIn();
  const month = asked && MONTH.test(asked) ? asked : today.slice(0, 7);
  const { from, to } = monthRange(month);
  const result = await authedFetch<EmployeeAttendanceView>(
    'tenant',
    `/tenant/employees/${employeeId}/attendance?from=${from}&to=${to}`,
  );
  if (!result.ok) {
    return (
      <Card>
        <p className="text-sm text-slate-600">
          {result.error.code === 'feature_not_in_plan'
            ? t('employee.notInPlan')
            : result.error.message}
        </p>
      </Card>
    );
  }
  const { attendancePin, shifts, range, punches } = result.data;
  const tab = (m: string) => `/workspace/employees/${employeeId}?tab=attendance&month=${m}`;
  return (
    <>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t('employee.devices')}>
          <PinForm employeeId={employeeId} pin={attendancePin} />
        </Card>
        <Card title={t('employee.shifts')}>
          {shifts.length === 0 ? (
            <p className="text-sm text-slate-500">{t('employee.defaultShift')}</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {shifts.map((s) => (
                <li key={s.id} className="flex justify-between gap-3 py-1.5">
                  <span>
                    <span className="font-mono text-xs text-slate-400">{s.shift.code}</span>{' '}
                    {s.shift.name} · {s.shift.startTime}–{s.shift.endTime}
                  </span>
                  <span className="text-xs text-slate-500">
                    {day(format, s.effectiveFrom)} –{' '}
                    {s.effectiveTo ? day(format, s.effectiveTo) : t('employee.now')}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/workspace/attendance/roster"
            className="mt-3 inline-block text-xs font-medium text-brand-700 hover:underline"
          >
            {t('employee.changeShift')} →
          </Link>
        </Card>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {format.dateTime(new Date(`${from}T00:00:00Z`), {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          })}
        </h2>
        <span className="flex gap-3 text-sm">
          <Link href={tab(shiftMonth(month, -1))} className="text-slate-600 hover:text-slate-900">
            ← {t('my.previous')}
          </Link>
          {month < today.slice(0, 7) && (
            <Link href={tab(shiftMonth(month, 1))} className="text-slate-600 hover:text-slate-900">
              {t('my.next')} →
            </Link>
          )}
        </span>
      </div>
      <TotalsBar totals={range.totals} />
      <Card>
        {range.days.length === 0 ? (
          <p className="text-sm text-slate-500">{t('my.notTracked')}</p>
        ) : (
          <DaysTable days={range.days} timeZone={range.timeZone} today={today} />
        )}
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t('employee.punches')}>
          <PunchList punches={punches} timeZone={range.timeZone} voidable />
        </Card>
        <Card title={t('employee.addPunch')}>
          <ManualPunchForm employeeId={employeeId} maxDate={today} />
        </Card>
      </div>
    </>
  );
}

async function PayTab({ employee, canEdit }: { employee: EmployeeDetail; canEdit: boolean }) {
  const t = await getTranslations('payroll');
  const pay = await load<EmployeePayView>('tenant', `/tenant/employees/${employee.id}/pay`);
  const [structures, groups, boards, components] = canEdit
    ? await Promise.all([
        load<SalaryStructureView[]>('tenant', '/tenant/payroll/structures'),
        load<PayGroupView[]>('tenant', '/tenant/payroll/pay-groups'),
        load<WageBoardView[]>('tenant', '/tenant/payroll/wage-boards'),
        load<PayComponentView[]>('tenant', '/tenant/payroll/components'),
      ])
    : [[], [], [], []];
  return (
    <>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title={t('pay.current')}
          action={<MinimumWageBadge check={pay.current?.minimumWage ?? null} />}
        >
          {pay.current ? (
            <div className="space-y-4">
              <PayRecordSummary record={pay.current} />
              <PayBreakdown lines={pay.current.lines} gross={pay.current.gross} />
            </div>
          ) : (
            <p className="text-sm text-slate-500">{t('pay.none')}</p>
          )}
        </Card>
        <Card title={t('pay.history')}>
          {pay.history.length === 0 ? (
            <p className="text-sm text-slate-500">{t('pay.noHistory')}</p>
          ) : (
            <ul className="-mx-5 divide-y divide-slate-100">
              {pay.history.map((record) => (
                <li key={record.id} className="flex items-start justify-between gap-3 px-5 py-3">
                  <PayRecordSummary record={record} />
                  {canEdit && record.status === 'pending' && (
                    <CancelPayChangeButton id={record.id} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <TaxSection employee={employee} canEdit={canEdit} />
      {canEdit && employee.status === 'active' && (
        <Card title={t('pay.change')}>
          {pay.pending.length > 0 ? (
            <p className="text-sm text-slate-600">{t('pay.waiting')}</p>
          ) : (
            <PayChangeForm
              employeeId={employee.id}
              current={pay.current}
              structures={structures}
              payGroups={groups}
              wageBoards={boards}
              fixedComponents={components.filter((c) => c.calculation === 'fixed' && c.isActive)}
              today={todayIn()}
            />
          )}
        </Card>
      )}
    </>
  );
}

/** The employee's salary tax this fiscal year, their profile, openings and declaration. */
async function TaxSection({ employee, canEdit }: { employee: EmployeeDetail; canEdit: boolean }) {
  const tt = await getTranslations('payroll.tax');
  const format = await getFormatter();
  const fiscalYear = fiscalYearOf(todayIn());
  const year = await load<TaxYearView>(
    'tenant',
    `/tenant/employees/${employee.id}/tax?fiscalYear=${fiscalYear}`,
  );
  const declaration = year.declaration;
  return (
    <>
      <Card title={tt('yearTitle', { year: fiscalYear })}>
        <TaxYear year={year} certificate={`/workspace/files/tax-certificate/${employee.id}`} />
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title={tt('declaration.title')}
          action={
            declaration.status && (
              <Badge tone={declaration.status === 'verified' ? 'green' : 'amber'}>
                {tt(`statuses.${declaration.status}`)}
              </Badge>
            )
          }
        >
          {declaration.status === 'submitted' && canEdit ? (
            <VerifyDeclarationForm
              employeeId={employee.id}
              fiscalYear={fiscalYear}
              items={declaration.items}
            />
          ) : declaration.status === 'verified' || !canEdit ? (
            declaration.items.length === 0 ? (
              <p className="text-sm text-slate-500">{tt('declaration.none')}</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {declaration.items.map((i, n) => (
                  <li key={n} className="flex justify-between gap-3">
                    <span>{tt(`kinds.${i.kind}`)}</span>
                    <span className="tabular-nums">
                      {taka(format, i.declared)}
                      {i.verified !== null && ` → ${taka(format, i.verified)}`}
                    </span>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <DeclarationForm
              employeeId={employee.id}
              fiscalYear={fiscalYear}
              items={declaration.items}
              locked={false}
            />
          )}
        </Card>
        {canEdit && (
          <Card title={tt('profile.title')}>
            <TaxProfileForm employeeId={employee.id} profile={year.profile} />
            <details className="mt-5 border-t border-slate-100 pt-4">
              <summary className="cursor-pointer text-sm font-medium text-slate-800">
                {tt('opening.title')}
              </summary>
              <p className="my-2 text-sm text-slate-600">{tt('opening.hint')}</p>
              <TaxOpeningForm employeeId={employee.id} fiscalYear={fiscalYear} />
            </details>
          </Card>
        )}
      </div>
    </>
  );
}
