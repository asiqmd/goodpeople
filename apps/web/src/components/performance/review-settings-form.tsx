'use client';

import { RATINGS, type PerformanceSettingsView } from '@gp/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import type { ActionState } from '@/app/actions/platform';
import { savePerformanceSettings } from '@/app/actions/reviews';
import { Form, issueFor, SubmitButton } from '../forms';
import { Banner, Field, inputClass } from '../ui';
import { CompetencyRows } from './cycle-forms';
import { Refused } from './review-forms';

/** The competencies reviews rate, and how final ratings usually spread (a guide, not a quota). */
export function PerformanceSettingsForm({ settings }: { settings: PerformanceSettingsView }) {
  const t = useTranslations('reviews.settings');
  const tr = useTranslations('reviews.ratings');
  const format = useFormatter();
  const [state, action] = useActionState<ActionState<PerformanceSettingsView>, FormData>(
    savePerformanceSettings,
    undefined,
  );
  const [guide, setGuide] = useState<Record<number, number>>(settings.ratingGuide);
  const total = RATINGS.reduce((sum, r) => sum + (guide[r] ?? 0), 0);
  return (
    <Form state={state} action={action} className="space-y-6">
      <Refused state={state} />
      {state?.ok && <Banner tone="green">{t('saved')}</Banner>}
      <CompetencyRows initial={settings.competencies} state={state} />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-800">{t('guide')}</legend>
        <p className="text-xs text-slate-500">{t('guideHint')}</p>
        <div className="grid gap-3 sm:grid-cols-5">
          {RATINGS.map((r) => (
            <Field
              key={r}
              label={`${format.number(r)} · ${tr(String(r) as '1')}`}
              error={issueFor(state, `ratingGuide.${r}`)}
            >
              <span className="flex items-center gap-1">
                <input
                  type="number"
                  name={`ratingGuide.${r}`}
                  min={0}
                  max={100}
                  required
                  value={guide[r] ?? 0}
                  onChange={(e) => setGuide({ ...guide, [r]: Number(e.target.value) })}
                  className={inputClass}
                />
                <span className="text-sm text-slate-500">%</span>
              </span>
            </Field>
          ))}
        </div>
        <p className={`text-sm ${total === 100 ? 'text-slate-600' : 'font-medium text-red-600'}`}>
          {t('total', { total: format.number(total) })}
        </p>
        {issueFor(state, 'ratingGuide') && (
          <p className="text-xs text-red-600">{issueFor(state, 'ratingGuide')}</p>
        )}
      </fieldset>
      <SubmitButton>{t('save')}</SubmitButton>
    </Form>
  );
}
