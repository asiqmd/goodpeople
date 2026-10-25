'use client';

import {
  GRIEVANCE_TEXT_MAX,
  GRIEVANCE_TEXT_MIN,
  type GrievanceCategory,
  type GrievanceSubmitted,
  type SpeakUpInfo,
} from '@gp/shared';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useActionState, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { raiseGrievance } from '@/app/actions/grievances';
import type { ActionState } from '@/app/actions/platform';
import { ErrorText, Form, issueFor } from '../forms';
import { Banner } from '../ui';
import { CategoryIcon } from './parts';

// Large type and touch targets: workers use this on a phone or a factory kiosk.
export const bigInput =
  'block w-full rounded-xl border-0 bg-white px-4 py-3 text-base text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-brand-600';
export const bigButton =
  'inline-flex min-h-14 w-full items-center justify-center rounded-xl bg-brand-600 px-5 py-3 text-lg font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60';
export const bigSecondary =
  'inline-flex min-h-14 w-full items-center justify-center rounded-xl bg-white px-5 py-3 text-lg font-semibold text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50';

export function BigSubmit({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={bigButton}>
      {pending ? '…' : children}
    </button>
  );
}

export function BigField({
  label,
  hint,
  error,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-base font-semibold text-slate-900">{label}</span>
      <span className="mt-2 block">{children}</span>
      {error ? (
        <span className="mt-1 block text-sm text-red-700">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-sm text-slate-600">{hint}</span>
      )}
    </label>
  );
}

/** A refusal that is not about one field (validation issues show at their fields). */
export function Refused({ state }: { state: ActionState<unknown> }) {
  if (!state?.error || state.issues?.length) return null;
  return (
    <Banner tone="red">
      <ErrorText state={state} />
    </Banner>
  );
}

/** Raising a grievance: what it is about, what happened, optionally who, and a PIN. */
export function SpeakUpForm({ info, kiosk }: { info: SpeakUpInfo; kiosk: boolean }) {
  const t = useTranslations('grievances');
  const [state, action] = useActionState<ActionState<GrievanceSubmitted>, FormData>(
    raiseGrievance.bind(null, info.workspace.slug),
    undefined,
  );
  const [category, setCategory] = useState<GrievanceCategory | null>(null);
  const [named, setNamed] = useState(false);
  const followUp = `/speak-up/${info.workspace.slug}/follow-up${kiosk ? '?channel=kiosk' : ''}`;
  const error = (path: string, message: string) => (issueFor(state, path) ? message : undefined);

  if (state?.ok && state.result) {
    return (
      <section className="space-y-5 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-xl font-semibold text-brand-700">{t('speakUp.sentTitle')}</h2>
        <div>
          <p className="text-base text-slate-700">{t('speakUp.reference')}</p>
          <p className="mt-1 select-all font-mono text-4xl font-bold tracking-widest text-slate-900">
            {state.result.reference}
          </p>
        </div>
        <Banner tone="amber">
          <span className="text-base">{t('speakUp.keep')}</span>
        </Banner>
        <div className="space-y-3">
          {kiosk ? (
            // oxlint-disable-next-line nextjs/no-html-link-for-pages -- a full load leaves nothing of this worker on the shared tablet
            <a href="/kiosk" className={bigButton}>
              {t('speakUp.done')}
            </a>
          ) : (
            <Link href={followUp} className={bigButton}>
              {t('speakUp.seeAnswer')}
            </Link>
          )}
          <a
            href={`/speak-up/${info.workspace.slug}${kiosk ? '?channel=kiosk' : ''}`}
            className={bigSecondary}
          >
            {t('speakUp.another')}
          </a>
        </div>
      </section>
    );
  }

  return (
    <Form state={state} action={action} className="space-y-6">
      <Refused state={state} />
      <input type="hidden" name="channel" value={kiosk ? 'kiosk' : 'web'} />

      <fieldset>
        <legend className="text-base font-semibold text-slate-900">{t('speakUp.category')}</legend>
        {issueFor(state, 'category') && (
          <p className="mt-1 text-sm text-red-700">{t('speakUp.categoryError')}</p>
        )}
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {info.categories.map((c) => (
            <label
              key={c}
              className="flex min-h-16 cursor-pointer items-start gap-3 rounded-xl bg-white p-4 ring-1 ring-slate-200 has-[:checked]:bg-brand-50 has-[:checked]:ring-2 has-[:checked]:ring-brand-600"
            >
              <input
                type="radio"
                name="category"
                value={c}
                required
                onChange={() => setCategory(c)}
                className="mt-1 size-5 shrink-0 accent-brand-600"
              />
              <CategoryIcon category={c} className="size-7 shrink-0 text-brand-700" />
              <span>
                <span className="block text-base font-semibold text-slate-900">
                  {t(`categories.${c}`)}
                </span>
                <span className="block text-sm text-slate-600">{t(`categoryHints.${c}`)}</span>
              </span>
            </label>
          ))}
        </div>
        {category === 'harassment' && (
          <div className="mt-3">
            <Banner tone="violet">
              <span className="text-base">{t('speakUp.harassmentNote')}</span>
            </Banner>
          </div>
        )}
      </fieldset>

      <BigField
        label={t('speakUp.text')}
        hint={t('speakUp.textHint', { min: GRIEVANCE_TEXT_MIN })}
        error={error(
          'text',
          t('speakUp.textError', { min: GRIEVANCE_TEXT_MIN, max: GRIEVANCE_TEXT_MAX }),
        )}
      >
        <textarea
          name="text"
          required
          rows={6}
          minLength={GRIEVANCE_TEXT_MIN}
          maxLength={GRIEVANCE_TEXT_MAX}
          className={bigInput}
        />
      </BigField>

      {info.sites.length > 0 && (
        <BigField label={t('speakUp.site')} error={error('locationId', t('speakUp.siteError'))}>
          <select name="locationId" defaultValue="" className={bigInput}>
            <option value="">{t('speakUp.noSite')}</option>
            {info.sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </BigField>
      )}

      <div className="space-y-4 rounded-xl bg-white p-4 ring-1 ring-slate-200">
        <label className="flex min-h-12 cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={named}
            onChange={(e) => setNamed(e.target.checked)}
            className="size-6 shrink-0 accent-brand-600"
          />
          <span className="text-base font-semibold text-slate-900">{t('speakUp.nameToggle')}</span>
        </label>
        <p className="text-sm text-slate-600">{t('speakUp.nameHint')}</p>
        {named && (
          <>
            <BigField label={t('speakUp.name')} error={error('name', t('speakUp.nameError'))}>
              <input name="name" required autoComplete="off" className={bigInput} />
            </BigField>
            <BigField label={t('speakUp.employeeCode')}>
              <input name="employeeCode" autoComplete="off" className={bigInput} />
            </BigField>
          </>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <BigField
          label={t('speakUp.pin')}
          hint={t('speakUp.pinHint')}
          error={error('pin', t('speakUp.pinError'))}
        >
          <input
            name="pin"
            type="password"
            required
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={8}
            className={`${bigInput} font-mono tracking-widest`}
          />
        </BigField>
        <BigField label={t('speakUp.pinAgain')} error={error('pinAgain', t('speakUp.pinMismatch'))}>
          <input
            name="pinAgain"
            type="password"
            required
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={8}
            className={`${bigInput} font-mono tracking-widest`}
          />
        </BigField>
      </div>

      <BigSubmit>{t('speakUp.submit')}</BigSubmit>
      <p className="text-center">
        <Link href={followUp} className="text-base font-medium text-brand-700 underline">
          {t('speakUp.followUpLink')}
        </Link>
      </p>
    </Form>
  );
}
