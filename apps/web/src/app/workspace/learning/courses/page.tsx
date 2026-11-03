import { can, type LearningCourseView } from '@gp/shared';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { CourseForm, LearningForm } from '@/components/learning/forms';
import { LearningHead } from '@/components/learning/views';
import { Card } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';
export default async function CoursesPage() {
  if (!can((await currentTenantUser())?.role, 'learning.manage')) redirect('/workspace/learning');
  const t = await getTranslations('learning');
  const l = await getLocale();
  const courses = await load<LearningCourseView[]>('tenant', '/tenant/learning/courses');
  return (
    <>
      <LearningHead title={t('courses')} manage />
      <Card title={t('createCourse')}>
        <CourseForm />
      </Card>
      {courses.map((c) => (
        <Card key={c.id} title={l === 'bn' ? c.nameBn : c.name}>
          <p className="mb-3 text-sm text-slate-600">
            {c.code} · {t(`categories.${c.category}`)} · {c.isActive ? t('active') : t('archived')}
          </p>
          <p className="mb-3 text-sm">{l === 'bn' ? c.descriptionBn : c.description}</p>
          <LearningForm kind="archive" id={c.id} label={t(c.isActive ? 'archive' : 'restore')}>
            <input type="hidden" name="isActive" value={String(!c.isActive)} />
          </LearningForm>
        </Card>
      ))}
    </>
  );
}
