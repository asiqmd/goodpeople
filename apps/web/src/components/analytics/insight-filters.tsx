'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  INSIGHT_KINDS,
  type InsightCatalog,
  type InsightDefinition,
  type InsightKind,
} from '@gp/shared';
import { buttonClass, inputClass } from '@/components/ui';

export function InsightFilters({
  catalog,
  definition,
}: {
  catalog: InsightCatalog;
  definition: InsightDefinition;
}) {
  const t = useTranslations('insights');
  const [kind, setKind] = useState(definition.kind);
  const [companyId, setCompanyId] = useState('companyId' in definition ? definition.companyId : '');
  const companies =
    kind === 'payroll' ? [] : catalog.companies.filter((c) => c.kinds.includes(kind));
  const kinds = INSIGHT_KINDS.filter((k) =>
    k === 'payroll' ? catalog.payroll : catalog.companies.some((c) => c.kinds.includes(k)),
  );
  return (
    <form method="get" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <label className="min-w-0 text-sm">
        {t('report')}
        <select
          name="kind"
          className={inputClass + ' mt-1 w-full'}
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as InsightKind);
            setCompanyId('');
          }}
        >
          {kinds.map((k) => (
            <option key={k} value={k}>
              {t('kinds.' + k)}
            </option>
          ))}
        </select>
      </label>
      {kind !== 'payroll' && (
        <label className="min-w-0 text-sm">
          {t('company')}
          <select
            name="companyId"
            className={inputClass + ' mt-1 w-full'}
            value={companies.some((c) => c.id === companyId) ? companyId : companies[0]?.id}
            onChange={(e) => setCompanyId(e.target.value)}
            required
          >
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="min-w-0 text-sm">
        {t('month')}
        <input
          name="month"
          type="month"
          min="1900-01"
          max={catalog.latestMonth}
          defaultValue={definition.month}
          className={inputClass + ' mt-1 w-full'}
          required
        />
      </label>
      <button className={buttonClass.primary + ' self-end'}>{t('apply')}</button>
    </form>
  );
}
