import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type {
  LearningSessionView,
  TrainingCertificateView,
  TrainingCoverageRow,
  TrainingAuditSection,
} from '@gp/shared';
import { Card, buttonClass } from '@/components/ui';
import { day } from '@/components/leave/leave-views';
export async function LearningHead({
  title,
  manage = false,
}: {
  title?: string;
  manage?: boolean;
}) {
  const t = await getTranslations('learning');
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">{title ?? t('title')}</h1>
      <nav className="flex flex-wrap gap-2">
        <Link href="/workspace/learning" className={buttonClass.secondary}>
          {t('myLearning')}
        </Link>
        <Link href="/workspace/learning/coverage" className={buttonClass.secondary}>
          {t('coverage')}
        </Link>
        {manage &&
          ['courses', 'sessions', 'requirements', 'drills'].map((k) => (
            <Link key={k} href={`/workspace/learning/${k}`} className={buttonClass.secondary}>
              {t(k)}
            </Link>
          ))}
      </nav>
    </div>
  );
}
export async function SessionList({ sessions }: { sessions: LearningSessionView[] }) {
  const t = await getTranslations('learning');
  const l = await getLocale();
  const f = await getFormatter();
  return !sessions.length ? (
    <p className="text-sm text-slate-500">{t('noneSessions')}</p>
  ) : (
    <ul className="divide-y divide-slate-100">
      {sessions.map((s) => (
        <li key={s.id} className="space-y-1 py-3">
          <Link
            href={`/workspace/learning/sessions/${s.id}`}
            className="font-medium text-brand-700 hover:underline"
          >
            {l === 'bn' ? s.course.nameBn : s.course.name}
          </Link>
          <p className="text-sm text-slate-600">
            {s.company.name} ·{' '}
            {f.dateTime(new Date(s.startsAt), {
              dateStyle: 'medium',
              timeStyle: 'short',
              timeZone: 'Asia/Dhaka',
            })}{' '}
            · {s.venue} · {t(`sessionStates.${s.status}`)}
          </p>
          {s.myStatus && <p className="text-sm">{t(`attendance.${s.myStatus}`)}</p>}
        </li>
      ))}
    </ul>
  );
}
export async function Certificates({ items }: { items: TrainingCertificateView[] }) {
  const t = await getTranslations('learning');
  const l = await getLocale();
  const f = await getFormatter();
  return !items.length ? (
    <p className="text-sm text-slate-500">{t('noneCertificates')}</p>
  ) : (
    <ul className="divide-y divide-slate-100">
      {items.map((c) => (
        <li key={c.id} className="space-y-1 py-3">
          <Link
            href={`/workspace/learning/certificates/${c.id}`}
            className="font-medium text-brand-700 hover:underline"
          >
            {l === 'bn' ? c.courseNameBn : c.courseName}
          </Link>
          <p className="text-sm text-slate-600">
            {day(f, c.completedOn)} ·{' '}
            {c.revokedAt
              ? t('revoked')
              : c.expiresOn
                ? `${t('expiresOn')}: ${day(f, c.expiresOn)}`
                : t('noExpiry')}
          </p>
        </li>
      ))}
    </ul>
  );
}
export async function CoverageTable({ rows }: { rows: TrainingCoverageRow[] }) {
  const t = await getTranslations('learning');
  const l = await getLocale();
  const f = await getFormatter();
  return !rows.length ? (
    <p className="text-sm text-slate-500">{t('noneRequirements')}</p>
  ) : (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr>
            {['employee', 'course', 'state', 'dueOn', 'expiresOn'].map((k) => (
              <th key={k} className="p-2 text-start">
                {t(k)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.employee.id}:${r.course.id}:${i}`} className="border-t border-slate-100">
              <td className="p-2">
                <Link
                  className="text-brand-700 hover:underline"
                  href={`/workspace/learning/people/${r.employee.id}`}
                >
                  {l === 'bn'
                    ? (r.employee.fullNameBn ?? r.employee.fullName)
                    : r.employee.fullName}
                </Link>
                <p className="text-xs text-slate-500">
                  {r.company.name} · {r.designation.name}
                </p>
              </td>
              <td className="p-2">{l === 'bn' ? r.course.nameBn : r.course.name}</td>
              <td className={`p-2 ${r.state === 'overdue' ? 'text-red-700' : ''}`}>
                {t(`trainingStates.${r.state}`)}
              </td>
              <td className="p-2">{day(f, r.dueOn)}</td>
              <td className="p-2">
                {r.certificateId ? (
                  <Link
                    href={`/workspace/learning/certificates/${r.certificateId}`}
                    className="text-brand-700 underline"
                  >
                    {r.expiresOn ? day(f, r.expiresOn) : t('noExpiry')}
                  </Link>
                ) : r.expiresOn ? (
                  day(f, r.expiresOn)
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export async function TrainingAudit({ report }: { report: TrainingAuditSection }) {
  const t = await getTranslations('learning');
  const f = await getFormatter();
  return (
    <Card title={t('auditTitle')}>
      <p className="mb-3 text-sm">
        {t('auditCounts', {
          required: f.number(report.required),
          current: f.number(report.current),
          due: f.number(report.due),
          overdue: f.number(report.overdue),
          completions: f.number(report.completions),
        })}
      </p>
      <CoverageTable rows={report.gaps} />
      <h3 className="mt-5 font-medium">{t('drills')}</h3>
      <ul className="space-y-2 text-sm">
        {report.drills.map((d) => (
          <li key={d.id}>
            {d.location.name} · {day(f, d.heldOn)} · {t('participants')}: {f.number(d.participants)}{' '}
            · {t('nextDueOn')}: {day(f, d.nextDueOn)}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-slate-500">{t('auditNote')}</p>
    </Card>
  );
}
