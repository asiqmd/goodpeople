'use client';

import { BD_DIVISIONS, type Address } from '@gp/shared';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { issueFor } from '../forms';
import { Field, inputClass } from '../ui';

type Issues = { issues?: { path: string; message: string }[] } | undefined;

/** Division → district pickers (districts follow the division) plus free-text lines. */
export function AddressFields({
  prefix,
  defaults,
  state,
  required = true,
}: {
  prefix: string;
  defaults?: Address | null;
  state: Issues;
  required?: boolean;
}) {
  const t = useTranslations('hr.form');
  const locale = useLocale();
  const [division, setDivision] = useState(defaults?.division ?? '');
  const districts = BD_DIVISIONS.find((d) => d.code === division)?.districts ?? [];
  const error = (field: string) => issueFor(state, `${prefix}.${field}`);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label={t('addressLine')} error={error('line')}>
          <input
            name={`${prefix}.line`}
            required={required}
            defaultValue={defaults?.line}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label={t('division')} error={error('division')}>
        <select
          name={`${prefix}.division`}
          required={required}
          value={division}
          onChange={(e) => setDivision(e.target.value)}
          className={inputClass}
        >
          <option value="">{t('choose')}</option>
          {BD_DIVISIONS.map((d) => (
            <option key={d.code} value={d.code}>
              {locale === 'bn' ? d.nameBn : d.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('district')} error={error('district')}>
        <select
          key={division}
          name={`${prefix}.district`}
          required={required}
          defaultValue={defaults?.division === division ? defaults?.district : ''}
          className={inputClass}
        >
          <option value="">{t('choose')}</option>
          {districts.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('upazila')} error={error('upazila')}>
        <input name={`${prefix}.upazila`} defaultValue={defaults?.upazila} className={inputClass} />
      </Field>
      <Field label={t('postcode')} error={error('postcode')}>
        <input
          name={`${prefix}.postcode`}
          inputMode="numeric"
          pattern="\d{4}"
          defaultValue={defaults?.postcode}
          className={inputClass}
        />
      </Field>
    </div>
  );
}
