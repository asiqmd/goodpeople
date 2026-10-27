import { TICKET_AUTO_CLOSE_DAYS, ticketLabel, type SupportTicketDetail } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  DHAKA,
  PriorityBadge,
  StatusBadge,
  supportRequester,
  Thread,
} from '@/components/support/parts';
import { ReplyForm, SolvedButton } from '@/components/support/ticket-forms';
import { Banner, buttonClass, Card } from '@/components/ui';
import { authedFetch } from '@/lib/api';
import { clockOptions } from '@/lib/clock';

/** One ticket: the conversation with support, a reply, and "This is solved". */
export default async function TicketPage({ params }: PageProps<'/workspace/support/[id]'>) {
  await supportRequester();
  const { id } = await params;
  const t = await getTranslations('support');
  const format = await getFormatter();
  const clock = await clockOptions();
  const result = await authedFetch<SupportTicketDetail>('tenant', `/tenant/support/tickets/${id}`);
  if (!result.ok && (result.status === 404 || result.status === 400)) notFound();
  if (!result.ok) throw new Error(result.error.message);
  const ticket = result.data;
  const when = (iso: string) =>
    format.dateTime(new Date(iso), {
      dateStyle: 'medium',
      timeStyle: 'short',
      ...clock,
      timeZone: DHAKA,
    });

  return (
    <>
      <Link href="/workspace/support" className="text-sm text-slate-600 hover:underline">
        ← {t('detail.back')}
      </Link>
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">
            <span className="font-mono text-slate-500">{ticketLabel(ticket.number)}</span>{' '}
            {ticket.subject}
          </h1>
          <StatusBadge status={ticket.status} />
          {ticket.priority === 'urgent' && <PriorityBadge priority={ticket.priority} />}
        </div>
        <p className="mt-1 text-sm text-slate-600">
          {t('detail.openedBy', { name: ticket.openedBy.name, date: when(ticket.createdAt) })}
        </p>
      </div>

      {ticket.status === 'waiting_on_customer' && (
        <Banner tone="amber">{t('detail.waitingOnYou')}</Banner>
      )}
      {ticket.status === 'resolved' && (
        <Banner tone="green">{t('detail.resolvedNote', { days: TICKET_AUTO_CLOSE_DAYS })}</Banner>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={t('detail.thread')}>
            <Thread
              messages={ticket.messages}
              ownSide="customer"
              fileHref={(attachment) => `/workspace/files/support/${attachment}`}
            />
          </Card>
          <Card>
            {ticket.status === 'closed' ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">{t('detail.closedNote')}</p>
                <Link href="/workspace/support/new" className={buttonClass.primary}>
                  {t('detail.newTicket')}
                </Link>
              </div>
            ) : (
              <ReplyForm id={ticket.id} />
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">{t('detail.category')}</dt>
                <dd>{t(`categories.${ticket.category}`)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t('detail.priority')}</dt>
                <dd>{t(`priorities.${ticket.priority}`)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">{t('detail.response')}</dt>
                <dd>
                  {ticket.firstRespondedAt
                    ? t('detail.answeredAt', { date: when(ticket.firstRespondedAt) })
                    : t('detail.answerBy', { date: when(ticket.firstResponseDueAt) })}
                </dd>
              </div>
              {ticket.requestId && (
                <div>
                  <dt className="text-slate-500">{t('detail.requestId')}</dt>
                  <dd className="break-all font-mono">{ticket.requestId}</dd>
                </div>
              )}
              {ticket.pagePath && (
                <div>
                  <dt className="text-slate-500">{t('detail.page')}</dt>
                  <dd className="break-all font-mono">{ticket.pagePath}</dd>
                </div>
              )}
            </dl>
          </Card>
          {ticket.status !== 'closed' && ticket.status !== 'resolved' && (
            <Card>
              <SolvedButton id={ticket.id} />
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
