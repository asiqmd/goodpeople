import {
  can,
  FIRST_RESPONSE_HOURS,
  SUPPORT_HOURS,
  TICKET_PRIORITIES,
  ticketLabel,
  type SupportTicketSummary,
  type TenantAccessView,
} from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { HelpLink } from '@/components/help/help-link';
import { DHAKA, PriorityBadge, StatusBadge, supportRequester } from '@/components/support/parts';
import { buttonClass, Card } from '@/components/ui';
import { load } from '@/lib/api';
import { clockOptions } from '@/lib/clock';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const tab = (active: boolean) =>
  `rounded-md px-3 py-1.5 text-sm font-medium ${
    active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
  }`;
const HOUR = 3_600_000;
/** Midnight starting a Sunday in Dhaka (25 October 2026): days and hours are named from it. */
const SUNDAY = Date.UTC(2026, 9, 24, 18);

/** The tickets this login (or, with support.manage, the whole workspace) has opened. */
export default async function SupportPage({ searchParams }: PageProps<'/workspace/support'>) {
  const user = await supportRequester();
  const t = await getTranslations('support');
  const tp = await getTranslations('pricing.plans');
  const format = await getFormatter();
  const clock = await clockOptions();
  const manage = can(user, 'support.manage');
  const all = manage && one((await searchParams).scope) === 'all';
  const [tickets, access] = await Promise.all([
    load<SupportTicketSummary[]>('tenant', `/tenant/support/tickets?scope=${all ? 'all' : 'mine'}`),
    load<TenantAccessView>('tenant', '/tenant/access'),
  ]);
  const plan = access.tenant.planCode;
  const day = (d: number) =>
    format.dateTime(new Date(SUNDAY + (d * 24 + 12) * HOUR), { weekday: 'long', timeZone: DHAKA });
  const hour = (h: number) =>
    format.dateTime(new Date(SUNDAY + h * HOUR), { timeStyle: 'short', ...clock, timeZone: DHAKA });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {t('list.title')}
            <HelpLink slug="contact-support" />
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {t('list.intro')}{' '}
            <Link href="/help" className="text-brand-700 hover:underline">
              {t('list.help')}
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {manage && (
            <Link href="/workspace/support/access" className={buttonClass.secondary}>
              {t('list.access')}
            </Link>
          )}
          <Link href="/workspace/support/new" className={buttonClass.primary}>
            {t('list.new')}
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          {manage && (
            <div className="mb-4 inline-flex rounded-lg bg-slate-100 p-0.5">
              <Link href="/workspace/support" className={tab(!all)} aria-current={!all}>
                {t('list.mine')}
              </Link>
              <Link href="/workspace/support?scope=all" className={tab(all)} aria-current={all}>
                {t('list.all')}
              </Link>
            </div>
          )}
          {tickets.length === 0 ? (
            <p className="text-sm text-slate-500">{t('list.empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2 pe-4 font-medium">{t('list.ticket')}</th>
                    <th className="py-2 pe-4 font-medium">{t('list.subject')}</th>
                    <th className="py-2 pe-4 font-medium">{t('list.status')}</th>
                    <th className="py-2 pe-4 font-medium">{t('list.updated')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tickets.map((ticket) => (
                    <tr key={ticket.id} className="align-top">
                      <td className="py-2 pe-4 whitespace-nowrap">
                        <Link
                          href={`/workspace/support/${ticket.id}`}
                          className="font-mono font-medium text-brand-700 hover:underline"
                        >
                          {ticketLabel(ticket.number)}
                        </Link>
                      </td>
                      <td className="py-2 pe-4">
                        <span className="text-slate-900">{ticket.subject}</span>
                        {all && (
                          <span className="block text-xs text-slate-500">
                            {t('list.openedBy', { name: ticket.openedBy.name })}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pe-4">
                        <span className="flex flex-wrap gap-1">
                          <StatusBadge status={ticket.status} />
                          {ticket.priority === 'urgent' && (
                            <PriorityBadge priority={ticket.priority} />
                          )}
                        </span>
                      </td>
                      <td className="py-2 pe-4 whitespace-nowrap text-slate-600">
                        {format.dateTime(new Date(ticket.updatedAt), {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                          ...clock,
                          timeZone: DHAKA,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title={t('targets.title')}>
          <p className="text-sm text-slate-600">{t('targets.intro', { plan: tp(plan) })}</p>
          <dl className="mt-3 space-y-2 text-sm">
            {TICKET_PRIORITIES.toReversed().map((p) => (
              <div key={p} className="flex items-center justify-between gap-3">
                <dt>
                  <PriorityBadge priority={p} />
                </dt>
                <dd className="font-medium">
                  {t('targets.hours', { hours: FIRST_RESPONSE_HOURS[plan][p] })}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-600">
            {t('targets.supportHours', {
              from: day(SUPPORT_HOURS.days[0]),
              to: day(SUPPORT_HOURS.days.at(-1)!),
              start: hour(SUPPORT_HOURS.startHour),
              end: hour(SUPPORT_HOURS.endHour),
            })}
          </p>
          <p className="mt-2 text-xs text-slate-500">{t('targets.clock')}</p>
        </Card>
      </div>
    </>
  );
}
