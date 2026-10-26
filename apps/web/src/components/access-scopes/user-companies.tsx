'use client';

import type { LegalEntityView } from '@gp/shared';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { setUserCompanies } from '@/app/actions/access-scopes';
import type { ActionState } from '@/app/actions/platform';
import { ErrorText, Form, SubmitButton } from '../forms';
import { Banner, buttonClass } from '../ui';

type Company = Pick<LegalEntityView, 'id' | 'name'>;

/** The companies one login may see people of, as ticks; none ticked: every company. */
export function UserCompanies({
  userId,
  companies,
  chosen,
}: {
  userId: string;
  companies: Company[];
  chosen: string[];
}) {
  const t = useTranslations('accessScopes');
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<ActionState, FormData>(
    setUserCompanies.bind(null, userId),
    undefined,
  );

  return (
    <div className="mt-2 space-y-2">
      <button
        type="button"
        aria-expanded={open}
        className={buttonClass.ghost}
        onClick={() => setOpen(!open)}
      >
        {t('choose')}
      </button>
      {open && (
        <Form state={state} action={action} className="w-64 space-y-3 rounded-lg bg-slate-50 p-3">
          {state?.error && (
            <Banner tone="red">
              <ErrorText state={state} />
            </Banner>
          )}
          {state?.ok && <Banner tone="green">{t('saved')}</Banner>}
          <fieldset className="space-y-2">
            <legend className="mb-2 text-xs text-slate-600">{t('hint')}</legend>
            {companies.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="legalEntityId"
                  value={c.id}
                  defaultChecked={chosen.includes(c.id)}
                />
                {c.name}
              </label>
            ))}
          </fieldset>
          <SubmitButton variant="secondary">{t('save')}</SubmitButton>
        </Form>
      )}
    </div>
  );
}
