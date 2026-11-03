import { TICKET_STATUSES, ticketLabel, type SupportTicketSummary } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { DHAKA, PriorityBadge, StatusBadge } from '@/components/support/parts';
import { Banner, buttonClass, Card, inputClass } from '@/components/ui';
import { authedFetch } from '@/lib/api';
import { clockOptions } from '@/lib/clock';

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const STATUSES = ['active', ...TICKET_STATUSES] as const;
const ASSIGNEES = ['', 'me', 'none'] as const;

/** The support queue: urgent and overdue first, then the soonest due. */
export default async function SupportQueuePage({ searchParams }: PageProps<'/platform/support'>) {
  const t = await getTranslations('supportConsole');
  const ts = await getTranslations('support');
  const ta = await getTranslations('supportAccess');
  const format = await getFormatter();
  const clock = await clockOptions();
  const query = await searchParams;
  const status = STATUSES.find((s) => s === one(query.status)) ?? 'active';
  const assignee = ASSIGNEES.find((a) => a === one(query.assignee)) ?? '';
  const q = one(query.q)?.trim().slice(0, 100) ?? '';
  const filter = new URLSearchParams({
    status,
    ...(assignee ? { assignee } : {}),
    ...(q ? { q } : {}),
  });
  const result = await authedFetch<SupportTicketSummary[]>(
    'platform',
    `/platform/support/tickets?${filter}`,
  );
  if (!result.ok && result.status === 403) {
    return <Banner tone="amber">{t('notForYou')}</Banner>;
  }
  if (!result.ok) throw new Error(result.error.message);
  const tickets = result.data;
  const when = (iso: string) =>
    format.dateTime(new Date(iso), {
      dateStyle: 'medium',
      timeStyle: 'short',
      ...clock,
      timeZone: DHAKA,
    });

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t('title')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('intro')}</p>
        </div>
        <Link href="/platform/support/access" className={buttonClass.secondary}>
          {ta('console.title')}
        </Link>
      </div>
      <Card>
        <form className="mb-4 flex flex-wrap items-end gap-3 text-sm">
          <label className="block">
            <span className="font-medium text-slate-800">{t('status')}</span>
            <select name="status" defaultValue={status} className={`${inputClass} mt-1`}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s === 'active' ? t('active') : t(`statuses.${s}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="font-medium text-slate-800">{t('assignee')}</span>
            <select name="assignee" defaultValue={assignee} className={`${inputClass} mt-1`}>
              <option value="">{t('anyone')}</option>
              <option value="me">{t('me')}</option>
              <option value="none">{t('nobody')}</option>
            </select>
          </label>
          <label className="block min-w-56 flex-1">
            <span className="font-medium text-slate-800">{t('search')}</span>
            <input
              name="q"
              type="search"
              defaultValue={q}
              placeholder={t('searchHint')}
              className={`${inputClass} mt-1`}
            />
          </label>
          <button className={buttonClass.secondary}>{t('filter')}</button>
        </form>
        {tickets.length === 0 ? (
          <p className="text-sm text-slate-500">{t('empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pe-4 font-medium">{t('ticket')}</th>
                  <th className="py-2 pe-4 font-medium">{t('subject')}</th>
                  <th className="py-2 pe-4 font-medium">{t('status')}</th>
                  <th className="py-2 pe-4 font-medium">{t('due')}</th>
                  <th className="py-2 font-medium">{t('assignee')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tickets.map((ticket) => (
                  <tr key={ticket.id} className="align-top">
                    <td className="py-2 pe-4 whitespace-nowrap">
                      <Link
                        href={`/platform/support/${ticket.id}`}
                        className="font-mono font-medium text-brand-700 hover:underline"
                      >
                        {ticketLabel(ticket.number)}
                      </Link>
                    </td>
                    <td className="py-2 pe-4">
                      <span className="text-slate-900">{ticket.subject}</span>
                      <span className="block text-xs text-slate-500">
                        {ticket.tenant.name} · {ts(`categories.${ticket.category}`)}
                      </span>
                    </td>
                    <td className="py-2 pe-4">
                      <span className="flex flex-wrap gap-1">
                        {ticket.priority === 'urgent' && (
                          <PriorityBadge priority={ticket.priority} />
                        )}
                        <StatusBadge status={ticket.status} side="console" />
                      </span>
                    </td>
                    <td className="py-2 pe-4 whitespace-nowrap">
                      {ticket.firstRespondedAt ? (
                        <span className="text-slate-500">{t('answered')}</span>
                      ) : (
                        <span className={ticket.overdue ? 'font-medium text-red-700' : ''}>
                          {when(ticket.firstResponseDueAt)}
                          {ticket.overdue && <span className="block text-xs">{t('overdue')}</span>}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-slate-600">{ticket.assignee?.name ?? '—'}</td>
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
