import {
  isStaffRole,
  type SupportMessage,
  type TenantRole,
  type TicketPriority,
  type TicketStatus,
} from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { currentTenantUser } from '@/lib/api';
import { clockOptions } from '@/lib/clock';
import { Badge, type Tone } from '../ui';

// Server pieces shared by the workspace's ticket pages and the console's.

export const STATUS_TONE: Record<TicketStatus, Tone> = {
  open: 'blue',
  waiting_on_customer: 'amber',
  resolved: 'green',
  closed: 'slate',
};

export const DHAKA = 'Asia/Dhaka';

/** The workspace and support each read the status from their own side ("Waiting for you"). */
export async function StatusBadge({
  status,
  side = 'workspace',
}: {
  status: TicketStatus;
  side?: 'workspace' | 'console';
}) {
  const t = await getTranslations(side === 'console' ? 'supportConsole' : 'support');
  return <Badge tone={STATUS_TONE[status]}>{t(`statuses.${status}`)}</Badge>;
}

export async function PriorityBadge({ priority }: { priority: TicketPriority }) {
  const t = await getTranslations('support');
  return (
    <Badge tone={priority === 'urgent' ? 'red' : 'slate'}>{t(`priorities.${priority}`)}</Badge>
  );
}

/**
 * The conversation, oldest first. `fileHref` is where an attachment downloads from (the
 * workspace's or the console's route); support's internal notes are shown apart, in amber.
 */
export async function Thread({
  messages,
  fileHref,
  ownSide,
}: {
  messages: SupportMessage[];
  fileHref: (attachmentId: string) => string;
  /** Whose messages sit on the right: the reader's side. */
  ownSide: SupportMessage['author'];
}) {
  const t = await getTranslations('support.thread');
  const format = await getFormatter();
  const clock = await clockOptions();
  const size = (bytes: number) =>
    bytes < 1024 * 1024
      ? t('kb', { size: Math.max(1, Math.round(bytes / 1024)) })
      : t('mb', { size: Math.round((bytes / (1024 * 1024)) * 10) / 10 });
  return (
    <ol className="space-y-4">
      {messages.map((m) => {
        const own = m.author === ownSide;
        const tone = m.internal
          ? 'bg-amber-50 ring-amber-300'
          : own
            ? 'bg-brand-50 ring-brand-200'
            : 'bg-white ring-slate-200';
        return (
          <li key={m.id} className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
            <article className={`max-w-[85%] rounded-xl p-4 text-sm ring-1 ${tone}`}>
              <header className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-medium text-slate-800">
                  {m.author === 'support' ? t('fromSupport', { name: m.authorName }) : m.authorName}
                </span>
                <time dateTime={m.createdAt}>
                  {format.dateTime(new Date(m.createdAt), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    ...clock,
                    timeZone: DHAKA,
                  })}
                </time>
                {m.internal && <Badge tone="amber">{t('internal')}</Badge>}
              </header>
              <p className="whitespace-pre-wrap break-words text-slate-800">{m.body}</p>
              {m.attachments.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-slate-200/70 pt-2">
                  {m.attachments.map((a) => (
                    <li key={a.id}>
                      <a
                        href={fileHref(a.id)}
                        className="text-brand-700 hover:underline"
                        download={a.fileName}
                      >
                        {a.fileName}
                      </a>{' '}
                      <span className="text-xs text-slate-500">({size(a.sizeBytes)})</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Workspace staff who may contact support: everyone with a staff role except the `support`
 * login, which is us. Others go back to the workspace's home.
 */
export async function supportRequester(): Promise<{ id: string; role: TenantRole }> {
  const user = await currentTenantUser();
  if (!user || !isStaffRole(user.role) || user.role === 'support') redirect('/workspace');
  return user;
}
