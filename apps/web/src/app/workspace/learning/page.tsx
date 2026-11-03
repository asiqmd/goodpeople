import type { LearningMe } from '@gp/shared';
import { getTranslations } from 'next-intl/server';
import {
  LearningHead,
  Certificates,
  CoverageTable,
  SessionList,
} from '@/components/learning/views';
import { Banner, Card } from '@/components/ui';
import { HelpLink } from '@/components/help/help-link';
import { authedFetch } from '@/lib/api';
export default async function LearningPage() {
  const t = await getTranslations('learning');
  const result = await authedFetch<LearningMe>('tenant', '/tenant/learning/me');
  if (!result.ok)
    return (
      <>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <Banner tone="amber">
          {result.error.code === 'feature_not_in_plan' ? t('notInPlan') : result.error.message}
        </Banner>
      </>
    );
  const me = result.data;
  return (
    <>
      <LearningHead manage={me.manage} />
      <p className="text-sm text-slate-600">
        {t('intro')} <HelpLink slug="learning" />
      </p>
      <Card title={t('myRequirements')}>
        <CoverageTable rows={me.requirements} />
      </Card>
      <Card title={t('upcoming')}>
        <SessionList
          sessions={me.sessions.filter(
            (s) => s.status === 'planned' && Date.parse(s.endsAt) > Date.parse(me.asOf),
          )}
        />
      </Card>
      <Card title={t('certificates')}>
        <Certificates items={me.certificates} />
      </Card>
      <Card title={t('history')}>
        <SessionList
          sessions={me.sessions.filter(
            (s) =>
              s.myStatus && (s.status !== 'planned' || Date.parse(s.endsAt) <= Date.parse(me.asOf)),
          )}
        />
      </Card>
    </>
  );
}
