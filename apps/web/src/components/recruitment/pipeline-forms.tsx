'use client';

import {
  CV_MAX_BYTES,
  HAND_SOURCES,
  type ApplicationDetail,
  type CandidateAdded,
  type EmployeeRef,
  type MovableStage,
} from '@gp/shared';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useActionState, useRef, useState, useTransition, type ChangeEvent } from 'react';
import type { ActionState } from '@/app/actions/platform';
import {
  addApplicationNote,
  addCandidate,
  findEmployees,
  moveApplication,
  readCvContacts,
} from '@/app/actions/applications';
import { ErrorText, Form, issueFor, SubmitButton } from '../forms';
import { Banner, buttonClass, Field, inputClass } from '../ui';

const CV_ACCEPT =
  'application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx';
const CV_MB = CV_MAX_BYTES / (1024 * 1024);

function Refused({ state }: { state: ActionState<unknown> }) {
  if (!state?.error || state.issues?.length) return null;
  return (
    <Banner tone="red">
      <ErrorText state={state} />
    </Banner>
  );
}

export const personName = (p: EmployeeRef, locale: string) =>
  locale === 'bn' && p.fullNameBn ? p.fullNameBn : p.fullName;

/**
 * Finds employees by name or code and keeps the chosen ones as hidden inputs: one for a
 * referrer, several for an interview panel.
 */
export function PeoplePicker({
  name,
  multiple,
  find,
  initial = [],
  error,
}: {
  name: string;
  multiple: boolean;
  find: (search: string) => Promise<EmployeeRef[]>;
  initial?: EmployeeRef[];
  error?: string;
}) {
  const t = useTranslations('pipeline.people');
  const locale = useLocale();
  const [chosen, setChosen] = useState<EmployeeRef[]>(initial);
  const [found, setFound] = useState<EmployeeRef[] | null>(null);
  const [search, setSearch] = useState('');
  const [pending, start] = useTransition();
  const look = () => start(async () => setFound(await find(search)));
  const choose = (p: EmployeeRef) => {
    setChosen(multiple ? [...chosen.filter((c) => c.id !== p.id), p] : [p]);
    setFound(null);
    setSearch('');
  };
  return (
    <div className="space-y-2">
      {chosen.map((p) => (
        <input key={p.id} type="hidden" name={name} value={p.id} />
      ))}
      {chosen.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {chosen.map((p) => (
            <li
              key={p.id}
              className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm"
            >
              {personName(p, locale)}
              <span className="font-mono text-xs text-slate-500">{p.employeeCode}</span>
              <button
                type="button"
                aria-label={t('remove', { name: personName(p, locale) })}
                onClick={() => setChosen(chosen.filter((c) => c.id !== p.id))}
                className="text-slate-500 hover:text-slate-900"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              look();
            }
          }}
          placeholder={t('search')}
          aria-label={t('search')}
          className={inputClass}
        />
        <button type="button" onClick={look} disabled={pending} className={buttonClass.secondary}>
          {pending ? '…' : t('find')}
        </button>
      </div>
      {found && (
        <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
          {found.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">{t('none')}</li>}
          {found.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => choose(p)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span>{personName(p, locale)}</span>
                <span className="font-mono text-xs text-slate-500">{p.employeeCode}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

/** Moves an application: to another stage, or out with a reason (and, if rejected, a note). */
export function MoveForm({
  applicationId,
  moves,
  compact = false,
}: {
  applicationId: string;
  moves: MovableStage[];
  compact?: boolean;
}) {
  const t = useTranslations('pipeline.move');
  const stages = useTranslations('pipeline.stages');
  const [stage, setStage] = useState<string>('');
  const [state, action] = useActionState<ActionState<ApplicationDetail>, FormData>(
    moveApplication.bind(null, applicationId),
    undefined,
  );
  if (moves.length === 0) return null;
  const closing = stage === 'rejected' || stage === 'withdrawn';
  return (
    <Form
      key={state?.ok ? state.result?.stage : 'move'}
      state={state}
      action={action}
      className="space-y-2"
    >
      <Refused state={state} />
      {/* Board columns are narrow: the stage list gets the card's full width there. */}
      <div className={compact ? 'flex flex-col gap-1.5' : 'flex flex-wrap items-end gap-2'}>
        <label className={compact ? 'block' : 'block text-sm'}>
          <span className={compact ? 'sr-only' : 'font-medium text-slate-800'}>{t('label')}</span>
          <select
            name="stage"
            required
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className={`${inputClass} ${compact ? 'py-1 text-xs' : 'mt-1'}`}
          >
            <option value="">{t('choose')}</option>
            {moves.map((s) => (
              <option key={s} value={s}>
                {stages(s)}
              </option>
            ))}
          </select>
        </label>
        {!closing && <SubmitButton variant="secondary">{t('submit')}</SubmitButton>}
      </div>
      {closing && (
        <div className="space-y-2">
          <Field label={t('reason')} hint={t('reasonHint')} error={issueFor(state, 'reason')}>
            <input name="reason" required minLength={3} maxLength={500} className={inputClass} />
          </Field>
          {stage === 'rejected' && (
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" name="emailCandidate" className="mt-1" />
              {t('email')}
            </label>
          )}
          <SubmitButton variant="secondary">{t('submit')}</SubmitButton>
        </div>
      )}
    </Form>
  );
}

export function NoteForm({ applicationId }: { applicationId: string }) {
  const t = useTranslations('pipeline.application');
  const [state, action] = useActionState<ActionState, FormData>(
    addApplicationNote.bind(null, applicationId),
    undefined,
  );
  return (
    <Form state={state} action={action} className="space-y-2">
      <Refused state={state} />
      <Field label={t('noteLabel')} hint={t('noteHint')} error={issueFor(state, 'note')}>
        <textarea name="note" required rows={2} maxLength={2000} className={inputClass} />
      </Field>
      <SubmitButton variant="secondary">{t('noteSubmit')}</SubmitButton>
    </Form>
  );
}

/**
 * Adds a person to the opening by hand. Choosing the CV reads its name, email and mobile
 * number into the empty fields; HR checks them before adding.
 */
export function AddCandidateForm({ openingId }: { openingId: string }) {
  const t = useTranslations('pipeline.add');
  const sources = useTranslations('pipeline.sources');
  const languages = useTranslations('pipeline.languages');
  const errors = useTranslations('errors');
  const [state, action] = useActionState<ActionState<CandidateAdded>, FormData>(
    addCandidate,
    undefined,
  );
  const form = useRef<HTMLFormElement>(null);
  const [source, setSource] = useState<string>('walk_in');
  const [reading, startReading] = useTransition();
  /** What reading the CV gave: read, unreadable, legacy, tooLarge, or the API's refusal. */
  const [read, setRead] = useState<string | null>(null);

  const fill = (name: string, value: string | null) => {
    const input = form.current?.elements.namedItem(name);
    if (value && input instanceof HTMLInputElement && !input.value.trim()) input.value = value;
  };
  const onCv = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setRead(null);
    if (!file) return;
    if (file.size > CV_MAX_BYTES) {
      setRead('tooLarge');
      return;
    }
    const upload = new FormData();
    upload.append('cv', file);
    startReading(async () => {
      const result = await readCvContacts(upload);
      if (!result.ok) {
        setRead(result.code && errors.has(result.code) ? errors(result.code) : 'unreadable');
        return;
      }
      const { contacts } = result;
      if (contacts.legacyBangla) {
        setRead('legacy');
        return;
      }
      fill('fullName', contacts.fullName);
      fill('email', contacts.email);
      fill('phone', contacts.phone);
      setRead(contacts.fullName || contacts.email || contacts.phone ? 'read' : 'unreadable');
    });
  };
  const readNote =
    read === 'read' ? (
      <Banner tone="blue">{t('read')}</Banner>
    ) : read === 'legacy' ? (
      <Banner tone="amber">{t('legacy')}</Banner>
    ) : read === 'unreadable' ? (
      <Banner tone="amber">{t('unreadable')}</Banner>
    ) : read === 'tooLarge' ? (
      <Banner tone="red">{t('tooLarge', { size: CV_MB })}</Banner>
    ) : read ? (
      <Banner tone="red">{read}</Banner>
    ) : null;

  return (
    <div className="space-y-4">
      {state?.ok && state.result && (
        <Banner tone="green">
          {state.result.newCandidate ? t('added') : t('foundAgain')}{' '}
          <Link
            href={`/workspace/recruitment/applications/${state.result.applicationId}`}
            className="font-medium underline"
          >
            {t('open')}
          </Link>
        </Banner>
      )}
      <Form
        key={state?.ok ? state.result?.applicationId : 'new'}
        ref={form}
        state={state}
        action={action}
        className="space-y-4"
      >
        <Refused state={state} />
        <input type="hidden" name="openingId" value={openingId} />
        <Field label={t('cv')} hint={t('cvHint', { size: CV_MB })} error={issueFor(state, 'cv')}>
          <input
            type="file"
            name="cv"
            accept={CV_ACCEPT}
            onChange={onCv}
            className="block w-full text-sm"
          />
        </Field>
        {reading ? <p className="text-sm text-slate-500">{t('reading')}</p> : readNote}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('fullName')} error={issueFor(state, 'fullName')}>
            <input name="fullName" required maxLength={120} className={inputClass} />
          </Field>
          <Field label={t('email')} hint={t('contactHint')} error={issueFor(state, 'email')}>
            <input name="email" type="email" maxLength={200} className={inputClass} />
          </Field>
          <Field label={t('phone')} hint={t('phoneHint')} error={issueFor(state, 'phone')}>
            <input name="phone" type="tel" inputMode="tel" className={inputClass} />
          </Field>
          <Field label={t('source')} error={issueFor(state, 'source')}>
            <select
              name="source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className={inputClass}
            >
              {HAND_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {sources(s)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('language')} error={issueFor(state, 'language')}>
            <select name="language" defaultValue="bn" className={inputClass}>
              <option value="bn">{languages('bn')}</option>
              <option value="en">{languages('en')}</option>
            </select>
          </Field>
        </div>
        {source === 'referral' && (
          <div className="text-sm">
            <p className="mb-1 font-medium text-slate-800">{t('referrer')}</p>
            <PeoplePicker
              name="referredByEmployeeId"
              multiple={false}
              find={findEmployees}
              error={issueFor(state, 'referredByEmployeeId')}
            />
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('coverNote')} error={issueFor(state, 'coverNote')}>
            <textarea name="coverNote" rows={3} maxLength={3000} className={inputClass} />
          </Field>
          <Field label={t('notes')} error={issueFor(state, 'notes')}>
            <textarea name="notes" rows={3} maxLength={4000} className={inputClass} />
          </Field>
        </div>
        <div className="space-y-2 text-sm text-slate-700">
          <label className="flex items-start gap-2">
            <input type="checkbox" name="consent" required className="mt-1" />
            <span>
              {t('consent')}
              <span className="block text-xs text-slate-500">{t('consentHint')}</span>
              {issueFor(state, 'consent') && (
                <span className="block text-xs text-red-600">{issueFor(state, 'consent')}</span>
              )}
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="talentPool" className="mt-1" />
            {t('talentPool')}
          </label>
        </div>
        <SubmitButton>{t('submit')}</SubmitButton>
      </Form>
    </div>
  );
}
