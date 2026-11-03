'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { AnalyticsCatalog } from '@gp/shared';
import { buttonClass, inputClass } from '@/components/ui';

export function AnalyticsFilters({
  catalog,
  asOf,
  maxAsOf,
  companyId,
  locationId,
}: {
  catalog: AnalyticsCatalog;
  asOf: string;
  maxAsOf: string;
  companyId: string;
  locationId: string;
}) {
  const t = useTranslations('analytics');
  const [company, setCompany] = useState(companyId);
  const [site, setSite] = useState(locationId);
  const selected = company.split(',');
  const options = catalog.locations.filter((s) => !company || selected.includes(s.legalEntityId));
  return (
    <form method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="min-w-0 text-sm">
        {t('asOf')}
        <input
          className={inputClass + ' mt-1 w-full'}
          type="date"
          name="asOf"
          defaultValue={asOf}
          min="1900-01-01"
          max={maxAsOf}
          required
        />
      </label>
      <label className="min-w-0 text-sm">
        {t('company')}
        <select
          className={inputClass + ' mt-1 w-full'}
          name="companyIds"
          value={company}
          onChange={(e) => {
            setCompany(e.target.value);
            setSite('');
          }}
        >
          <option value="">{t('allCompanies')}</option>
          {selected.length > 1 && (
            <option value={company}>{t('selectedCompanies', { count: selected.length })}</option>
          )}
          {catalog.companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-0 text-sm">
        {t('location')}
        <select
          className={inputClass + ' mt-1 w-full'}
          name="locationId"
          value={site}
          onChange={(e) => setSite(e.target.value)}
        >
          <option value="">{t('allLocations')}</option>
          {options.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <button className={buttonClass.primary + ' self-end'}>{t('apply')}</button>
    </form>
  );
}
