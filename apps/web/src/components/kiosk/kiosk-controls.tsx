'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition, type ReactNode } from 'react';
import { setKioskLanguage } from '@/app/actions/kiosk';

// Touch controls sized for a 10-inch tablet held in landscape: nothing smaller than a thumb.

export const bigButton = {
  primary:
    'inline-flex min-h-20 items-center justify-center gap-3 rounded-2xl bg-brand-600 px-8 text-2xl font-semibold text-white shadow-sm active:bg-brand-700 disabled:opacity-50',
  secondary:
    'inline-flex min-h-20 items-center justify-center gap-3 rounded-2xl bg-white px-8 text-2xl font-semibold text-slate-800 ring-2 ring-inset ring-slate-300 active:bg-slate-100 disabled:opacity-50',
  quiet:
    'inline-flex min-h-16 items-center justify-center rounded-2xl px-6 text-xl font-medium text-slate-700 underline underline-offset-4 active:bg-slate-200',
};

export const bigInput =
  'block min-h-20 w-full rounded-2xl border-0 bg-white px-6 text-3xl text-slate-900 ring-2 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-4 focus:ring-inset focus:ring-brand-600';

export function Notice({
  tone,
  children,
}: {
  tone: 'red' | 'green' | 'amber';
  children: ReactNode;
}) {
  const tones = {
    red: 'bg-red-50 text-red-800 ring-red-300',
    green: 'bg-brand-50 text-brand-800 ring-brand-300',
    amber: 'bg-amber-50 text-amber-900 ring-amber-300',
  };
  return (
    <p role="status" className={`rounded-2xl px-6 py-4 text-2xl ring-2 ring-inset ${tones[tone]}`}>
      {children}
    </p>
  );
}

/** বাংলা / English, kept on this tablet. */
export function LanguageSwitch() {
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const option = (value: 'bn' | 'en', label: string) => (
    <button
      type="button"
      disabled={pending}
      aria-pressed={locale === value}
      onClick={() =>
        start(async () => {
          await setKioskLanguage(value);
          router.refresh();
        })
      }
      className={`min-h-14 rounded-xl px-5 text-xl font-semibold ${
        locale === value ? 'bg-white text-slate-900 shadow' : 'text-slate-600'
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="inline-flex rounded-2xl bg-slate-200 p-1">
      {option('bn', 'বাংলা')}
      {option('en', 'English')}
    </div>
  );
}

/** Digits on screen, for PINs and SMS codes: no keyboard pops up over half the screen. */
export function PinPad({
  value,
  max,
  masked,
  onChange,
  onSubmit,
  submitLabel,
  busy,
  min = max,
}: {
  value: string;
  max: number;
  min?: number;
  masked: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  submitLabel: string;
  busy: boolean;
}) {
  const t = useTranslations('kiosk.pin');
  const key = 'flex min-h-20 items-center justify-center rounded-2xl text-4xl font-semibold';
  const digit = (d: string) => (
    <button
      key={d}
      type="button"
      disabled={busy || value.length >= max}
      onClick={() => onChange(value + d)}
      className={`${key} bg-white text-slate-900 shadow-sm ring-1 ring-slate-200 active:bg-slate-200`}
    >
      {d}
    </button>
  );
  return (
    <div className="space-y-4">
      <div
        aria-live="polite"
        className="flex min-h-20 items-center justify-center gap-4 rounded-2xl bg-white text-5xl tracking-[0.3em] ring-2 ring-slate-300"
      >
        {Array.from({ length: Math.max(value.length, min) }, (_, i) => (
          <span key={i} className={i < value.length ? 'text-slate-900' : 'text-slate-300'}>
            {i < value.length ? (masked ? '●' : value[i]) : '○'}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(digit)}
        <button
          type="button"
          disabled={busy || value.length === 0}
          onClick={() => onChange(value.slice(0, -1))}
          aria-label={t('delete')}
          className={`${key} bg-slate-200 text-slate-700 active:bg-slate-300`}
        >
          ⌫
        </button>
        {digit('0')}
        <button
          type="button"
          disabled={busy || value.length < min}
          onClick={onSubmit}
          className={`${key} bg-brand-600 text-2xl text-white active:bg-brand-700 disabled:opacity-40`}
        >
          {busy ? '…' : submitLabel}
        </button>
      </div>
    </div>
  );
}
