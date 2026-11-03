'use client';

import Link from 'next/link';
import { useActionState, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  ACCESS_FIELDS,
  PERMISSIONS,
  emptyFieldPolicy,
  policyCan,
  policyField,
  type AccessRoleView,
  type IdentityOverview,
} from '@gp/shared';
import {
  identityChange,
  startSso,
  findIdentityEmployees,
  type IdentityState,
} from '@/app/actions/identity';
import { Badge, Banner, Card } from '@/components/ui';

const input = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
const button =
  'rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50';
function Change({
  op,
  id,
  children,
  label,
}: {
  op: string;
  id?: string;
  children?: ReactNode;
  label: string;
}) {
  const t = useTranslations('identity'),
    e = useTranslations('errors');
  const [state, action, pending] = useActionState<IdentityState, FormData>(
    identityChange,
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
      {state?.token && (
        <Banner tone="amber">
          <p>{t('tokenOnce')}</p>
          <textarea
            readOnly
            rows={3}
            aria-label={t('credential')}
            className={`${input} font-mono`}
            value={state.token}
          />
        </Banner>
      )}
      <button disabled={pending} className={button}>
        {pending ? t('saving') : label}
      </button>
    </form>
  );
}
function RoleForm({ role }: { role?: AccessRoleView }) {
  const t = useTranslations('identity'),
    fields = role?.fields ?? emptyFieldPolicy();
  return (
    <Change op="role" id={role?.id} label={t(role ? 'saveRole' : 'createRole')}>
      {role && <input type="hidden" name="version" value={role.version} />}
      <label className="block text-sm font-medium">
        {t('roleName')}
        <input className={input} name="name" required maxLength={100} defaultValue={role?.name} />
      </label>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t('permissions')}</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PERMISSIONS.filter(
            (p) => !['users.manage', 'support.manage', 'billing.manage', 'imports.run'].includes(p),
          ).map((p) => (
            <label key={p} className="flex gap-2 text-sm">
              <input
                type="checkbox"
                name="permission"
                value={p}
                defaultChecked={role?.permissions.includes(p)}
              />
              {t(`permissionsList.${p.replace('.', '_')}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <details className="rounded-lg bg-slate-50 p-3">
        <summary className="text-sm font-medium">{t('denials')}</summary>
        <p className="my-2 text-xs text-slate-600">{t('denialHint')}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {PERMISSIONS.map((p) => (
            <label key={p} className="flex gap-2 text-sm">
              <input
                type="checkbox"
                name="deniedPermission"
                value={p}
                defaultChecked={role?.deniedPermissions.includes(p)}
              />
              {t(`permissionsList.${p.replace('.', '_')}`)}
            </label>
          ))}
        </div>
      </details>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t('fields')}</legend>
        <p className="mb-3 text-xs text-slate-600">{t('fieldHint')}</p>
        <table className="w-full text-start text-sm">
          <thead>
            <tr>
              <th>{t('field')}</th>
              {(['read', 'write', 'export'] as const).map((a) => (
                <th key={a}>{t(a)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ACCESS_FIELDS.map((f) => (
              <tr key={f}>
                <td className="py-2">{t(`fieldNames.${f}`)}</td>
                {(['read', 'write', 'export'] as const).map((a) => (
                  <td key={a}>
                    <input
                      type="checkbox"
                      name={`${f}.${a}`}
                      aria-label={`${t(`fieldNames.${f}`)} ${t(a)}`}
                      defaultChecked={fields[f][a]}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </fieldset>
    </Change>
  );
}
function Scope({ companies }: { companies: IdentityOverview['companies'] }) {
  const t = useTranslations('identity'),
    [scope, setScope] = useState('none');
  return (
    <>
      <label className="block text-sm">
        {t('scope')}
        <select
          name="scope"
          className={input}
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        >
          <option value="none">{t('scopeNone')}</option>
          <option value="selected">{t('scopeSelected')}</option>
          <option value="all">{t('scopeAll')}</option>
        </select>
      </label>
      {scope === 'all' && <p className="text-xs text-amber-800">{t('futureCompanies')}</p>}
      {scope === 'selected' && (
        <div className="grid gap-2 sm:grid-cols-2">
          {companies.map((c) => (
            <label key={c.id} className="flex gap-2 text-sm">
              <input type="checkbox" name="companyId" value={c.id} />
              {c.name}
            </label>
          ))}
        </div>
      )}
    </>
  );
}
export function IdentityConsole({ data }: { data: IdentityOverview }) {
  const t = useTranslations('identity'),
    [selected, setSelected] = useState(data.users[0]?.id ?? ''),
    [company, setCompany] = useState(data.companies[0]?.id ?? '');
  const user = data.users.find((u) => u.id === selected),
    policy = { custom: true, grants: user?.grants ?? [] };
  return (
    <>
      <Card title={t('title')}>
        <p className="mb-4 text-sm text-slate-600">{t('intro')}</p>
        <Change op="step-up" label={t('confirm')}>
          <label className="block max-w-sm text-sm">
            {t('mfaCode')}
            <input
              className={input}
              name="code"
              autoComplete="one-time-code"
              required
              maxLength={32}
            />
          </label>
        </Change>
        <p className="mt-3 text-xs text-slate-500">
          {t('mfaHint')}{' '}
          <Link href="/workspace/account" className="underline">
            {t('account')}
          </Link>
        </p>
      </Card>
      <Card title={t('roles')}>
        <p className="mb-4 text-sm text-slate-600">{t('roleHint')}</p>
        <RoleForm />
        {data.roles.map((r) => (
          <details key={r.id} className="mt-4 rounded-lg border border-slate-200 p-4">
            <summary className="font-medium">
              {r.name} · {t('version', { version: r.version })}
            </summary>
            <div className="mt-4">
              <RoleForm role={r} />
            </div>
          </details>
        ))}
      </Card>
      <Card title={t('assignments')}>
        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            {t('person')}
            <select
              className={input}
              aria-label={t('person')}
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {data.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.disabled ? ` · ${t('disabled')}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            {t('previewCompany')}
            <select
              className={input}
              aria-label={t('previewCompany')}
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            >
              {data.companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {user && (
          <div key={user.id} className="space-y-4">
            <p className="text-sm">
              {t(user.accessMode === 'custom' ? 'customMode' : 'templateMode')}
            </p>
            {user.accessMode === 'custom' && (
              <div className="rounded-lg bg-slate-50 p-4">
                <h3 className="mb-2 font-medium">{t('preview')}</h3>
                <p className="mb-3 text-xs text-slate-500">{t('previewHint')}</p>
                <div className="flex flex-wrap gap-2">
                  {PERMISSIONS.filter((p) => policyCan(policy, p, company)).map((p) => (
                    <Badge key={p} tone="green">
                      {t(`permissionsList.${p.replace('.', '_')}`)}
                    </Badge>
                  ))}
                  {!PERMISSIONS.some((p) => policyCan(policy, p, company)) && (
                    <Badge tone="slate">{t('noPermissions')}</Badge>
                  )}
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  {ACCESS_FIELDS.filter((f) => policyField(policy, f, 'read'))
                    .map((f) => t(`fieldNames.${f}`))
                    .join(' · ') || t('noSensitiveFields')}
                </p>
              </div>
            )}
            {user.grants.map((g) => (
              <div
                key={g.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div>
                  <strong>{g.name}</strong>
                  <p className="text-xs text-slate-500">
                    {g.scope === 'all'
                      ? t('scopeAll')
                      : g.scope === 'none'
                        ? t('scopeNone')
                        : g.companyIds
                            .map((id) => data.companies.find((c) => c.id === id)?.name ?? id)
                            .join(', ')}{' '}
                    · {t(`relationships.${g.relationship}`)}
                  </p>
                </div>
                {g.source === 'local' ? (
                  <Change op="revoke" id={g.id} label={t('revoke')} />
                ) : (
                  <Badge tone="blue">{t('managed')}</Badge>
                )}
              </div>
            ))}
            {user.role !== 'tenant_admin' && (
              <Change op="assign" id={user.id} label={t('assign')}>
                <label className="block text-sm">
                  {t('role')}
                  <select aria-label={t('role')} name="roleId" className={input} required>
                    <option value="">{t('chooseRole')}</option>
                    {data.roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Scope companies={data.companies} />
                <label className="block text-sm">
                  {t('relationship')}
                  <select className={input} name="relationship">
                    <option value="all">{t('relationships.all')}</option>
                    <option value="own">{t('relationships.own')}</option>
                    <option value="direct_reports">{t('relationships.direct_reports')}</option>
                  </select>
                </label>
                <p className="text-xs text-slate-500">{t('relationshipHint')}</p>
              </Change>
            )}
            {user.accessMode === 'custom' && (
              <details>
                <summary className="text-sm text-slate-600">{t('restoreTemplate')}</summary>
                <p className="my-2 text-xs text-amber-800">{t('templateWarning')}</p>
                <Change op="template" id={user.id} label={t('restoreTemplate')} />
              </details>
            )}
            {user.role === 'tenant_admin' && (
              <Change
                op="emergency"
                id={user.id}
                label={t(user.emergencyLocal ? 'removeEmergency' : 'setEmergency')}
              >
                <input type="hidden" name="enabled" value={String(!user.emergencyLocal)} />
                <p className="text-sm text-slate-600">{t('emergencyHint')}</p>
                {user.emergencyLocal && <Badge tone="amber">{t('emergency')}</Badge>}
              </Change>
            )}
          </div>
        )}
      </Card>
      <Card title={t('sso')}>
        <p className="mb-4 text-sm text-slate-600">{t('ssoHint')}</p>
        <p className="mb-3 break-all text-xs text-slate-500">
          {t('callback')}: {data.endpoints.callbackUrl}
        </p>
        <ConnectionForm />
        {data.connections.map((c) => (
          <details key={c.id} className="mt-4 rounded-lg border p-4">
            <summary className="font-medium">
              {c.name} · {t(c.enforced ? 'enforced' : c.enabled ? 'enabled' : 'disabled')}
            </summary>
            <div className="mt-4 space-y-4">
              <ConnectionForm connection={c} />
              <p className="text-sm text-slate-600">
                {t('testStatus', { count: Number(!!c.testedBy) + Number(!!c.secondTestBy) })}
              </p>
              <form action={startSso}>
                <input type="hidden" name="mode" value="test" />
                <input type="hidden" name="id" value={c.id} />
                <button className={button}>{t('testConnection')}</button>
              </form>
              <Change
                op="enforcement"
                id={c.id}
                label={t(c.enforced ? 'stopEnforcement' : 'enforce')}
              >
                <input type="hidden" name="enabled" value={String(!c.enforced)} />
                <p className="text-xs text-amber-800">{t('enforcementHint')}</p>
              </Change>
            </div>
          </details>
        ))}
      </Card>
      <Card title={t('provisioning')}>
        <p className="mb-3 text-sm text-slate-600">{t('scimHint')}</p>
        <p className="mb-4 break-all text-xs text-slate-500">
          {t('scimEndpoint')}: {data.endpoints.scimUrl}
        </p>
        <Change op="credential" label={t('createCredential')}>
          <label className="block text-sm">
            {t('connection')}
            <select className={input} name="connectionId" required>
              <option value="">{t('chooseConnection')}</option>
              {data.connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            {t('credentialName')}
            <input name="name" className={input} required maxLength={100} />
          </label>
          <label className="block text-sm">
            {t('validDays')}
            <input
              className={input}
              name="days"
              type="number"
              min={1}
              max={365}
              defaultValue={90}
              required
            />
          </label>
        </Change>
        <div className="mt-4 space-y-3">
          {data.credentials.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <p className="text-sm">
                {c.name} · {c.expiresAt.slice(0, 10)}
              </p>
              {c.revoked ? (
                <Badge tone="slate">{t('revoked')}</Badge>
              ) : (
                <Change op="credential-revoke" id={c.id} label={t('revoke')} />
              )}
            </div>
          ))}
        </div>
        {data.groups.map((g) => (
          <details key={g.id} className="mt-4 rounded-lg border p-3">
            <summary>{g.displayName}</summary>
            <div className="mt-3 space-y-3">
              {g.mappings.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-3">
                  <span className="text-sm">{data.roles.find((r) => r.id === m.roleId)?.name}</span>
                  <Change op="unmap" id={m.id} label={t('revoke')} />
                </div>
              ))}
              <Change op="mapping" id={g.id} label={t('mapGroup')}>
                <label className="block text-sm">
                  {t('role')}
                  <select className={input} name="roleId" required>
                    {data.roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Scope companies={data.companies} />
              </Change>
            </div>
          </details>
        ))}
        {data.provisioned.map((p) => (
          <div key={p.id} className="mt-4 rounded-lg border p-3">
            <p className="mb-2 text-sm font-medium">
              {data.users.find((u) => u.id === p.userId)?.name}
            </p>
            {p.deleted ? (
              <Change op="restore-managed" id={p.id} label={t('restoreManaged')} />
            ) : (
              <EmployeeLink userId={p.userId} />
            )}
          </div>
        ))}
      </Card>
      <Card title={t('events')}>
        <p className="mb-3 text-sm text-slate-500">{t('eventsHint')}</p>
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-start text-sm">
            <thead>
              <tr>
                <th>{t('event')}</th>
                <th>{t('when')}</th>
              </tr>
            </thead>
            <tbody>
              {data.events.map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="py-2">
                    {t.has(`eventNames.${e.action.replaceAll('.', '_')}`)
                      ? t(`eventNames.${e.action.replaceAll('.', '_')}`)
                      : t('accessChanged')}
                    <p className="text-xs text-slate-500" title={e.actorId}>
                      {data.users.find((u) => u.id === e.actorId)?.name ??
                        data.credentials.find((c) => c.id === e.actorId)?.name ??
                        t('unknownActor')}
                    </p>
                  </td>
                  <td className="py-2 text-slate-500">
                    {e.createdAt.replace('T', ' ').slice(0, 19)} UTC
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
function ConnectionForm({
  connection: c,
}: {
  connection?: IdentityOverview['connections'][number];
}) {
  const t = useTranslations('identity');
  return (
    <Change op="connection" id={c?.id} label={t(c ? 'saveConnection' : 'addConnection')}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          {t('connectionName')}
          <input className={input} name="name" defaultValue={c?.name} required maxLength={100} />
        </label>
        <label className="text-sm">
          {t('issuer')}
          <input type="url" className={input} name="issuer" defaultValue={c?.issuer} required />
        </label>
        <label className="text-sm">
          {t('clientId')}
          <input className={input} name="clientId" defaultValue={c?.clientId} required />
        </label>
        <label className="text-sm">
          {t('clientSecret')}
          <input
            className={input}
            name="clientSecret"
            type="password"
            autoComplete="new-password"
            required={!c}
          />
        </label>
        <label className="text-sm">
          {t('provisioningClaim')}
          <select
            className={input}
            name="provisioningClaim"
            defaultValue={c?.provisioningClaim ?? 'sub'}
          >
            <option value="sub">{t('subjectClaim')}</option>
            <option value="oid">{t('objectClaim')}</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="enabled" defaultChecked={c?.enabled ?? true} />
          {t('enabled')}
        </label>
      </div>
    </Change>
  );
}

function EmployeeLink({ userId }: { userId: string }) {
  const t = useTranslations('identity'),
    [search, setSearch] = useState(''),
    [people, setPeople] = useState<{ id: string; employeeCode: string; name: string }[]>([]),
    [busy, setBusy] = useState(false);
  return (
    <div className="space-y-3">
      <label className="block text-sm">
        {t('employeeSearch')}
        <input
          className={input}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          maxLength={100}
        />
      </label>
      <button
        type="button"
        disabled={busy || !search.trim()}
        className={button}
        onClick={async () => {
          setBusy(true);
          try {
            setPeople(await findIdentityEmployees(search));
          } finally {
            setBusy(false);
          }
        }}
      >
        {t('findEmployee')}
      </button>
      <Change op="employee-link" id={userId} label={t('linkEmployee')}>
        <label className="block text-sm">
          {t('employeeId')}
          <select name="employeeId" className={input} required>
            <option value="">{t('chooseEmployee')}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.employeeCode} · {p.name}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-slate-500">{t('employeeLinkHint')}</p>
      </Change>
    </div>
  );
}
