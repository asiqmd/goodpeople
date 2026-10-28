'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { moveOffer } from '@/app/actions/offers';
import type { ActionState } from '@/app/actions/platform';
import { ErrorText, Form, SubmitButton } from '../forms';
import { Banner } from '../ui';

/** One step of an offer (submit, send, withdraw) as a button, with the API's refusal. */
export function OfferStepButton({
  offerId,
  step,
  label,
  confirmText,
  variant = 'primary',
}: {
  offerId: string;
  step: 'submit' | 'send' | 'withdraw';
  label: string;
  confirmText?: string;
  variant?: 'primary' | 'secondary';
}) {
  const [state, action] = useActionState<ActionState, FormData>(
    moveOffer.bind(null, offerId, step),
    undefined,
  );
  return (
    <Form
      state={state}
      action={action}
      onSubmit={(event) => {
        if (confirmText && !window.confirm(confirmText)) event.preventDefault();
      }}
      className="space-y-2"
    >
      {state?.error && (
        <Banner tone="red">
          <ErrorText state={state} />
        </Banner>
      )}
      <SubmitButton variant={variant}>{label}</SubmitButton>
    </Form>
  );
}

/** Withdrawing asks first: the candidate's link stops working. */
export function OfferWithdrawButton({ offerId }: { offerId: string }) {
  const t = useTranslations('offers.actions');
  return (
    <OfferStepButton
      offerId={offerId}
      step="withdraw"
      label={t('withdraw')}
      confirmText={t('withdrawConfirm')}
      variant="secondary"
    />
  );
}
