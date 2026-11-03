import type { LearningSessionView } from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AttendanceForm, EnrolForm, LearningForm, ReasonForm } from '@/components/learning/forms';
import { LearningHead } from '@/components/learning/views';
import { Banner, Card } from '@/components/ui';
import { authedFetch } from '@/lib/api';
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations('learning');
  const l = await getLocale();
  const f = await getFormatter();
  const result = await authedFetch<LearningSessionView>(
    'tenant',
    `/tenant/learning/sessions/${id}`,
  );
  if (!result.ok) {
    if (result.status === 404) notFound();
    return <Banner tone="red">{result.error.message}</Banner>;
  }
  const s = result.data;
  return (
    <>
      <LearningHead title={l === 'bn' ? s.course.nameBn : s.course.name} manage={s.manage} />
      <Card>
        <p>
          {s.company.name} · {s.location?.name ?? t('allSites')} · {t(`sessionStates.${s.status}`)}
        </p>
        <p className="mt-2 text-sm">
          {f.dateTime(new Date(s.startsAt), {
            dateStyle: 'medium',
            timeStyle: 'short',
            timeZone: 'Asia/Dhaka',
          })}{' '}
          – {f.dateTime(new Date(s.endsAt), { timeStyle: 'short', timeZone: 'Asia/Dhaka' })} ·{' '}
          {s.venue}
        </p>
        <p className="mt-2 text-sm">
          {t('trainer')}: {s.trainer} ·{' '}
          {t('capacityUsed', { enrolled: f.number(s.enrolled), capacity: f.number(s.capacity) })}
        </p>
        {s.myStatus && <p className="mt-2 text-sm font-medium">{t(`attendance.${s.myStatus}`)}</p>}
        {s.canEnrol && (
          <div className="mt-4">
            <EnrolForm id={id} />
          </div>
        )}
        {s.canWithdraw && (
          <div className="mt-4">
            <LearningForm kind="withdraw" id={id} label={t('withdraw')}>
              {null}
            </LearningForm>
          </div>
        )}
        {s.note && <p className="mt-3 text-sm text-slate-600">{s.note}</p>}
      </Card>
      {s.manage && (
        <Card title={t('roster')}>
          <ul className="mb-4 space-y-2 text-sm">
            {s.attendance.map((a) => (
              <li key={a.employee.id} className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  <Link
                    className="text-brand-700 underline"
                    href={`/workspace/learning/people/${a.employee.id}`}
                  >
                    {a.employee.employeeCode} · {a.employee.fullName}
                  </Link>{' '}
                  · {t(`attendance.${a.status}`)}{' '}
                  {a.certificateId && (
                    <Link
                      className="text-brand-700 underline"
                      href={`/workspace/learning/certificates/${a.certificateId}`}
                    >
                      {t('certificate')}
                    </Link>
                  )}
                </span>
                {s.status === 'planned' && a.status === 'enrolled' && (
                  <LearningForm kind="withdraw" id={id} label={t('withdraw')}>
                    <input type="hidden" name="employeeId" value={a.employee.id} />
                  </LearningForm>
                )}
              </li>
            ))}
          </ul>
          {s.status === 'planned' && <EnrolForm id={id} staff />}
        </Card>
      )}
      {s.manage && s.status === 'planned' && (
        <>
          {s.canComplete && (
            <Card title={t('attendanceTitle')}>
              <AttendanceForm key={s.attendance.map((a) => a.employee.id).join(':')} session={s} />
            </Card>
          )}
          <Card title={t('cancel')}>
            <ReasonForm kind="cancel" id={id} />
          </Card>
        </>
      )}
    </>
  );
}
