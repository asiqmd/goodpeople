import { FEATURE_KEYS, LIMIT_KEYS, type LegalEntityView, type TenantAccessView } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import { ACCESS_TONE, Badge, BILLING_TONE, Card } from '@/components/ui';
import { load } from '@/lib/api';

export default async function WorkspaceHome() {
  const t = await getTranslations('workspace');
  const tc = await getTranslations('common');
  const tb = await getTranslations('billingModes');
  const ta = await getTranslations('accessStates');
  const tf = await getTranslations('features');
  const tl = await getTranslations('limits');
  const format = await getFormatter();
  const limit = (value: number | null) => (value === null ? tc('unlimited') : format.number(value));

  // The layout has already handled a suspended workspace.
  const { tenant, access } = await load<TenantAccessView>('tenant', '/tenant/access');
  const entities = access.features.includes('core_hr')
    ? await load<LegalEntityView[]>('tenant', '/tenant/legal-entities')
    : [];

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('plan')}</p>
          <p className="mt-1 text-lg font-semibold capitalize">{tenant.planCode}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t('billing')}
          </p>
          <p className="mt-2">
            <Badge tone={BILLING_TONE[tenant.billingMode]}>{tb(tenant.billingMode)}</Badge>
          </p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t('access')}
          </p>
          <p className="mt-2">
            <Badge tone={ACCESS_TONE[access.accessState]}>{ta(access.accessState)}</Badge>
          </p>
        </Card>
      </div>

      <Card title={t('modules')}>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURE_KEYS.map((feature) => {
            const enabled = access.features.includes(feature);
            return (
              <li
                key={feature}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ring-1 ring-inset ${
                  enabled ? 'ring-brand-600/20' : 'bg-slate-50 text-slate-400 ring-slate-200'
                }`}
              >
                <span>{tf(feature)}</span>
                <span className="text-xs">{enabled ? `✓ ${t('enabled')}` : t('locked')}</span>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={t('legalEntities')}>
          {entities.length === 0 ? (
            <p className="text-sm text-slate-500">{t('noEntities')}</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {entities.map((e) => (
                <li key={e.id} className="py-2">
                  {e.name}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={t('limits')}>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            {LIMIT_KEYS.map((key) => (
              <div key={key} className="contents">
                <dt className="text-slate-500">{tl(key)}</dt>
                <dd className="text-right font-medium">{limit(access.limits[key])}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </>
  );
}
