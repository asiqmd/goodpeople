import { can, type TrainingCertificateView } from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ReasonForm } from '@/components/learning/forms';
import { LearningHead } from '@/components/learning/views';
import { day } from '@/components/leave/leave-views';
import { Banner, Card, buttonClass } from '@/components/ui';
import { authedFetch, currentTenantUser } from '@/lib/api';
export default async function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations('learning');
  const l = await getLocale();
  const f = await getFormatter();
  const r = await authedFetch<TrainingCertificateView>(
    'tenant',
    `/tenant/learning/certificates/${id}`,
  );
  if (!r.ok) {
    if (r.status === 404) notFound();
    return <Banner tone="red">{r.error.message}</Banner>;
  }
  const c = r.data;
  const manage = can((await currentTenantUser())?.role, 'learning.manage');
  return (
    <>
      <LearningHead title={t('certificate')} manage={manage} />
      {c.revokedAt && (
        <Banner tone="red">
          {t('revoked')}: {c.revokeReason}
        </Banner>
      )}
      <Card title={l === 'bn' ? c.courseNameBn : c.courseName}>
        <p>
          {l === 'bn' ? (c.employee.fullNameBn ?? c.employee.fullName) : c.employee.fullName} ·{' '}
          {c.employee.employeeCode}
        </p>
        <p className="mt-2 text-sm">
          {c.company.name} · {t('trainer')}: {c.trainer}
        </p>
        <p className="mt-2 text-sm">
          {t('completedOn')}: {day(f, c.completedOn)} ·{' '}
          {c.expiresOn ? `${t('expiresOn')}: ${day(f, c.expiresOn)}` : t('noExpiry')}
        </p>
        <p className="mt-2 break-all text-xs text-slate-500">{c.number}</p>
        <div className="mt-4 flex gap-2">
          {['en', 'bn'].map((language) => (
            <a
              key={language}
              href={`/workspace/files/training-certificate/${id}?language=${language}`}
              className={buttonClass.secondary}
            >
              {language === 'bn' ? t('pdfBn') : t('pdfEn')}
            </a>
          ))}
        </div>
      </Card>
      {manage && !c.revokedAt && (
        <Card title={t('revoke')}>
          <ReasonForm kind="revoke" id={id} />
        </Card>
      )}
    </>
  );
}
