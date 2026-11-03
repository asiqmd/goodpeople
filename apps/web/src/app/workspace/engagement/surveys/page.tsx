import Link from 'next/link';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import type { EngagementMe } from '@gp/shared';
import { ServiceHead } from '@/components/employee-services/views';
import { Banner, Card, buttonClass } from '@/components/ui';
import { serviceData } from '@/lib/employee-services';
export default async function SurveysPage() {
  const me = await serviceData<EngagementMe>('/engagement/me'),
    t = await getTranslations('services'),
    locale = await getLocale(),
    f = await getFormatter();
  return (
    <>
      <ServiceHead area="engagement" />
      <Banner tone="amber">{t('anonymousNote')}</Banner>
      {me.manage && (
        <Link href="/workspace/engagement/surveys/new" className={buttonClass.primary}>
          {t('newSurvey')}
        </Link>
      )}
      {!me.surveys.length && <p>{t('empty')}</p>}
      {me.surveys.map((s) => (
        <Card key={s.id} title={locale === 'bn' ? s.titleBn : s.title}>
          <p>
            {s.company.name} · {t(`states.${s.status}`)}
          </p>
          <p className="text-sm">
            {t('closesAt')}:{' '}
            {f.dateTime(new Date(s.closesAt), {
              dateStyle: 'medium',
              timeStyle: 'short',
              timeZone: 'Asia/Dhaka',
            })}
          </p>
          {s.submitted && <p className="text-sm text-brand-700">{t('alreadyResponded')}</p>}
          <Link
            href={`/workspace/engagement/surveys/${s.id}`}
            className="mt-3 inline-block text-brand-700 hover:underline"
          >
            {locale === 'bn' ? s.titleBn : s.title}
          </Link>
        </Card>
      ))}
    </>
  );
}
