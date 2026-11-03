import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import type { AssetView } from '@gp/shared';
import { ServiceHead } from '@/components/employee-services/views';
import { Card, buttonClass } from '@/components/ui';
import { serviceData } from '@/lib/employee-services';
export default async function InventoryPage() {
  const assets = await serviceData<AssetView[]>('/employee-services/assets'),
    t = await getTranslations('services'),
    locale = await getLocale();
  return (
    <>
      <ServiceHead area="services" manage title={t('inventory')} />
      <Link href="/workspace/employee-services/assets/new" className={buttonClass.primary}>
        {t('newAsset')}
      </Link>
      {!assets.length && <p>{t('empty')}</p>}
      {assets.map((a) => (
        <Card key={a.id} title={`${a.tag} · ${locale === 'bn' ? a.nameBn : a.name}`}>
          <p>
            {a.company.name} · {t(`kinds.${a.kind}`)} ·{' '}
            {a.retiredAt
              ? t('states.retired')
              : a.issues.some((i) => !i.returnedOn)
                ? t('issued')
                : t('available')}
          </p>
          {a.issues.some((i) => i.overdue) && <p className="text-red-700">{t('overdue')}</p>}
          <Link
            href={`/workspace/employee-services/assets/${a.id}`}
            className="mt-3 inline-block text-brand-700 hover:underline"
          >
            {t('history')}
          </Link>
        </Card>
      ))}
    </>
  );
}
