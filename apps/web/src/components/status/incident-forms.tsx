'use client';

import {
  INCIDENT_IMPACTS,
  INCIDENT_KINDS,
  INCIDENT_STATUSES,
  MAINTENANCE_STATUSES,
  STATUS_COMPONENTS,
  type IncidentKind,
  type IncidentView,
} from '@gp/shared';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import type { ActionState } from '@/app/actions/platform';
import { createIncident, postIncidentUpdate } from '@/app/actions/status';
import { ErrorText, Form, issueFor, SubmitButton } from '../forms';
import { Banner, Field, inputClass } from '../ui';

const statusesOf = (kind: IncidentKind) =>
  kind === 'incident' ? INCIDENT_STATUSES : MAINTENANCE_STATUSES;

/** The English and Bangla text every post and update needs. */
function Bodies({ state }: { state: ActionState<IncidentView> }) {
  const t = useTranslations('statusConsole');
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t('bodyEn')} hint={t('bodyHint')} error={issueFor(state, 'bodyEn')}>
        <textarea name="bodyEn" required rows={3} lang="en" className={inputClass} />
      </Field>
      <Field label={t('bodyBn')} hint={t('bodyHint')} error={issueFor(state, 'bodyBn')}>
        <textarea name="bodyBn" required rows={3} lang="bn" className={inputClass} />
      </Field>
    </div>
  );
}

function FormMessage({ state, done }: { state: ActionState<IncidentView>; done: string }) {
  if (state?.error && !state.issues?.length) {
    return (
      <Banner tone="red">
        <ErrorText state={state} />
      </Banner>
    );
  }
  return state?.ok ? <Banner tone="green">{done}</Banner> : null;
}

/** A new incident (now, with its impact) or planned maintenance (with its window). */
export function CreateIncidentForm() {
  const t = useTranslations('statusConsole');
  const ts = useTranslations('status');
  const [kind, setKind] = useState<IncidentKind>('incident');
  const [state, action] = useActionState<ActionState<IncidentView>, FormData>(
    createIncident,
    undefined,
  );
  // The form starts empty again after each post.
  const key = state?.ok ? state.result?.id : 'new';
  return (
    <Form key={key} state={state} action={action} className="space-y-4">
      <FormMessage state={state} done={t('posted')} />
      <fieldset>
        <legend className="text-sm font-medium text-slate-800">{t('kind')}</legend>
        <div className="mt-1 flex flex-wrap gap-4 text-sm">
          {INCIDENT_KINDS.map((k) => (
            <label key={k} className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="kind"
                value={k}
                checked={kind === k}
                onChange={() => setKind(k)}
              />
              {t(`kinds.${k}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('titleEn')} error={issueFor(state, 'titleEn')}>
          <input name="titleEn" required maxLength={160} lang="en" className={inputClass} />
        </Field>
        <Field label={t('titleBn')} error={issueFor(state, 'titleBn')}>
          <input name="titleBn" required maxLength={160} lang="bn" className={inputClass} />
        </Field>
      </div>
      <fieldset>
        <legend className="text-sm font-medium text-slate-800">{t('components')}</legend>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {STATUS_COMPONENTS.map((c) => (
            <label key={c} className="inline-flex items-center gap-2">
              <input type="checkbox" name="components" value={c} />
              {ts(`components.${c}`)}
            </label>
          ))}
        </div>
        {issueFor(state, 'components') && (
          <p className="mt-1 text-xs text-red-600">{issueFor(state, 'components')}</p>
        )}
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        {kind === 'incident' && (
          <Field label={t('impact')} error={issueFor(state, 'impact')}>
            <select name="impact" required className={inputClass}>
              {INCIDENT_IMPACTS.map((i) => (
                <option key={i} value={i}>
                  {ts(`states.${i}`)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label={t('status')} error={issueFor(state, 'status')}>
          <select key={kind} name="status" required className={inputClass}>
            {statusesOf(kind).map((s) => (
              <option key={s} value={s}>
                {ts(`incidentStatuses.${s}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={t('startsAt')}
          hint={kind === 'incident' ? t('startsAtHint') : undefined}
          error={issueFor(state, 'startsAt')}
        >
          <input
            type="datetime-local"
            name="startsAt"
            required={kind === 'maintenance'}
            className={inputClass}
          />
        </Field>
        {kind === 'maintenance' && (
          <Field label={t('endsAt')} error={issueFor(state, 'endsAt')}>
            <input type="datetime-local" name="endsAt" required className={inputClass} />
          </Field>
        )}
      </div>
      <Bodies state={state} />
      <SubmitButton>{t('post')}</SubmitButton>
    </Form>
  );
}

/** A new status and text for one incident or maintenance; a finished status closes it. */
export function IncidentUpdateForm({ incident }: { incident: IncidentView }) {
  const t = useTranslations('statusConsole');
  const ts = useTranslations('status');
  const [state, action] = useActionState<ActionState<IncidentView>, FormData>(
    postIncidentUpdate.bind(null, incident.id),
    undefined,
  );
  const key = state?.ok ? state.result?.updates[0]?.id : 'new';
  return (
    <Form key={key} state={state} action={action} className="space-y-4">
      <FormMessage state={state} done={t('updated')} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('status')} hint={t('updateHint')} error={issueFor(state, 'status')}>
          <select name="status" defaultValue={incident.status} className={inputClass}>
            {statusesOf(incident.kind).map((s) => (
              <option key={s} value={s}>
                {ts(`incidentStatuses.${s}`)}
              </option>
            ))}
          </select>
        </Field>
        {incident.kind === 'incident' && (
          <Field label={t('impact')} error={issueFor(state, 'impact')}>
            <select name="impact" defaultValue={incident.impact} className={inputClass}>
              {INCIDENT_IMPACTS.map((i) => (
                <option key={i} value={i}>
                  {ts(`states.${i}`)}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <Bodies state={state} />
      <SubmitButton>{t('postUpdate')}</SubmitButton>
    </Form>
  );
}
