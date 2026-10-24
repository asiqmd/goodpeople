import {
  can,
  DELIVERY_STATUSES,
  NOTIFICATION_EVENTS,
  type DeliveryStatus,
  type DeliveryView,
  type NotificationEvent,
  type NotificationInbox,
  type NotificationSettingsView,
  type NotificationTemplateView,
} from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { markAllRead, openNotification } from '@/app/actions/account';
import {
  NotificationSettingsForm,
  RetryButton,
  TemplateForm,
} from '@/components/account/account-forms';
import { Badge, buttonClass, Card, type Tone } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';
import { eventKey } from '@/lib/form';

const TABS = ['inbox', 'settings', 'templates', 'log'] as const;
const STATUS_TONE: Record<DeliveryStatus, Tone> = {
  queued: 'blue',
  sent: 'green',
  failed: 'red',
  skipped: 'slate',
};

export default async function NotificationsPage({
  searchParams,
}: PageProps<'/workspace/notifications'>) {
  const t = await getTranslations('notifications');
  const format = await getFormatter();
  const user = await currentTenantUser();
  const manages = can(user?.role, 'notifications.manage');
  const params = await searchParams;
  const tab =
    manages && TABS.includes(params.tab as never) ? (params.tab as (typeof TABS)[number]) : 'inbox';
  const when = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' });

  const tabs = manages && (
    <nav className="flex gap-2 text-sm">
      {TABS.map((key) => (
        <Link
          key={key}
          href={`/workspace/notifications?tab=${key}`}
          aria-current={tab === key ? 'page' : undefined}
          className={`rounded-lg px-3 py-1.5 font-medium ${
            tab === key
              ? 'bg-white shadow-sm ring-1 ring-slate-200'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          {t(`tabs.${key}`)}
        </Link>
      ))}
    </nav>
  );

  if (tab === 'settings') {
    const settings = await load<NotificationSettingsView>(
      'tenant',
      '/tenant/notification-settings',
    );
    return (
      <>
        {tabs}
        <Card title={t('settingsTitle')}>
          <p className="mb-4 text-sm text-slate-600">
            {settings.smsLimit === null
              ? t('smsUsageUnlimited', { used: settings.smsUsedThisMonth })
              : t('smsUsage', { used: settings.smsUsedThisMonth, limit: settings.smsLimit })}
          </p>
          <NotificationSettingsForm settings={settings} />
        </Card>
      </>
    );
  }

  if (tab === 'templates') {
    const templates = await load<NotificationTemplateView[]>(
      'tenant',
      '/tenant/notification-templates',
    );
    const event = (
      NOTIFICATION_EVENTS.includes(params.event as never) ? params.event : 'approval.requested'
    ) as NotificationEvent;
    return (
      <>
        {tabs}
        <Card title={t('templatesTitle')}>
          <div className="mb-4 flex flex-wrap gap-2">
            {NOTIFICATION_EVENTS.map((e) => (
              <Link
                key={e}
                href={`/workspace/notifications?tab=templates&event=${e}`}
                className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
                  e === event
                    ? 'bg-brand-600 text-white ring-brand-600'
                    : 'text-slate-700 ring-slate-300'
                }`}
              >
                {t(`events.${eventKey(e)}`)}
                {templates.some((x) => x.event === e && x.customized) ? ' •' : ''}
              </Link>
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            {templates
              .filter((x) => x.event === event)
              .map((x) => (
                <div key={x.language}>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                    {t(`languages.${x.language}`)}
                    {x.customized && <Badge tone="violet">{t('customized')}</Badge>}
                  </h3>
                  <TemplateForm key={`${x.event}-${x.language}-${x.title}`} template={x} />
                </div>
              ))}
          </div>
          {event === 'auth.otp' && <p className="mt-4 text-sm text-slate-500">{t('otpFixed')}</p>}
        </Card>
      </>
    );
  }

  if (tab === 'log') {
    const status = DELIVERY_STATUSES.includes(params.status as never)
      ? (params.status as DeliveryStatus)
      : undefined;
    const deliveries = await load<DeliveryView[]>(
      'tenant',
      `/tenant/notification-deliveries${status ? `?status=${status}` : ''}`,
    );
    return (
      <>
        {tabs}
        <Card
          title={t('logTitle')}
          action={
            <span className="flex gap-2 text-xs">
              <Link
                href="/workspace/notifications?tab=log"
                className={!status ? 'font-semibold' : 'text-slate-500'}
              >
                {t('all')}
              </Link>
              {DELIVERY_STATUSES.map((s) => (
                <Link
                  key={s}
                  href={`/workspace/notifications?tab=log&status=${s}`}
                  className={status === s ? 'font-semibold' : 'text-slate-500'}
                >
                  {t(`statuses.${s}`)}
                </Link>
              ))}
            </span>
          }
        >
          {deliveries.length === 0 ? (
            <p className="text-sm text-slate-500">{t('logEmpty')}</p>
          ) : (
            <div className="-mx-5 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-2 font-medium">{t('when')}</th>
                    <th className="px-5 py-2 font-medium">{t('event')}</th>
                    <th className="px-5 py-2 font-medium">{t('channel')}</th>
                    <th className="px-5 py-2 font-medium">{t('to')}</th>
                    <th className="px-5 py-2 font-medium">{t('status')}</th>
                    <th className="px-5 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 align-top">
                  {deliveries.map((d) => (
                    <tr key={d.id}>
                      <td className="whitespace-nowrap px-5 py-3 text-slate-600">
                        {when(d.createdAt)}
                      </td>
                      <td className="px-5 py-3">
                        {d.event ? t(`events.${eventKey(d.event)}`) : '—'}
                        {d.subject && (
                          <span className="block text-xs text-slate-500">{d.subject}</span>
                        )}
                      </td>
                      <td className="px-5 py-3">{t(`channels.${d.channel}`)}</td>
                      <td className="px-5 py-3 font-mono text-xs">
                        {d.channel === 'push' ? t('devices') : d.recipient}
                      </td>
                      <td className="px-5 py-3">
                        <Badge tone={STATUS_TONE[d.status]}>{t(`statuses.${d.status}`)}</Badge>
                        {d.attempts > 1 && (
                          <span className="ml-1 text-xs text-slate-500">×{d.attempts}</span>
                        )}
                        {d.lastError && (
                          <span className="mt-1 block text-xs text-red-600">{d.lastError}</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {(d.status === 'failed' || d.status === 'skipped') &&
                          d.event !== 'auth.otp' && <RetryButton id={d.id} />}
                      </td>
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

  const inbox = await load<NotificationInbox>('tenant', '/tenant/notifications');
  return (
    <>
      {tabs}
      <Card
        title={t('inboxTitle')}
        action={
          inbox.unread > 0 && (
            <form action={markAllRead}>
              <button className={buttonClass.ghost}>{t('markAllRead')}</button>
            </form>
          )
        }
      >
        {inbox.items.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">{t('inboxEmpty')}</p>
        ) : (
          <ul className="-mx-5 divide-y divide-slate-100">
            {inbox.items.map((n) => (
              <li key={n.id}>
                <form action={openNotification.bind(null, n.id, n.link)}>
                  <button className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-slate-50">
                    <span
                      aria-hidden
                      className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? 'bg-transparent' : 'bg-brand-600'}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-sm ${n.readAt ? 'text-slate-700' : 'font-semibold text-slate-900'}`}
                      >
                        {n.title}
                        {!n.readAt && <span className="sr-only"> ({t('unread')})</span>}
                      </span>
                      <span className="block text-sm text-slate-600">{n.body}</span>
                      <span className="mt-1 block text-xs text-slate-400">{when(n.createdAt)}</span>
                    </span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
