'use client';

import { SUPPORT_ACCESS_MAX_DAYS, ticketLabel, type SupportTicketSummary } from '@gp/shared';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import type { ActionState } from '@/app/actions/platform';
import {
  endSupportSessionFromConsole,
  grantSupportAccess,
  openSupportWorkspace,
  revokeSupportAccess,
} from '@/app/actions/support-access';
import { ErrorText, Form, issueFor, SubmitButton } from '@/components/forms';
import { Banner, buttonClass, Field, inputClass } from '@/components/ui';

const DAYS = Array.from({ length: SUPPORT_ACCESS_MAX_DAYS }, (_, i) => i + 1);

function Refused({ state }: { state: ActionState }) {
  if (!state?.error) return null;
  return (
    <p className="mt-1 text-xs text-red-600">
      <ErrorText state={state} />
    </p>
  );
}

/** How long support may look inside, about which ticket, and what to look at. */
export function GrantAccessForm({ tickets }: { tickets: SupportTicketSummary[] }) {
  const t = useTranslations('supportAccess.grant');
  const [state, action] = useActionState(grantSupportAccess, undefined);
  return (
    <Form state={state} action={action} className="space-y-4">
      {state?.error && !state.issues?.length && (
        <Banner tone="red">
          <ErrorText state={state} />
        </Banner>
      )}
      {state?.ok && <Banner tone="green">{t('granted')}</Banner>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('days')} error={issueFor(state, 'days')}>
          <select name="days" defaultValue="2" className={inputClass}>
            {DAYS.map((days) => (
              <option key={days} value={days}>
                {t('daysOption', { count: days })}
              </option>
            ))}
          </select>
        </Field>
        {tickets.length > 0 && (
          <Field label={t('ticket')} error={issueFor(state, 'ticketId')}>
            <select name="ticketId" defaultValue="" className={inputClass}>
              <option value="">{t('noTicket')}</option>
              {tickets.map((ticket) => (
                <option key={ticket.id} value={ticket.id}>
                  {ticketLabel(ticket.number)} · {ticket.subject}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <Field label={t('note')} hint={t('noteHint')} error={issueFor(state, 'note')}>
        <textarea name="note" rows={2} maxLength={500} className={inputClass} />
      </Field>
      <SubmitButton>{t('submit')}</SubmitButton>
    </Form>
  );
}

export function RevokeAccessButton({ grantId }: { grantId: string }) {
  const t = useTranslations('supportAccess.grants');
  const [state, action] = useActionState(revokeSupportAccess.bind(null, grantId), undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(t('revokeConfirm'))) e.preventDefault();
      }}
    >
      <SubmitButton variant="secondary">{t('revoke')}</SubmitButton>
      <Refused state={state} />
    </form>
  );
}

/** Signs this browser in to the workspace as its read-only support login. */
export function OpenWorkspaceButton({ tenantId, grantId }: { tenantId: string; grantId: string }) {
  const t = useTranslations('supportAccess.console');
  const [state, action] = useActionState(
    openSupportWorkspace.bind(null, tenantId, grantId),
    undefined,
  );
  return (
    <form action={action}>
      <SubmitButton>{t('open')}</SubmitButton>
      {state?.code === 'mfa_required' ? (
        <p className="mt-1 text-xs text-red-600">{t('mfaRequired')}</p>
      ) : (
        <Refused state={state} />
      )}
    </form>
  );
}

export function EndSessionButton({ sessionId }: { sessionId: string }) {
  const t = useTranslations('supportAccess.console');
  const [state, action] = useActionState(
    endSupportSessionFromConsole.bind(null, sessionId),
    undefined,
  );
  return (
    <form action={action} className="inline">
      <button className={buttonClass.ghost}>{t('end')}</button>
      <Refused state={state} />
    </form>
  );
}
