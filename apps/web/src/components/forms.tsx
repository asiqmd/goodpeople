'use client';

import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { useFormStatus } from 'react-dom';
import { signIn, type LoginState } from '@/app/actions/auth';
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

type FormResult = { error?: string; code?: string; requestId?: string } | null | undefined;

/**
 * Puts what was typed back into a form's fields. Files cannot be put back, and a refused
 * password is better typed again, so both are skipped.
 */
function restore(form: HTMLFormElement, data: FormData) {
  for (const el of Array.from(form.elements)) {
    if (
      !(el instanceof HTMLInputElement) &&
      !(el instanceof HTMLSelectElement) &&
      !(el instanceof HTMLTextAreaElement)
    ) {
      continue;
    }
    if (!el.name || ['file', 'hidden', 'password'].includes(el.type)) continue;
    const values = data.getAll(el.name).map(String);
    if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
      el.checked = values.includes(el.value);
    } else if (el instanceof HTMLSelectElement && el.multiple) {
      for (const option of Array.from(el.options)) option.selected = values.includes(option.value);
    } else if (values[0] !== undefined) {
      el.value = values[0];
    }
  }
}

/**
 * A form for a server action that keeps what was typed when the action refuses it. React
 * clears a form's fields after every action; after an error they are put back, so a person
 * fixes one field instead of typing everything again.
 */
export function Form({
  state,
  ref,
  onSubmit,
  children,
  ...props
}: Omit<ComponentProps<'form'>, 'action'> & {
  action: (form: FormData) => void;
  state: FormResult;
}) {
  const own = useRef<HTMLFormElement | null>(null);
  const submitted = useRef<FormData | null>(null);
  useEffect(() => {
    if (own.current && submitted.current && state?.error) restore(own.current, submitted.current);
  }, [state]);
  return (
    <form
      {...props}
      ref={(el) => {
        own.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) ref.current = el;
      }}
      onSubmit={(event) => {
        submitted.current = new FormData(event.currentTarget);
        onSubmit?.(event);
      }}
    >
      {children}
    </form>
  );
}

/**
 * The API's error in the reader's language when its code is known, else the API's text, with
 * the request's reference for support.
 */
export function ErrorText({ state }: { state: FormResult }) {
  const t = useTranslations('errors');
  if (!state?.error) return null;
  return (
    <>
      {state.code && t.has(state.code) ? t(state.code) : state.error}
      {state.requestId && <ErrorReference id={state.requestId} />}
    </>
  );
}

/**
 * The reference support asks for: the API's request ID or the web's error digest. In the
 * workspace it comes with a link that opens a ticket carrying it and the page it happened on.
 */
export function ErrorReference({ id }: { id?: string }) {
  const t = useTranslations('common');
  const pathname = usePathname();
  const inWorkspace = pathname.startsWith('/workspace');
  if (!id && !inWorkspace) return null;
  const ticket = new URLSearchParams({ ...(id && { ref: id }), from: pathname });
  return (
    <span className="mt-1 block text-xs opacity-80">
      {id && t('errorReference', { id })}
      {id && inWorkspace && ' · '}
      {inWorkspace && (
        <Link href={`/workspace/support/new?${ticket}`} className="font-medium underline">
          {t('contactSupport')}
        </Link>
      )}
    </span>
  );
}

export function LanguageToggle() {
  const locale = useLocale();
  const t = useTranslations('common');
  const [pending, start] = useTransition();
  const option = (value: 'en' | 'bn' | 'ar', label: string) => (
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
      {option('ar', 'العربية')}
    </div>
  );
}

export function LoginForm({
  kind,
  initialState,
}: {
  kind: 'tenant' | 'platform';
  initialState?: LoginState;
}) {
  const t = useTranslations('login');
  const [state, action] = useActionState<LoginState, FormData>(
    signIn.bind(null, kind),
    initialState,
  );
  // Employees may sign in with a code sent to their mobile instead of a password.
  const [byPhone, setByPhone] = useState(false);
  const step = state?.step;
  const banner = state?.error && (
    <Banner tone="red">
      <ErrorText state={state} />
      {state.routeUrl && (
        <p>
          <a href={state.routeUrl} className="font-medium underline">
            {state.routeUrl}
          </a>
        </p>
      )}
    </Banner>
  );
  const codeField = (hint: string) => (
    <Field label={t('code')} hint={hint} error={issueFor(state, 'code')}>
      <input
        name="code"
        required
        autoFocus
        autoComplete="one-time-code"
        inputMode={step === 'mfa' ? 'text' : 'numeric'}
        maxLength={9}
        className={`${inputClass} font-mono tracking-widest`}
      />
    </Field>
  );
  const startAgain = (
    <a
      href={kind === 'tenant' ? '/login' : '/platform/login'}
      className="text-sm text-slate-600 underline"
    >
      {t('startAgain')}
    </a>
  );

  if (step === 'recovery') {
    return (
      <div className="space-y-4">
        <Banner tone="green">{t('mfaOn')}</Banner>
        <p className="text-sm text-slate-700">{t('recoveryCodesHint')}</p>
        <ul className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-4 font-mono text-sm ring-1 ring-slate-200">
          {state!.recoveryCodes!.map((c) => (
            <li key={c} className="select-all">
              {c}
            </li>
          ))}
        </ul>
        <a href={kind === 'tenant' ? '/workspace' : '/platform'} className={buttonClass.primary}>
          {t('continue')}
        </a>
      </div>
    );
  }

  if (step === 'mfa_setup_start')
    return (
      <Form state={state} action={action} className="space-y-4">
        <input type="hidden" name="step" value="mfa_setup_start" />
        <input type="hidden" name="mfaToken" value={state?.mfaToken} />
        <p>{t('mfaSetupIntro')}</p>
        <SubmitButton>{t('continue')}</SubmitButton>
        {startAgain}
      </Form>
    );

  if (step === 'mfa' || step === 'mfa_setup') {
    return (
      <Form state={state} action={action} className="space-y-4">
        {banner}
        <input type="hidden" name="step" value={step} />
        <input type="hidden" name="mfaToken" value={state!.mfaToken} />
        {step === 'mfa_setup' && state?.setup && (
          <div className="space-y-3 text-sm text-slate-700">
            <p>{t('mfaSetupIntro')}</p>
            {/* oxlint-disable-next-line nextjs/no-img-element -- a data URL made on the server */}
            <img
              src={state.setup.qr}
              alt={t('qrAlt')}
              width={200}
              height={200}
              className="mx-auto"
            />
            <p>
              {t('mfaKey')}{' '}
              <code className="select-all break-all rounded bg-slate-100 px-1.5 py-0.5 font-mono">
                {state.setup.secret}
              </code>
            </p>
          </div>
        )}
        {codeField(step === 'mfa' ? t('mfaCodeHint') : t('mfaSetupCodeHint'))}
        <div className="flex items-center justify-between">
          <SubmitButton>{t('verify')}</SubmitButton>
          {startAgain}
        </div>
      </Form>
    );
  }

  if (step === 'otp_code') {
    return (
      <div className="space-y-4">
        <Form state={state} action={action} className="space-y-4">
          {banner}
          <p className="text-sm text-slate-700">{t('otpSent', { phone: state!.phone! })}</p>
          <input type="hidden" name="step" value="otp_code" />
          <input type="hidden" name="tenant" value={state!.tenant} />
          <input type="hidden" name="phone" value={state!.phone} />
          {codeField(t('otpCodeHint'))}
          <div className="flex items-center justify-between">
            <SubmitButton>{t('submit')}</SubmitButton>
            {startAgain}
          </div>
        </Form>
        <form action={action}>
          <input type="hidden" name="step" value="otp_request" />
          <input type="hidden" name="tenant" value={state!.tenant} />
          <input type="hidden" name="phone" value={state!.phone} />
          <button className="text-sm text-slate-600 underline">{t('sendAgain')}</button>
        </form>
      </div>
    );
  }

  const phone = kind === 'tenant' && (byPhone || step === 'otp_request');
  return (
    <Form state={state} action={action} className="space-y-4">
      {banner}
      <input type="hidden" name="step" value={phone ? 'otp_request' : 'password'} />
      {kind === 'tenant' && (
        <Field label={t('workspace')} hint={t('workspaceHint')} error={issueFor(state, 'tenant')}>
          <input
            name="tenant"
            required
            autoComplete="organization"
            defaultValue={state?.tenant}
            className={inputClass}
          />
        </Field>
      )}
      {phone ? (
        <Field label={t('phone')} hint={t('phoneHint')} error={issueFor(state, 'phone')}>
          <input
            name="phone"
            type="tel"
            required
            inputMode="tel"
            autoComplete="tel"
            placeholder="01XXXXXXXXX"
            defaultValue={state?.phone}
            className={inputClass}
          />
        </Field>
      ) : (
        <>
          <Field label={t('email')} error={issueFor(state, 'email')}>
            <input
              name="email"
              type="email"
              required
              autoComplete="username"
              className={inputClass}
            />
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
        </>
      )}
      <div className="flex items-center justify-between gap-3">
        <SubmitButton>{phone ? t('sendCode') : t('submit')}</SubmitButton>
        {kind === 'tenant' && (
          <button
            type="button"
            onClick={() => setByPhone(!phone)}
            className="text-sm text-slate-600 underline"
          >
            {phone ? t('usePassword') : t('usePhone')}
          </button>
        )}
      </div>
    </Form>
  );
}
