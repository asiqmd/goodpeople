import {
  can,
  type LearningSessionView,
  type LearningCourseView,
  type OrgSnapshot,
} from '@gp/shared';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { SessionForm } from '@/components/learning/forms';
import { LearningHead, SessionList } from '@/components/learning/views';
import { Card } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';
export default async function SessionsPage() {
  if (!can((await currentTenantUser())?.role, 'learning.manage')) redirect('/workspace/learning');
  const t = await getTranslations('learning');
  const [org, courses, sessions] = await Promise.all([
    load<OrgSnapshot>('tenant', '/tenant/org'),
    load<LearningCourseView[]>('tenant', '/tenant/learning/courses'),
    load<LearningSessionView[]>('tenant', '/tenant/learning/sessions'),
  ]);
  return (
    <>
      <LearningHead title={t('sessions')} manage />
      <Card title={t('createSession')}>
        <SessionForm org={org} courses={courses} />
      </Card>
      <Card title={t('sessions')}>
        <SessionList sessions={sessions} />
      </Card>
    </>
  );
}
