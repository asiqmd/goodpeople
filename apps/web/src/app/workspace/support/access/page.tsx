import {
  can,
  ticketLabel,
  type SupportAccessGrantView,
  type SupportActivityEntry,
  type SupportTicketSummary,
} from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { GrantAccessForm, RevokeAccessButton } from '@/components/support/access-forms';
import { Badge, Banner, Card, type Tone } from '@/components/ui';
import { authedFetch, currentTenantUser, load } from '@/lib/api';
import { clockOptions } from '@/lib/clock';

type Formatter = Awaited<ReturnType<typeof getFormatter>>;
const when = (format: Formatter, iso: string, clock: Awaited<ReturnType<typeof clockOptions>>) =>
  format.dateTime(new Date(iso), {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...clock,
    timeZone: 'Asia/Dhaka',
  });

const statusOf = (grant: SupportAccessGrantView) =>
  grant.active ? 'active' : grant.revokedAt ? 'revoked' : 'ended';
const STATUS_TONE: Record<ReturnType<typeof statusOf>, Tone> = {
  active: 'green',
  revoked: 'slate',
  ended: 'slate',
};

/**
 * Letting Good People support look inside the workspace: what they can and cannot do, the
 * access given and who used it, and every page they opened.
 */
export default async function SupportAccessPage() {
  const t = await getTranslations('supportAccess');
  const user = await currentTenantUser();
  if (!can(user, 'support.manage')) {
    return <Banner tone="slate">{t('notAllowed')}</Banner>;
  }
  const format = await getFormatter();
  const clock = await clockOptions();
  const [grants, activity, tickets] = await Promise.all([
    load<SupportAccessGrantView[]>('tenant', '/tenant/support/access'),
    load<SupportActivityEntry[]>('tenant', '/tenant/support/access/activity'),
    authedFetch<SupportTicketSummary[]>('tenant', '/tenant/support/tickets?scope=all'),
  ]);
  const openTickets = tickets.ok ? tickets.data.filter((ticket) => ticket.status !== 'closed') : [];

  return (
    <>
      <Card title={t('title')}>
        <p className="text-sm text-slate-600">{t('intro')}</p>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
          {(['can', 'cannot', 'logged'] as const).map((key) => (
            <div key={key} className="rounded-lg bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
              <dt className="font-medium text-slate-900">{t(`${key}Title`)}</dt>
              <dd className="mt-1 text-slate-600">{t(key)}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card title={t('grant.title')}>
        <GrantAccessForm tickets={openTickets} />
      </Card>

      <Card title={t('grants.title')}>
        {grants.length === 0 ? (
          <p className="text-sm text-slate-500">{t('grants.none')}</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-start text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2 font-medium">{t('grants.given')}</th>
                  <th className="px-5 py-2 font-medium">{t('grants.until')}</th>
                  <th className="px-5 py-2 font-medium">{t('grants.about')}</th>
                  <th className="px-5 py-2 font-medium">{t('grants.usedBy')}</th>
                  <th className="px-5 py-2 font-medium">{t('grants.status')}</th>
                  <th className="px-5 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {grants.map((grant) => {
                  const status = statusOf(grant);
                  return (
                    <tr key={grant.id} className="align-top">
                      <td className="px-5 py-3">
                        {t('grants.givenBy', {
                          when: when(format, grant.startsAt, clock),
                          name: grant.grantedBy.name,
                        })}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap">
                        {when(format, grant.revokedAt ?? grant.endsAt, clock)}
                      </td>
                      <td className="px-5 py-3">
                        {grant.ticketId && grant.ticketNumber && (
                          <Link
                            href={`/workspace/support/${grant.ticketId}`}
                            className="me-1 font-medium text-brand-700 hover:underline"
                          >
                            {ticketLabel(grant.ticketNumber)}
                          </Link>
                        )}
                        <span className="text-slate-600">{grant.note}</span>
                      </td>
                      <td className="px-5 py-3">
                        {grant.sessions.length === 0 ? (
                          <span className="text-slate-500">{t('grants.notUsed')}</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {grant.sessions.map((s) => (
                              <li key={s.startedAt}>
                                {s.platformUserName}{' '}
                                <span className="text-slate-500">
                                  {when(format, s.startedAt, clock)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={STATUS_TONE[status]}>{t(`grants.${status}`)}</Badge>
                      </td>
                      <td className="px-5 py-3 text-end">
                        {grant.active && <RevokeAccessButton grantId={grant.id} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={t('activity.title')}>
        <p className="mb-4 text-sm text-slate-600">{t('activity.intro', { count: 200 })}</p>
        {activity.length === 0 ? (
          <p className="text-sm text-slate-500">{t('activity.none')}</p>
        ) : (
          <div className="-mx-5 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-start text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-2 font-medium">{t('activity.when')}</th>
                  <th className="px-5 py-2 font-medium">{t('activity.who')}</th>
                  <th className="px-5 py-2 font-medium">{t('activity.what')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activity.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-5 py-2 whitespace-nowrap">{when(format, entry.at, clock)}</td>
                    <td className="px-5 py-2">{entry.by}</td>
                    <td className="px-5 py-2 font-mono text-xs text-slate-700">{entry.route}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
