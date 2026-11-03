'use client';

import {
  CONFIGURABLE_EVENTS,
  isFixedEvent,
  DELIVERY_CHANNELS,
  ASSIGNABLE_TENANT_ROLES,
  smsSegments,
  type NotificationSettingsView,
  type NotificationTemplateView,
  type WorkspaceUserCreated,
  type WorkspaceUserView,
} from '@gp/shared';
import { useTranslations } from 'next-intl';
import { useActionState, useState, useTransition } from 'react';
import {
  changePassword,
  createUser,
  disableMfa,
  resetNotificationTemplate,
  resetUserMfa,
  resetUserPassword,
  retryDelivery,
  saveNotificationSettings,
  saveNotificationTemplate,
  setUpMfa,
  setUserDisabled,
  updateUser,
  type MfaSetupState,
} from '@/app/actions/account';
import type { ActionState } from '@/app/actions/platform';
import { eventKey } from '@/lib/form';
import type { SessionKind } from '@/lib/session';
import { ErrorText, Form, issueFor, SubmitButton } from '../forms';
import { Banner, buttonClass, Field, inputClass } from '../ui';

function Errors({ state }: { state: { error?: string; code?: string } | undefined }) {
  if (!state?.error) return null;
  return (
    <Banner tone="red">
      <ErrorText state={state} />
    </Banner>
  );
}

function RecoveryCodes({ codes, done }: { codes: string[]; done?: string }) {
  const t = useTranslations('account');
  return (
    <div className="space-y-3">
      <Banner tone="green">{t('mfaOn')}</Banner>
      <p className="text-sm text-slate-700">{t('recoveryHint')}</p>
      <ul className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-4 font-mono text-sm ring-1 ring-slate-200 sm:grid-cols-4">
        {codes.map((c) => (
          <li key={c} className="select-all">
            {c}
          </li>
        ))}
      </ul>
      {done && (
        <a href={done} className={buttonClass.secondary}>
          {t('savedCodes')}
        </a>
      )}
    </div>
  );
}

// ── The signed-in login ──────────────────────────────────────────────────────

export function PasswordForm({ kind }: { kind: SessionKind }) {
  const t = useTranslations('account');
  const [state, action] = useActionState<ActionState, FormData>(
    changePassword.bind(null, kind),
    undefined,
  );
  return (
    <Form state={state} action={action} className="space-y-4">
      <Errors state={state} />
      {state?.ok && <Banner tone="green">{t('passwordChanged')}</Banner>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('currentPassword')} error={issueFor(state, 'currentPassword')}>
          <input
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
            className={inputClass}
          />
        </Field>
        <Field
          label={t('newPassword')}
          hint={t('newPasswordHint')}
          error={issueFor(state, 'newPassword')}
        >
          <input
            name="newPassword"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            className={inputClass}
          />
        </Field>
      </div>
      <SubmitButton variant="secondary">{t('changePassword')}</SubmitButton>
    </Form>
  );
}

/** Turning two-step sign-in on: a key for the authenticator app, then its first code. */
export function MfaSetupForm({ kind }: { kind: SessionKind }) {
  const t = useTranslations('account');
  const [state, action] = useActionState<MfaSetupState, FormData>(
    setUpMfa.bind(null, kind),
    undefined,
  );
  if (state?.recoveryCodes) {
    return (
      <RecoveryCodes
        codes={state.recoveryCodes}
        done={kind === 'tenant' ? '/workspace/account' : '/platform/account'}
      />
    );
  }
  if (!state?.setup) {
    return (
      <Form state={state} action={action} className="space-y-3">
        <Errors state={state} />
        <p className="text-sm text-slate-600">{t('mfaIntro')}</p>
        <input type="hidden" name="step" value="start" />
        <SubmitButton variant="secondary">{t('mfaStart')}</SubmitButton>
      </Form>
    );
  }
  return (
    <Form state={state} action={action} className="space-y-4">
      <Errors state={state} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* oxlint-disable-next-line nextjs/no-img-element -- a data URL made on the server */}
        <img src={state.setup.qr} alt={t('qrAlt')} width={160} height={160} />
        <div className="space-y-2 text-sm text-slate-700">
          <p>{t('mfaScan')}</p>
          <p>
            {t('mfaKey')}{' '}
            <code className="select-all break-all rounded bg-slate-100 px-1.5 py-0.5 font-mono">
              {state.setup.secret}
            </code>
          </p>
        </div>
      </div>
      <input type="hidden" name="step" value="confirm" />
      <Field label={t('mfaCode')} hint={t('mfaCodeHint')}>
        <input
          name="code"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          className={`${inputClass} max-w-40 font-mono tracking-widest`}
        />
      </Field>
      <SubmitButton>{t('mfaConfirm')}</SubmitButton>
    </Form>
  );
}

export function MfaDisableForm({ kind }: { kind: SessionKind }) {
  const t = useTranslations('account');
  const [state, action] = useActionState<ActionState, FormData>(
    disableMfa.bind(null, kind),
    undefined,
  );
  return (
    <Form state={state} action={action} className="flex flex-wrap items-end gap-3">
      <Errors state={state} />
      <Field label={t('confirmPassword')}>
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className={inputClass}
        />
      </Field>
      <SubmitButton variant="secondary">{t('mfaDisable')}</SubmitButton>
    </Form>
  );
}

// ── Workspace logins ─────────────────────────────────────────────────────────

export function CreateUserForm() {
  const t = useTranslations('users');
  const th = useTranslations('hr');
  const [state, action] = useActionState<ActionState<WorkspaceUserCreated>, FormData>(
    createUser,
    undefined,
  );
  const created = state?.result;
  return (
    <div className="space-y-4">
      {created && (
        <Banner tone="green">
          {t('created', { name: created.name })}
          {created.temporaryPassword && (
            <span className="mt-2 block">
              {t('temporaryPassword')}{' '}
              <code className="select-all rounded bg-white px-2 py-0.5 font-mono">
                {created.temporaryPassword}
              </code>
            </span>
          )}
        </Banner>
      )}
      <Form state={state} action={action} className="space-y-4">
        <Errors state={state} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t('name')} error={issueFor(state, 'name')}>
            <input name="name" required className={inputClass} />
          </Field>
          <Field label={t('email')} error={issueFor(state, 'email')}>
            <input name="email" type="email" className={inputClass} />
          </Field>
          <Field label={t('phone')} hint={t('phoneHint')} error={issueFor(state, 'phone')}>
            <input name="phone" type="tel" placeholder="01XXXXXXXXX" className={inputClass} />
          </Field>
          <Field label={t('role')} hint={t('roleHint')}>
            <select name="role" defaultValue="employee" className={inputClass}>
              {ASSIGNABLE_TENANT_ROLES.map((r) => (
                <option key={r} value={r}>
                  {th(`roles.${r}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={t('employee')}
            hint={t('employeeHint')}
            error={issueFor(state, 'employeeCode')}
          >
            <input name="employeeCode" className={inputClass} />
          </Field>
          <Field label={t('password')} hint={t('passwordHint')} error={issueFor(state, 'password')}>
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              className={inputClass}
            />
          </Field>
        </div>
        <SubmitButton>{t('create')}</SubmitButton>
      </Form>
    </div>
  );
}

/** One login's role and contact details, and what an admin can do about it. */
export function UserActions({ user, self }: { user: WorkspaceUserView; self: boolean }) {
  const t = useTranslations('users');
  const th = useTranslations('hr');
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(
    updateUser.bind(null, user.id),
    undefined,
  );
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionState<{ temporaryPassword: string }>>();
  const run = (fn: () => Promise<ActionState<{ temporaryPassword: string }>>, confirm?: string) => {
    if (confirm && !window.confirm(confirm)) return;
    start(async () => setResult(await fn()));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col items-start gap-1 whitespace-nowrap">
        <button type="button" className={buttonClass.ghost} onClick={() => setOpen(!open)}>
          {t('edit')}
        </button>
        {!self && (
          <button
            type="button"
            disabled={pending}
            className={buttonClass.ghost}
            onClick={() =>
              run(
                () => setUserDisabled(user.id, !user.disabled),
                user.disabled ? undefined : t('disableConfirm', { name: user.name }),
              )
            }
          >
            {user.disabled ? t('enable') : t('disable')}
          </button>
        )}
        {user.email && !user.disabled && (
          <button
            type="button"
            disabled={pending}
            className={buttonClass.ghost}
            onClick={() => run(() => resetUserPassword(user.id), t('resetPasswordConfirm'))}
          >
            {t('resetPassword')}
          </button>
        )}
        {user.mfaEnabled && !self && (
          <button
            type="button"
            disabled={pending}
            className={buttonClass.ghost}
            onClick={() => run(() => resetUserMfa(user.id), t('resetMfaConfirm'))}
          >
            {t('resetMfa')}
          </button>
        )}
      </div>
      {result?.error && (
        <p className="text-xs text-red-600">
          <ErrorText state={result} />
        </p>
      )}
      {result?.result?.temporaryPassword && (
        <p className="text-xs text-slate-700">
          {t('temporaryPassword')}{' '}
          <code className="select-all rounded bg-slate-100 px-1.5 py-0.5 font-mono">
            {result.result.temporaryPassword}
          </code>
        </p>
      )}
      {open && (
        <Form state={state} action={action} className="w-72 space-y-3 rounded-lg bg-slate-50 p-3">
          <Errors state={state} />
          {state?.ok && <Banner tone="green">{t('saved')}</Banner>}
          <div className="grid gap-3">
            <Field label={t('name')}>
              <input name="name" defaultValue={user.name} required className={inputClass} />
            </Field>
            <Field label={t('role')}>
              <select name="role" defaultValue={user.role} disabled={self} className={inputClass}>
                {ASSIGNABLE_TENANT_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {th(`roles.${r}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('email')}>
              <input
                name="email"
                type="email"
                defaultValue={user.email ?? ''}
                className={inputClass}
              />
            </Field>
            <Field label={t('phone')}>
              <input
                name="phone"
                type="tel"
                defaultValue={user.phone ?? ''}
                className={inputClass}
              />
            </Field>
          </div>
          <SubmitButton variant="secondary">{t('save')}</SubmitButton>
        </Form>
      )}
    </div>
  );
}

// ── Notifications (HR) ───────────────────────────────────────────────────────

export function NotificationSettingsForm({ settings }: { settings: NotificationSettingsView }) {
  const t = useTranslations('notifications');
  const [state, action] = useActionState<ActionState, FormData>(
    saveNotificationSettings,
    undefined,
  );
  const master = { email: 'emailEnabled', sms: 'smsEnabled', push: 'pushEnabled' } as const;
  return (
    <Form state={state} action={action} className="space-y-5">
      <Errors state={state} />
      {state?.ok && <Banner tone="green">{t('saved')}</Banner>}
      <div className="grid gap-3 sm:grid-cols-3">
        {DELIVERY_CHANNELS.map((c) => (
          <label
            key={c}
            className="flex items-start gap-2 rounded-lg p-3 text-sm ring-1 ring-slate-200"
          >
            <input
              type="checkbox"
              name={master[c]}
              defaultChecked={settings[master[c]]}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">{t(`channels.${c}`)}</span>
              <span className="block text-xs text-slate-500">
                {settings.drivers[c] === 'log'
                  ? t('driverLog')
                  : t('driver', { driver: settings.drivers[c] })}
              </span>
            </span>
          </label>
        ))}
      </div>
      <div className="-mx-5 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-start text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-2 font-medium">{t('event')}</th>
              {DELIVERY_CHANNELS.map((c) => (
                <th key={c} className="px-5 py-2 text-center font-medium">
                  {t(`channels.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {CONFIGURABLE_EVENTS.map((e) => (
              <tr key={e}>
                <td className="px-5 py-2">{t(`events.${eventKey(e)}`)}</td>
                {DELIVERY_CHANNELS.map((c) => (
                  <td key={c} className="px-5 py-2 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${t(`events.${eventKey(e)}`)}: ${t(`channels.${c}`)}`}
                      name={`channels.${e}.${c}`}
                      defaultChecked={settings.channels[e].includes(c)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">{t('inAppAlways')}</p>
      <SubmitButton>{t('save')}</SubmitButton>
    </Form>
  );
}

export function TemplateForm({ template }: { template: NotificationTemplateView }) {
  const t = useTranslations('notifications');
  const [state, action] = useActionState<ActionState, FormData>(
    saveNotificationTemplate.bind(null, template.event, template.language),
    undefined,
  );
  const [sms, setSms] = useState(template.sms);
  const [pending, start] = useTransition();
  const fixed = isFixedEvent(template.event);
  return (
    <Form state={state} action={action} className="space-y-3">
      <Errors state={state} />
      {state?.ok && <Banner tone="green">{t('saved')}</Banner>}
      <Field label={t('templateTitle')}>
        <input name="title" defaultValue={template.title} disabled={fixed} className={inputClass} />
      </Field>
      <Field label={t('templateBody')}>
        <textarea
          name="body"
          rows={3}
          defaultValue={template.body}
          disabled={fixed}
          className={inputClass}
        />
      </Field>
      <Field
        label={t('templateSms')}
        hint={t('smsLength', { characters: [...sms].length, messages: smsSegments(sms) })}
      >
        <textarea
          name="sms"
          rows={2}
          value={sms}
          onChange={(e) => setSms(e.target.value)}
          disabled={fixed}
          className={inputClass}
        />
      </Field>
      <p className="text-xs text-slate-500">
        {t('placeholders')}{' '}
        {template.placeholders.map((p) => (
          <code key={p} className="me-1 rounded bg-slate-100 px-1 font-mono">{`{{${p}}}`}</code>
        ))}
      </p>
      {!fixed && (
        <div className="flex items-center gap-3">
          <SubmitButton variant="secondary">{t('save')}</SubmitButton>
          {template.customized && (
            <button
              type="button"
              disabled={pending}
              className={buttonClass.ghost}
              onClick={() =>
                start(() => resetNotificationTemplate(template.event, template.language))
              }
            >
              {t('reset')}
            </button>
          )}
        </div>
      )}
    </Form>
  );
}

export function RetryButton({ id }: { id: string }) {
  const t = useTranslations('notifications');
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={buttonClass.ghost}
      onClick={() => start(async () => void (await retryDelivery(id)))}
    >
      {t('retry')}
    </button>
  );
}
