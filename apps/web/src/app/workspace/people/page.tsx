import { can, todayIn, type LifecycleOverview } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { day } from '@/components/leave/leave-views';
import { DocumentList, SeparationList } from '@/components/lifecycle/lifecycle-views';
import { Badge, Card } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

const person = (e: { id: string; fullName: string; employeeCode: string }, tab = 'job') => (
  <Link href={`/workspace/employees/${e.id}?tab=${tab}`} className="font-medium hover:underline">
    {e.fullName} <span className="font-mono text-xs text-slate-400">{e.employeeCode}</span>
  </Link>
);

/** What needs HR's attention: probation ending, people leaving or retiring, documents expiring. */
export default async function PeopleEventsPage() {
  if (!can((await currentTenantUser())?.role, 'lifecycle.manage')) redirect('/workspace');
  const t = await getTranslations('lifecycle.people');
  const format = await getFormatter();
  const overview = await load<LifecycleOverview>('tenant', '/tenant/lifecycle');
  const today = todayIn();

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t('probation')}>
          {overview.probations.length === 0 ? (
            <p className="text-sm text-slate-500">{t('noProbation')}</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {overview.probations.map((p) => (
                <li
                  key={p.employee.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  {person(p.employee)}
                  <span className="flex items-center gap-2 text-xs text-slate-600">
                    {t('ends', { date: day(format, p.probationEndsOn) })}
                    {p.deemedPermanent && <Badge tone="amber">{t('deemed')}</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-slate-500">{t('probationHint')}</p>
        </Card>
        <Card title={t('retirement')}>
          {overview.retirements.length === 0 ? (
            <p className="text-sm text-slate-500">{t('noRetirement')}</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {overview.retirements.map((r) => (
                <li key={r.employee.id} className="flex justify-between gap-2 py-2">
                  {person(r.employee)}
                  <span className="text-xs text-slate-600">
                    {t('retires', { date: day(format, r.retiresOn) })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Card title={t('separations')}>
        <SeparationList separations={overview.separations} cancellable={() => true} />
      </Card>
      <Card title={t('documents')}>
        <DocumentList documents={overview.expiringDocuments} today={today} />
      </Card>
    </>
  );
}
