import type { IncidentView } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { DHAKA_TIME } from '@/components/status/dhaka-time';
import { CreateIncidentForm, IncidentUpdateForm } from '@/components/status/incident-forms';
import { StateIcon } from '@/components/status/status-look';
import { Badge, Banner, Card } from '@/components/ui';
import { authedFetch } from '@/lib/api';
import { clockOptions } from '@/lib/clock';

/** Incidents and maintenance on the public status page, posted and updated by staff. */
export default async function PlatformStatusPage() {
  const t = await getTranslations('statusConsole');
  const te = await getTranslations('errors');
  const result = await authedFetch<IncidentView[]>('platform', '/platform/status/incidents');
  if (!result.ok) {
    const { code, message } = result.error;
    return <Banner tone="amber">{code && te.has(code) ? te(code) : message}</Banner>;
  }
  const open = result.data.filter((i) => !i.resolvedAt);
  const finished = result.data.filter((i) => i.resolvedAt);
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">{t('intro')}</p>
        </div>
        <Link href="/status" className="text-sm font-medium text-brand-700 hover:underline">
          {t('publicLink')}
        </Link>
      </div>
      <Card title={t('new')}>
        <CreateIncidentForm />
      </Card>
      <Card title={t('open')}>
        {open.length === 0 ? (
          <p className="text-sm text-slate-600">{t('noneOpen')}</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {open.map((i) => (
              <Incident key={i.id} incident={i} />
            ))}
          </div>
        )}
      </Card>
      <Card title={t('finished')}>
        {finished.length === 0 ? (
          <p className="text-sm text-slate-600">{t('noneFinished')}</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {finished.map((i) => (
              <Incident key={i.id} incident={i} />
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

/** One post in both languages with its updates, and a form for the next update. */
async function Incident({ incident }: { incident: IncidentView }) {
  const t = await getTranslations('statusConsole');
  const ts = await getTranslations('status');
  const format = await getFormatter();
  const clock = await clockOptions();
  const time = (iso: string) => format.dateTime(new Date(iso), { ...DHAKA_TIME, ...clock });
  return (
    <article className="space-y-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div>
          <h3 className="font-semibold text-slate-900">{incident.titleEn}</h3>
          <p lang="bn" className="text-slate-700">
            {incident.titleBn}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="slate">{t(`kinds.${incident.kind}`)}</Badge>
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-800">
            <StateIcon state={incident.impact} />
            {ts(`states.${incident.impact}`)}
          </span>
          <Badge tone={incident.resolvedAt ? 'green' : 'amber'}>
            {ts(`incidentStatuses.${incident.status}`)}
          </Badge>
        </div>
      </div>
      <p className="text-sm text-slate-600">
        {ts('affects', {
          list: format.list(
            incident.components.map((c) => ts(`components.${c}`)),
            { type: 'conjunction' },
          ),
        })}
        {' · '}
        {incident.kind === 'maintenance' && incident.endsAt
          ? ts('window', { from: time(incident.startsAt), to: time(incident.endsAt) })
          : ts('started', { time: time(incident.startsAt) })}
        {incident.resolvedAt && (
          <>
            {' · '}
            {ts(incident.kind === 'incident' ? 'resolved' : 'ended', {
              time: time(incident.resolvedAt),
            })}
          </>
        )}
      </p>
      <details open={!incident.resolvedAt}>
        <summary className="cursor-pointer text-sm font-medium text-slate-700">
          {t('updates')} ({format.number(incident.updates.length)})
        </summary>
        <ol className="mt-2 space-y-3 border-s-2 border-slate-200 ps-4">
          {incident.updates.map((u) => (
            <li key={u.id} className="text-sm">
              <p>
                <span className="font-semibold">{ts(`incidentStatuses.${u.status}`)}</span>
                <span className="text-slate-500"> · {time(u.createdAt)}</span>
              </p>
              <p className="mt-0.5 whitespace-pre-line text-slate-700">{u.bodyEn}</p>
              <p lang="bn" className="mt-0.5 whitespace-pre-line text-slate-700">
                {u.bodyBn}
              </p>
            </li>
          ))}
        </ol>
      </details>
      <details open={!incident.resolvedAt} className="rounded-lg bg-slate-50 p-4">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">
          {t('update')}
        </summary>
        <div className="mt-3">
          <IncidentUpdateForm incident={incident} />
        </div>
      </details>
    </article>
  );
}
