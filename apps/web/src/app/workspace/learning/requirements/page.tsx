import {
  can,
  type LearningRequirementView,
  type LearningCourseView,
  type OrgSnapshot,
} from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { RequirementForm, ReasonForm } from '@/components/learning/forms';
import { LearningHead } from '@/components/learning/views';
import { day } from '@/components/leave/leave-views';
import { Card } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';
export default async function RequirementsPage() {
  if (!can((await currentTenantUser())?.role, 'learning.manage')) redirect('/workspace/learning');
  const t = await getTranslations('learning');
  const l = await getLocale();
  const f = await getFormatter();
  const [org, courses, policies] = await Promise.all([
    load<OrgSnapshot>('tenant', '/tenant/org'),
    load<LearningCourseView[]>('tenant', '/tenant/learning/courses'),
    load<LearningRequirementView[]>('tenant', '/tenant/learning/requirements'),
  ]);
  return (
    <>
      <LearningHead title={t('requirements')} manage />
      <p className="text-sm text-slate-600">{t('policyHint')}</p>
      <Card title={t('createRequirement')}>
        <RequirementForm org={org} courses={courses} />
      </Card>
      {policies.map((p) => (
        <Card key={p.id} title={`${p.company.name} · ${p.designation.name}`}>
          <p className="mb-3 text-sm">
            {l === 'bn' ? p.course.nameBn : p.course.name} · {day(f, p.effectiveFrom)} –{' '}
            {p.effectiveTo ? day(f, p.effectiveTo) : t('openEnded')} ·{' '}
            {t('graceValue', { days: f.number(p.graceDays) })}
          </p>
          {!p.effectiveTo && <ReasonForm kind="retire" id={p.id} />}
        </Card>
      ))}
    </>
  );
}
