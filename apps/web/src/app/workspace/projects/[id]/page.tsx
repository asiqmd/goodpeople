import {
  addDays,
  can,
  todayIn,
  MAX_PROJECT_REPORT_MONTHS,
  type AllocationView,
  type DonorView,
  type EmployeeListItem,
  type LegalEntityView,
  type Page,
  type ProjectCostReport,
  type ProjectTimesheetRef,
  type ProjectView,
} from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { day } from '@/components/leave/leave-views';
import { monthName, taka } from '@/components/payroll/payroll-views';
import {
  AllocationActions,
  AllocationForm,
  CloseProjectButton,
  ProjectForm,
} from '@/components/projects/project-forms';
import {
  Meter,
  projectName,
  projectPeriod,
  ProjectStatusBadge,
} from '@/components/projects/project-views';
import { Banner, buttonClass, Card, inputClass } from '@/components/ui';
import { authedFetch, currentTenantUser, load } from '@/lib/api';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const shift = (month: string, by: number) => {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
};
const span = (from: string, to: string) => {
  const [fy, fm] = from.split('-').map(Number) as [number, number];
  const [ty, tm] = to.split('-').map(Number) as [number, number];
  return (ty - fy) * 12 + (tm - fm) + 1;
};

const asked = (v: unknown) => (typeof v === 'string' && MONTH.test(v) ? v : null);

/** The period shown: as asked, else the year to the last month that has ended. */
function periodOf(project: ProjectView, query: Record<string, string | string[] | undefined>) {
  const started = project.startsOn.slice(0, 7);
  const ended = addDays(`${todayIn().slice(0, 7)}-01`, -1).slice(0, 7);
  const to = asked(query.to) ?? (ended < started ? started : ended);
  let from = asked(query.from) ?? shift(to, -11);
  if (!asked(query.from) && from < started) from = started;
  if (from > to || span(from, to) > MAX_PROJECT_REPORT_MONTHS) from = to;
  return { from, to };
}

export default async function ProjectPage({
  params,
  searchParams,
}: PageProps<'/workspace/projects/[id]'>) {
  if (!can((await currentTenantUser())?.role, 'projects.manage')) redirect('/workspace');
  const { id } = await params;
  const query = await searchParams;
  const t = await getTranslations('projects');
  const format = await getFormatter();
  const locale = await getLocale();
  const found = await authedFetch<ProjectView>('tenant', `/tenant/projects/${id}`);
  if (!found.ok) {
    if (found.status === 404 || found.status === 400) notFound();
    return (
      <>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <Banner tone="amber">
          {found.error.code === 'feature_not_in_plan' ? t('notInPlan') : found.error.message}
        </Banner>
      </>
    );
  }
  const project = found.data;
  const { from, to } = periodOf(project, query);
  const search = typeof query.people === 'string' ? query.people.trim() : '';
  const period = `from=${from}&to=${to}`;
  const [donors, entities, allocations, report, sheets, people] = await Promise.all([
    load<DonorView[]>('tenant', '/tenant/donors'),
    load<LegalEntityView[]>('tenant', '/tenant/legal-entities'),
    load<AllocationView[]>('tenant', `/tenant/projects/${id}/allocations`),
    load<ProjectCostReport>('tenant', `/tenant/projects/${id}/costs?${period}`),
    load<ProjectTimesheetRef[]>('tenant', `/tenant/projects/${id}/timesheets?${period}`),
    load<Page<EmployeeListItem>>(
      'tenant',
      `/tenant/employees?${new URLSearchParams({ status: 'active', pageSize: '100', ...(search ? { search } : {}) })}`,
    ),
  ]);
  const today = todayIn();
  const name = (p: { fullName: string; fullNameBn: string | null }) =>
    locale === 'bn' && p.fullNameBn ? p.fullNameBn : p.fullName;
  const percent = (v: number) => `${format.number(v, { maximumFractionDigits: 1 })}%`;
  const { cumulative, adminCap } = report;
  const files = (kind: 'csv' | 'pdf', language = 'en') =>
    `/workspace/files/projects/${id}/donor-report?${new URLSearchParams({ from, to, format: kind, language })}`;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <Link href="/workspace/projects" className="text-sm text-slate-500 hover:underline">
            ← {t('title')}
          </Link>
          <h1 className="text-2xl font-semibold">
            {projectName(project, locale)}{' '}
            <span className="font-mono text-base font-normal text-slate-400">{project.code}</span>
          </h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <ProjectStatusBadge status={project.status} />
            <span>{project.donor?.name ?? t('list.coreFunds')}</span>
            <span>· {project.legalEntity.name}</span>
            <span>· {await projectPeriod(format, project)}</span>
          </p>
        </div>
        {project.status === 'active' && <CloseProjectButton project={project} />}
      </div>

      <Card title={t('costs.title')}>
        <form className="mb-4 flex flex-wrap items-end gap-3 text-sm">
          <label>
            <span className="font-medium text-slate-800">{t('costs.from')}</span>
            <input
              type="month"
              name="from"
              defaultValue={from}
              className={`${inputClass} mt-1 w-40`}
            />
          </label>
          <label>
            <span className="font-medium text-slate-800">{t('costs.to')}</span>
            <input type="month" name="to" defaultValue={to} className={`${inputClass} mt-1 w-40`} />
          </label>
          <button className={buttonClass.secondary}>{t('costs.show')}</button>
        </form>

        <div className="mb-5 grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5 text-sm">
            <p className="font-medium text-slate-800">{t('costs.staffBudget')}</p>
            {cumulative.staffBudget && cumulative.staffBudgetUsed !== null ? (
              <>
                <Meter used={cumulative.staffBudgetUsed} label={t('costs.staffBudget')} />
                <p className="text-slate-600">
                  {t('costs.staffUsed', {
                    spent: taka(format, cumulative.total),
                    budget: taka(format, cumulative.staffBudget),
                    percent: percent(cumulative.staffBudgetUsed),
                  })}
                </p>
                {cumulative.overStaffBudget && <Banner tone="amber">{t('costs.overStaff')}</Banner>}
              </>
            ) : (
              <p className="text-slate-500">
                {t('costs.noStaffBudget', { spent: taka(format, cumulative.total) })}
              </p>
            )}
          </div>
          <div className="space-y-1.5 text-sm">
            <p className="font-medium text-slate-800">{t('costs.adminCap')}</p>
            {adminCap ? (
              <>
                <Meter
                  used={(adminCap.used / adminCap.percent) * 100}
                  label={t('costs.adminCap')}
                />
                <p className="text-slate-600">
                  {t('costs.adminUsed', {
                    admin: taka(format, adminCap.admin),
                    cap: taka(format, adminCap.cap),
                    percent: percent(adminCap.used),
                    limit: percent(adminCap.percent),
                  })}
                </p>
                {adminCap.over && (
                  <Banner tone="amber">
                    {t('costs.adminOver', { limit: percent(adminCap.percent) })}
                  </Banner>
                )}
                <p className="text-xs text-slate-500">
                  {t('costs.reference', {
                    act: adminCap.reference.act,
                    // In the reader's digits: s.6, or ধারা ৬.
                    section: adminCap.reference.section.replace(/\d+/g, (n) =>
                      format.number(Number(n)),
                    ),
                  })}
                  {adminCap.status === 'needs_review' && ` ${t('costs.needsReview')}`}
                </p>
              </>
            ) : (
              <p className="text-slate-500">{t('costs.noApprovedBudget')}</p>
            )}
          </div>
        </div>

        <div className="-mx-5 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-start text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-2 font-medium">{t('costs.month')}</th>
                {(
                  [
                    'people',
                    'fte',
                    'earnings',
                    'employerCost',
                    'total',
                    'programme',
                    'admin',
                  ] as const
                ).map((k) => (
                  <th key={k} className="px-3 py-2 text-end font-medium">
                    {t(`costs.${k}`)}
                  </th>
                ))}
                <th className="px-5 py-2 font-medium">{t('costs.basis')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.months.map((m) => (
                <tr key={m.month}>
                  <td className="px-5 py-2 whitespace-nowrap">{monthName(format, m.month)}</td>
                  <td className="px-3 py-2 text-end tabular-nums">{format.number(m.people)}</td>
                  <td className="px-3 py-2 text-end tabular-nums">
                    {format.number(Number(m.fte), { maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-2 text-end tabular-nums">{taka(format, m.earnings)}</td>
                  <td className="px-3 py-2 text-end tabular-nums">
                    {taka(format, m.employerCost)}
                  </td>
                  <td className="px-3 py-2 text-end font-medium tabular-nums">
                    {taka(format, m.total)}
                  </td>
                  <td className="px-3 py-2 text-end tabular-nums">{taka(format, m.programme)}</td>
                  <td className="px-3 py-2 text-end tabular-nums">{taka(format, m.admin)}</td>
                  <td className="px-5 py-2 text-xs text-slate-600">
                    {m.people > 0 &&
                      t('costs.basisValue', {
                        timesheet: m.basis.timesheet,
                        planned: m.basis.planned,
                      })}
                    {m.unlocked && (
                      <span className="block text-amber-700">{t('costs.unlocked')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-slate-200 font-semibold">
              <tr>
                <td className="px-5 py-2">{t('costs.totalRow')}</td>
                <td colSpan={2} />
                <td className="px-3 py-2 text-end tabular-nums">
                  {taka(format, report.total.earnings)}
                </td>
                <td className="px-3 py-2 text-end tabular-nums">
                  {taka(format, report.total.employerCost)}
                </td>
                <td className="px-3 py-2 text-end tabular-nums">
                  {taka(format, report.total.total)}
                </td>
                <td className="px-3 py-2 text-end tabular-nums">
                  {taka(format, report.total.programme)}
                </td>
                <td className="px-3 py-2 text-end tabular-nums">
                  {taka(format, report.total.admin)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">{t('costs.basisNote')}</p>
      </Card>

      <Card title={t('reports.title')}>
        <p className="mb-3 text-sm text-slate-600">
          {t('reports.intro', { from: monthName(format, from), to: monthName(format, to) })}
        </p>
        <ul className="flex flex-wrap gap-4 text-sm">
          <li>
            <a href={files('csv')} className="font-medium text-brand-700 hover:underline">
              {t('reports.csv')}
            </a>
          </li>
          <li>
            <a href={files('pdf', 'en')} className="font-medium text-brand-700 hover:underline">
              {t('reports.pdfEn')}
            </a>
          </li>
          <li>
            <a href={files('pdf', 'bn')} className="font-medium text-brand-700 hover:underline">
              {t('reports.pdfBn')}
            </a>
          </li>
        </ul>
      </Card>

      <Card title={t('timesheets.title')}>
        {sheets.length === 0 ? (
          <p className="text-sm text-slate-500">{t('timesheets.none')}</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {sheets.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <span>
                  <span className="font-medium">{name(s.employee)}</span>{' '}
                  <span className="font-mono text-xs text-slate-400">
                    {s.employee.employeeCode}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {monthName(format, s.month)} ·{' '}
                    {t('timesheets.hours', {
                      project: format.number(Number(s.projectHours)),
                      total: format.number(Number(s.hours)),
                    })}
                  </span>
                </span>
                <a
                  href={`/workspace/files/timesheets/${s.id}`}
                  className="font-medium text-brand-700 hover:underline"
                >
                  {t('timesheets.open')}
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t('allocations.title')}>
        <p className="mb-4 text-sm text-slate-600">{t('allocations.intro')}</p>
        {allocations.length === 0 ? (
          <p className="mb-4 text-sm text-slate-500">{t('allocations.none')}</p>
        ) : (
          <div className="-mx-5 mb-5 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-start text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2 font-medium">{t('allocations.person')}</th>
                  <th className="px-3 py-2 text-end font-medium">{t('allocations.percent')}</th>
                  <th className="px-3 py-2 font-medium">{t('allocations.kind')}</th>
                  <th className="px-3 py-2 font-medium">{t('allocations.from')}</th>
                  <th className="px-3 py-2 font-medium">{t('allocations.to')}</th>
                  <th className="px-5 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allocations.map((a) => (
                  <tr key={a.id}>
                    <td className="px-5 py-2">
                      <span className="font-medium">{name(a.employee)}</span>{' '}
                      <span className="font-mono text-xs text-slate-400">
                        {a.employee.employeeCode}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-end tabular-nums">
                      {percent(Number(a.percent))}
                    </td>
                    <td className="px-3 py-2">{t(`allocations.kinds.${a.costKind}`)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{day(format, a.fromOn)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {a.toOn ? day(format, a.toOn) : t('allocations.untilEnd')}
                    </td>
                    <td className="px-5 py-2 text-end">
                      {(!a.toOn || a.toOn >= today || a.fromOn > today) && (
                        <AllocationActions allocation={a} started={a.fromOn <= today} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {project.status === 'closed' ? (
          <p className="text-sm text-slate-500">{t('allocations.closed')}</p>
        ) : (
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <h3 className="text-sm font-semibold text-slate-900">{t('allocations.addTitle')}</h3>
            <form className="flex flex-wrap gap-2">
              <input type="hidden" name="from" value={from} />
              <input type="hidden" name="to" value={to} />
              <label className="sr-only" htmlFor="people">
                {t('allocations.search')}
              </label>
              <input
                id="people"
                name="people"
                defaultValue={search}
                placeholder={t('allocations.search')}
                className={`${inputClass} max-w-xs`}
              />
              <button className={buttonClass.secondary}>{t('allocations.searchButton')}</button>
            </form>
            {people.items.length === 0 ? (
              <p className="text-sm text-slate-500">{t('allocations.noMatch')}</p>
            ) : (
              <AllocationForm
                projectId={project.id}
                people={people.items.map((e) => ({
                  id: e.id,
                  label: `${e.employeeCode} · ${name(e)}`,
                }))}
                startsOn={project.startsOn}
                endsOn={project.endsOn}
              />
            )}
          </div>
        )}
      </Card>

      <Card title={t('form.editTitle')}>
        <ProjectForm
          key={project.updatedAt}
          project={project}
          entities={entities
            .filter((e) => e.isActive || e.id === project.legalEntity.id)
            .map((e) => ({ id: e.id, name: e.name }))}
          donors={donors}
        />
      </Card>
    </>
  );
}
