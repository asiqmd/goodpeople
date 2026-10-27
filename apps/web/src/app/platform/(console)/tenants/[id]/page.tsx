import {
  LIMIT_KEYS,
  type AuditEntry,
  type PlanDefinition,
  type TenantWithAccess,
} from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { AuditTable } from '@/components/audit-table';
import { BillingForm, GrantForm } from '@/components/platform-forms';
import { SupportAccessCard } from '@/components/support/access-card';
import { ACCESS_TONE, Badge, BILLING_TONE, Card } from '@/components/ui';
import { load } from '@/lib/api';

export default async function TenantPage({ params }: PageProps<'/platform/tenants/[id]'>) {
  const { id } = await params;
  const [tenant, plans, audit] = await Promise.all([
    load<TenantWithAccess>('platform', `/platform/tenants/${id}`),
    load<PlanDefinition[]>('platform', '/platform/plans'),
    load<AuditEntry[]>('platform', `/platform/audit?tenantId=${id}`),
  ]);
  const t = await getTranslations('platform');
  const tb = await getTranslations('billingModes');
  const ta = await getTranslations('accessStates');
  const tr = await getTranslations('reasons');
  const tf = await getTranslations('features');
  const tl = await getTranslations('limits');
  const tc = await getTranslations('common');
  const format = await getFormatter();
  const limit = (value: number | null) => (value === null ? tc('unlimited') : format.number(value));

  return (
    <>
      <div>
        <Link href="/platform" className="text-sm text-slate-500 hover:text-slate-900">
          ← {t('backToTenants')}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{tenant.name}</h1>
          <Badge tone={BILLING_TONE[tenant.billingMode]}>{tb(tenant.billingMode)}</Badge>
          <Badge tone={ACCESS_TONE[tenant.access.accessState]}>
            {ta(tenant.access.accessState)}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {tenant.slug} · {tr(tenant.access.reason)} ·{' '}
          {tenant.access.subscriptionChecked ? t('subscriptionChecked') : t('subscriptionBypassed')}
        </p>
        {tenant.bypassReason && (
          <p className="mt-1 text-sm text-slate-600">
            {t('bypassReason')}: {tenant.bypassReason}
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title={t('access')} className="lg:col-span-1">
          <ul className="space-y-1 text-sm">
            {tenant.access.features.map((f) => (
              <li key={f}>✓ {tf(f)}</li>
            ))}
          </ul>
          <dl className="mt-4 grid grid-cols-2 gap-y-1 border-t border-slate-100 pt-4 text-sm">
            {LIMIT_KEYS.map((key) => (
              <div key={key} className="contents">
                <dt className="text-slate-500">{tl(key)}</dt>
                <dd className="text-right font-medium">{limit(tenant.access.limits[key])}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card title={t('changeBilling')} className="lg:col-span-1">
          <BillingForm tenant={tenant} plans={plans} />
        </Card>
        <Card title={t('addGrant')} className="lg:col-span-1">
          <GrantForm tenantId={tenant.id} />
        </Card>
      </div>

      <SupportAccessCard tenantId={tenant.id} />

      <Card title={t('audit')}>
        <AuditTable entries={audit} showTenant={false} />
      </Card>
    </>
  );
}
