'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { setUpKiosk } from '@/app/actions/kiosk';
import type { ActionState } from '@/app/actions/platform';
import { ErrorText, Form, SubmitButton } from '../forms';
import { LanguageSwitch, Notice } from './kiosk-controls';

const PROBLEMS = ['kiosk_unknown', 'tenant_suspended', 'feature_not_in_plan'] as const;

/** For staff: the kiosk's token, pasted once. Also shown when the token stops working. */
export function KioskSetup({ problem }: { problem?: string }) {
  const t = useTranslations('kiosk.setup');
  const [state, action] = useActionState<ActionState, FormData>(setUpKiosk, undefined);
  const known = PROBLEMS.find((p) => p === problem);
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 p-10">
      <div className="flex items-start justify-between gap-6">
        <h1 className="text-4xl font-bold">{t('title')}</h1>
        <LanguageSwitch />
      </div>
      {problem && (
        <Notice tone="amber">{known ? t(`problems.${known}`) : t('problems.kiosk_unknown')}</Notice>
      )}
      <p className="text-xl text-slate-700">{t('intro')}</p>
      <Form state={state} action={action} className="space-y-5">
        <label className="block space-y-2">
          <span className="text-xl font-medium">{t('token')}</span>
          <textarea
            name="token"
            required
            rows={3}
            autoComplete="off"
            spellCheck={false}
            className="block w-full rounded-2xl border-0 bg-white p-4 font-mono text-lg ring-2 ring-inset ring-slate-300 focus:ring-4 focus:ring-brand-600"
          />
        </label>
        {state?.error && (
          <Notice tone="red">
            <ErrorText state={state} />
          </Notice>
        )}
        <SubmitButton>{t('start')}</SubmitButton>
      </Form>
    </main>
  );
}
