import type { EmployeeRef, TrainingCertificateView, TrainingCoverageRow } from '@gp/shared';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { LearningHead, Certificates, CoverageTable } from '@/components/learning/views';
import { Banner, Card } from '@/components/ui';
import { authedFetch } from '@/lib/api';
export default async function PersonLearningPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations('learning');
  const l = await getLocale();
  const r = await authedFetch<{
    employee: EmployeeRef;
    certificates: TrainingCertificateView[];
    requirements: TrainingCoverageRow[];
  }>('tenant', `/tenant/learning/people/${id}`);
  if (!r.ok) {
    if (r.status === 404) notFound();
    return <Banner tone="red">{r.error.message}</Banner>;
  }
  return (
    <>
      <LearningHead
        title={
          l === 'bn'
            ? (r.data.employee.fullNameBn ?? r.data.employee.fullName)
            : r.data.employee.fullName
        }
      />
      <Card title={t('requirements')}>
        <CoverageTable rows={r.data.requirements} />
      </Card>
      <Card title={t('certificates')}>
        <Certificates items={r.data.certificates} />
      </Card>
    </>
  );
}
