import { can, type DonorView, type LegalEntityView, type ProjectListItem } from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { HelpLink } from '@/components/help/help-link';
import { taka } from '@/components/payroll/payroll-views';
import { DonorActiveToggle, DonorForm, ProjectForm } from '@/components/projects/project-forms';
import {
  projectName,
  projectPeriod,
  ProjectStatusBadge,
} from '@/components/projects/project-views';
import { Badge, Banner, Card } from '@/components/ui';
import { authedFetch, currentTenantUser, load } from '@/lib/api';

/** Donor-funded projects, what each was charged this month, and the donors. */
export default async function ProjectsPage() {
  if (!can((await currentTenantUser())?.role, 'projects.manage')) redirect('/workspace');
  const t = await getTranslations('projects');
  const format = await getFormatter();
  const locale = await getLocale();
  const projects = await authedFetch<ProjectListItem[]>('tenant', '/tenant/projects');
  if (!projects.ok) {
    return (
      <>
        <h1 className="text-2xl font-semibold">
          {t('title')}
          <HelpLink slug="ngo-timesheets" />
        </h1>
        <Banner tone="amber">
          {projects.error.code === 'feature_not_in_plan' ? t('notInPlan') : projects.error.message}
        </Banner>
      </>
    );
  }
  const [donors, entities] = await Promise.all([
    load<DonorView[]>('tenant', '/tenant/donors'),
    load<LegalEntityView[]>('tenant', '/tenant/legal-entities'),
  ]);
  const periods = await Promise.all(projects.data.map((p) => projectPeriod(format, p)));

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">
          {t('title')}
          <HelpLink slug="ngo-timesheets" />
        </h1>
        <p className="text-sm text-slate-600">{t('intro')}</p>
      </div>

      <Card title={t('list.title')}>
        {projects.data.length === 0 ? (
          <p className="text-sm text-slate-500">{t('list.none')}</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-start text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2 font-medium">{t('list.project')}</th>
                  <th className="px-3 py-2 font-medium">{t('list.donor')}</th>
                  <th className="px-3 py-2 font-medium">{t('list.company')}</th>
                  <th className="px-3 py-2 font-medium">{t('list.period')}</th>
                  <th className="px-3 py-2 font-medium">{t('list.status')}</th>
                  <th className="px-3 py-2 text-end font-medium">{t('list.people')}</th>
                  <th className="px-5 py-2 text-end font-medium">{t('list.monthCost')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {projects.data.map((p, i) => (
                  <tr key={p.id}>
                    <td className="px-5 py-2">
                      <Link
                        href={`/workspace/projects/${p.id}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {projectName(p, locale)}
                      </Link>
                      <span className="block font-mono text-xs text-slate-400">{p.code}</span>
                    </td>
                    <td className="px-3 py-2">{p.donor?.name ?? t('list.coreFunds')}</td>
                    <td className="px-3 py-2">{p.legalEntity.name}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{periods[i]}</td>
                    <td className="px-3 py-2">
                      <ProjectStatusBadge status={p.status} />
                    </td>
                    <td className="px-3 py-2 text-end tabular-nums">{format.number(p.people)}</td>
                    <td className="px-5 py-2 text-end tabular-nums">{taka(format, p.monthCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={t('form.addTitle')}>
        <ProjectForm
          entities={entities.filter((e) => e.isActive).map((e) => ({ id: e.id, name: e.name }))}
          donors={donors}
        />
      </Card>

      <Card title={t('donors.title')}>
        {donors.length === 0 ? (
          <p className="mb-4 text-sm text-slate-500">{t('donors.none')}</p>
        ) : (
          <ul className="mb-4 divide-y divide-slate-100 text-sm">
            {donors.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <span className={d.isActive ? undefined : 'text-slate-400'}>
                  <span className="font-mono text-xs text-slate-400">{d.code}</span>{' '}
                  <span className="font-medium">{d.name}</span>
                  {d.country && <span className="text-slate-500"> · {d.country}</span>}
                </span>
                <span className="flex items-center gap-3">
                  {!d.isActive && <Badge tone="slate">{t('donors.inactive')}</Badge>}
                  <DonorActiveToggle donor={d} />
                </span>
              </li>
            ))}
          </ul>
        )}
        <DonorForm />
      </Card>
    </>
  );
}
