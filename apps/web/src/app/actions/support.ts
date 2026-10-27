'use server';

import type { SupportTicketDetail } from '@gp/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { authedFetch, authedUpload } from '@/lib/api';
import { fail } from '@/lib/form';
import type { ActionState } from './platform';

const WORKSPACE = '/workspace/support';
const CONSOLE = '/platform/support';

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();

/** The form as multipart, without empty fields or the empty file a file input sends. */
function withoutEmpty(form: FormData): FormData {
  const out = new FormData();
  for (const [key, value] of form.entries()) {
    if (key.startsWith('$')) continue;
    if (typeof value === 'string' ? value.trim() === '' : value.size === 0) continue;
    out.append(key, value);
  }
  return out;
}

// ── The workspace ───────────────────────────────────────────────────────────

/** Opens a ticket and goes to it. */
export async function openTicket(_: ActionState, form: FormData): Promise<ActionState> {
  const result = await authedUpload<SupportTicketDetail>(
    '/tenant/support/tickets',
    withoutEmpty(form),
  );
  if (!result.ok) return fail(result);
  revalidatePath(WORKSPACE);
  redirect(`${WORKSPACE}/${result.data.id}`);
}

export async function replyToTicket(
  id: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const result = await authedUpload<SupportTicketDetail>(
    `/tenant/support/tickets/${id}/replies`,
    withoutEmpty(form),
  );
  if (!result.ok) return fail(result);
  revalidatePath(WORKSPACE, 'layout');
  return { ok: true };
}

export async function markSolved(id: string): Promise<ActionState> {
  const result = await authedFetch('tenant', `/tenant/support/tickets/${id}/solved`, {
    method: 'POST',
  });
  if (!result.ok) return fail(result);
  revalidatePath(WORKSPACE, 'layout');
  return { ok: true };
}

// ── The console ─────────────────────────────────────────────────────────────

/** A reply the workspace sees, or an internal note (`internal` checked). */
export async function answerTicket(
  id: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const body = withoutEmpty(form);
  body.set('internal', form.get('internal') === 'on' ? 'true' : 'false');
  const result = await authedUpload<SupportTicketDetail>(
    `/platform/support/tickets/${id}/replies`,
    body,
    'platform',
  );
  if (!result.ok) return fail(result);
  revalidatePath(CONSOLE, 'layout');
  return { ok: true };
}

/** Priority, category and status from the ticket's settings form. */
export async function updateTicket(
  id: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const result = await authedFetch('platform', `/platform/support/tickets/${id}`, {
    method: 'PATCH',
    body: {
      priority: text(form, 'priority'),
      category: text(form, 'category'),
      status: text(form, 'status'),
    },
  });
  if (!result.ok) return fail(result);
  revalidatePath(CONSOLE, 'layout');
  return { ok: true };
}

/** Takes the ticket (`assigneeId` is the reader's own id) or puts it back (null). */
export async function assignTicket(id: string, assigneeId: string | null): Promise<ActionState> {
  const result = await authedFetch('platform', `/platform/support/tickets/${id}`, {
    method: 'PATCH',
    body: { assigneeId },
  });
  if (!result.ok) return fail(result);
  revalidatePath(CONSOLE, 'layout');
  return { ok: true };
}
