'use client';
import { useActionState, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { COUNTRY_DEFAULTS, type InternationalOverview } from '@gp/shared';
import { internationalChange, type InternationalState } from '@/app/actions/international';
import { Card, Banner } from '@/components/ui';
const input = 'mt-1 w-full rounded-lg border border-slate-300 p-2';
export function InternationalConsole({ data }: { data: InternationalOverview }) {
  const t = useTranslations('international'),
    locale = useLocale(),
    [state, action, pending] = useActionState<InternationalState, FormData>(
      internationalChange,
      undefined,
    ),
    [country, setCountry] = useState<'BD' | 'AE' | 'SA'>('BD'),
    [zone, setZone] = useState('Asia/Dhaka');
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        <p className="mt-2 text-slate-600">{t('intro')}</p>
      </header>
      <Card>
        <h2 className="font-semibold">{t('create')}</h2>
        <form action={action} className="mt-4 grid gap-4 sm:grid-cols-3">
          <input type="hidden" name="op" value="company" />
          <label>
            {t('name')}
            <input name="name" required minLength={2} className={input} dir="auto" />
          </label>
          <label>
            {t('code')}
            <input name="code" required minLength={2} className={input} dir="ltr" />
          </label>
          <label>
            {t('country')}
            <select name="countryCode" className={input}>
              <option value="BD">BD — Bangladesh</option>
              <option value="AE">AE — الإمارات</option>
              <option value="SA">SA — السعودية</option>
            </select>
          </label>
          <button disabled={pending} className="rounded-lg bg-emerald-700 p-2 text-white">
            {t('create')}
          </button>
        </form>
        {state?.error && <Banner tone="red">{state.error}</Banner>}
        {state?.ok && <Banner tone="green">{t('saved')}</Banner>}
      </Card>
      <Card>
        <h2 className="font-semibold">{t('profiles')}</h2>
        <div className="my-3 flex flex-wrap gap-3">
          {data.profiles
            .filter((p) => !p.effectiveTo && p.countryCode !== 'BD')
            .map((p) => (
              <a
                className="underline"
                key={p.id}
                href={`/workspace/international/employees/new?company=${p.legalEntityId}`}
              >
                {t('employee.hire')} · {p.companyName}
              </a>
            ))}
        </div>
        {data.profiles
          .filter((p) => !p.effectiveTo && p.countryCode === 'AE')
          .map((p) => (
            <a
              key={'uae-' + p.id}
              href={'/workspace/uae?company=' + p.legalEntityId}
              className="my-3 block text-sm underline"
            >
              {t('uaePilot')} · {p.companyName}
            </a>
          ))}
        {data.profiles
          .filter((p) => !p.effectiveTo && p.countryCode === 'SA')
          .map((p) => (
            <a
              key={'saudi-' + p.id}
              href={'/workspace/saudi?company=' + p.legalEntityId}
              className="my-3 block text-sm underline"
            >
              {t('saudiPilot')} · {p.companyName}
            </a>
          ))}
        <div className="overflow-x-auto">
          <table className="mt-4 w-full min-w-[900px] text-sm">
            <thead>
              <tr>
                {['name', 'country', 'currency', 'regime', 'from', 'to', 'zone', 'calendar'].map(
                  (k) => (
                    <th className="p-2 text-start" key={k}>
                      {t(k)}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {data.profiles.map((p) => (
                <tr className="border-t" key={p.id}>
                  <td className="p-2" dir="auto">
                    <a
                      className="underline"
                      href={`/workspace/employees?entity=${p.legalEntityId}`}
                    >
                      {p.companyName}
                    </a>
                  </td>
                  <td className="p-2">
                    <bdi className="whitespace-nowrap">{p.countryCode}</bdi>
                  </td>
                  <td className="p-2">
                    <bdi className="whitespace-nowrap">{p.currency}</bdi>
                  </td>
                  <td className="p-2">
                    <bdi className="whitespace-nowrap">{p.regime}</bdi>
                    <p>{p.reviewStatus === 'existing_bd' ? t('existing') : t('review')}</p>
                  </td>
                  <td className="p-2">
                    <bdi className="whitespace-nowrap">{p.effectiveFrom}</bdi>
                  </td>
                  <td className="p-2">
                    <bdi className="whitespace-nowrap">{p.effectiveTo ?? '—'}</bdi>
                  </td>
                  <td className="p-2">
                    <bdi className="whitespace-nowrap">{p.businessTimeZone}</bdi>
                  </td>
                  <td className="p-2">{t(p.calendar)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <a
          className="mt-4 inline-block underline"
          href={'/api/international-profile?language=' + locale}
        >
          {t('preview')}
        </a>
      </Card>
      <Card>
        <h2 className="font-semibold">{t('version')}</h2>
        <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="op" value="profile" />
          <label>
            {t('name')}
            <select
              name="legalEntityId"
              className={input}
              required
              onChange={(e) => {
                const c = data.profiles.find(
                  (p) => p.legalEntityId === e.target.value,
                )?.countryCode;
                if (c === 'BD' || c === 'AE' || c === 'SA') {
                  setCountry(c);
                  setZone(
                    data.profiles.find((p) => p.legalEntityId === e.target.value && !p.effectiveTo)
                      ?.businessTimeZone ?? COUNTRY_DEFAULTS[c].zone,
                  );
                }
              }}
            >
              <option value="">—</option>
              {data.profiles
                .filter((p) => !p.effectiveTo)
                .map((p) => (
                  <option key={p.id} value={p.legalEntityId}>
                    {p.companyName} ({p.countryCode})
                  </option>
                ))}
            </select>
          </label>
          <input name="countryCode" type="hidden" value={country} />
          <input name="regime" type="hidden" value={COUNTRY_DEFAULTS[country].regime} />
          <input name="currency" type="hidden" value={COUNTRY_DEFAULTS[country].currency} />
          <label>
            {t('from')}
            <input name="effectiveFrom" type="date" required className={input} />
          </label>
          <label>
            {t('zone')}
            <input
              name="businessTimeZone"
              key={country}
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              required
              className={input}
              dir="ltr"
            />
          </label>
          <label>
            {t('calendar')}
            <select name="calendar" className={input}>
              <option value="gregorian">{t('gregorian')}</option>
              <option value="hijri_required">{t('hijri_required')}</option>
            </select>
          </label>
          <label>
            {t('reason')}
            <textarea name="reason" required minLength={10} className={input} dir="auto" />
          </label>
          <button disabled={pending} className="rounded-lg bg-emerald-700 p-2 text-white">
            {t('version')}
          </button>
        </form>
      </Card>
      <Card>
        <h2 className="font-semibold">{t('commercial')}</h2>
        <p className="mt-2">{t('gate')}</p>
      </Card>
    </div>
  );
}
