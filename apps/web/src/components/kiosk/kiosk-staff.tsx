'use client';

import type { KioskCreated, LocationView } from '@gp/shared';
import { useTranslations } from 'next-intl';
import { useActionState, useState, useTransition } from 'react';
import { createKiosk, revokeKiosk } from '@/app/actions/kiosk';
import type { ActionState } from '@/app/actions/platform';
import { ErrorText, Form, issueFor, SubmitButton } from '../forms';
import { Banner, buttonClass, Field, inputClass } from '../ui';

/** A new kiosk: its token shown once, with how to set up the tablet. */
export function NewKioskForm({
  locations,
  kioskUrl,
}: {
  locations: LocationView[];
  kioskUrl: string;
}) {
  const t = useTranslations('kiosk.staff');
  const [state, action] = useActionState<ActionState<KioskCreated>, FormData>(
    createKiosk,
    undefined,
  );
  const [copied, setCopied] = useState(false);
  const token = state?.result?.token;
  return (
    <div className="space-y-4">
      <Form state={state} action={action} className="flex flex-wrap items-end gap-3">
        <Field label={t('name')} error={issueFor(state, 'name')}>
          <input
            name="name"
            required
            minLength={2}
            maxLength={80}
            placeholder={t('namePlaceholder')}
            className={`${inputClass} w-64`}
          />
        </Field>
        <Field label={t('site')} error={issueFor(state, 'locationId')}>
          <select name="locationId" required className={`${inputClass} w-56`}>
            {locations
              .filter((l) => l.isActive)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </select>
        </Field>
        <SubmitButton>{t('add')}</SubmitButton>
      </Form>
      {state?.error && (
        <Banner tone="red">
          <ErrorText state={state} />
        </Banner>
      )}
      {token && (
        <Banner tone="amber">
          <p className="font-medium">{t('tokenOnce')}</p>
          <div className="mt-2 flex items-start gap-2">
            <code className="block flex-1 select-all break-all rounded bg-white px-2 py-1 font-mono text-xs text-slate-900 ring-1 ring-slate-200">
              {token}
            </code>
            <button
              type="button"
              className={buttonClass.secondary}
              onClick={() => void navigator.clipboard.writeText(token).then(() => setCopied(true))}
            >
              {copied ? t('copied') : t('copy')}
            </button>
          </div>
          <p className="mt-3 font-medium">{t('stepsTitle')}</p>
          <ol className="mt-1 list-inside list-decimal space-y-1">
            <li>{t('steps.open', { url: kioskUrl })}</li>
            <li>{t('steps.paste')}</li>
            <li>{t('steps.lock')}</li>
            <li>{t('steps.workers')}</li>
          </ol>
        </Banner>
      )}
    </div>
  );
}

export function RevokeKioskButton({ id }: { id: string }) {
  const t = useTranslations('kiosk.staff');
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="text-sm font-medium text-red-700 hover:underline"
      onClick={() => {
        if (window.confirm(t('revokeConfirm'))) start(() => revokeKiosk(id));
      }}
    >
      {t('revoke')}
    </button>
  );
}
