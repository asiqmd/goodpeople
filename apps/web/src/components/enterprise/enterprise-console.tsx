'use client';
import { useActionState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { EnterpriseOverview } from '@gp/shared';
import {
  enterpriseChange,
  claimInstallation,
  type EnterpriseState,
} from '@/app/actions/enterprise';
import { Card, Banner, Badge } from '@/components/ui';
const input = 'mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm';
function Change({ op, label, children }: { op: string; label: string; children?: ReactNode }) {
  const t = useTranslations('enterprise'),
    e = useTranslations('errors');
  const [state, action, pending] = useActionState<EnterpriseState, FormData>(
    enterpriseChange,
    undefined,
  );
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="op" value={op} />
      {children}
      {state?.error && (
        <Banner tone="red">{state.code && e.has(state.code) ? e(state.code) : state.error}</Banner>
      )}
      {state?.ok && <Banner tone="green">{t('saved')}</Banner>}
      {state?.diagnostics && (
        <label className="block text-sm">
          {t('diagnosticOutput')}
          <textarea
            className={input + ' font-mono text-xs'}
            rows={14}
            readOnly
            value={state.diagnostics}
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
export function EnterpriseConsole({ data }: { data: EnterpriseOverview }) {
  const t = useTranslations('enterprise'),
    tf = useTranslations('features'),
    tl = useTranslations('limits');
  return (
    <>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      <p className="text-sm text-slate-600">{t('intro')}</p>
      <Card title={t('installation')}>
        <dl className="grid gap-2 text-sm">
          <dt>{t('deployment')}</dt>
          <dd>{t('modes.' + data.mode)}</dd>
          <dt>{t('release')}</dt>
          <dd>{data.release}</dd>
          {data.installationId && (
            <>
              <dt>{t('installationId')}</dt>
              <dd className="break-all font-mono">{data.installationId}</dd>
            </>
          )}
        </dl>
      </Card>
      {data.mode === 'managed' ? (
        <Card title={t('managedTitle')}>
          <p>{t('managedHint')}</p>
        </Card>
      ) : (
        <>
          <Card title={t('mfa')}>
            <p className="mb-3 text-sm">{t('mfaHint')}</p>
            <Change op="mfa" label={t('confirm')}>
              <label className="block text-sm">
                {t('code')}
                <input name="code" required autoComplete="one-time-code" className={input} />
              </label>
            </Change>
          </Card>
          {data.license && (
            <Card title={t('license')}>
              <Badge tone={data.license.state === 'valid' ? 'green' : 'amber'}>
                {t('states.' + data.license.state)}
              </Badge>
              <dl className="my-4 grid gap-2 text-sm">
                <dt>{t('customer')}</dt>
                <dd>{data.license.customer ?? '—'}</dd>
                <dt>{t('licenseId')}</dt>
                <dd className="font-mono">{data.license.licenseId ?? '—'}</dd>
                <dt>{t('sequence')}</dt>
                <dd>{data.license.sequence}</dd>
                <dt>{t('expires')}</dt>
                <dd>{data.license.expiresAt ?? '—'}</dd>
                <dt>{t('grace')}</dt>
                <dd>{data.license.graceEndsAt ?? '—'}</dd>
              </dl>
              <p className="mb-4 text-sm">{t('expiryHint')}</p>
              {data.license.lastImportError && (
                <Banner tone="amber">
                  {t('lastRejected')}: {data.license.lastImportError}
                </Banner>
              )}
              <Change op="license" label={t('importLicense')}>
                <label className="block text-sm">
                  {t('signedLicense')}
                  <textarea
                    name="envelope"
                    className={input + ' font-mono text-xs'}
                    rows={4}
                    required
                    maxLength={24000}
                  />
                </label>
              </Change>
              <details className="mt-5 text-sm">
                <summary>{t('approvedEntitlements')}</summary>
                <ul className="mt-2 list-inside list-disc">
                  {data.license.features.map((feature) => (
                    <li key={feature}>{tf(feature)}</li>
                  ))}
                </ul>
                {Object.entries(data.license.limits).map(([key, value]) => (
                  <p key={key}>
                    {tl(key)}: {value ?? t('unlimited')}
                  </p>
                ))}
              </details>
            </Card>
          )}
          {data.license?.clockRollback && (
            <Card title={t('clock')}>
              <p className="mb-4 text-sm">{t('clockHint')}</p>
              <Change op="clock" label={t('acknowledgeClock')} />
            </Card>
          )}
          {data.license?.state === 'recovery_pending' && (
            <Card title={t('recovery')}>
              <p className="mb-4 text-sm">{t('recoveryHint')}</p>
              <Change op="recovery" label={t('acknowledgeRecovery')}>
                <label className="block text-sm">
                  {t('reason')}
                  <textarea
                    name="reason"
                    required
                    minLength={20}
                    maxLength={1000}
                    className={input}
                  />
                </label>
                <label className="flex gap-2 text-sm">
                  <input type="checkbox" name="reconciled" required />
                  {t('reconciled')}
                </label>
              </Change>
            </Card>
          )}
          <Card title={t('diagnostics')}>
            <p className="mb-4 text-sm">{t('diagnosticsHint')}</p>
            <Change op="diagnostics" label={t('generateDiagnostics')} />
          </Card>
          <Card title={t('audit')}>
            <ul className="space-y-2 text-sm">
              {data.events.map((event, index) => (
                <li key={event.createdAt + index}>
                  <span>
                    {t.has('events.' + event.action) ? t('events.' + event.action) : event.action}
                  </span>
                  <span className="ms-2 text-slate-500">
                    {event.createdAt.replace('T', ' ').slice(0, 19)} UTC
                    {event.code ? ' · ' + event.code : ''}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <p className="text-sm text-slate-500">{t('operatorHint')}</p>
        </>
      )}
    </>
  );
}
export function InstallationClaim() {
  const t = useTranslations('enterprise'),
    e = useTranslations('errors');
  const [state, action, pending] = useActionState<EnterpriseState, FormData>(
    claimInstallation,
    undefined,
  );
  return (
    <Card title={t('activate')}>
      <p className="mb-4 text-sm">{t('activationHint')}</p>
      {state?.ok ? (
        <Banner tone="green">
          {t('activated')}{' '}
          <Link href="/login" className="underline">
            {t('signIn')}
          </Link>
        </Banner>
      ) : (
        <form action={action} className="space-y-4">
          <label className="block text-sm">
            {t('activationCode')}
            <input name="token" className={input} required autoComplete="off" />
          </label>
          <label className="block text-sm">
            {t('newPassword')}
            <input
              name="password"
              type="password"
              required
              minLength={16}
              maxLength={128}
              autoComplete="new-password"
              className={input}
            />
          </label>
          {state?.error && (
            <Banner tone="red">
              {state.code && e.has(state.code) ? e(state.code) : state.error}
            </Banner>
          )}
          <button disabled={pending} className="rounded-lg bg-brand-600 px-4 py-2 text-white">
            {t('activate')}
          </button>
        </form>
      )}
    </Card>
  );
}
