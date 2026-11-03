'use client';
import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ASSET_KINDS,
  HR_REQUEST_CATEGORIES,
  RECOGNITION_VALUES,
  type AnnouncementView,
  type OrgSnapshot,
  type SurveyView,
  type HrRequestView,
} from '@gp/shared';
import { saveEmployeeService, type ServiceAction } from '@/app/actions/employee-services';
import type { ActionState } from '@/app/actions/platform';
import { Form, SubmitButton, ErrorText } from '@/components/forms';
import { Banner, Field, inputClass, buttonClass } from '@/components/ui';
export function ServiceForm({
  kind,
  id,
  label,
  children,
}: {
  kind: ServiceAction;
  id?: string;
  label: string;
  children?: React.ReactNode;
}) {
  const t = useTranslations('services');
  const [state, action] = useActionState<ActionState<unknown>, FormData>(
    saveEmployeeService.bind(null, kind, id),
    undefined,
  );
  return (
    <Form action={action} state={state} className="space-y-4">
      {state?.error && (
        <Banner tone="red">
          {state.code && t.has(`errors.${state.code}`) ? (
            t(`errors.${state.code}`)
          ) : (
            <ErrorText state={state} />
          )}
          {state.issues?.map((issue) => (
            <p key={issue.path}>
              {issue.path}: {issue.message}
            </p>
          ))}
        </Banner>
      )}
      {state?.ok && <Banner tone="green">{t('saved')}</Banner>}
      {children}
      <SubmitButton>{label}</SubmitButton>
    </Form>
  );
}
function Text({
  name,
  label,
  type = 'text',
  optional = false,
  value,
  maxLength = 160,
}: {
  name: string;
  label: string;
  type?: string;
  optional?: boolean;
  value?: string;
  maxLength?: number;
}) {
  return (
    <Field label={label}>
      {type === 'textarea' ? (
        <textarea
          name={name}
          required={!optional}
          defaultValue={value}
          minLength={optional ? undefined : 2}
          maxLength={maxLength}
          rows={5}
          className={inputClass}
        />
      ) : (
        <input
          name={name}
          type={type}
          required={!optional}
          defaultValue={value}
          maxLength={maxLength}
          className={inputClass}
        />
      )}
    </Field>
  );
}
function Company({ org, value }: { org: OrgSnapshot; value?: string }) {
  const t = useTranslations('services');
  return (
    <Field label={t('company')}>
      <select name="legalEntityId" defaultValue={value} required className={inputClass}>
        {org.legalEntities
          .filter((e) => e.isActive)
          .map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
      </select>
    </Field>
  );
}
export function ReasonAction({
  kind,
  id,
  label,
}: {
  kind: ServiceAction;
  id: string;
  label: string;
}) {
  const t = useTranslations('services');
  return (
    <ServiceForm kind={kind} id={id} label={label}>
      <Text name="reason" label={t('reason')} maxLength={4000} />
    </ServiceForm>
  );
}
export function SurveyForm({ org, initial }: { org: OrgSnapshot; initial?: SurveyView }) {
  const t = useTranslations('services');
  const [questions, setQuestions] = useState(initial?.questions ?? []);
  const close = initial
    ? new Date(Date.parse(initial.closesAt) + 21600000).toISOString().slice(0, 16)
    : '';
  return (
    <ServiceForm kind="survey" id={initial?.id} label={t('saveDraft')}>
      <Banner tone="amber">
        {t('anonymousNote')} {t('cohortNote')}
      </Banner>
      <Company org={org} value={initial?.legalEntityId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Text name="title" label={t('title')} value={initial?.title} />
        <Text name="titleBn" label={t('titleBn')} value={initial?.titleBn} />
        <Text
          name="description"
          label={t('description')}
          type="textarea"
          maxLength={10000}
          value={initial?.description}
        />
        <Text
          name="descriptionBn"
          label={t('descriptionBn')}
          type="textarea"
          maxLength={10000}
          value={initial?.descriptionBn}
        />
        <Text name="closesAt" label={t('closesAt')} type="datetime-local" value={close} />
        <Field label={t('threshold')}>
          <input
            name="threshold"
            type="number"
            min={5}
            max={100}
            defaultValue={initial?.threshold ?? 5}
            required
            className={inputClass}
          />
        </Field>
      </div>
      <h3 className="font-medium">{t('pulseQuestions')}</h3>
      {questions.map((q, i) => (
        <fieldset key={i} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
          <Field label={`${t('question')} ${i + 1}`}>
            <input
              name="question"
              required
              maxLength={160}
              minLength={2}
              className={inputClass}
              value={q.text}
              onChange={(event) =>
                setQuestions(
                  questions.map((row, index) =>
                    index === i ? { ...row, text: event.target.value } : row,
                  ),
                )
              }
            />
          </Field>
          <Field label={`${t('questionBn')} ${i + 1}`}>
            <input
              name="questionBn"
              required
              maxLength={160}
              minLength={2}
              className={inputClass}
              value={q.textBn}
              onChange={(event) =>
                setQuestions(
                  questions.map((row, index) =>
                    index === i ? { ...row, textBn: event.target.value } : row,
                  ),
                )
              }
            />
          </Field>
          <button
            type="button"
            className={buttonClass.ghost}
            onClick={() => setQuestions(questions.filter((_, index) => index !== i))}
          >
            {t('remove')} {i + 1}
          </button>
        </fieldset>
      ))}
      {questions.length < 10 && (
        <button
          type="button"
          className={buttonClass.secondary}
          onClick={() => setQuestions([...questions, { text: '', textBn: '' }])}
        >
          {t('addQuestion')}
        </button>
      )}
    </ServiceForm>
  );
}
const scoreOptions = (max: number, min: number) =>
  Array.from({ length: max - min + 1 }, (_, i) => (
    <option key={i + min} value={i + min}>
      {i + min}
    </option>
  ));
export function SurveyResponseForm({ survey, bangla }: { survey: SurveyView; bangla: boolean }) {
  const t = useTranslations('services');
  return (
    <ServiceForm kind="respond" id={survey.id} label={t('submitSurvey')}>
      <Banner tone="amber">{t('anonymousNote')}</Banner>
      <Field label={t('enpsQuestion')} hint={t('enpsScale')}>
        <select name="enps" required defaultValue="" className={inputClass}>
          <option disabled value="">
            {t('choose')}
          </option>
          {scoreOptions(10, 0)}
        </select>
      </Field>
      {survey.questions.map((q, i) => (
        <Field key={i} label={bangla ? q.textBn : q.text} hint={t('pulseScale')}>
          <select name="score" required defaultValue="" className={inputClass}>
            <option disabled value="">
              {t('choose')}
            </option>
            {scoreOptions(5, 1)}
          </select>
        </Field>
      ))}
    </ServiceForm>
  );
}
export function AnnouncementForm({
  org,
  initial,
}: {
  org: OrgSnapshot;
  initial?: AnnouncementView;
}) {
  const t = useTranslations('services');
  return (
    <ServiceForm kind="announcement" id={initial?.id} label={t('saveDraft')}>
      <Company org={org} value={initial?.legalEntityId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Text name="title" label={t('title')} value={initial?.title} />
        <Text name="titleBn" label={t('titleBn')} value={initial?.titleBn} />
        <Text
          name="body"
          label={t('body')}
          type="textarea"
          maxLength={10000}
          value={initial?.body}
        />
        <Text
          name="bodyBn"
          label={t('bodyBn')}
          type="textarea"
          maxLength={10000}
          value={initial?.bodyBn}
        />
        <Text name="dueOn" label={t('dueOn')} type="date" optional value={initial?.dueOn ?? ''} />
        <Text
          name="expiresOn"
          label={t('expiresOn')}
          type="date"
          optional
          value={initial?.expiresOn ?? ''}
        />
      </div>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="requiresAcknowledgement"
          defaultChecked={initial?.requiresAcknowledgement}
        />
        {t('requiresAcknowledgement')}
      </label>
      <p className="text-sm text-slate-600">{t('policyNote')}</p>
    </ServiceForm>
  );
}
export function RecognitionForm() {
  const t = useTranslations('services');
  return (
    <ServiceForm kind="recognition" label={t('newRecognition')}>
      <p className="text-sm text-slate-600">{t('recognitionNote')}</p>
      <Text name="employeeCode" label={t('employeeCode')} maxLength={40} />
      <Field label={t('value')}>
        <select name="value" className={inputClass}>
          {RECOGNITION_VALUES.map((v) => (
            <option key={v} value={v}>
              {t(`values.${v}`)}
            </option>
          ))}
        </select>
      </Field>
      <Text name="message" label={t('message')} type="textarea" maxLength={1000} />
    </ServiceForm>
  );
}
export function RequestForm() {
  const t = useTranslations('services');
  return (
    <ServiceForm kind="request" label={t('newRequest')}>
      <Field label={t('category')}>
        <select name="category" className={inputClass}>
          {HR_REQUEST_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`categories.${c}`)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('priority')}>
        <select name="priority" className={inputClass}>
          {['normal', 'urgent'].map((c) => (
            <option key={c} value={c}>
              {t(`priorities.${c}`)}
            </option>
          ))}
        </select>
      </Field>
      <Text name="subject" label={t('subject')} />
      <Text name="body" label={t('requestBody')} type="textarea" maxLength={10000} />
    </ServiceForm>
  );
}
export function RequestReplyForm({ id, manage }: { id: string; manage: boolean }) {
  const t = useTranslations('services');
  return (
    <ServiceForm kind="reply" id={id} label={t('reply')}>
      <Text name="body" label={t('replyBody')} type="textarea" maxLength={10000} />
      {manage && (
        <label className="flex items-center gap-2">
          <input type="checkbox" name="internal" />
          {t('internal')}
        </label>
      )}
    </ServiceForm>
  );
}
export function RequestUpdateForm({
  request,
  handlers,
}: {
  request: HrRequestView;
  handlers: { id: string; name: string }[];
}) {
  const t = useTranslations('services');
  const statuses = request.manage
    ? ['open', 'in_progress'].includes(request.status)
      ? ['in_progress', 'resolved']
      : []
    : [];
  // An HR login can also be the requester; owner-only closure/reopening is still checked by the API.
  return (
    <ServiceForm kind="updateRequest" id={request.id} label={t('updateRequest')}>
      <Field label={t('status')}>
        <select name="status" defaultValue="" className={inputClass}>
          <option value="">{t(`states.${request.status}`)}</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {t(`states.${s}`)}
            </option>
          ))}
        </select>
      </Field>
      {request.manage && (
        <Field label={t('assignee')}>
          <select name="assigneeId" defaultValue="" className={inputClass}>
            <option value="">{t('keepHandler')}</option>
            <option value="__unassign">{t('unassigned')}</option>
            {handlers.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Text name="reason" label={t('reason')} maxLength={4000} />
    </ServiceForm>
  );
}
export function OwnerRequestAction({ id, status }: { id: string; status: 'open' | 'closed' }) {
  const t = useTranslations('services');
  return (
    <ServiceForm
      kind="updateRequest"
      id={id}
      label={t(status === 'open' ? 'reopen' : 'closeRequest')}
    >
      <input type="hidden" name="status" value={status} />
      <Text name="reason" label={t('reason')} maxLength={4000} />
    </ServiceForm>
  );
}
export function AssetForm({ org }: { org: OrgSnapshot }) {
  const t = useTranslations('services');
  return (
    <ServiceForm kind="asset" label={t('newAsset')}>
      <Company org={org} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Text name="tag" label={t('tag')} maxLength={40} />
        <Text name="name" label={t('name')} />
        <Text name="nameBn" label={t('nameBn')} />
        <Text name="serialNumber" label={t('serialNumber')} optional />
      </div>
      <Field label={t('kind')}>
        <select name="kind" className={inputClass}>
          {ASSET_KINDS.map((v) => (
            <option key={v} value={v}>
              {t(`kinds.${v}`)}
            </option>
          ))}
        </select>
      </Field>
    </ServiceForm>
  );
}
export function IssueForm({ id }: { id: string }) {
  const t = useTranslations('services');
  return (
    <ServiceForm kind="issue" id={id} label={t('issueAsset')}>
      <Text name="employeeCode" label={t('employeeCode')} maxLength={40} />
      <Text name="issuedOn" label={t('issuedOn')} type="date" />
      <Text name="dueOn" label={t('dueOn')} type="date" optional />
      <Text name="condition" label={t('condition')} type="textarea" maxLength={2000} />
    </ServiceForm>
  );
}
export function ReturnForm({ id }: { id: string }) {
  const t = useTranslations('services');
  return (
    <ServiceForm kind="return" id={id} label={t('returnAsset')}>
      <Text name="returnedOn" label={t('returnedOn')} type="date" />
      <Text name="condition" label={t('returnCondition')} type="textarea" maxLength={2000} />
    </ServiceForm>
  );
}
