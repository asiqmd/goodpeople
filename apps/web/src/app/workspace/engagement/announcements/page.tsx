import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import type { EngagementMe } from '@gp/shared';
import { ServiceHead } from '@/components/employee-services/views';
import { Card, buttonClass } from '@/components/ui';
import { serviceData } from '@/lib/employee-services';
export default async function AnnouncementsPage() {
  const me = await serviceData<EngagementMe>('/engagement/me'),
    t = await getTranslations('services'),
    locale = await getLocale();
  return (
    <>
      <ServiceHead area="engagement" />
      {me.manage && (
        <Link href="/workspace/engagement/announcements/new" className={buttonClass.primary}>
          {t('newAnnouncement')}
        </Link>
      )}
      {!me.announcements.length && <p>{t('empty')}</p>}
      {me.announcements.map((a) => (
        <Card key={a.id} title={locale === 'bn' ? a.titleBn : a.title}>
          <p className="text-sm text-slate-600">
            {a.company.name} · {t(`states.${a.status}`)}
            {a.expired && <> · {t('expired')}</>}
            {a.requiresAcknowledgement && (
              <> · {a.acknowledgedAt ? t('acknowledged') : t('outstanding')}</>
            )}
          </p>
          <p className="mt-3 whitespace-pre-wrap">
            {(locale === 'bn' ? a.bodyBn : a.body).slice(0, 240)}
          </p>
          <Link
            href={`/workspace/engagement/announcements/${a.id}`}
            className="mt-3 inline-block text-brand-700 hover:underline"
          >
            {locale === 'bn' ? a.titleBn : a.title}
          </Link>
        </Card>
      ))}
    </>
  );
}
