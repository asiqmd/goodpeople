'use client';
import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { commercialPriceChange, type InternationalState } from '@/app/actions/international';
import { Banner, buttonClass, inputClass } from '@/components/ui';
export function CommercialPriceForm() {
  const t = useTranslations('international.priceBook'),
    [state, action, pending] = useActionState<InternationalState, FormData>(
      commercialPriceChange,
      undefined,
    );
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <label>
        {t('plan')}
        <select className={inputClass} name="planCode">
          {['starter', 'growth', 'business', 'enterprise'].map((plan) => (
            <option key={plan}>{plan}</option>
          ))}
        </select>
      </label>
      <label>
        {t('currency')}
        <select className={inputClass} name="currency">
          <option>USD</option>
          <option>AED</option>
        </select>
      </label>
      {['seatPrice', 'effectiveFrom', 'merchantProduct', 'merchantPrice', 'reason'].map((key) => (
        <label key={key}>
          {t(key)}
          <input
            className={inputClass}
            name={key}
            type={key === 'effectiveFrom' ? 'date' : 'text'}
            dir={key === 'reason' ? 'auto' : 'ltr'}
            required
            minLength={key === 'reason' ? 10 : undefined}
            placeholder={key === 'seatPrice' ? '49.00' : undefined}
            pattern={key === 'seatPrice' ? '[0-9]+[.][0-9]{2}' : undefined}
          />
        </label>
      ))}
      <button disabled={pending} className={buttonClass.primary}>
        {t('save')}
      </button>
      {state?.error && <Banner tone="red">{state.error}</Banner>}
      {state?.ok && <Banner tone="green">{t('saved')}</Banner>}
    </form>
  );
}
