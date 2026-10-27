'use client';

import {
  SUPPORT_ATTACHMENT_MAX_BYTES,
  SUPPORT_ATTACHMENTS_PER_MESSAGE,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  type SupportTicketDetail,
} from '@gp/shared';
import { useTranslations } from 'next-intl';
import { useActionState, useState, type FormEvent } from 'react';
import {
  answerTicket,
  assignTicket,
  markSolved,
  openTicket,
  replyToTicket,
  updateTicket,
} from '@/app/actions/support';
import { ErrorText, Form, issueFor, SubmitButton } from '../forms';
import { Banner, Field, inputClass } from '../ui';

const ACCEPT =
  'image/png,image/jpeg,image/webp,application/pdf,.xlsx,.csv,.txt,text/plain,text/csv';
const MAX_MB = SUPPORT_ATTACHMENT_MAX_BYTES / (1024 * 1024);

type State = { error?: string; code?: string; issues?: unknown[]; ok?: boolean } | undefined;

function Errors({ state }: { state: State }) {
  if (!state?.error || state.issues?.length) return null;
  return (
    <Banner tone="red">
      <ErrorText state={state} />
    </Banner>
  );
}

/**
 * The files field, checked in the browser before sending so a person with a too-large
 * screenshot hears about it at once; the API checks again, by the files' contents.
 */
function useFiles() {
  const t = useTranslations('support.files');
  const [problem, setProblem] = useState<string | null>(null);
  const check = (event: FormEvent<HTMLFormElement>) => {
    const input = event.currentTarget.elements.namedItem('files');
    const files = input instanceof HTMLInputElement ? Array.from(input.files ?? []) : [];
    const found =
      files.length > SUPPORT_ATTACHMENTS_PER_MESSAGE
        ? t('tooMany', { count: SUPPORT_ATTACHMENTS_PER_MESSAGE })
        : files.some((f) => f.size > SUPPORT_ATTACHMENT_MAX_BYTES)
          ? t('tooLarge', { size: MAX_MB })
          : null;
    setProblem(found);
    if (found) event.preventDefault();
  };
  const field = (
    <Field
      label={t('label')}
      hint={t('hint', { count: SUPPORT_ATTACHMENTS_PER_MESSAGE, size: MAX_MB })}
      error={problem ?? undefined}
    >
      <input
        name="files"
        type="file"
        multiple
        accept={ACCEPT}
        onChange={() => setProblem(null)}
        className="block w-full text-sm"
      />
    </Field>
  );
  return { check, field };
}

// ── The workspace ───────────────────────────────────────────────────────────

export function NewTicketForm({ requestId, pagePath }: { requestId?: string; pagePath?: string }) {
  const t = useTranslations('support');
  const [state, action] = useActionState(openTicket, undefined);
  const files = useFiles();
  return (
    <Form state={state} action={action} onSubmit={files.check} className="space-y-5">
      <Errors state={state} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label={t('new.category')} error={issueFor(state, 'category')}>
          <select name="category" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              {t('new.chooseCategory')}
            </option>
            {TICKET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`categories.${c}`)}
              </option>
            ))}
          </select>
        </Field>
        <fieldset className="text-sm">
          <legend className="font-medium text-slate-800">{t('new.priority')}</legend>
          <div className="mt-1 space-y-2">
            {TICKET_PRIORITIES.map((p) => (
              <label key={p} className="flex items-start gap-2">
                <input
                  type="radio"
                  name="priority"
                  value={p}
                  defaultChecked={p === 'normal'}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">{t(`priorities.${p}`)}</span>
                  <span className="block text-xs text-slate-500">{t(`new.${p}Hint`)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <Field label={t('new.subject')} error={issueFor(state, 'subject')}>
        <input name="subject" required minLength={3} maxLength={150} className={inputClass} />
      </Field>
      <Field
        label={t('new.description')}
        hint={t('new.descriptionHint')}
        error={issueFor(state, 'body')}
      >
        <textarea
          name="body"
          required
          rows={7}
          minLength={10}
          maxLength={10_000}
          className={inputClass}
        />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label={t('new.requestId')}
          hint={t('new.requestIdHint')}
          error={issueFor(state, 'requestId')}
        >
          <input
            name="requestId"
            defaultValue={requestId}
            maxLength={64}
            autoComplete="off"
            className={`${inputClass} font-mono`}
          />
        </Field>
        <Field label={t('new.page')} hint={t('new.pageHint')} error={issueFor(state, 'pagePath')}>
          <input
            name="pagePath"
            defaultValue={pagePath}
            maxLength={500}
            placeholder="/workspace/…"
            className={`${inputClass} font-mono`}
          />
        </Field>
      </div>
      {files.field}
      <SubmitButton>{t('new.submit')}</SubmitButton>
    </Form>
  );
}

export function ReplyForm({ id }: { id: string }) {
  const t = useTranslations('support.detail');
  const [state, action] = useActionState(replyToTicket.bind(null, id), undefined);
  const files = useFiles();
  return (
    <Form state={state} action={action} onSubmit={files.check} className="space-y-4">
      <Errors state={state} />
      <Field label={t('reply')} error={issueFor(state, 'body')}>
        <textarea name="body" required rows={5} maxLength={10_000} className={inputClass} />
      </Field>
      {files.field}
      <SubmitButton>{t('send')}</SubmitButton>
    </Form>
  );
}

export function SolvedButton({ id }: { id: string }) {
  const t = useTranslations('support.detail');
  const [state, action] = useActionState(markSolved.bind(null, id), undefined);
  return (
    <form action={action} className="space-y-3">
      <Errors state={state} />
      <p className="text-sm text-slate-600">{t('solvedHint')}</p>
      <SubmitButton variant="secondary">{t('solved')}</SubmitButton>
    </form>
  );
}

// ── The console ─────────────────────────────────────────────────────────────

export function AnswerForm({ id }: { id: string }) {
  const t = useTranslations('supportConsole.detail');
  const tc = useTranslations('supportConsole');
  const [state, action] = useActionState(answerTicket.bind(null, id), undefined);
  const [internal, setInternal] = useState(false);
  // A sent form is cleared, its checkbox too; the colour and wording follow it.
  const [answered, setAnswered] = useState(state);
  if (state !== answered) {
    setAnswered(state);
    if (state?.ok) setInternal(false);
  }
  const files = useFiles();
  return (
    <Form
      state={state}
      action={action}
      onSubmit={files.check}
      className={`space-y-4 rounded-lg p-4 ring-1 ${
        internal ? 'bg-amber-50 ring-amber-300' : 'bg-white ring-slate-200'
      }`}
    >
      <Errors state={state} />
      <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
        <input type="checkbox" name="internal" onChange={(e) => setInternal(e.target.checked)} />
        {t('internal')}
      </label>
      <p className="text-xs text-slate-600">{internal ? t('internalHint') : t('publicHint')}</p>
      <Field label={internal ? t('note') : t('reply')} error={issueFor(state, 'body')}>
        <textarea name="body" required rows={6} maxLength={10_000} className={inputClass} />
      </Field>
      <Field label={t('nextStatus')} error={issueFor(state, 'status')}>
        <select name="status" defaultValue="" className={inputClass}>
          <option value="">{internal ? t('keepStatus') : t('defaultStatus')}</option>
          {TICKET_STATUSES.map((s) => (
            <option key={s} value={s}>
              {tc(`statuses.${s}`)}
            </option>
          ))}
        </select>
      </Field>
      {files.field}
      <SubmitButton>{internal ? t('addNote') : t('send')}</SubmitButton>
    </Form>
  );
}

export function TicketSettingsForm({ ticket }: { ticket: SupportTicketDetail }) {
  const t = useTranslations('supportConsole.detail');
  const tc = useTranslations('supportConsole');
  const ts = useTranslations('support');
  const [state, action] = useActionState(updateTicket.bind(null, ticket.id), undefined);
  // Re-mount after a save so the selects show what was saved.
  const key = `${ticket.priority}-${ticket.category}-${ticket.status}`;
  return (
    <Form key={key} state={state} action={action} className="space-y-3">
      <Errors state={state} />
      {state?.ok && <Banner tone="green">{t('saved')}</Banner>}
      <Field label={ts('detail.priority')}>
        <select name="priority" defaultValue={ticket.priority} className={inputClass}>
          {TICKET_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {ts(`priorities.${p}`)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={ts('detail.category')}>
        <select name="category" defaultValue={ticket.category} className={inputClass}>
          {TICKET_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {ts(`categories.${c}`)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={tc('status')}>
        <select name="status" defaultValue={ticket.status} className={inputClass}>
          {TICKET_STATUSES.map((s) => (
            <option key={s} value={s}>
              {tc(`statuses.${s}`)}
            </option>
          ))}
        </select>
      </Field>
      <SubmitButton variant="secondary">{t('save')}</SubmitButton>
    </Form>
  );
}

/** "Assign to me" for anyone, and "Unassign" while someone holds it. */
export function AssignButtons({
  id,
  me,
  assignee,
}: {
  id: string;
  me: string;
  assignee: SupportTicketDetail['assignee'];
}) {
  const t = useTranslations('supportConsole.detail');
  const [taken, take] = useActionState(assignTicket.bind(null, id, me), undefined);
  const [released, release] = useActionState(assignTicket.bind(null, id, null), undefined);
  return (
    <div className="space-y-2">
      <Errors state={taken ?? released} />
      <div className="flex flex-wrap gap-2">
        {assignee?.id !== me && (
          <form action={take}>
            <SubmitButton variant="secondary">{t('assignMe')}</SubmitButton>
          </form>
        )}
        {assignee && (
          <form action={release}>
            <SubmitButton variant="secondary">{t('unassign')}</SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
