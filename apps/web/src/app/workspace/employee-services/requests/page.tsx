import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { EmployeeServicesMe, HrRequestView, TenantAccessView } from '@gp/shared';
import { RequestForm } from '@/components/employee-services/forms';
import { RequestList, ServiceHead } from '@/components/employee-services/views';
import { Banner, Card } from '@/components/ui';
import { serviceData } from '@/lib/employee-services';
export default async function RequestsPage() {
  const me = await serviceData<EmployeeServicesMe>('/employee-services/me'),
    t = await getTranslations('services'),
    access = await serviceData<TenantAccessView>('/access');
  const queue = me.manage
    ? await serviceData<HrRequestView[]>('/employee-services/requests?scope=all')
    : [];
  return (
    <>
      <ServiceHead area="services" manage={me.manage} />
      <Banner tone="amber">
        {t('requestPrivacy')}{' '}
        <Link href={`/speak-up/${access.tenant.slug}`} className="underline">
          {t('grievances')}
        </Link>
      </Banner>
      {me.employee ? (
        <details className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <summary className="cursor-pointer font-semibold">{t('newRequest')}</summary>
          <div className="mt-4">
            <RequestForm />
          </div>
        </details>
      ) : (
        <Banner tone="amber">{t('noEmployee')}</Banner>
      )}
      <Card title={t('myRequests')}>
        <RequestList requests={me.requests} />
      </Card>
      {me.manage && (
        <Card title={t('allRequests')}>
          <RequestList requests={queue} />
        </Card>
      )}
    </>
  );
}
