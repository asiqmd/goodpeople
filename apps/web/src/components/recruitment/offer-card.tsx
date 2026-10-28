import {
  can,
  LIVE_OFFER_STATUSES,
  OFFER_EDITABLE_STATUSES,
  OFFER_WITHDRAWABLE_STATUSES,
  type ApplicationOffers,
  type OfferStatus,
  type OrgSnapshot,
} from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { authedFetch, currentTenantUser, load } from '@/lib/api';
import { buttonClass, Card } from '../ui';
import { OfferStepButton, OfferWithdrawButton } from './offer-actions';
import { OfferForm } from './offer-form';
import { day, money, OfferNotes, OfferStatusBadge, OfferTerms } from './offer-views';

const isIn = (statuses: readonly OfferStatus[], status: OfferStatus) => statuses.includes(status);

function Disclosure({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="group rounded-lg ring-1 ring-slate-200">
      <summary className="cursor-pointer select-none px-4 py-2 text-sm font-medium text-brand-700">
        {summary}
      </summary>
      <div className="space-y-3 border-t border-slate-200 p-4">{children}</div>
    </details>
  );
}

/**
 * The offer for an application, on its page: its terms and where it stands, the steps HR
 * takes (submit, send, withdraw, hire), the form to make or change it, and earlier offers.
 * Only for logins that manage recruitment.
 */
export async function OfferCard({ applicationId }: { applicationId: string }) {
  const user = await currentTenantUser();
  if (!can(user?.role, 'recruitment.manage')) return null;
  const result = await authedFetch<ApplicationOffers>(
    'tenant',
    `/tenant/recruitment/offers?applicationId=${encodeURIComponent(applicationId)}`,
  );
  if (!result.ok) return null;
  const data = result.data;
  const t = await getTranslations('offers');
  const format = await getFormatter();
  const live = data.offers.find((o) => isIn(LIVE_OFFER_STATUSES, o.status)) ?? null;
  const earlier = data.offers.filter((o) => o !== live);
  const editable = !!live && isIn(OFFER_EDITABLE_STATUSES, live.status);
  const org = data.canOffer || editable ? await load<OrgSnapshot>('tenant', '/tenant/org') : null;
  const form = {
    applicationId,
    defaults: data.defaults,
    budgetMax: data.budgetMax,
    probation: data.probation,
  };

  return (
    <Card title={t('title')} action={live ? <OfferStatusBadge status={live.status} /> : undefined}>
      <div className="space-y-5">
        {live ? (
          <>
            <OfferNotes offer={live} />
            <OfferTerms offer={live} />
            <div className="flex flex-wrap items-start gap-3">
              <a
                href={`/workspace/files/offers/${live.id}/letter`}
                target="_blank"
                rel="noopener"
                className={buttonClass.secondary}
              >
                {live.status === 'accepted' ? t('actions.acceptedLetter') : t('actions.letter')}
              </a>
              {live.status === 'draft' && (
                <OfferStepButton offerId={live.id} step="submit" label={t('actions.submit')} />
              )}
              {live.status === 'approved' && (
                <OfferStepButton offerId={live.id} step="send" label={t('actions.send')} />
              )}
              {live.status === 'sent' && (
                <OfferStepButton
                  offerId={live.id}
                  step="send"
                  label={t('actions.resend')}
                  confirmText={t('actions.resendConfirm')}
                  variant="secondary"
                />
              )}
              {live.status === 'accepted' &&
                (live.employeeId ? (
                  <Link
                    href={`/workspace/employees/${live.employeeId}`}
                    className={buttonClass.primary}
                  >
                    {t('actions.viewEmployee')}
                  </Link>
                ) : (
                  can(user?.role, 'employees.write') && (
                    <Link
                      href={`/workspace/employees/new?offer=${live.id}`}
                      className={buttonClass.primary}
                    >
                      {t('actions.hire')}
                    </Link>
                  )
                ))}
              {isIn(OFFER_WITHDRAWABLE_STATUSES, live.status) && (
                <OfferWithdrawButton offerId={live.id} />
              )}
            </div>
            {editable && org && (
              <Disclosure summary={t('form.edit')}>
                {live.status !== 'draft' && (
                  <p className="text-xs text-slate-500">{t('form.editHint')}</p>
                )}
                <OfferForm {...form} offer={live} org={org} />
              </Disclosure>
            )}
          </>
        ) : data.canOffer && org ? (
          <Disclosure summary={t('make')}>
            <OfferForm {...form} org={org} />
          </Disclosure>
        ) : (
          <p className="text-sm text-slate-500">{t('none')}</p>
        )}
        {earlier.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-slate-800">{t('earlier')}</h3>
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {earlier.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-slate-700">
                    {t('earlierLine', {
                      amount: money(format, o.monthlyGross),
                      date: day(format, o.joiningOn),
                    })}
                  </span>
                  <span className="flex items-center gap-3">
                    <OfferStatusBadge status={o.status} />
                    <a
                      href={`/workspace/files/offers/${o.id}/letter`}
                      target="_blank"
                      rel="noopener"
                      className="font-medium text-brand-700 hover:underline"
                    >
                      {t('actions.letter')}
                    </a>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
