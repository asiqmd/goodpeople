'use client';

import { GRIEVANCE_TEXT_MAX, GRIEVANCE_TEXT_MIN, type GrievanceFollowUp } from '@gp/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { openGrievance, replyAsReporter } from '@/app/actions/grievances';
import type { ActionState } from '@/app/actions/platform';
import { Form, issueFor } from '../forms';
import { Badge, Banner } from '../ui';
import { CategoryIcon, STATUS_TONE, Thread } from './parts';
import { BigField, BigSubmit, bigButton, bigInput, bigSecondary, Refused } from './speak-up-form';

type State = ActionState<GrievanceFollowUp>;

/** The reporter opens their grievance with the reference and PIN, reads the answers and replies. */
export function FollowUpPanel({ slug, kiosk }: { slug: string; kiosk: boolean }) {
  const t = useTranslations('grievances');
  const format = useFormatter();
  const [opened, open] = useActionState<State, FormData>(openGrievance.bind(null, slug), undefined);
  const [replied, reply] = useActionState<State, FormData>(
    replyAsReporter.bind(null, slug),
    undefined,
  );
  // Kept in this page's memory only, to send with a reply.
  const [credentials, setCredentials] = useState<{ reference: string; pin: string } | null>(null);
  // Once open, the page only replies; opening another starts again with a page load.
  const view = replied?.result ?? opened?.result;

  const when = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' });
  const raise = `/speak-up/${slug}${kiosk ? '?channel=kiosk' : ''}`;

  if (!view || !credentials) {
    return (
      <Form
        state={opened}
        action={open}
        onSubmit={(event) => {
          const data = new FormData(event.currentTarget);
          setCredentials({
            reference: String(data.get('reference') ?? ''),
            pin: String(data.get('pin') ?? ''),
          });
        }}
        className="space-y-5"
      >
        <p className="text-base text-slate-700">{t('followUp.intro')}</p>
        <Refused state={opened} />
        <BigField
          label={t('followUp.reference')}
          hint={t('followUp.referenceHint')}
          error={issueFor(opened, 'reference') ? t('followUp.referenceError') : undefined}
        >
          <input
            name="reference"
            required
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="GR-"
            className={`${bigInput} font-mono uppercase tracking-widest`}
          />
        </BigField>
        <BigField
          label={t('followUp.pin')}
          hint={t('followUp.lockHint')}
          error={issueFor(opened, 'pin') ? t('speakUp.pinError') : undefined}
        >
          <input
            name="pin"
            type="password"
            required
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            className={`${bigInput} font-mono tracking-widest`}
          />
        </BigField>
        <BigSubmit>{t('followUp.open')}</BigSubmit>
        <a href={raise} className={bigSecondary}>
          {t('followUp.raise')}
        </a>
      </Form>
    );
  }

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-2xl font-bold tracking-widest">{view.reference}</p>
          <Badge tone={STATUS_TONE[view.status]}>{t(`statuses.${view.status}`)}</Badge>
        </div>
        <p className="flex items-center gap-2 text-base text-slate-800">
          <CategoryIcon category={view.category} className="size-6 text-brand-700" />
          {t(`categories.${view.category}`)}
        </p>
        <p className="text-sm text-slate-600">
          {t('followUp.raisedOn', {
            date: format.dateTime(new Date(view.createdAt), { dateStyle: 'long' }),
          })}
        </p>
        <p className="text-base text-slate-800">{t(`reporterStatuses.${view.status}`)}</p>
      </section>

      <Thread
        items={view.thread.map((m, i) => ({
          key: `${i}`,
          own: m.author === 'reporter',
          who: m.author === 'reporter' ? t('followUp.you') : t('followUp.answer'),
          when: when(m.createdAt),
          text: m.text,
        }))}
      />

      {view.status !== 'closed' && (
        <Form state={replied} action={reply} className="space-y-4">
          {replied?.ok && <Banner tone="green">{t('followUp.sent')}</Banner>}
          <Refused state={replied} />
          <input type="hidden" name="reference" value={credentials.reference} />
          <input type="hidden" name="pin" value={credentials.pin} />
          <BigField
            label={t('followUp.reply')}
            error={
              issueFor(replied, 'text')
                ? t('speakUp.textError', { min: GRIEVANCE_TEXT_MIN, max: GRIEVANCE_TEXT_MAX })
                : undefined
            }
          >
            <textarea
              name="text"
              required
              rows={4}
              minLength={GRIEVANCE_TEXT_MIN}
              maxLength={GRIEVANCE_TEXT_MAX}
              className={bigInput}
            />
          </BigField>
          <BigSubmit>{t('followUp.send')}</BigSubmit>
        </Form>
      )}

      {/* A full page load forgets the reference and PIN; on a kiosk, back to its start. */}
      <a
        href={kiosk ? '/kiosk' : `/speak-up/${slug}/follow-up`}
        className={kiosk ? bigButton : bigSecondary}
      >
        {kiosk ? t('speakUp.done') : t('followUp.finish')}
      </a>
    </div>
  );
}
