'use client';
import { useActionState, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import {
  API_SCOPES,
  PUBLIC_FIELDS,
  INTEGRATION_EVENTS,
  type IntegrationsOverview,
} from '@gp/shared';
import { integrationChange, type IntegrationState } from '@/app/actions/integrations';
import { Banner, Card, Badge } from '@/components/ui';
const input = 'mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm';
const button =
  'rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50';
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
  const t = useTranslations('integrations'),
    e = useTranslations('errors');
  const [state, action, pending] = useActionState<IntegrationState, FormData>(
    integrationChange,
    undefined,
  );
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="op" value={op} />
      {id && <input type="hidden" name="id" value={id} />}
      {children}
      {state?.error && (
        <Banner tone="red">{state.code && e.has(state.code) ? e(state.code) : state.error}</Banner>
      )}
      {state?.ok && <Banner tone="green">{t('saved')}</Banner>}
      {state?.secret && (
        <Banner tone="amber">
          <p>{t('secretOnce')}</p>
          {state.clientId && <p className="break-all font-mono text-xs">{state.clientId}</p>}
          {state.keyId && (
            <p className="break-all font-mono text-xs">
              {t('keyId')}: {state.keyId}
            </p>
          )}
          <textarea
            aria-label={t('oneTimeSecret')}
            readOnly
            className={`${input} font-mono`}
            value={state.secret}
            rows={2}
          />
        </Banner>
      )}
      <button disabled={pending} className={button}>
        {label}
      </button>
    </form>
  );
}
function ClientForm({
  data,
  client,
}: {
  data: IntegrationsOverview;
  client?: IntegrationsOverview['clients'][number];
}) {
  const t = useTranslations('integrations');
  const [scope, setScope] = useState(client?.scope ?? 'none');
  return (
    <Change op="client" id={client?.id} label={t(client ? 'saveClient' : 'createClient')}>
      {client && <input type="hidden" name="version" value={client.version} />}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          {t('name')}
          <input
            className={input}
            name="name"
            defaultValue={client?.name}
            required
            minLength={2}
            maxLength={100}
          />
        </label>
        <label className="text-sm">
          {t('owner')}
          <select
            aria-label={t('owner')}
            className={input}
            name="ownerId"
            required
            defaultValue={client?.ownerId ?? ''}
          >
            <option value="">{t('chooseOwner')}</option>
            {data.owners.map((u) => (
              <option value={u.id} key={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          {t('days')}
          <input
            name="days"
            type="number"
            min={1}
            max={365}
            defaultValue={client?.daysRemaining ?? 90}
            className={input}
            required
          />
        </label>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t('scopes')}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {API_SCOPES.map((s) => (
            <label className="flex gap-2 text-sm" key={s}>
              <input
                type="checkbox"
                name="scopeKey"
                value={s}
                defaultChecked={client?.scopes.includes(s)}
              />
              {t(`scopeNames.${s.replace(':', '_')}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t('fields')}</legend>
        <p className="mb-2 text-xs text-slate-500">{t('fieldsHint')}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {PUBLIC_FIELDS.map((f) => (
            <label key={f} className="flex gap-2 text-sm">
              <input
                type="checkbox"
                name="field"
                value={f}
                defaultChecked={client?.fields.includes(f)}
              />
              {t(`fieldNames.${f}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm">
        {t('companyScope')}
        <select
          aria-label={t('companyScope')}
          className={input}
          name="scope"
          value={scope}
          onChange={(e) => setScope(e.target.value as typeof scope)}
        >
          <option value="none">{t('none')}</option>
          <option value="selected">{t('selected')}</option>
          <option value="all">{t('all')}</option>
        </select>
      </label>
      {scope === 'selected' && (
        <div className="grid gap-2 sm:grid-cols-2">
          {data.companies.map((c) => (
            <label key={c.id} className="flex gap-2 text-sm">
              <input
                type="checkbox"
                name="companyId"
                value={c.id}
                defaultChecked={client?.companyIds.includes(c.id)}
              />
              {c.name}
            </label>
          ))}
        </div>
      )}
    </Change>
  );
}
export function IntegrationsConsole({ data }: { data: IntegrationsOverview }) {
  const t = useTranslations('integrations');
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-1 text-slate-600">{t('intro')}</p>
      </header>
      <Card title={t('confirm')}>
        <p className="mb-3 text-sm text-slate-600">
          {t('mfaHint')}{' '}
          <Link href="/workspace/account" className="underline">
            {t('account')}
          </Link>
        </p>
        <Change op="mfa" label={t('confirm')}>
          <label className="block max-w-sm text-sm">
            {t('code')}
            <input
              name="code"
              className={input}
              autoComplete="one-time-code"
              required
              maxLength={40}
            />
          </label>
        </Change>
      </Card>
      <Card title={t('contract')}>
        <p className="text-sm text-slate-600">{t('contractHint')}</p>
        <dl className="mt-3 space-y-2 break-all text-sm">
          <div>
            <dt className="font-medium">{t('tokenEndpoint')}</dt>
            <dd>{data.endpoints.token}</dd>
          </div>
          <div>
            <dt className="font-medium">{t('apiEndpoint')}</dt>
            <dd>{data.endpoints.api}</dd>
          </div>
        </dl>
        <a
          className="mt-3 inline-block text-sm underline"
          href={data.endpoints.openapi}
          target="_blank"
          rel="noreferrer"
        >
          {t('openapi')}
        </a>
      </Card>
      <Card title={t('newClient')}>
        <p className="mb-4 text-sm text-slate-600">{t('ownerHint')}</p>
        <ClientForm data={data} />
      </Card>
      <Card title={t('clients')}>
        <div className="space-y-4">
          {!data.clients.length && <p className="text-sm text-slate-500">{t('noClients')}</p>}
          {data.clients.map((c) => (
            <section key={c.id} className="rounded-xl border p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{c.name}</h3>
                <Badge
                  tone={c.revoked || c.expired ? 'slate' : c.reviewRequired ? 'amber' : 'green'}
                >
                  {t(
                    c.revoked
                      ? 'revoked'
                      : c.expired
                        ? 'expired'
                        : c.reviewRequired
                          ? 'reviewRequired'
                          : 'active',
                  )}
                </Badge>
              </div>
              <p className="mb-1 break-all font-mono text-xs">{c.clientId}</p>
              <p className="mb-3 text-xs text-slate-500">
                {t('expires')}: {c.expiresAt.slice(0, 10)} ·{' '}
                {data.owners.find((o) => o.id === c.ownerId)?.name ?? t('ownerUnavailable')}
              </p>
              <p className="text-sm">
                {c.scopes.map((s) => t(`scopeNames.${s.replace(':', '_')}`)).join(' · ')}
              </p>
              <p className="mb-3 text-sm">
                {c.scope === 'all'
                  ? t('all')
                  : c.scope === 'none'
                    ? t('none')
                    : c.companyIds
                        .map(
                          (id) => data.companies.find((company) => company.id === id)?.name ?? id,
                        )
                        .join(', ')}
              </p>
              {!c.revoked && (
                <>
                  <details className="my-4">
                    <summary className="cursor-pointer text-sm font-medium">
                      {t('editReview')}
                    </summary>
                    <div className="mt-4">
                      <ClientForm data={data} client={c} />
                    </div>
                  </details>
                  <details className="my-4">
                    <summary className="cursor-pointer text-sm font-medium">
                      {t('rotateClient')}
                    </summary>
                    <div className="mt-3">
                      <Change op="rotate-client" id={c.id} label={t('rotateClient')}>
                        <label className="text-sm">
                          {t('overlap')}
                          <input
                            className={input}
                            name="overlapSeconds"
                            type="number"
                            min={0}
                            max={3600}
                            defaultValue={300}
                          />
                        </label>
                      </Change>
                    </div>
                  </details>
                  <div className="my-3 space-y-2">
                    {c.credentials.map((k) => (
                      <div
                        key={k.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-xs"
                      >
                        <span>
                          {k.id.slice(0, 8)} · {k.expiresAt.replace('T', ' ').slice(0, 19)} UTC
                        </span>
                        {k.revoked ? (
                          <span>{t('revoked')}</span>
                        ) : (
                          <Change op="revoke-credential" id={k.id} label={t('revokeCredential')} />
                        )}
                      </div>
                    ))}
                  </div>
                  <Change op="revoke-client" id={c.id} label={t('revokeClient')} />
                </>
              )}
            </section>
          ))}
        </div>
      </Card>
      <Card title={t('webhooks')}>
        <p className="mb-3 text-sm text-slate-600">{t('webhookHint')}</p>
        <Change op="webhook" label={t('createWebhook')}>
          <label className="block text-sm">
            {t('client')}
            <select name="clientId" className={input} aria-label={t('client')} required>
              <option value="">{t('chooseClient')}</option>
              {data.clients
                .filter((c) => !c.revoked && !c.expired && !c.reviewRequired)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="block text-sm">
            {t('name')}
            <input name="name" className={input} required maxLength={100} />
          </label>
          <label className="block text-sm">
            {t('receiverUrl')}
            <input
              name="url"
              type="url"
              className={input}
              required
              placeholder="https://receiver.example/events"
            />
          </label>
          <fieldset>
            <legend className="text-sm font-medium">{t('events')}</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {INTEGRATION_EVENTS.map((e) => (
                <label key={e} className="flex gap-2 text-sm">
                  <input type="checkbox" name="event" value={e} />
                  {t(`eventNames.${e.replaceAll('.', '_')}`)}
                </label>
              ))}
            </div>
          </fieldset>
        </Change>
        <div className="mt-5 space-y-4">
          {data.subscriptions.map((s) => (
            <section className="rounded-xl border p-4" key={s.id}>
              <h3 className="font-medium">
                {s.name} · {t(s.enabled ? 'enabled' : 'disabled')}
              </h3>
              <p className="my-2 break-all text-xs">{s.url}</p>
              <p className="mb-3 text-xs text-slate-500">
                {t('keyId')}: {s.keyId} · {t('failures')}: {s.failureCount}
              </p>
              <div className="flex flex-wrap gap-3">
                <Change op="webhook-state" id={s.id} label={t(s.enabled ? 'disable' : 'enable')}>
                  <input type="hidden" name="enabled" value={String(!s.enabled)} />
                </Change>
                <Change op="rotate-webhook" id={s.id} label={t('prepareKey')} />
                {s.pendingKeyId && (
                  <Change op="activate-webhook" id={s.id} label={t('activateKey')} />
                )}
              </div>
            </section>
          ))}
        </div>
      </Card>
      <Card title={t('deliveryHealth')}>
        <div className="mb-4 flex flex-wrap gap-4 text-sm">
          <span>
            {t('pending')}: {data.queue.pending}
          </span>
          <span>
            {t('dead')}: {data.queue.dead}
          </span>
          <span>
            {t('oldest')}: {data.queue.oldestAt ? String(data.queue.oldestAt) : '—'}
          </span>
        </div>
        <p className="mb-3 text-sm">
          {t('outbox')}: {data.queue.outboxPending} · {t('worker')}:{' '}
          {data.worker.heartbeatAt
            ? `${t(data.worker.stale ? 'workerLate' : 'workerFresh')} (${data.worker.heartbeatAt})`
            : t('workerNever')}{' '}
          · {t('workerFailures')}: {data.worker.failures}
        </p>
        <p className="mb-3 text-sm text-slate-500">{t('deliveryHint')}</p>
        <div className="overflow-auto">
          <table className="w-full text-start text-sm">
            <thead>
              <tr>
                <th>{t('event')}</th>
                <th>{t('state')}</th>
                <th>{t('attempts')}</th>
                <th>{t('nextAttempt')}</th>
              </tr>
            </thead>
            <tbody>
              {data.deliveries.map((d) => (
                <tr className="border-t align-top" key={d.id}>
                  <td className="py-3 pe-3">
                    {t(`eventNames.${d.type.replaceAll('.', '_')}`)}
                    <p className="font-mono text-xs text-slate-500">{d.eventId.slice(0, 8)}</p>
                  </td>
                  <td className="py-3 pe-3">
                    {t(`states.${d.state}`)}
                    {d.lastStatus && <p className="text-xs">HTTP {d.lastStatus}</p>}
                  </td>
                  <td className="py-3 pe-3">{d.attempts}</td>
                  <td className="py-3">
                    {d.nextAttemptAt.replace('T', ' ').slice(0, 19)} UTC
                    {['dead', 'suppressed'].includes(d.state) && (
                      <div className="mt-2">
                        <Change op="replay" id={d.id} label={t('replay')}>
                          <label className="text-xs">
                            {t('reason')}
                            <input
                              name="reason"
                              className={input}
                              minLength={10}
                              maxLength={500}
                              required
                            />
                          </label>
                        </Change>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title={t('audit')}>
        <p className="mb-3 text-sm text-slate-500">{t('auditHint')}</p>
        <ul className="max-h-72 space-y-2 overflow-auto text-sm">
          {data.events.map((e) => (
            <li className="border-b pb-2" key={e.id}>
              {t.has(`actions.${e.action.replaceAll('.', '_')}`)
                ? t(`actions.${e.action.replaceAll('.', '_')}`)
                : t('changed')}
              <span className="ms-2 text-xs text-slate-500">
                {data.owners.find((u) => u.id === e.actorId)?.name ?? t('ownerUnavailable')} ·{' '}
                {e.createdAt.replace('T', ' ').slice(0, 19)} UTC
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
