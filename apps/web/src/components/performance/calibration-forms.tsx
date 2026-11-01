'use client';

import { RATINGS, type CalibrationRow, type ReviewDetail } from '@gp/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import type { ActionState } from '@/app/actions/platform';
import { setFinalRating } from '@/app/actions/reviews';
import { Form, SubmitButton } from '../forms';
import { inputClass } from '../ui';
import { Refused } from './review-forms';

/** HR's final rating for one person; a change from the proposal needs its reason. */
export function FinalRatingForm({ row }: { row: CalibrationRow }) {
  const t = useTranslations('reviews.calibration');
  const tr = useTranslations('reviews.ratings');
  const format = useFormatter();
  const [state, action] = useActionState<ActionState<ReviewDetail>, FormData>(
    setFinalRating.bind(null, row.reviewId),
    undefined,
  );
  const [rating, setRating] = useState(String(row.finalRating ?? row.proposedRating ?? ''));
  const changed = rating !== '' && Number(rating) !== row.proposedRating;
  return (
    <Form state={state} action={action} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          name="finalRating"
          required
          value={rating}
          onChange={(e) => setRating(e.target.value)}
          aria-label={t('final')}
          className={`${inputClass} w-auto`}
        >
          <option value="" disabled>
            {t('choose')}
          </option>
          {RATINGS.map((r) => (
            <option key={r} value={r}>
              {format.number(r)} · {tr(String(r) as '1')}
            </option>
          ))}
        </select>
        <SubmitButton variant="secondary">{t('set')}</SubmitButton>
      </div>
      {changed && (
        <input
          name="note"
          required
          maxLength={1000}
          defaultValue={row.calibrationNote ?? ''}
          placeholder={t('reason')}
          aria-label={t('reason')}
          className={inputClass}
        />
      )}
      {state?.ok && <p className="text-xs text-brand-700">{t('saved')}</p>}
      <Refused state={state} />
    </Form>
  );
}
