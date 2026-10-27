'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { ErrorReference } from './forms';
import { buttonClass } from './ui';

/** The digest Next gives a server error, which matches the line in this server's log. */
export const digestOf = (error: unknown) =>
  error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;

/** What an error boundary shows: a calm message, the reference and a way to try again. */
export function ErrorPanel({
  error,
  retry,
  children,
}: {
  error: unknown;
  retry: () => void;
  /** More ways out, next to "Try again". */
  children?: ReactNode;
}) {
  const t = useTranslations('common');
  return (
    <div role="alert" className="space-y-3">
      <h1 className="text-xl font-semibold text-slate-900">{t('errorTitle')}</h1>
      <p className="text-sm text-slate-600">{t('errorBody')}</p>
      <div className="text-sm text-slate-500">
        <ErrorReference id={digestOf(error)} />
      </div>
      <div className="flex flex-wrap gap-3 pt-2">
        <button type="button" onClick={retry} className={buttonClass.primary}>
          {t('tryAgain')}
        </button>
        {children}
      </div>
    </div>
  );
}
