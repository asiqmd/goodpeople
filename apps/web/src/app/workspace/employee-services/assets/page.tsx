import { getTranslations } from 'next-intl/server';
import type { EmployeeServicesMe } from '@gp/shared';
import { IssueCards, ServiceHead } from '@/components/employee-services/views';
import { Banner } from '@/components/ui';
import { serviceData } from '@/lib/employee-services';
export default async function AssetsPage() {
  const me = await serviceData<EmployeeServicesMe>('/employee-services/me'),
    t = await getTranslations('services');
  return (
    <>
      <ServiceHead area="services" manage={me.manage} />
      <Banner tone="amber">{t('assetNote')}</Banner>
      <IssueCards issues={me.issues} />
    </>
  );
}
