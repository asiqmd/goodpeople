'use client';

import { PEER_QUESTIONS, type PeerRequestView } from '@gp/shared';
import { useTranslations } from 'next-intl';
import { useActionState, useState, useTransition } from 'react';
import type { ActionState } from '@/app/actions/platform';
import { answerPeer, decidePeer } from '@/app/actions/reviews';
import { ErrorText, Form, issueFor, SubmitButton } from '../forms';
import { Banner, buttonClass, Field, inputClass } from '../ui';
import { RatingChoice, Refused } from './review-forms';

/** The manager's yes or no to a peer someone named. */
export function PeerDecision({ peerId }: { peerId: string }) {
  const t = useTranslations('reviews.peers');
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState>(undefined);
  const decide = (approve: boolean) =>
    start(async () => setState(await decidePeer(peerId, approve)));
  return (
    <div className="space-y-2">
      {state?.error && (
        <Banner tone="red">
          <ErrorText state={state} />
        </Banner>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => decide(true)}
          className={buttonClass.primary}
        >
          {t('approve')}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => decide(false)}
          className={buttonClass.secondary}
        >
          {t('decline')}
        </button>
      </div>
    </div>
  );
}

/** A peer's two answers and rating, given once. */
export function PeerAnswerForm({ request }: { request: PeerRequestView }) {
  const t = useTranslations('reviews.peers');
  const [state, action] = useActionState<ActionState<PeerRequestView>, FormData>(
    answerPeer.bind(null, request.id),
    undefined,
  );
  if (state?.ok) return <Banner tone="green">{t('thanks')}</Banner>;
  return (
    <Form state={state} action={action} className="space-y-4">
      <Refused state={state} />
      <p className="text-sm text-slate-600">{t('answerIntro')}</p>
      {PEER_QUESTIONS.map((q) => (
        <Field key={q} label={t(`questions.${q}`)} error={issueFor(state, `answers.${q}`)}>
          <textarea name={q} rows={4} required maxLength={2000} className={inputClass} />
        </Field>
      ))}
      <RatingChoice name="rating" legend={t('rating')} required error={issueFor(state, 'rating')} />
      <SubmitButton>{t('send')}</SubmitButton>
    </Form>
  );
}
