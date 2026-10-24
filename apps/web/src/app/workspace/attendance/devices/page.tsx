import {
  can,
  type DeviceView,
  type EdgeAgentView,
  type EmployeeListItem,
  type OrgSnapshot,
  type Page,
  type UnmatchedPunchGroup,
} from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { SetupTabs } from '@/components/attendance/setup-tabs';
import {
  ClaimPinForm,
  DeviceForm,
  NewAgentForm,
  RevokeAgentButton,
} from '@/components/attendance/setup-forms';
import { Badge, Card } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

export default async function DevicesPage() {
  if (!can((await currentTenantUser())?.role, 'attendance.manage'))
    redirect('/workspace/attendance');
  const t = await getTranslations('attendance.devices');
  const ts = await getTranslations('attendance.setup');
  const format = await getFormatter();
  const [agents, devices, unmatched, org, employees] = await Promise.all([
    load<EdgeAgentView[]>('tenant', '/tenant/attendance/agents'),
    load<DeviceView[]>('tenant', '/tenant/attendance/devices'),
    load<UnmatchedPunchGroup[]>('tenant', '/tenant/attendance/unmatched'),
    load<OrgSnapshot>('tenant', '/tenant/org'),
    load<Page<EmployeeListItem>>('tenant', '/tenant/employees?status=active&pageSize=100'),
  ]);
  const when = (iso: string | null) => (iso ? format.relativeTime(new Date(iso)) : t('never'));

  return (
    <>
      <h1 className="text-2xl font-semibold">{ts('title')}</h1>
      <SetupTabs active="devices" />
      <Card title={t('agentsTitle')}>
        <p className="mb-4 text-sm text-slate-600">{t('agentsHint')}</p>
        <ul className="mb-4 divide-y divide-slate-100 text-sm">
          {agents.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <span>
                <span className="font-medium">{a.name}</span>{' '}
                <span className="font-mono text-xs text-slate-400">…{a.tokenPrefix}</span>
                <span className="block text-xs text-slate-500">
                  {t('lastSeen', { when: when(a.lastSeenAt) })}
                  {a.agentVersion && ` · v${a.agentVersion}`}
                  {a.queued ? ` · ${t('queued', { count: a.queued })}` : ''}
                </span>
              </span>
              {a.revokedAt ? (
                <Badge tone="slate">{t('revoked')}</Badge>
              ) : (
                <RevokeAgentButton id={a.id} />
              )}
            </li>
          ))}
        </ul>
        <NewAgentForm />
      </Card>
      <Card title={t('devicesTitle')}>
        {devices.length === 0 ? (
          <p className="text-sm text-slate-500">{t('noDevices')}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {devices.map((d) => (
              <li key={d.id} className="space-y-2 py-3">
                <p className="text-sm">
                  <Badge tone="slate">{d.vendor}</Badge>{' '}
                  <span className="font-mono text-xs text-slate-500">{d.serialNumber}</span>
                  <span className="text-xs text-slate-500">
                    {' '}
                    · {t('lastSeen', { when: when(d.lastSeenAt) })}
                    {d.agent && ` · ${d.agent.name}`}
                  </span>
                </p>
                <DeviceForm device={d} locations={org.locations} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={t('unmatchedTitle')}>
        <p className="mb-3 text-sm text-slate-600">{t('unmatchedHint')}</p>
        {unmatched.length === 0 ? (
          <p className="text-sm text-slate-500">{t('noUnmatched')}</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {unmatched.map((u) => (
              <li
                key={`${u.deviceUserId}-${u.device?.id}`}
                className="flex flex-wrap justify-between gap-3 py-2"
              >
                <span>
                  <span className="font-mono font-medium">{u.deviceUserId}</span>{' '}
                  <span className="text-xs text-slate-500">
                    {u.device?.name} · {t('punchCount', { count: u.punches })} ·{' '}
                    {format.dateTime(new Date(u.first), { dateStyle: 'medium' })} –{' '}
                    {format.dateTime(new Date(u.last), { dateStyle: 'medium' })}
                  </span>
                </span>
                <ClaimPinForm pin={u.deviceUserId} employees={employees.items} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
