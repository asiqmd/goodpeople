import type { IncidentView } from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { DHAKA_TIME } from './dhaka-time';
import { StateIcon } from './status-look';
import { clockOptions } from '@/lib/clock';

/** An incident or maintenance on the public page, in the reader's language, newest update first. */
export async function IncidentCard({ incident }: { incident: IncidentView }) {
  const t = await getTranslations('status');
  const format = await getFormatter();
  const clock = await clockOptions();
  const bn = (await getLocale()) === 'bn';
  const time = (iso: string) => format.dateTime(new Date(iso), { ...DHAKA_TIME, ...clock });
  const when =
    incident.kind === 'maintenance' && incident.endsAt
      ? t('window', { from: time(incident.startsAt), to: time(incident.endsAt) })
      : t('started', { time: time(incident.startsAt) });
  return (
    <article className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h3 className="font-semibold text-slate-900">{bn ? incident.titleBn : incident.titleEn}</h3>
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-800">
          <StateIcon state={incident.impact} />
          {t(`states.${incident.impact}`)}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        {t('affects', {
          list: format.list(
            incident.components.map((c) => t(`components.${c}`)),
            { type: 'conjunction' },
          ),
        })}
      </p>
      <p className="text-sm text-slate-600">
        {when}
        {incident.resolvedAt && (
          <>
            {' · '}
            {t(incident.kind === 'incident' ? 'resolved' : 'ended', {
              time: time(incident.resolvedAt),
            })}
          </>
        )}
      </p>
      <ol className="mt-4 space-y-3 border-s-2 border-slate-200 ps-4">
        {incident.updates.map((u) => (
          <li key={u.id}>
            <p className="text-sm">
              <span className="font-semibold text-slate-900">
                {t(`incidentStatuses.${u.status}`)}
              </span>
              <span className="text-slate-500"> · {time(u.createdAt)}</span>
            </p>
            <p className="mt-0.5 whitespace-pre-line text-sm text-slate-700">
              {bn ? u.bodyBn : u.bodyEn}
            </p>
          </li>
        ))}
      </ol>
    </article>
  );
}
