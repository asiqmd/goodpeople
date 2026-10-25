'use client';

import {
  GRIEVANCE_STATUSES,
  GRIEVANCE_TEXT_MAX,
  GRIEVANCE_TEXT_MIN,
  type GrievanceStatus,
} from '@gp/shared';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { answerGrievance, setGrievanceStatus } from '@/app/actions/grievances';
import { ErrorText, Form, issueFor, SubmitButton } from '../forms';
import { Banner, buttonClass, Field, inputClass } from '../ui';

function Errors({
  state,
}: {
  state: { error?: string; code?: string; issues?: unknown[] } | undefined;
}) {
  if (!state?.error || state.issues?.length) return null;
  return (
    <Banner tone="red">
      <ErrorText state={state} />
    </Banner>
  );
}

export function AnswerForm({ id }: { id: string }) {
  const t = useTranslations('grievances.detail');
  const [state, action] = useActionState(answerGrievance.bind(null, id), undefined);
  return (
    <Form state={state} action={action} className="space-y-3">
      <Errors state={state} />
      {state?.ok && <Banner tone="green">{t('replied')}</Banner>}
      <Field label={t('reply')} hint={t('replyHint')} error={issueFor(state, 'text')}>
        <textarea
          name="text"
          required
          rows={5}
          minLength={GRIEVANCE_TEXT_MIN}
          maxLength={GRIEVANCE_TEXT_MAX}
          className={inputClass}
        />
      </Field>
      <SubmitButton>{t('send')}</SubmitButton>
    </Form>
  );
}

export function StatusForm({ id, status }: { id: string; status: GrievanceStatus }) {
  const t = useTranslations('grievances');
  const [state, action] = useActionState(setGrievanceStatus.bind(null, id), undefined);
  return (
    <Form state={state} action={action} className="space-y-3">
      <Errors state={state} />
      {state?.ok && <Banner tone="green">{t('detail.statusSaved')}</Banner>}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Field label={t('detail.status')}>
            <select name="status" defaultValue={status} key={status} className={inputClass}>
              {GRIEVANCE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`statuses.${s}`)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <SubmitButton variant="secondary">{t('detail.setStatus')}</SubmitButton>
      </div>
    </Form>
  );
}

export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass.primary}>
      {label}
    </button>
  );
}
