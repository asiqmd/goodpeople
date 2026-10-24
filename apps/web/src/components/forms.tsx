'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useActionState, useTransition, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { signInPlatform, signInWorkspace, type FormState } from '@/app/actions/auth';
import { setLocale } from '@/app/actions/locale';
import { Banner, buttonClass, Field, inputClass } from './ui';

export function SubmitButton({
  children,
  variant = 'primary',
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary';
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={buttonClass[variant]}>
      {pending ? '…' : children}
    </button>
  );
}

/** Finds the API's message for one field, if the last submit failed validation there. */
export function issueFor(
  state: { issues?: { path: string; message: string }[] } | undefined,
  path: string,
) {
  return state?.issues?.find((i) => i.path === path)?.message;
}

export function LanguageToggle() {
  const locale = useLocale();
  const t = useTranslations('common');
  const [pending, start] = useTransition();
  const option = (value: 'en' | 'bn', label: string) => (
    <button
      type="button"
      disabled={pending}
      aria-pressed={locale === value}
      onClick={() => start(() => setLocale(value))}
      className={`rounded-md px-2.5 py-1 text-xs font-medium ${
        locale === value
          ? 'bg-white text-slate-900 shadow-sm'
          : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      {label}
    </button>
  );
  return (
    <div
      role="group"
      aria-label={t('language')}
      className="inline-flex rounded-lg bg-slate-100 p-0.5"
    >
      {option('en', t('english'))}
      {option('bn', t('bangla'))}
    </div>
  );
}

export function LoginForm({ kind }: { kind: 'tenant' | 'platform' }) {
  const t = useTranslations('login');
  const [state, action] = useActionState<FormState, FormData>(
    kind === 'tenant' ? signInWorkspace : signInPlatform,
    undefined,
  );
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Banner tone="red">{state.error}</Banner>}
      {kind === 'tenant' && (
        <Field label={t('workspace')} hint={t('workspaceHint')} error={issueFor(state, 'tenant')}>
          <input name="tenant" required autoComplete="organization" className={inputClass} />
        </Field>
      )}
      <Field label={t('email')} error={issueFor(state, 'email')}>
        <input name="email" type="email" required autoComplete="username" className={inputClass} />
      </Field>
      <Field label={t('password')} error={issueFor(state, 'password')}>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className={inputClass}
        />
      </Field>
      <SubmitButton>{t('submit')}</SubmitButton>
    </form>
  );
}
