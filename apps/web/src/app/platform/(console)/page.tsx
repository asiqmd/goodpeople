import type { PlanDefinition, TenantWithAccess } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AssignCompanyDialog } from '@/components/platform-forms';
import { ACCESS_TONE, Badge, BILLING_TONE, Card } from '@/components/ui';
import { load } from '@/lib/api';

export default async function TenantsPage() {
  const [tenants, plans] = await Promise.all([
    load<TenantWithAccess[]>('platform', '/platform/tenants'),
    load<PlanDefinition[]>('platform', '/platform/plans'),
  ]);
  const t = await getTranslations('platform');
  const tb = await getTranslations('billingModes');
  const ta = await getTranslations('accessStates');
  const tr = await getTranslations('reasons');
  const tc = await getTranslations('common');
  const format = await getFormatter();

  return (
    <Card title={t('tenants')} action={<AssignCompanyDialog plans={plans} />}>
      <div className="-mx-5 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-start text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-2 font-medium">{t('company')}</th>
              <th className="px-5 py-2 font-medium">{t('billingMode')}</th>
              <th className="px-5 py-2 font-medium">{t('plan')}</th>
              <th className="px-5 py-2 font-medium">{t('access')}</th>
              <th className="px-5 py-2 font-medium">{t('expires')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tenants.map((tenant) => (
              <tr key={tenant.id} className="hover:bg-slate-50">
                <td className="px-5 py-3">
                  <Link
                    href={`/platform/tenants/${tenant.id}`}
                    className="font-medium text-slate-900 hover:underline"
                  >
                    {tenant.name}
                  </Link>
                  <div className="text-xs text-slate-500">{tenant.slug}</div>
                </td>
                <td className="px-5 py-3">
                  <Badge tone={BILLING_TONE[tenant.billingMode]}>{tb(tenant.billingMode)}</Badge>
                  <div className="mt-1 text-xs text-slate-500">
                    {tenant.access.subscriptionChecked
                      ? t('subscriptionChecked')
                      : t('subscriptionBypassed')}
                  </div>
                </td>
                <td className="px-5 py-3 capitalize">{tenant.planCode}</td>
                <td className="px-5 py-3">
                  <Badge tone={ACCESS_TONE[tenant.access.accessState]}>
                    {ta(tenant.access.accessState)}
                  </Badge>
                  <div className="mt-1 text-xs text-slate-500">{tr(tenant.access.reason)}</div>
                </td>
                <td className="px-5 py-3 text-slate-600">
                  {tenant.accessExpiresAt
                    ? format.dateTime(new Date(tenant.accessExpiresAt), { dateStyle: 'medium' })
                    : tc('never')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
