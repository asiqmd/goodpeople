import {
  can,
  todayIn,
  type CommitteeRequirementView,
  type CommitteeSummaryView,
  type OrgSnapshot,
  type RelationsStatusView,
} from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { day } from '@/components/leave/leave-views';
import { CommitteeForm, RunChecksButton } from '@/components/relations/committee-forms';
import {
  CheckList,
  EstablishmentName,
  RelationsNav,
  RuleRef,
} from '@/components/relations/relations-views';
import { Badge, Card } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

export default async function CommitteesPage() {
  const accessPrincipal = await currentTenantUser();
  if (!can(accessPrincipal, 'compliance.manage')) redirect('/workspace');
  const t = await getTranslations('relations');
  const tc = await getTranslations('relations.committees');
  const format = await getFormatter();
  const [status, committees, org] = await Promise.all([
    load<RelationsStatusView>('tenant', '/tenant/relations/status'),
    load<CommitteeSummaryView[]>('tenant', '/tenant/relations/committees'),
    load<OrgSnapshot>('tenant', '/tenant/org'),
  ]);
  const today = todayIn();
  const entities = org.legalEntities.filter((e) => e.isActive);
  const sites = org.locations
    .filter((l) => l.isActive)
    .map((l) => ({ id: l.id, name: l.name, legalEntityId: l.legalEntityId }));

  const requirementLabel = (r: CommitteeRequirementView) => {
    if (r.coveredByCompany) return <Badge tone="slate">{tc('covered')}</Badge>;
    return r.required ? (
      <Badge tone="blue">{tc('required')}</Badge>
    ) : (
      <Badge tone="slate">{tc('notRequired')}</Badge>
    );
  };
  const counted = (r: CommitteeRequirementView) => {
    if (r.minWorkers === null) return tc('noRule');
    return r.minWorkers === 0
      ? tc('countedEvery', { workforce: r.workforce })
      : tc('counted', { workforce: r.workforce, min: r.minWorkers });
  };

  return (
    <>
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">{tc('title')}</h1>
        <RelationsNav current="committees" />
        <p className="text-sm text-slate-600">{tc('intro')}</p>
      </div>

      <Card title={tc('status')} action={<RunChecksButton />}>
        <p className="mb-4 text-xs text-slate-500">
          {tc('asOf', { date: day(format, status.asOf) })} · {tc('workforceHint')}
        </p>
        {status.establishments.length === 0 ? (
          <p className="text-sm text-slate-500">{tc('noEstablishments')}</p>
        ) : (
          <div className="space-y-6">
            {status.establishments.map((e) => (
              <section key={e.id} className="space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold text-slate-900">
                    <EstablishmentName of={e} />
                  </h3>
                  <p className="text-xs text-slate-500">
                    {tc('headcount', {
                      workers: e.workers,
                      employees: e.employees,
                      unions: e.unions,
                    })}
                  </p>
                </div>
                <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
                  {e.requirements.map((r) => (
                    <li key={r.kind} className="grid gap-3 p-3 text-sm sm:grid-cols-[14rem_1fr]">
                      <div className="space-y-1">
                        <p className="font-medium text-slate-900">{t(`kinds.${r.kind}`)}</p>
                        <p>{requirementLabel(r)}</p>
                        <p className="text-xs text-slate-500">{counted(r)}</p>
                        <RuleRef rule={r.rule} />
                      </div>
                      <div className="space-y-2">
                        {r.committee && (
                          <Link
                            href={`/workspace/compliance/committees/${r.committee.id}`}
                            className="font-medium text-brand-700 hover:underline"
                          >
                            {r.committee.name}
                          </Link>
                        )}
                        {r.checks.length > 0 ? (
                          <CheckList checks={r.checks} />
                        ) : (
                          !r.committee && <p className="text-slate-500">{t('none')}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>

      <Card title={tc('all')}>
        {committees.length === 0 ? (
          <p className="text-sm text-slate-500">{tc('empty')}</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-start text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2 font-medium">{tc('columns.committee')}</th>
                  <th className="px-3 py-2 font-medium">{tc('columns.establishment')}</th>
                  <th className="px-3 py-2 font-medium">{tc('columns.formed')}</th>
                  <th className="px-3 py-2 font-medium">{tc('columns.ends')}</th>
                  <th className="px-3 py-2 text-end font-medium">{tc('columns.members')}</th>
                  <th className="px-3 py-2 font-medium">{tc('columns.lastMeeting')}</th>
                  <th className="px-5 py-2 font-medium">{tc('columns.nextDue')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {committees.map((c) => (
                  <tr key={c.id}>
                    <td className="px-5 py-2">
                      <Link
                        href={`/workspace/compliance/committees/${c.id}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {c.name}
                      </Link>
                      <span className="block text-xs text-slate-500">{t(`kinds.${c.kind}`)}</span>
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      <EstablishmentName of={c} />
                    </td>
                    <td className="px-3 py-2 text-slate-700">{day(format, c.formedOn)}</td>
                    <td className="px-3 py-2">
                      {c.endsOn ? (
                        <span className={c.inTerm ? 'text-slate-700' : 'text-red-700'}>
                          {day(format, c.endsOn)}
                          {!c.inTerm && (
                            <span className="ms-2">
                              <Badge tone="red">{tc('ended')}</Badge>
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate-500">{tc('noEnd')}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-end tabular-nums">{format.number(c.members)}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {c.lastMeetingOn ? day(format, c.lastMeetingOn) : tc('never')}
                    </td>
                    <td className="px-5 py-2">
                      {c.nextMeetingDue ? (
                        <span
                          className={c.nextMeetingDue < today ? 'text-red-700' : 'text-slate-700'}
                        >
                          {day(format, c.nextMeetingDue)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {entities.length > 0 && (
        <Card title={tc('new')}>
          <p className="mb-4 text-sm text-slate-600">{tc('newIntro')}</p>
          <CommitteeForm entities={entities} sites={sites} today={today} />
        </Card>
      )}
    </>
  );
}
