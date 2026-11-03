import { getLocale, getTranslations } from 'next-intl/server';
import type { AssetView } from '@gp/shared';
import { IssueForm, ReasonAction, ReturnForm } from '@/components/employee-services/forms';
import { IssueCards, ServiceHead } from '@/components/employee-services/views';
import { Card } from '@/components/ui';
import { serviceData } from '@/lib/employee-services';
export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params,
    a = await serviceData<AssetView>(`/employee-services/assets/${id}`),
    t = await getTranslations('services'),
    locale = await getLocale(),
    outstanding = a.issues.find((i) => !i.returnedOn);
  return (
    <>
      <ServiceHead
        area="services"
        manage
        title={`${a.tag} · ${locale === 'bn' ? a.nameBn : a.name}`}
      />
      <Card>
        <p>
          {a.company.name} · {t(`kinds.${a.kind}`)} · {a.serialNumber}
        </p>
        <p>{a.retiredAt ? t('states.retired') : outstanding ? t('issued') : t('available')}</p>
      </Card>
      {!a.retiredAt && !outstanding && (
        <Card title={t('issueAsset')}>
          <IssueForm id={id} />
        </Card>
      )}
      {outstanding && (
        <Card title={t('returnAsset')}>
          <ReturnForm id={outstanding.id} />
        </Card>
      )}
      <h2 className="text-lg font-semibold">{t('history')}</h2>
      <IssueCards issues={a.issues} />
      {!a.retiredAt && !outstanding && (
        <Card title={t('retire')}>
          <ReasonAction kind="retireAsset" id={id} label={t('retire')} />
        </Card>
      )}
    </>
  );
}
