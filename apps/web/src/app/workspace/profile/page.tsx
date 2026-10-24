import type { EmployeeDetail } from '@gp/shared';
import { getTranslations } from 'next-intl/server';
import {
  AccountList,
  EmployeeHeader,
  JobSummary,
  NomineeList,
  PersonalDetails,
} from '@/components/hr/employee-views';
import { Card } from '@/components/ui';
import { authedFetch } from '@/lib/api';

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
  return (
    <>
      <EmployeeHeader employee={employee} />
      <JobSummary employee={employee} />
      <PersonalDetails employee={employee} />
      <div className="grid gap-6 lg:grid-cols-2">
        <NomineeList employee={employee} />
        <AccountList employee={employee} />
      </div>
    </>
  );
}
