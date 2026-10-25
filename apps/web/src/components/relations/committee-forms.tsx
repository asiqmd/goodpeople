'use client';

import {
  GENDERS,
  COMMITTEE_KINDS,
  COMMITTEE_ROLES,
  COMMITTEE_SELECTIONS,
  COMMITTEE_SIDES,
  type CommitteeKind,
  type CommitteeMeetingView,
  type CommitteeView,
  type Ref,
  type RelationsCheckResult,
} from '@gp/shared';
import { useTranslations } from 'next-intl';
import { useActionState, useState, useTransition } from 'react';
import {
  addCommitteeMember,
  addMeeting,
  createCommittee,
  deleteCommittee,
  endCommitteeMember,
  runChecks,
  setDecisionDone,
  updateCommittee,
  updateMeeting,
} from '@/app/actions/relations';
import type { ActionState } from '@/app/actions/platform';
import { ErrorText, Form, issueFor, SubmitButton } from '../forms';
import { buttonClass, Field, inputClass } from '../ui';
import { ActionButton, Errors, Saved } from './form-bits';

export interface SiteOption extends Ref {
  legalEntityId: string;
}

/** Raises and resolves the committee alerts now instead of waiting for the daily check. */
export function RunChecksButton() {
  const t = useTranslations('relations.committees');
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionState<RelationsCheckResult>>();
  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      {result?.result && (
        <span className="text-xs text-slate-600">{t('checked', { ...result.result })}</span>
      )}
      {result?.error && (
        <span className="text-xs text-red-600">
          <ErrorText state={result} />
        </span>
      )}
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        className={buttonClass.secondary}
        onClick={() => start(async () => setResult(await runChecks()))}
      >
        {t('runChecks')}
      </button>
    </span>
  );
}

export function CommitteeForm({
  entities,
  sites,
  today,
}: {
  entities: Ref[];
  sites: SiteOption[];
  today: string;
}) {
  const t = useTranslations('relations');
  const tf = useTranslations('relations.committees.fields');
  const [state, action] = useActionState(createCommittee, undefined);
  const [kind, setKind] = useState<CommitteeKind>('participation');
  const [entity, setEntity] = useState(entities[0]?.id ?? '');
  return (
    <Form state={state} action={action} className="space-y-4">
      <Errors state={state} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={tf('kind')} hint={t(`kindHints.${kind}`)}>
          <select
            name="kind"
            defaultValue={kind}
            onChange={(e) => setKind(e.target.value as CommitteeKind)}
            className={inputClass}
          >
            {COMMITTEE_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kinds.${k}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tf('legalEntity')} error={issueFor(state, 'legalEntityId')}>
          <select
            name="legalEntityId"
            required
            defaultValue={entity}
            onChange={(e) => setEntity(e.target.value)}
            className={inputClass}
          >
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tf('location')} hint={tf('locationHint')}>
          <select name="locationId" defaultValue="" className={inputClass}>
            <option value="">{tf('wholeCompany')}</option>
            {sites
              .filter((s) => s.legalEntityId === entity)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label={tf('name')} error={issueFor(state, 'name')}>
          <input name="name" required minLength={2} maxLength={160} className={inputClass} />
        </Field>
        <Field label={tf('formedOn')} error={issueFor(state, 'formedOn')}>
          <input type="date" name="formedOn" required defaultValue={today} className={inputClass} />
        </Field>
        <Field label={tf('endsOn')} hint={tf('endsOnHint')} error={issueFor(state, 'endsOn')}>
          <input type="date" name="endsOn" className={inputClass} />
        </Field>
      </div>
      <Field label={tf('note')}>
        <textarea name="note" rows={2} maxLength={2000} className={inputClass} />
      </Field>
      <SubmitButton>{t('committees.create')}</SubmitButton>
    </Form>
  );
}

export function CommitteeEditForm({ committee }: { committee: CommitteeView }) {
  const t = useTranslations('relations');
  const tf = useTranslations('relations.committees.fields');
  const [state, action] = useActionState(updateCommittee.bind(null, committee.id), undefined);
  return (
    <Form state={state} action={action} className="space-y-4">
      <Errors state={state} />
      <Saved state={state}>{t('saved')}</Saved>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={tf('name')} error={issueFor(state, 'name')}>
          <input
            name="name"
            required
            minLength={2}
            maxLength={160}
            defaultValue={committee.name}
            className={inputClass}
          />
        </Field>
        <Field label={tf('formedOn')} error={issueFor(state, 'formedOn')}>
          <input
            type="date"
            name="formedOn"
            required
            defaultValue={committee.formedOn}
            className={inputClass}
          />
        </Field>
        <Field label={tf('endsOn')} hint={tf('endsOnHint')} error={issueFor(state, 'endsOn')}>
          <input
            type="date"
            name="endsOn"
            defaultValue={committee.endsOn ?? ''}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label={tf('note')}>
        <textarea
          name="note"
          rows={2}
          maxLength={2000}
          defaultValue={committee.note ?? ''}
          className={inputClass}
        />
      </Field>
      <SubmitButton>{t('save')}</SubmitButton>
    </Form>
  );
}

export function DeleteCommitteeButton({ id }: { id: string }) {
  const t = useTranslations('relations.committee');
  return (
    <ActionButton
      label={t('delete')}
      confirm={t('deleteConfirm')}
      run={() => deleteCommittee(id)}
      className={buttonClass.secondary}
    />
  );
}

export function MemberForm({ committeeId, today }: { committeeId: string; today: string }) {
  const t = useTranslations('relations');
  const tc = useTranslations('relations.committee');
  const [state, action] = useActionState(addCommitteeMember.bind(null, committeeId), undefined);
  const [who, setWho] = useState<'employee' | 'outsider'>('employee');
  return (
    <Form state={state} action={action} className="space-y-4">
      <Errors state={state} />
      <fieldset className="flex flex-wrap gap-4 text-sm">
        <legend className="mb-1 font-medium text-slate-800">{tc('who')}</legend>
        {(['employee', 'outsider'] as const).map((w) => (
          <label key={w} className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="who"
              value={w}
              checked={who === w}
              onChange={() => setWho(w)}
            />
            {w === 'employee' ? tc('employee') : tc('outsiderOption')}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        {who === 'employee' ? (
          <Field label={tc('employeeCode')} error={issueFor(state, 'employeeCode')}>
            <input name="employeeCode" required maxLength={40} className={inputClass} />
          </Field>
        ) : (
          <Field
            label={tc('outsiderName')}
            hint={tc('outsiderHint')}
            error={issueFor(state, 'name')}
          >
            <input name="name" required minLength={2} maxLength={160} className={inputClass} />
          </Field>
        )}
        {who === 'outsider' && (
          <Field label={tc('outsiderGender')}>
            <select name="gender" defaultValue="" className={inputClass}>
              <option value="">{tc('genderNotGiven')}</option>
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {t(`genders.${g}`)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={tc('memberColumns.side')}>
          <select name="side" defaultValue="worker" className={inputClass}>
            {COMMITTEE_SIDES.map((s) => (
              <option key={s} value={s}>
                {t(`sides.${s}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tc('memberColumns.role')}>
          <select name="role" defaultValue="member" className={inputClass}>
            {COMMITTEE_ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tc('memberColumns.selection')}>
          <select name="selection" defaultValue="elected" className={inputClass}>
            {COMMITTEE_SELECTIONS.map((s) => (
              <option key={s} value={s}>
                {t(`selections.${s}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={tc('fromOn')} error={issueFor(state, 'fromOn')}>
          <input type="date" name="fromOn" required defaultValue={today} className={inputClass} />
        </Field>
      </div>
      <SubmitButton>{tc('add')}</SubmitButton>
    </Form>
  );
}

/** The member's last day on the committee. */
export function EndMemberForm({
  committeeId,
  memberId,
  today,
}: {
  committeeId: string;
  memberId: string;
  today: string;
}) {
  const t = useTranslations('relations.committee');
  const [state, action] = useActionState(
    endCommitteeMember.bind(null, committeeId, memberId),
    undefined,
  );
  return (
    <Form state={state} action={action} className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`end-${memberId}`}>
        {t('endOn')}
      </label>
      <input
        id={`end-${memberId}`}
        type="date"
        name="toOn"
        required
        defaultValue={today}
        className={`${inputClass} w-40 py-1`}
      />
      <SubmitButton variant="secondary">{t('end')}</SubmitButton>
      {state?.error && (
        <span className="text-xs text-red-600">
          <ErrorText state={state} />
        </span>
      )}
    </Form>
  );
}

/** A meeting held: its agenda, minutes, when they went out, and the decisions taken. */
export function MeetingForm({
  committeeId,
  meeting,
  today,
}: {
  committeeId: string;
  meeting?: CommitteeMeetingView;
  today: string;
}) {
  const t = useTranslations('relations');
  const tc = useTranslations('relations.committee');
  const [state, action] = useActionState(
    meeting
      ? updateMeeting.bind(null, committeeId, meeting.id)
      : addMeeting.bind(null, committeeId),
    undefined,
  );
  const decisions = [
    ...(meeting?.decisions ?? []),
    { text: '', dueOn: null, done: false },
    { text: '', dueOn: null, done: false },
  ];
  return (
    <Form state={state} action={action} className="space-y-4">
      <Errors state={state} />
      {meeting && <Saved state={state}>{t('saved')}</Saved>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={tc('heldOn')} error={issueFor(state, 'heldOn')}>
          <input
            type="date"
            name="heldOn"
            required
            max={today}
            defaultValue={meeting?.heldOn ?? today}
            className={inputClass}
          />
        </Field>
        <Field label={tc('attendees')} error={issueFor(state, 'attendees')}>
          <input
            name="attendees"
            inputMode="numeric"
            defaultValue={meeting?.attendees ?? ''}
            className={inputClass}
          />
        </Field>
        <Field
          label={tc('minutesSentOn')}
          hint={tc('minutesSentHint')}
          error={issueFor(state, 'minutesSentOn')}
        >
          <input
            type="date"
            name="minutesSentOn"
            max={today}
            defaultValue={meeting?.minutesSentOn ?? ''}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label={tc('agenda')}>
        <textarea
          name="agenda"
          rows={2}
          defaultValue={meeting?.agenda ?? ''}
          className={inputClass}
        />
      </Field>
      <Field label={tc('minutes')}>
        <textarea
          name="minutes"
          rows={4}
          defaultValue={meeting?.minutes ?? ''}
          className={inputClass}
        />
      </Field>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-800">{tc('decisions')}</legend>
        {decisions.map((d, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]">
            <input
              name={`decisions.${i}.text`}
              aria-label={tc('decision', { n: i + 1 })}
              placeholder={tc('decision', { n: i + 1 })}
              maxLength={1000}
              defaultValue={d.text}
              className={inputClass}
            />
            <input
              type="date"
              name={`decisions.${i}.dueOn`}
              aria-label={tc('dueOn')}
              defaultValue={d.dueOn ?? ''}
              className={inputClass}
            />
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" name={`decisions.${i}.done`} defaultChecked={d.done} />
              {tc('done')}
            </label>
          </div>
        ))}
      </fieldset>
      <SubmitButton>{meeting ? t('save') : tc('record')}</SubmitButton>
    </Form>
  );
}

export function DecisionToggle({
  committeeId,
  meetingId,
  index,
  done,
}: {
  committeeId: string;
  meetingId: string;
  index: number;
  done: boolean;
}) {
  const t = useTranslations('relations.committee');
  return (
    <ActionButton
      label={done ? t('markOpen') : t('markDone')}
      run={() => setDecisionDone(committeeId, meetingId, index, !done)}
    />
  );
}
