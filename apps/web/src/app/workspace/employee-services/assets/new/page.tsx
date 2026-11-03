import { getTranslations } from 'next-intl/server';
import { AssetForm } from '@/components/employee-services/forms';
import { ServiceHead } from '@/components/employee-services/views';
import { Card } from '@/components/ui';
import { serviceOrg } from '@/lib/employee-services';
export default async function NewAssetPage() {
  const org = await serviceOrg('employee_services.manage'),
    t = await getTranslations('services');
  return (
    <>
      <ServiceHead area="services" manage title={t('newAsset')} />
      <Card>
        <AssetForm org={org} />
      </Card>
    </>
  );
}
