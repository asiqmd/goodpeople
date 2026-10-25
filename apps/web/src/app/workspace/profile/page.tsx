import {
  todayIn,
  type DocumentView,
  type EmployeeDetail,
  type EmployeePayView,
  type SeparationView,
} from '@gp/shared';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import {
  AccountList,
  EmployeeHeader,
  JobSummary,
  NomineeList,
  PersonalDetails,
} from '@/components/hr/employee-views';
import { ResignForm } from '@/components/lifecycle/lifecycle-forms';
import { DocumentList, SeparationList } from '@/components/lifecycle/lifecycle-views';
import { PayBreakdown, PayRecordSummary } from '@/components/payroll/payroll-views';
import { Card } from '@/components/ui';
import { authedFetch, load } from '@/lib/api';

export default async function MyProfilePage() {
  const t = await getTranslations('hr.profile');
  const result = await authedFetch<EmployeeDetail>('tenant', '/tenant/me/employee');
  if (!result.ok) {
    return (
      <Card title={t('title')}>
        <p className="text-sm text-slate-600">
          {result.status === 404 ? t('none') : result.error.message}
        </p>
      </Card>
    );
  }
  const employee = result.data;
  const tl = await getTranslations('lifecycle');
  const tp = await getTranslations('payroll');
  const today = todayIn();
  const [documents, separations, pay] = await Promise.all([
    load<DocumentView[]>('tenant', '/tenant/me/documents'),
    load<SeparationView[]>('tenant', '/tenant/me/separations'),
    // Only in workspaces with payroll; otherwise nothing to show.
    authedFetch<EmployeePayView>('tenant', '/tenant/me/pay'),
  ]);
  const open = separations.some((s) => s.status === 'pending' || s.status === 'approved');
  return (
    <>
      <EmployeeHeader employee={employee} />
      <JobSummary employee={employee} />
      {pay.ok && pay.data.current && (
        <Card
          title={tp('pay.mine')}
          action={
            <Link
              href="/workspace/payslips"
              className="text-sm font-medium text-brand-700 hover:underline"
            >
              {tp('pay.payslipsLink')}
            </Link>
          }
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <PayRecordSummary record={pay.data.current} />
            <PayBreakdown lines={pay.data.current.lines} gross={pay.data.current.gross} />
          </div>
        </Card>
      )}
      <PersonalDetails employee={employee} />
      <div className="grid gap-6 lg:grid-cols-2">
        <NomineeList employee={employee} />
        <AccountList employee={employee} />
      </div>
      <Card
        title={tl('documents.mine')}
        action={
          <span className="flex gap-3 text-sm">
            <a
              href="/workspace/files/my-service-book?language=en"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-brand-700 hover:underline"
            >
              {tl('documents.serviceBook')}
            </a>
            <a
              href="/workspace/files/my-service-book?language=bn"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-brand-700 hover:underline"
            >
              {tl('documents.serviceBookBn')}
            </a>
          </span>
        }
      >
        <DocumentList documents={documents} today={today} />
      </Card>
      {employee.status === 'active' && (
        <Card title={tl('separation.mine')}>
          {separations.length > 0 && (
            <div className="mb-4">
              <SeparationList
                separations={separations}
                cancellable={(s) => s.status === 'pending'}
              />
            </div>
          )}
          {!open && (
            <details>
              <summary className="cursor-pointer text-sm font-medium text-slate-600">
                {tl('separation.resignTitle')}
              </summary>
              <div className="mt-4">
                <ResignForm today={today} />
              </div>
            </details>
          )}
        </Card>
      )}
    </>
  );
}
