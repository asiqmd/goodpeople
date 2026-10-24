import { addDays, type DocumentView, type SeparationStatus, type SeparationView } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import { day } from '../leave/leave-views';
import { Badge, type Tone } from '../ui';
import { CancelSeparationButton, DocumentActions } from './lifecycle-forms';

const SEPARATION_TONE: Record<SeparationStatus, Tone> = {
  pending: 'amber',
  approved: 'blue',
  completed: 'slate',
  rejected: 'red',
  cancelled: 'slate',
};

/** Expired, expiring within 60 days, or fine. */
export function expiryTone(expiresOn: string | null, today: string): Tone | null {
  if (!expiresOn) return null;
  if (expiresOn < today) return 'red';
  return expiresOn <= addDays(today, 60) ? 'amber' : null;
}

const fileSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export async function DocumentList({
  documents,
  today,
  manage = false,
}: {
  documents: DocumentView[];
  today: string;
  /** HR: show visibility and delete. */
  manage?: boolean;
}) {
  const t = await getTranslations('lifecycle.documents');
  const format = await getFormatter();
  if (documents.length === 0) return <p className="text-sm text-slate-500">{t('none')}</p>;
  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {documents.map((d) => {
        const tone = expiryTone(d.expiresOn, today);
        return (
          <li key={d.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
            <span className="min-w-0">
              <a
                href={`/workspace/files/documents/${d.id}`}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-slate-900 hover:underline"
              >
                {d.title}
              </a>{' '}
              <Badge tone="slate">{t(`categories.${d.category}`)}</Badge>{' '}
              {d.refNo && <span className="font-mono text-xs text-slate-500">{d.refNo}</span>}
              <span className="block text-xs text-slate-500">
                {[
                  d.issuedOn && t('issued', { date: day(format, d.issuedOn) }),
                  d.expiresOn && t('expires', { date: day(format, d.expiresOn) }),
                  fileSize(d.sizeBytes),
                  d.uploadedBy,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
            <span className="flex items-center gap-3">
              {tone && <Badge tone={tone}>{tone === 'red' ? t('expired') : t('expiring')}</Badge>}
              <a
                href={`/workspace/files/documents/${d.id}?download=1`}
                className="text-xs font-medium text-brand-700 hover:underline"
              >
                {t('download')}
              </a>
              {manage && <DocumentActions id={d.id} visible={d.visibleToEmployee} />}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export async function SeparationList({
  separations,
  cancellable,
}: {
  separations: SeparationView[];
  /** Which ones the reader may call off. */
  cancellable: (s: SeparationView) => boolean;
}) {
  const t = await getTranslations('lifecycle.separation');
  const tl = await getTranslations('leave');
  const format = await getFormatter();
  if (separations.length === 0) return <p className="text-sm text-slate-500">{t('none')}</p>;
  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {separations.map((s) => (
        <li key={s.id} className="space-y-1 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-medium">
              {t(`types.${s.type}`)} · {s.employee.fullName}
            </span>
            <span className="flex items-center gap-3">
              <Badge tone={SEPARATION_TONE[s.status]}>{t(`statuses.${s.status}`)}</Badge>
              {cancellable(s) && <CancelSeparationButton id={s.id} />}
            </span>
          </div>
          <p className="text-xs text-slate-600">
            {t('dates', { notice: day(format, s.noticeDate), last: day(format, s.lastWorkingDay) })}
            {s.noticeDaysRequired !== null &&
              ` · ${t('noticeRequired', { days: s.noticeDaysRequired })}`}
          </p>
          {s.noticeShortfallDays > 0 && (
            <p className="text-xs text-amber-700">
              {t('shortfall', { days: s.noticeShortfallDays })}
            </p>
          )}
          <p className="text-xs text-slate-500">{s.reason}</p>
          {s.steps.length > 0 && (
            <p className="text-xs text-slate-500">
              {s.steps
                .map((st) => `${tl(`step.${st.kind}`)}: ${tl(`step.${st.status}`)}`)
                .join(' → ')}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
