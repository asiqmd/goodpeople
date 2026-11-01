import { can, type ProbationReviewListItem } from '@gp/shared';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { ProbationTable } from '@/components/performance/probation-views';
import { Card } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

/**
 * Probation reviews: the ones a manager is asked for, and for HR every one in their companies,
 * due, submitted with the recommendation, and acted on. HR acts from the person's probation.
 */
export default async function ProbationPage() {
  const t = await getTranslations('development.probation');
  const role = (await currentTenantUser())?.role;
  const reviews = await load<ProbationReviewListItem[]>('tenant', '/tenant/performance/probation');
  // HR who may change a job confirm, extend or end probation from the employee page.
  const actions = can(role, 'performance.manage') && can(role, 'employees.write');
  const sections = [
    { key: 'due', reviews: reviews.filter((r) => r.state === 'due') },
    { key: 'submitted', reviews: reviews.filter((r) => r.state === 'submitted') },
    {
      key: 'acted',
      reviews: reviews.filter((r) => r.state === 'acted').toReversed(),
    },
  ] as const;
  return (
    <>
      <div className="space-y-1">
        <Link href="/workspace/performance" className="text-sm text-slate-500 hover:underline">
          ← {t('back')}
        </Link>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-slate-600">{t('intro')}</p>
      </div>
      {sections.map((s) => (
        <Card key={s.key} title={t(`sections.${s.key}`)}>
          <ProbationTable reviews={s.reviews} actions={actions && s.key !== 'acted'} />
        </Card>
      ))}
    </>
  );
}
