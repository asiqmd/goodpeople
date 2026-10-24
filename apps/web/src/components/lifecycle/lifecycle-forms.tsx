'use client';

import {
  EMPLOYMENT_TYPES,
  SEPARATION_TYPES,
  UPLOAD_CATEGORIES,
  WORKER_CATEGORIES,
  type DocumentView,
  type ImportBatchView,
  type JobAssignmentView,
  type LetterPreview,
  type LetterTemplateView,
  type OrgSnapshot,
  type SeparationView,
} from '@gp/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useActionState, useRef, useState, useTransition } from 'react';
import {
  cancelSeparation,
  commitImport,
  correctJob,
  deleteDocument,
  extendProbation,
  issueLetter,
  previewLetter,
  recordSeparation,
  resetLetterTemplate,
  resign,
  setDocumentVisibility,
  updateLetterTemplate,
  uploadDocument,
  uploadImport,
} from '@/app/actions/lifecycle';
import type { ActionState } from '@/app/actions/platform';
import { ErrorText, Form, SubmitButton } from '../forms';
import { Banner, buttonClass, Field, inputClass } from '../ui';

function Errors({ state }: { state: ActionState<unknown> }) {
  if (!state?.error) return null;
  return (
    <Banner tone="red">
      <ErrorText state={state} />
      {state.issues?.length ? (
        <ul className="mt-1 list-inside list-disc">
          {state.issues.map((i) => (
            <li key={`${i.path}-${i.message}`}>{i.message}</li>
          ))}
        </ul>
      ) : null}
    </Banner>
  );
}

// ── Documents ────────────────────────────────────────────────────────────────

export function UploadDocumentForm({ employeeId }: { employeeId: string }) {
  const t = useTranslations('lifecycle.documents');
  const [state, action] = useActionState<ActionState<DocumentView>, FormData>(
    uploadDocument.bind(null, employeeId),
    undefined,
  );
  return (
    <Form state={state} action={action} className="space-y-4">
      <Errors state={state} />
      {state?.result && <Banner tone="green">{t('uploaded')}</Banner>}
      <div key={state?.result?.id} className="grid gap-4 sm:grid-cols-2">
        <Field label={t('file')} hint={t('fileHint')}>
          <input
            name="file"
            type="file"
            required
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="block w-full text-sm"
          />
        </Field>
        <Field label={t('category')}>
          <select name="category" required className={inputClass}>
            {UPLOAD_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`categories.${c}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('docTitle')}>
          <input name="title" required minLength={2} maxLength={160} className={inputClass} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('issuedOn')}>
            <input name="issuedOn" type="date" className={inputClass} />
          </Field>
          <Field label={t('expiresOn')}>
            <input name="expiresOn" type="date" className={inputClass} />
          </Field>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="visibleToEmployee" />
        {t('share')}
      </label>
      <SubmitButton>{t('upload')}</SubmitButton>
    </Form>
  );
}

export function DocumentActions({ id, visible }: { id: string; visible: boolean }) {
  const t = useTranslations('lifecycle.documents');
  const [pending, start] = useTransition();
  return (
    <span className="flex items-center gap-3 text-xs">
      <label className="flex items-center gap-1 text-slate-600">
        <input
          type="checkbox"
          defaultChecked={visible}
          disabled={pending}
          onChange={(e) => {
            const checked = e.target.checked;
            start(() => setDocumentVisibility(id, checked));
          }}
        />
        {t('shared')}
      </label>
      <button
        type="button"
        disabled={pending}
        className="font-medium text-red-700 hover:underline"
        onClick={() => {
          if (window.confirm(t('deleteConfirm'))) start(() => deleteDocument(id));
        }}
      >
        {t('delete')}
      </button>
    </span>
  );
}

// ── Letters ──────────────────────────────────────────────────────────────────

/**
 * Picks a template, asks for its extra fields, previews the letter as it will print and
 * issues it. Issuing numbers the letter and files the PDF with the employee's documents.
 */
export function IssueLetterForm({
  employeeId,
  templates,
}: {
  employeeId: string;
  templates: LetterTemplateView[];
}) {
  const t = useTranslations('lifecycle.letters');
  const locale = useLocale();
  const active = templates.filter((x) => x.isActive);
  const [templateId, setTemplateId] = useState(
    active.find((x) => x.language === locale)?.id ?? active[0]?.id ?? '',
  );
  const [preview, setPreview] = useState<LetterPreview | { error: string } | null>(null);
  const [previewing, startPreview] = useTransition();
  const [state, action] = useActionState<ActionState<DocumentView>, FormData>(
    issueLetter.bind(null, employeeId),
    undefined,
  );
  const form = useRef<HTMLFormElement>(null);
  const template = active.find((x) => x.id === templateId);

  return (
    <Form ref={form} state={state} action={action} className="space-y-4">
      <Errors state={state} />
      {state?.result && (
        <Banner tone="green">
          {t('issued', { refNo: state.result.refNo ?? '' })}{' '}
          <a
            href={`/workspace/files/documents/${state.result.id}`}
            target="_blank"
            rel="noreferrer"
            className="font-medium underline"
          >
            {t('open')}
          </a>
        </Banner>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('template')}>
          <select
            name="templateId"
            value={templateId}
            onChange={(e) => {
              setTemplateId(e.target.value);
              setPreview(null);
            }}
            className={inputClass}
          >
            {active.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} ({x.language === 'bn' ? 'বাংলা' : 'English'})
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('date')}>
          <input name="date" type="date" className={inputClass} />
        </Field>
        {template?.extraFields.map((f) => (
          <Field key={`${templateId}-${f}`} label={f.replace('extra.', '')} hint={t('extraHint')}>
            <input name={f} required className={inputClass} />
          </Field>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="visibleToEmployee" defaultChecked />
        {t('share')}
      </label>
      <div className="flex gap-3">
        <button
          type="button"
          disabled={previewing}
          className={buttonClass.secondary}
          onClick={() =>
            startPreview(async () =>
              setPreview(await previewLetter(employeeId, new FormData(form.current!))),
            )
          }
        >
          {previewing ? '…' : t('preview')}
        </button>
        <SubmitButton>{t('issue')}</SubmitButton>
      </div>
      {preview && 'error' in preview && <Banner tone="red">{preview.error}</Banner>}
      {preview && 'html' in preview && (
        <div className="space-y-2">
          {preview.missing.length > 0 && (
            <Banner tone="amber">{t('missing', { fields: preview.missing.join(', ') })}</Banner>
          )}
          {/* A sandboxed frame: the letter's HTML cannot run or reach anything. */}
          <iframe
            title={t('preview')}
            sandbox=""
            srcDoc={preview.html}
            className="h-[640px] w-full rounded-lg bg-white ring-1 ring-slate-200"
          />
        </div>
      )}
    </Form>
  );
}

export function LetterTemplateForm({ template }: { template: LetterTemplateView }) {
  const t = useTranslations('lifecycle.letters');
  const [state, action] = useActionState<ActionState, FormData>(
    updateLetterTemplate.bind(null, template.id),
    undefined,
  );
  const [pending, start] = useTransition();
  return (
    <Form state={state} action={action} className="space-y-3">
      <Errors state={state} />
      {state?.ok && <Banner tone="green">{t('saved')}</Banner>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('name')}>
          <input name="name" required defaultValue={template.name} className={inputClass} />
        </Field>
        <Field label={t('subject')}>
          <input name="subject" required defaultValue={template.subject} className={inputClass} />
        </Field>
      </div>
      <Field label={t('body')} hint={t('bodyHint')}>
        <textarea
          name="body"
          required
          rows={14}
          defaultValue={template.body}
          lang={template.language}
          className={`${inputClass} font-mono text-xs leading-relaxed`}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={template.isActive} />
        {t('active')}
      </label>
      <div className="flex gap-3">
        <SubmitButton>{t('save')}</SubmitButton>
        {template.customized && (
          <button
            type="button"
            disabled={pending}
            className={buttonClass.secondary}
            onClick={() => {
              if (window.confirm(t('resetConfirm'))) start(() => resetLetterTemplate(template.id));
            }}
          >
            {t('reset')}
          </button>
        )}
      </div>
    </Form>
  );
}

// ── Separation and probation ─────────────────────────────────────────────────

export function RecordSeparationForm({ employeeId, today }: { employeeId: string; today: string }) {
  const t = useTranslations('lifecycle.separation');
  const [state, action] = useActionState<ActionState<SeparationView>, FormData>(
    recordSeparation.bind(null, employeeId),
    undefined,
  );
  return (
    <Form state={state} action={action} className="space-y-4">
      <Errors state={state} />
      {state?.result && <Banner tone="green">{t('recorded')}</Banner>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('type')}>
          <select name="type" required className={inputClass}>
            {SEPARATION_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`types.${type}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('noticeDate')}>
          <input
            name="noticeDate"
            type="date"
            required
            defaultValue={today}
            className={inputClass}
          />
        </Field>
        <Field label={t('lastWorkingDay')}>
          <input name="lastWorkingDay" type="date" required className={inputClass} />
        </Field>
      </div>
      <Field label={t('reason')}>
        <input name="reason" required minLength={3} maxLength={500} className={inputClass} />
      </Field>
      <p className="text-xs text-slate-500">{t('recordHint')}</p>
      <SubmitButton>{t('record')}</SubmitButton>
    </Form>
  );
}

export function ResignForm({ today }: { today: string }) {
  const t = useTranslations('lifecycle.separation');
  const [state, action] = useActionState<ActionState<SeparationView>, FormData>(resign, undefined);
  return (
    <Form state={state} action={action} className="space-y-4">
      <Errors state={state} />
      {state?.result && <Banner tone="green">{t('resignationSent')}</Banner>}
      <p className="text-sm text-slate-600">{t('resignHint')}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('lastWorkingDay')}>
          <input name="lastWorkingDay" type="date" required min={today} className={inputClass} />
        </Field>
        <Field label={t('reason')}>
          <input name="reason" required minLength={3} maxLength={500} className={inputClass} />
        </Field>
      </div>
      <SubmitButton variant="secondary">{t('resign')}</SubmitButton>
    </Form>
  );
}

export function CancelSeparationButton({ id }: { id: string }) {
  const t = useTranslations('lifecycle.separation');
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={buttonClass.ghost}
      onClick={() => {
        if (window.confirm(t('cancelConfirm'))) start(() => cancelSeparation(id));
      }}
    >
      {t('cancel')}
    </button>
  );
}

export function ExtendProbationForm({
  employeeId,
  current,
}: {
  employeeId: string;
  current: string;
}) {
  const t = useTranslations('lifecycle.probation');
  const [state, action] = useActionState<ActionState, FormData>(
    extendProbation.bind(null, employeeId),
    undefined,
  );
  return (
    <Form state={state} action={action} className="space-y-3">
      <Errors state={state} />
      {state?.ok && <Banner tone="green">{t('extended')}</Banner>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('until')} hint={t('untilHint')}>
          <input name="until" type="date" required min={current} className={inputClass} />
        </Field>
        <Field label={t('reason')}>
          <input name="reason" required minLength={3} className={inputClass} />
        </Field>
      </div>
      <SubmitButton variant="secondary">{t('extend')}</SubmitButton>
    </Form>
  );
}

function RefSelect({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string | undefined;
  options: { id: string; name: string }[];
}) {
  return (
    <Field label={label}>
      <select name={name} defaultValue={value ?? ''} className={inputClass}>
        <option value="">–</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** Fixes a mistake in one job history entry; later entries follow where they had the same value. */
export function CorrectJobForm({
  employeeId,
  job,
  org,
  managers,
}: {
  employeeId: string;
  job: JobAssignmentView;
  org: OrgSnapshot;
  managers: { id: string; name: string }[];
}) {
  const t = useTranslations('lifecycle.job');
  const th = useTranslations('hr');
  const [state, action] = useActionState<ActionState, FormData>(
    correctJob.bind(null, employeeId, job.id),
    undefined,
  );
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs font-medium text-brand-700">
        {t('correct')}
      </summary>
      <Form state={state} action={action} className="mt-3 space-y-3 rounded-lg bg-slate-50 p-3">
        <Errors state={state} />
        {state?.ok && <Banner tone="green">{t('corrected')}</Banner>}
        <div className="grid gap-3 sm:grid-cols-2">
          <RefSelect
            name="designationId"
            label={th('form.designation')}
            value={job.designation?.id}
            options={org.designations}
          />
          <RefSelect
            name="gradeId"
            label={th('form.grade')}
            value={job.grade?.id}
            options={org.grades}
          />
          <RefSelect
            name="orgUnitId"
            label={th('form.orgUnit')}
            value={job.orgUnit?.id}
            options={org.orgUnits}
          />
          <RefSelect
            name="locationId"
            label={th('form.location')}
            value={job.location?.id}
            options={org.locations}
          />
          <RefSelect
            name="costCentreId"
            label={th('form.costCentre')}
            value={job.costCentre?.id}
            options={org.costCentres}
          />
          <RefSelect
            name="managerId"
            label={th('form.manager')}
            value={job.manager?.id}
            options={managers}
          />
          <Field label={th('form.employmentType')}>
            <select name="employmentType" defaultValue={job.employmentType} className={inputClass}>
              {EMPLOYMENT_TYPES.map((e) => (
                <option key={e} value={e}>
                  {th(`employmentTypes.${e}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={th('form.workerCategory')}>
            <select name="workerCategory" defaultValue={job.workerCategory} className={inputClass}>
              {WORKER_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {th(`workerCategories.${c}`)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={t('reason')} hint={t('correctHint')}>
          <input name="reason" required minLength={3} className={inputClass} />
        </Field>
        <SubmitButton variant="secondary">{t('saveCorrection')}</SubmitButton>
      </Form>
    </details>
  );
}

// ── Import ───────────────────────────────────────────────────────────────────

export function ImportEmployeesForm() {
  const t = useTranslations('lifecycle.import');
  const [state, action] = useActionState<ActionState<ImportBatchView>, FormData>(
    uploadImport,
    undefined,
  );
  const [committed, setCommitted] = useState<ActionState<ImportBatchView>>();
  const [pending, start] = useTransition();
  const batch = committed?.result ?? state?.result;
  const commit = (onlyValid: boolean) =>
    start(async () => setCommitted(await commitImport(state!.result!.id, onlyValid)));

  return (
    <div className="space-y-4">
      <Form state={state} action={action} className="flex flex-wrap items-end gap-3">
        <Field label={t('file')}>
          <input
            name="file"
            type="file"
            required
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="block text-sm"
          />
        </Field>
        <SubmitButton>{t('check')}</SubmitButton>
      </Form>
      <Errors state={state} />
      <Errors state={committed} />
      {batch && (
        <div className="space-y-3">
          <Banner
            tone={
              batch.status === 'committed'
                ? 'green'
                : batch.validRows === batch.totalRows
                  ? 'green'
                  : 'amber'
            }
          >
            {batch.status === 'committed'
              ? t('committed', { count: batch.imported ?? 0 })
              : t('checked', { valid: batch.validRows, total: batch.totalRows })}
          </Banner>
          {batch.rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-500">
                  <tr>
                    <th className="py-2 pr-3 font-medium">{t('row')}</th>
                    <th className="py-2 pr-3 font-medium">{t('employee')}</th>
                    <th className="py-2 font-medium">{t('problems')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {batch.rows.map((r) => (
                    <tr key={r.row}>
                      <td className="py-2 pr-3 tabular-nums">{r.row}</td>
                      <td className="py-2 pr-3">
                        {r.fullName}{' '}
                        <span className="font-mono text-xs text-slate-400">{r.employeeCode}</span>
                      </td>
                      <td className="py-2 text-xs text-red-700">
                        {r.errors.map((e) => `${e.column}: ${e.message}`).join('; ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {batch.status === 'validated' && batch.validRows > 0 && (
            <div className="flex gap-3">
              {batch.validRows === batch.totalRows ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => commit(false)}
                  className={buttonClass.primary}
                >
                  {t('importAll', { count: batch.totalRows })}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => commit(true)}
                  className={buttonClass.secondary}
                >
                  {t('importValid', { count: batch.validRows })}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
