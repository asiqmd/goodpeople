'use client';

import {
  DEFAULT_CANDIDATE_RETENTION_MONTHS,
  DEFAULT_SCORECARD_CRITERIA,
  EMPLOYMENT_TYPES,
  OPENING_REASONS,
  type OpeningDetail,
  type OrgSnapshot,
  type RecruitmentSettingsView,
  type Ref,
} from '@gp/shared';
import { useTranslations } from 'next-intl';
import { useActionState, useState, useTransition } from 'react';
import {
  createOpening,
  moveOpening,
  saveOpeningPost,
  saveRecruitmentSettings,
  updateOpening,
  type OpeningMove,
} from '@/app/actions/openings';
import type { ActionState } from '@/app/actions/platform';
import { Markdown } from '@/lib/help/markdown';
import { ErrorText, Form, issueFor, SubmitButton } from '../forms';
import { Banner, buttonClass, Field, inputClass } from '../ui';

export interface Choice {
  id: string;
  label: string;
}

function Refused({ state }: { state: ActionState<unknown> }) {
  if (!state?.error || state.issues?.length) return null;
  return (
    <Banner tone="red">
      <ErrorText state={state} />
    </Banner>
  );
}

const activeChoices = (rows: { isActive: boolean; id: string; name: string }[]) =>
  rows.filter((r) => r.isActive).map((r) => ({ id: r.id, label: r.name }));

/** A stored amount as typed: 12500.00 → 12500. */
const amount = (v: string | null | undefined) => (v ? String(Number(v)) : '');

function Select({
  name,
  choices,
  defaultValue,
  none,
  required,
  onChange,
}: {
  name: string;
  choices: Choice[];
  defaultValue?: string | null;
  none?: string;
  required?: boolean;
  onChange?: (value: string) => void;
}) {
  return (
    <select
      name={name}
      required={required}
      defaultValue={defaultValue ?? ''}
      onChange={onChange && ((e) => onChange(e.target.value))}
      className={inputClass}
    >
      {none !== undefined && <option value="">{none}</option>}
      {choices.map((c) => (
        <option key={c.id} value={c.id}>
          {c.label}
        </option>
      ))}
    </select>
  );
}

/**
 * A new opening, or a draft's details: the position, why it is needed, its budget and hiring
 * manager. `org` and the people lists are null for a line manager, who drafts for their own
 * team as its hiring manager and leaves the rest to HR.
 */
export function OpeningForm({
  opening,
  entities,
  org,
  managers,
  people,
}: {
  opening?: OpeningDetail;
  entities: Ref[];
  org: Pick<OrgSnapshot, 'orgUnits' | 'locations' | 'designations' | 'grades'> | null;
  managers: Choice[] | null;
  people: Choice[] | null;
}) {
  const t = useTranslations('openings.form');
  const th = useTranslations('hr.employmentTypes');
  const [state, action] = useActionState<ActionState<OpeningDetail>, FormData>(
    opening ? updateOpening.bind(null, opening.id) : createOpening,
    undefined,
  );
  const [entity, setEntity] = useState(opening?.legalEntity.id ?? entities[0]?.id ?? '');
  const [reason, setReason] = useState(opening?.reason ?? 'new_position');
  /** The company's active units or locations, and the one the opening has. */
  const ofEntity = (
    rows: { legalEntityId: string; isActive: boolean; id: string; name: string }[],
    current: string | undefined,
  ) =>
    rows
      .filter((r) => r.legalEntityId === entity && (r.isActive || r.id === current))
      .map((r) => ({ id: r.id, label: r.name }));

  return (
    <Form state={state} action={action} className="space-y-4">
      <Refused state={state} />
      {state?.ok && <Banner tone="green">{t('saved')}</Banner>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('title')} hint={t('titleHint')} error={issueFor(state, 'title')}>
          <input
            name="title"
            required
            maxLength={160}
            defaultValue={opening?.title}
            className={inputClass}
          />
        </Field>
        <Field label={t('company')} error={issueFor(state, 'legalEntityId')}>
          <Select
            name="legalEntityId"
            required
            choices={entities.map((e) => ({ id: e.id, label: e.name }))}
            defaultValue={entity}
            onChange={setEntity}
          />
        </Field>
        {org && (
          <>
            <Field label={t('unit')} error={issueFor(state, 'orgUnitId')}>
              <Select
                key={`unit-${entity}`}
                name="orgUnitId"
                none={t('none')}
                choices={ofEntity(org.orgUnits, opening?.orgUnit?.id)}
                defaultValue={opening?.orgUnit?.id}
              />
            </Field>
            <Field label={t('location')} error={issueFor(state, 'locationId')}>
              <Select
                key={`location-${entity}`}
                name="locationId"
                none={t('none')}
                choices={ofEntity(org.locations, opening?.location?.id)}
                defaultValue={opening?.location?.id}
              />
            </Field>
            <Field label={t('designation')} error={issueFor(state, 'designationId')}>
              <Select
                name="designationId"
                none={t('none')}
                choices={activeChoices(org.designations)}
                defaultValue={opening?.designation?.id}
              />
            </Field>
            <Field label={t('grade')} error={issueFor(state, 'gradeId')}>
              <Select
                name="gradeId"
                none={t('none')}
                choices={activeChoices(org.grades)}
                defaultValue={opening?.grade?.id}
              />
            </Field>
          </>
        )}
        <Field label={t('employmentType')} error={issueFor(state, 'employmentType')}>
          <Select
            name="employmentType"
            required
            choices={EMPLOYMENT_TYPES.map((type) => ({ id: type, label: th(type) }))}
            defaultValue={opening?.employmentType ?? 'permanent'}
          />
        </Field>
        <Field label={t('headcount')} error={issueFor(state, 'headcount')}>
          <input
            name="headcount"
            type="number"
            min={1}
            max={1000}
            required
            defaultValue={opening?.headcount ?? 1}
            className={inputClass}
          />
        </Field>
        <Field label={t('reason')} error={issueFor(state, 'reason')}>
          <Select
            name="reason"
            choices={OPENING_REASONS.filter((r) => people || r === 'new_position').map((r) => ({
              id: r,
              label: t(`reasons.${r}`),
            }))}
            defaultValue={reason}
            onChange={(v) => setReason(v as typeof reason)}
          />
        </Field>
        {reason === 'replacement' && people && (
          <Field label={t('replaces')} error={issueFor(state, 'replacesEmployeeId')}>
            <Select
              name="replacesEmployeeId"
              required
              none={t('choose')}
              choices={people}
              defaultValue={opening?.replaces?.id}
            />
          </Field>
        )}
        <Field label={t('budgetMin')} hint={t('budgetHint')} error={issueFor(state, 'budgetMin')}>
          <input
            name="budgetMin"
            inputMode="decimal"
            defaultValue={amount(opening?.budgetMin)}
            className={inputClass}
          />
        </Field>
        <Field label={t('budgetMax')} error={issueFor(state, 'budgetMax')}>
          <input
            name="budgetMax"
            inputMode="decimal"
            defaultValue={amount(opening?.budgetMax)}
            className={inputClass}
          />
        </Field>
        {managers && (
          <Field
            label={t('hiringManager')}
            hint={t('hiringManagerHint')}
            error={issueFor(state, 'hiringManagerEmployeeId')}
          >
            <Select
              name="hiringManagerEmployeeId"
              none={t('choose')}
              choices={managers}
              defaultValue={opening?.hiringManager?.id}
            />
          </Field>
        )}
      </div>
      <Field label={t('justification')} error={issueFor(state, 'justification')}>
        <textarea
          name="justification"
          rows={3}
          maxLength={2000}
          defaultValue={opening?.justification ?? ''}
          className={inputClass}
        />
      </Field>
      <Field
        label={t('criteria')}
        hint={t('criteriaHint')}
        error={issueFor(state, 'scorecardCriteria')}
      >
        <textarea
          name="scorecardCriteria"
          rows={4}
          defaultValue={(opening?.scorecardCriteria ?? DEFAULT_SCORECARD_CRITERIA).join('\n')}
          className={inputClass}
        />
      </Field>
      <SubmitButton>{opening ? t('save') : t('create')}</SubmitButton>
    </Form>
  );
}

const LANGUAGES = ['en', 'bn'] as const;
type Language = (typeof LANGUAGES)[number];
const suffix = (language: Language) => (language === 'en' ? 'En' : 'Bn');

const tab = (active: boolean) =>
  `rounded-md px-3 py-1.5 text-sm font-medium ${
    active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
  }`;

/**
 * The job post: a title and a description in English, Bangla or both (each tab with a preview
 * as the careers page shows it), the closing date and whether the salary is shown.
 */
export function PostEditor({
  opening,
  today,
  budget,
}: {
  opening: OpeningDetail;
  today: string;
  /** The budget as shown when the salary is, or null when there is none. */
  budget: string | null;
}) {
  const t = useTranslations('openings.post');
  const [state, action] = useActionState<ActionState<OpeningDetail>, FormData>(
    saveOpeningPost.bind(null, opening.id),
    undefined,
  );
  const [language, setLanguage] = useState<Language>(
    !opening.postTitleEn && opening.postTitleBn ? 'bn' : 'en',
  );
  const [descriptions, setDescriptions] = useState({
    en: opening.descriptionEn ?? '',
    bn: opening.descriptionBn ?? '',
  });

  return (
    <Form state={state} action={action} className="space-y-4">
      <Refused state={state} />
      {state?.ok && <Banner tone="green">{t('saved')}</Banner>}
      <div className="inline-flex rounded-lg bg-slate-100 p-0.5" role="tablist">
        {LANGUAGES.map((l) => (
          <button
            key={l}
            type="button"
            role="tab"
            aria-selected={language === l}
            onClick={() => setLanguage(l)}
            className={tab(language === l)}
          >
            {t(`languages.${l}`)}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">{t('languagesHint')}</p>
      {LANGUAGES.map((l) => (
        // Both languages stay in the form; only the chosen one shows.
        <div key={l} hidden={language !== l} lang={l} className="space-y-4">
          <Field label={t('title')} error={issueFor(state, `postTitle${suffix(l)}`)}>
            <input
              name={`postTitle${suffix(l)}`}
              maxLength={160}
              defaultValue={(l === 'en' ? opening.postTitleEn : opening.postTitleBn) ?? ''}
              className={inputClass}
            />
          </Field>
          <div className="grid gap-4 lg:grid-cols-2">
            <Field
              label={t('description')}
              hint={t('descriptionHint')}
              error={issueFor(state, `description${suffix(l)}`)}
            >
              <textarea
                name={`description${suffix(l)}`}
                rows={14}
                maxLength={10000}
                defaultValue={descriptions[l]}
                onChange={(e) => setDescriptions((d) => ({ ...d, [l]: e.target.value }))}
                className={`${inputClass} font-mono`}
              />
            </Field>
            <div className="text-sm">
              <p className="font-medium text-slate-800">{t('preview')}</p>
              <div className="mt-1 min-h-24 rounded-lg bg-slate-50 p-4 ring-1 ring-inset ring-slate-200">
                {descriptions[l].trim() ? (
                  <Markdown source={descriptions[l]} />
                ) : (
                  <p className="text-slate-400">{t('previewEmpty')}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('closesOn')} hint={t('closesOnHint')} error={issueFor(state, 'closesOn')}>
          <input
            type="date"
            name="closesOn"
            required
            min={today}
            defaultValue={opening.closesOn ?? ''}
            className={inputClass}
          />
        </Field>
        <label className="flex items-start gap-2 self-center text-sm">
          <input
            type="checkbox"
            name="showSalary"
            defaultChecked={opening.showSalary}
            disabled={!budget}
            className="mt-1"
          />
          <span>
            <span className="font-medium text-slate-800">{t('showSalary')}</span>
            <span className="block text-xs text-slate-500">
              {budget ? t('showSalaryHint', { budget }) : t('noBudget')}
            </span>
          </span>
        </label>
      </div>
      <SubmitButton>{t('save')}</SubmitButton>
    </Form>
  );
}

/** Submit, publish, close, reopen or cancel; cancelling asks first. */
export function OpeningMoveButton({
  id,
  move,
  primary,
}: {
  id: string;
  move: OpeningMove;
  primary?: boolean;
}) {
  const t = useTranslations('openings.moves');
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>(undefined);
  return (
    <span className="inline-flex flex-col items-start gap-2">
      <button
        type="button"
        disabled={pending}
        className={primary ? buttonClass.primary : buttonClass.secondary}
        onClick={() => {
          if (move === 'cancel' && !window.confirm(t('cancelConfirm'))) return;
          start(async () => setState(await moveOpening(id, move)));
        }}
      >
        {pending ? '…' : t(move)}
      </button>
      <Refused state={state} />
    </span>
  );
}

/** Ready text to paste where no formatting is kept, with a button that copies it. */
export function CopyText({ label, text }: { label: string; text: string }) {
  const t = useTranslations('openings.copy');
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-800">{label}</span>
        <button
          type="button"
          className={buttonClass.secondary}
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          }}
        >
          {copied ? t('copied') : t('copy')}
        </button>
      </div>
      <textarea readOnly rows={10} value={text} className={`${inputClass} font-mono text-xs`} />
    </div>
  );
}

/** The careers page on or off, its introduction, and how long candidates' data is kept. */
export function RecruitmentSettingsForm({ settings }: { settings: RecruitmentSettingsView }) {
  const t = useTranslations('openings.settings');
  const [state, action] = useActionState<ActionState<RecruitmentSettingsView>, FormData>(
    saveRecruitmentSettings,
    undefined,
  );
  return (
    <Form state={state} action={action} className="space-y-4">
      <Refused state={state} />
      {state?.ok && <Banner tone="green">{t('saved')}</Banner>}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="careersEnabled"
          defaultChecked={settings.careersEnabled}
          className="mt-1"
        />
        <span>
          <span className="font-medium text-slate-800">{t('careersEnabled')}</span>
          <span className="block text-xs text-slate-500">{t('careersEnabledHint')}</span>
        </span>
      </label>
      <div className="grid gap-4 lg:grid-cols-2">
        <Field label={t('introEn')} hint={t('introHint')} error={issueFor(state, 'introEn')}>
          <textarea
            name="introEn"
            rows={5}
            maxLength={4000}
            defaultValue={settings.introEn ?? ''}
            className={inputClass}
          />
        </Field>
        <Field label={t('introBn')} error={issueFor(state, 'introBn')}>
          <textarea
            name="introBn"
            lang="bn"
            rows={5}
            maxLength={4000}
            defaultValue={settings.introBn ?? ''}
            className={inputClass}
          />
        </Field>
        <Field
          label={t('retentionMonths')}
          hint={t('retentionHint', { months: DEFAULT_CANDIDATE_RETENTION_MONTHS })}
          error={issueFor(state, 'retentionMonths')}
        >
          <input
            type="number"
            name="retentionMonths"
            min={1}
            max={60}
            required
            defaultValue={settings.retentionMonths}
            className={inputClass}
          />
        </Field>
        <Field
          label={t('privacyEmail')}
          hint={t('privacyEmailHint')}
          error={issueFor(state, 'privacyEmail')}
        >
          <input
            type="email"
            name="privacyEmail"
            maxLength={200}
            defaultValue={settings.privacyEmail ?? ''}
            className={inputClass}
          />
        </Field>
      </div>
      <SubmitButton>{t('save')}</SubmitButton>
    </Form>
  );
}
