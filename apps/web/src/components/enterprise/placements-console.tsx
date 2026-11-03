'use client';
import { useActionState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import type { PlacementView } from '@gp/shared';
import { placementChange, type PlacementState } from '@/app/actions/placements';
import { Card, Banner, Badge } from '@/components/ui';
const input = 'mt-1 block w-full rounded-lg border border-slate-300 p-2 text-sm';
function Change({
  op,
  id,
  label,
  children,
}: {
  op: string;
  id?: string;
  label: string;
  children?: ReactNode;
}) {
  const t = useTranslations('placements'),
    e = useTranslations('errors'),
    [state, action, pending] = useActionState<PlacementState, FormData>(placementChange, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="op" value={op} />
      {id && <input type="hidden" name="id" value={id} />} {children}
      {state?.error && (
        <Banner tone="red">{state.code && e.has(state.code) ? e(state.code) : state.error}</Banner>
      )}
      {state?.ok && <Banner tone="green">{t('saved')}</Banner>}
      {state?.details && (
        <label className="block text-sm">
          {t('challengeDetails')}
          <textarea
            className={input + ' font-mono text-xs'}
            rows={8}
            readOnly
            value={state.details}
          />
        </label>
      )}
      <button
        disabled={pending}
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {label}
      </button>
    </form>
  );
}
export function PlacementsConsole({ rows }: { rows: PlacementView[] }) {
  const t = useTranslations('placements');
  const field = (key: string, type = 'text') => (
    <label key={key} className="block text-sm">
      {t(key)}
      <input name={key} type={type} required className={input} />
    </label>
  );
  const reason = (
    <label className="block text-sm">
      {t('reason')}
      <textarea name="reason" required minLength={10} maxLength={500} className={input} />
    </label>
  );
  return (
    <>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p>{t('intro')}</p>
      <Card title={t('mfa')}>
        <Change op="mfa" label={t('confirm')}>
          {field('code')}
        </Change>
      </Card>
      <Card title={t('new')}>
        <p className="mb-4 text-sm text-slate-600">{t('newHint')}</p>
        <Change op="create" label={t('create')}>
          <div className="grid gap-3 sm:grid-cols-2">
            {['name', 'slug', 'customerId', 'installationId', 'region', 'routeKey'].map((key) =>
              field(key),
            )}
            {field('apiOrigin', 'url')}
            {field('webOrigin', 'url')}
          </div>
          <label className="block text-sm">
            {t('proofPublicKey')}
            <textarea name="proofPublicKey" required className={input + ' font-mono'} rows={4} />
          </label>
          <fieldset>
            <legend className="font-medium">{t('residency')}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                'primary',
                'replicas',
                'backups',
                'logs',
                'support',
                'notifications',
                'integrations',
              ].map((key) => (
                <label className="block text-sm" key={key}>
                  {t('residencyNames.' + key)}
                  <input
                    name={'residency_' + key}
                    className={input}
                    required
                    minLength={2}
                    maxLength={500}
                  />
                </label>
              ))}
            </div>
          </fieldset>
          {reason}
        </Change>
      </Card>
      <Card title={t('registry')}>
        <div className="space-y-5">
          {rows.map((p) => (
            <section className="rounded-xl border p-4" key={p.id}>
              <h3 className="font-semibold">
                {p.routeKey}{' '}
                <Badge tone={p.status === 'active' ? 'green' : 'slate'}>
                  {t('states.' + p.status)}
                </Badge>
              </h3>
              <dl className="my-3 grid gap-1 text-sm">
                <dt>{t('installationId')}</dt>
                <dd className="break-all font-mono">{p.installationId}</dd>
                <dt>{t('tenantId')}</dt>
                <dd className="break-all font-mono">{p.tenantId}</dd>
                <dt>{t('region')}</dt>
                <dd>{p.region}</dd>
                <dt>{t('webOrigin')}</dt>
                <dd>{p.webOrigin}</dd>
                <dt>{t('apiOrigin')}</dt>
                <dd>{p.apiOrigin}</dd>
              </dl>
              <details className="my-3 text-sm">
                <summary>{t('residency')}</summary>
                {Object.entries(p.residency).map(([key, value]) => (
                  <p key={key}>
                    {t('residencyNames.' + key)}: {value}
                  </p>
                ))}
              </details>
              {p.status !== 'active' ? (
                <>
                  <details className="my-3">
                    <summary>{t('challenge')}</summary>
                    <Change op="challenge" id={p.id} label={t('challenge')}>
                      {reason}
                    </Change>
                  </details>
                  <details className="my-3">
                    <summary>{t('activate')}</summary>
                    <p className="mb-3 text-sm">{t('receiptHint')}</p>
                    <Change op="activate" id={p.id} label={t('activate')}>
                      <label className="block text-sm">
                        {t('receipt')}
                        <textarea
                          name="receipt"
                          required
                          maxLength={16000}
                          className={input + ' font-mono text-xs'}
                          rows={5}
                        />
                      </label>
                      {reason}
                    </Change>
                  </details>
                </>
              ) : (
                <Change op="disable" id={p.id} label={t('disable')}>
                  {reason}
                </Change>
              )}
            </section>
          ))}
        </div>
      </Card>
    </>
  );
}
