import { can, type EmployeeListItem, type Page } from '@gp/shared';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buttonClass, Card, Field, inputClass } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

/** Tick people and print their photo ID cards (Labour Act s.5). */
export default async function IdCardsPage() {
  if (!can((await currentTenantUser())?.role, 'employees.read')) redirect('/workspace');
  const t = await getTranslations('lifecycle.idCards');
  const people = await load<Page<EmployeeListItem>>(
    'tenant',
    '/tenant/employees?status=active&pageSize=100',
  );
  return (
    <>
      <Link href="/workspace/employees" className="text-sm text-slate-500 hover:text-slate-900">
        ← {t('back')}
      </Link>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <Card>
        {/* Posts to a route that returns the PDF, opened in a new tab to print. */}
        <form
          method="post"
          action="/workspace/files/id-cards"
          target="_blank"
          className="space-y-4"
        >
          <p className="text-sm text-slate-600">{t('hint')}</p>
          <div className="max-h-96 overflow-y-auto rounded-lg p-2 ring-1 ring-inset ring-slate-300">
            {people.items.map((e) => (
              <label key={e.id} className="flex items-center gap-2 py-0.5 text-sm">
                <input type="checkbox" name="employeeIds" value={e.id} />
                <span className="font-mono text-xs text-slate-400">{e.employeeCode}</span>
                {e.fullName}
                {e.designation && (
                  <span className="text-xs text-slate-500">· {e.designation.name}</span>
                )}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <Field label={t('language')}>
              <select name="language" className={inputClass}>
                <option value="en">English</option>
                <option value="bn">বাংলা</option>
              </select>
            </Field>
            <Field label={t('validUntil')}>
              <input type="date" name="validUntil" className={inputClass} />
            </Field>
            <button className={buttonClass.primary}>{t('print')}</button>
          </div>
        </form>
      </Card>
    </>
  );
}
