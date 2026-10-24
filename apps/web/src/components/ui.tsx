import type { AccessState, BillingMode } from '@gp/shared';
import type { ReactNode } from 'react';

// Small server-safe building blocks. Interactive pieces live in their own 'use client' files.

export type Tone = 'green' | 'amber' | 'red' | 'blue' | 'violet' | 'slate';

const TONES: Record<Tone, string> = {
  green: 'bg-brand-50 text-brand-700 ring-brand-600/20',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  red: 'bg-red-50 text-red-700 ring-red-600/20',
  blue: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  violet: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  slate: 'bg-slate-100 text-slate-700 ring-slate-500/20',
};

export const BILLING_TONE: Record<BillingMode, Tone> = {
  paid: 'blue',
  trial: 'slate',
  complimentary: 'violet',
  internal: 'green',
  partner: 'amber',
  license: 'slate',
};

export const ACCESS_TONE: Record<AccessState, Tone> = {
  full: 'green',
  read_only: 'amber',
  suspended: 'red',
};

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function Banner({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <div role="status" className={`rounded-lg px-4 py-3 text-sm ring-1 ring-inset ${TONES[tone]}`}>
      {children}
    </div>
  );
}

export function Card({
  title,
  action,
  children,
  className = '',
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-4">
          {title && <h2 className="text-base font-semibold text-slate-900">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({
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
    <label className="block text-sm">
      <span className="font-medium text-slate-800">{label}</span>
      <span className="mt-1 block">{children}</span>
      {error ? (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      )}
    </label>
  );
}

export const inputClass =
  'block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-brand-600';

export const buttonClass = {
  primary:
    'inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60',
  secondary:
    'inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-800 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:opacity-60',
  ghost: 'text-sm font-medium text-slate-600 hover:text-slate-900',
};

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 font-semibold text-slate-900">
      <span className="grid size-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">
        GP
      </span>
      Good People
    </span>
  );
}
