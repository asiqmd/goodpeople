import { can, type EmployeeListItem, type OrgSnapshot, type Page } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge, buttonClass, Card, inputClass } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';
import { treeOrder } from '@/lib/org';

const PAGE_SIZE = 25;
const param = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '');

export default async function EmployeesPage({ searchParams }: PageProps<'/workspace/employees'>) {
  const user = await currentTenantUser();
  if (!can(user, 'employees.read')) redirect('/workspace');
  const sp = await searchParams;
  const filters = {
    search: param(sp.q),
    legalEntityId: param(sp.entity),
    orgUnitId: param(sp.unit),
  };
  const page = Math.max(1, Number(param(sp.page)) || 1);
  const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
  for (const [k, v] of Object.entries(filters)) if (v) query.set(k, v);

  const [list, org] = await Promise.all([
    load<Page<EmployeeListItem>>('tenant', `/tenant/employees?${query}`),
    load<OrgSnapshot>('tenant', '/tenant/org'),
  ]);
  const t = await getTranslations('hr');
  const tl = await getTranslations('lifecycle');
  const format = await getFormatter();
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const pageLink = (p: number) => {
    const q = new URLSearchParams(
      Object.entries({
        q: filters.search,
        entity: filters.legalEntityId,
        unit: filters.orgUnitId,
      }).filter(([, v]) => v),
    );
    q.set('page', String(p));
    return `/workspace/employees?${q}`;
  };

  return (
    <Card
      title={`${t('employees.title')} · ${t('employees.total', { count: list.total })}`}
      action={
        <span className="flex flex-wrap gap-2">
          <Link href="/workspace/employees/id-cards" className={buttonClass.secondary}>
            {tl('idCards.title')}
          </Link>
          {can(user, 'imports.run') && (
            <Link href="/workspace/employees/import" className={buttonClass.secondary}>
              {tl('import.title')}
            </Link>
          )}
          {can(user, 'employees.write') && (
            <Link href="/workspace/employees/new" className={buttonClass.primary}>
              {t('employees.hire')}
            </Link>
          )}
        </span>
      }
    >
      <form className="mb-4 grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
        <input
          name="q"
          defaultValue={filters.search}
          placeholder={t('employees.search')}
          className={inputClass}
        />
        <select name="entity" defaultValue={filters.legalEntityId} className={inputClass}>
          <option value="">{t('employees.allEntities')}</option>
          {org.legalEntities.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <select name="unit" defaultValue={filters.orgUnitId} className={inputClass}>
          <option value="">{t('employees.allUnits')}</option>
          {treeOrder(org.orgUnits).map(({ unit, depth }) => (
            <option key={unit.id} value={unit.id}>
              {`${'  '.repeat(depth)}${unit.name}`}
            </option>
          ))}
        </select>
        <button className={buttonClass.secondary}>{t('employees.filter')}</button>
      </form>

      {list.items.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">{t('employees.none')}</p>
      ) : (
        <div className="-mx-5 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-start text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-2 font-medium">{t('employees.code')}</th>
                <th className="px-5 py-2 font-medium">{t('employees.name')}</th>
                <th className="px-5 py-2 font-medium">{t('employees.designation')}</th>
                <th className="px-5 py-2 font-medium">{t('employees.unit')}</th>
                <th className="px-5 py-2 font-medium">{t('employees.location')}</th>
                <th className="px-5 py-2 font-medium">{t('employees.type')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.items.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-slate-600">
                    {e.employeeCode}
                  </td>
                  <td className="px-5 py-3">
                    <Link
                      href={`/workspace/employees/${e.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {e.fullName}
                    </Link>
                    {e.fullNameBn && (
                      <div lang="bn" className="text-xs text-slate-500">
                        {e.fullNameBn}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3">{e.designation?.name ?? '—'}</td>
                  <td className="px-5 py-3">{e.orgUnit?.name ?? '—'}</td>
                  <td className="px-5 py-3">{e.location?.name ?? '—'}</td>
                  <td className="space-x-1 whitespace-nowrap px-5 py-3">
                    {e.employmentType && (
                      <Badge tone="slate">{t(`employmentTypes.${e.employmentType}`)}</Badge>
                    )}
                    {e.isAdolescent && <Badge tone="amber">{t('employees.adolescent')}</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={pageLink(page - 1)}>← {t('employees.previous')}</Link> : <span />}
          <span className="text-slate-500">
            {t('employees.page', { page: format.number(page), pages: format.number(pages) })}
          </span>
          {page < pages ? <Link href={pageLink(page + 1)}>{t('employees.next')} →</Link> : <span />}
        </div>
      )}
    </Card>
  );
}
