import {
  ticketLabel,
  type AccountView,
  type SupportTicketDetail,
  type TenantWithAccess,
} from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { OpenWorkspaceButton } from '@/components/support/access-forms';
import { DHAKA, PriorityBadge, StatusBadge, Thread } from '@/components/support/parts';
import { AnswerForm, AssignButtons, TicketSettingsForm } from '@/components/support/ticket-forms';
import { Badge, Banner, BILLING_TONE, Card } from '@/components/ui';
import { authedFetch, load } from '@/lib/api';
import { clockOptions } from '@/lib/clock';

/** One ticket for support: the thread with internal notes, the reply form and its settings. */
export default async function ConsoleTicketPage({ params }: PageProps<'/platform/support/[id]'>) {
  const { id } = await params;
  const t = await getTranslations('supportConsole');
  const ts = await getTranslations('support');
  const tp = await getTranslations('pricing.plans');
  const tb = await getTranslations('billingModes');
  const format = await getFormatter();
  const clock = await clockOptions();
  const result = await authedFetch<SupportTicketDetail>(
    'platform',
    `/platform/support/tickets/${id}`,
  );
  if (!result.ok && result.status === 403) return <Banner tone="amber">{t('notForYou')}</Banner>;
  if (!result.ok && (result.status === 404 || result.status === 400)) notFound();
  if (!result.ok) throw new Error(result.error.message);
  const ticket = result.data;
  const [me, tenant] = await Promise.all([
    load<AccountView>('platform', '/account'),
    load<TenantWithAccess>('platform', `/platform/tenants/${ticket.tenant.id}`),
  ]);
  const when = (iso: string) =>
    format.dateTime(new Date(iso), {
      dateStyle: 'medium',
      timeStyle: 'short',
      ...clock,
      timeZone: DHAKA,
    });
  const closed = ticket.status === 'closed';

  return (
    <>
      <div>
        <Link href="/platform/support" className="text-sm text-slate-500 hover:text-slate-900">
          ← {t('detail.back')}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">
            <span className="font-mono text-slate-500">{ticketLabel(ticket.number)}</span>{' '}
            {ticket.subject}
          </h1>
          <StatusBadge status={ticket.status} side="console" />
          {ticket.priority === 'urgent' && <PriorityBadge priority={ticket.priority} />}
          {ticket.overdue && <Badge tone="red">{t('overdue')}</Badge>}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {ts('detail.openedBy', { name: ticket.openedBy.name, date: when(ticket.createdAt) })}
          {ticket.openedBy.email && <> · {ticket.openedBy.email}</>}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={ts('detail.thread')}>
            <Thread
              messages={ticket.messages}
              ownSide="support"
              fileHref={(attachment) => `/platform/files/support/${attachment}`}
            />
          </Card>
          <Card>
            {closed ? (
              <p className="text-sm text-slate-600">{t('detail.closedNote')}</p>
            ) : (
              <AnswerForm id={ticket.id} />
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title={t('detail.ticket')}>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">{t('due')}</dt>
                <dd className={ticket.overdue ? 'font-medium text-red-700' : ''}>
                  {ticket.firstRespondedAt
                    ? t('detail.answeredAt', { date: when(ticket.firstRespondedAt) })
                    : when(ticket.firstResponseDueAt)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{t('assignee')}</dt>
                <dd className="space-y-2">
                  <p>{ticket.assignee?.name ?? t('nobody')}</p>
                  {!closed && (
                    <AssignButtons id={ticket.id} me={me.id} assignee={ticket.assignee} />
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">{ts('detail.requestId')}</dt>
                <dd className="break-all font-mono">{ticket.requestId ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{ts('detail.page')}</dt>
                <dd className="break-all font-mono">{ticket.pagePath ?? '—'}</dd>
              </div>
            </dl>
          </Card>

          {!closed && (
            <Card title={t('detail.settings')}>
              <TicketSettingsForm ticket={ticket} />
            </Card>
          )}

          <Card title={t('detail.workspace')}>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="font-medium text-slate-900">{tenant.name}</dt>
                <dd className="font-mono text-slate-500">{tenant.slug}</dd>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="slate">{tp(tenant.planCode)}</Badge>
                <Badge tone={BILLING_TONE[tenant.billingMode]}>{tb(tenant.billingMode)}</Badge>
              </div>
            </dl>
            <Link
              href={`/platform/tenants/${tenant.id}`}
              className="mt-3 inline-block text-sm text-brand-700 hover:underline"
            >
              {t('detail.openTenant')}
            </Link>
          </Card>

          <Card title={t('detail.access')}>
            <p className="text-sm text-slate-700">
              {ticket.access
                ? t('detail.accessUntil', {
                    date: when(ticket.access.endsAt),
                    name: ticket.access.grantedBy.name,
                  })
                : t('detail.noAccess')}
            </p>
            {ticket.access?.note && (
              <p className="mt-2 text-sm text-slate-500">“{ticket.access.note}”</p>
            )}
            {ticket.access?.active && (
              <div className="mt-3">
                <OpenWorkspaceButton tenantId={ticket.tenant.id} grantId={ticket.access.id} />
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
