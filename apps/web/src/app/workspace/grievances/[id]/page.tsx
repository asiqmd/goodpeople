import type { GrievanceDetail } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { CategoryIcon, STATUS_TONE, Thread } from '@/components/grievances/parts';
import { AnswerForm, StatusForm } from '@/components/grievances/staff-forms';
import { Badge, Banner, Card } from '@/components/ui';
import { authedFetch } from '@/lib/api';

/** One grievance: who raised it (if they said), the messages, an answer and its status. */
export default async function GrievancePage({ params }: PageProps<'/workspace/grievances/[id]'>) {
  // Handlers, and complaint committee members for harassment cases: the API decides.
  if (!(await authedFetch('tenant', '/tenant/grievances/access')).ok) redirect('/workspace');
  const { id } = await params;
  const t = await getTranslations('grievances');
  const format = await getFormatter();
  const result = await authedFetch<GrievanceDetail>('tenant', `/tenant/grievances/${id}`);
  // Harassment cases are not found for anyone outside the complaint committee.
  if (!result.ok && (result.status === 404 || result.status === 400)) notFound();
  if (!result.ok) throw new Error(result.error.message);
  const g = result.data;
  const day = (iso: string) =>
    format.dateTime(new Date(iso.length === 10 ? `${iso}T00:00:00+06:00` : iso), {
      dateStyle: 'medium',
      timeZone: 'Asia/Dhaka',
    });
  const when = (iso: string) =>
    format.dateTime(new Date(iso), {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Dhaka',
    });

  return (
    <>
      <Link href="/workspace/grievances" className="text-sm text-slate-600 hover:underline">
        ← {t('detail.back')}
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-semibold">{g.reference}</h1>
        <Badge tone={STATUS_TONE[g.status]}>{t(`statuses.${g.status}`)}</Badge>
        {g.overdue && <Badge tone="red">{t('list.overdue')}</Badge>}
        {g.awaitingReply && <Badge tone="amber">{t('list.awaiting')}</Badge>}
      </div>
      {g.restricted && (
        <Banner tone={g.committeeMissing ? 'amber' : 'violet'}>
          {g.committeeMissing ? t('list.committeeMissingAdmin') : t('detail.restrictedNote')}
        </Banner>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={t('detail.thread')}>
            <Thread
              items={g.thread.map((m, i) => ({
                key: `${i}`,
                own: m.author === 'staff',
                who: m.author === 'staff' ? (m.staff?.name ?? '') : t('detail.worker'),
                when: when(m.createdAt),
                text: m.text,
              }))}
            />
          </Card>
          <Card>
            {g.status === 'closed' ? (
              <p className="text-sm text-slate-600">{t('detail.closedNote')}</p>
            ) : (
              <AnswerForm id={g.id} />
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <dl className="space-y-3 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <CategoryIcon category={g.category} className="size-5 text-brand-700" />
                {t(`categories.${g.category}`)}
              </div>
              <div>
                <dt className="text-slate-500">
                  {t('detail.raisedOn', { date: day(g.createdAt) })}
                </dt>
                <dd className={g.overdue ? 'font-medium text-red-700' : 'text-slate-700'}>
                  {t('detail.dueOn', { date: day(g.dueOn) })} ·{' '}
                  {t('list.ageDays', { days: g.ageDays })}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{t('detail.channel')}</dt>
                <dd>{t(`channels.${g.channel}`)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t('detail.site')}</dt>
                <dd>{g.location?.name ?? t('detail.noSite')}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t('detail.reporter')}</dt>
                {g.reporter ? (
                  <dd className="space-y-1">
                    {g.reporter.name && <p className="font-medium">{g.reporter.name}</p>}
                    {g.reporter.employeeCode && (
                      <p>{t('detail.codeGiven', { code: g.reporter.employeeCode })}</p>
                    )}
                    {g.reporter.employee ? (
                      <Link
                        href={`/workspace/employees/${g.reporter.employee.id}`}
                        className="text-brand-700 hover:underline"
                      >
                        {t('detail.matched', {
                          name: g.reporter.employee.name,
                          code: g.reporter.employee.employeeCode,
                        })}
                      </Link>
                    ) : (
                      g.reporter.employeeCode && (
                        <p className="text-slate-500">{t('detail.unmatched')}</p>
                      )
                    )}
                  </dd>
                ) : (
                  <dd>{t('detail.anonymousReporter')}</dd>
                )}
              </div>
            </dl>
          </Card>
          <Card>
            <StatusForm id={g.id} status={g.status} />
          </Card>
        </div>
      </div>
    </>
  );
}
