import type { EmployeeListItem, OrgSnapshot, Page } from '@gp/shared';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { EmployeeForm } from '@/components/hr/employee-form';
import { load } from '@/lib/api';

export default async function HirePage() {
  const [org, people] = await Promise.all([
    load<OrgSnapshot>('tenant', '/tenant/org'),
    load<Page<EmployeeListItem>>('tenant', '/tenant/employees?status=active&pageSize=100'),
  ]);
  const t = await getTranslations('hr.employees');
  const managers = people.items.map((e) => ({
    id: e.id,
    name: `${e.fullName} (${e.employeeCode})`,
  }));
  return (
    <>
      <div>
        <Link href="/workspace/employees" className="text-sm text-slate-500 hover:text-slate-900">
          ← {t('title')}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{t('hire')}</h1>
      </div>
      <EmployeeForm mode="hire" org={org} managers={managers} />
    </>
  );
}
