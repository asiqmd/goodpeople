'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef, type ReactNode } from 'react';
import type { ActionState } from '@/app/actions/platform';
import { SubmitButton } from '../forms';
import { Banner } from '../ui';

/** A small "add" form: shows the API's messages and clears itself after a successful save. */
export function ActionForm({
  action,
  submitLabel,
  children,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  submitLabel: string;
  children: ReactNode;
}) {
  const t = useTranslations('hr.form');
  const [state, formAction] = useActionState<ActionState, FormData>(action, undefined);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={formAction} className="space-y-3">
      {state?.error && (
        <Banner tone="red">
          {state.error}
          {state.issues?.length ? (
            <ul className="mt-1 list-inside list-disc">
              {state.issues.map((i) => (
                <li key={`${i.path}-${i.message}`}>
                  {i.path}: {i.message}
                </li>
              ))}
            </ul>
          ) : null}
        </Banner>
      )}
      {state?.ok && <Banner tone="green">{t('saved')}</Banner>}
      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
      <SubmitButton variant="secondary">{submitLabel}</SubmitButton>
    </form>
  );
}
