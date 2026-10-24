'use client';

import type { NomineeView } from '@gp/shared';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { saveNominees } from '@/app/actions/hr';
import type { ActionState } from '@/app/actions/platform';
import { SubmitButton } from '../forms';
import { Banner, buttonClass, inputClass } from '../ui';

interface Row {
  key: number;
  name: string;
  relation: string;
  sharePercent: number;
}

/** Replaces the whole nominee list; shares must total 100% (checked here and by the API). */
export function NomineesForm({
  employeeId,
  nominees,
}: {
  employeeId: string;
  nominees: NomineeView[];
}) {
  const t = useTranslations('hr.detail');
  const tf = useTranslations('hr.form');
  const [state, action] = useActionState<ActionState, FormData>(
    saveNominees.bind(null, employeeId),
    undefined,
  );
  const [rows, setRows] = useState<Row[]>(nominees.map((n, key) => ({ key, ...n })));
  const total = rows.reduce((sum, r) => sum + (Number(r.sharePercent) || 0), 0);
  const update = (key: number, patch: Partial<Row>) =>
    setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <form action={action} className="space-y-4">
      <p className="text-sm text-slate-600">{t('nomineesHint')}</p>
      {state?.error && <Banner tone="red">{state.error}</Banner>}
      {state?.ok && <Banner tone="green">{tf('saved')}</Banner>}
      {rows.length === 0 && <p className="text-sm text-slate-500">{t('noNominees')}</p>}
      {rows.map((row, i) => (
        <div key={row.key} className="grid items-end gap-3 sm:grid-cols-[2fr_1fr_6rem_auto]">
          <label className="text-sm">
            <span className="font-medium">{t('nomineeName')}</span>
            <input
              name={`rows.${i}.name`}
              required
              value={row.name}
              onChange={(e) => update(row.key, { name: e.target.value })}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-sm">
            <span className="font-medium">{t('relation')}</span>
            <input
              name={`rows.${i}.relation`}
              required
              value={row.relation}
              onChange={(e) => update(row.key, { relation: e.target.value })}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-sm">
            <span className="font-medium">{t('share')}</span>
            <input
              name={`rows.${i}.sharePercent`}
              type="number"
              min={1}
              max={100}
              required
              value={row.sharePercent}
              onChange={(e) => update(row.key, { sharePercent: Number(e.target.value) })}
              className={`${inputClass} mt-1`}
            />
          </label>
          <button
            type="button"
            className={buttonClass.ghost}
            onClick={() => setRows((all) => all.filter((r) => r.key !== row.key))}
          >
            {t('remove')}
          </button>
        </div>
      ))}
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          className={buttonClass.secondary}
          onClick={() =>
            setRows((all) => [
              ...all,
              {
                key: Date.now(),
                name: '',
                relation: '',
                sharePercent: Math.max(0, 100 - total) || 100,
              },
            ])
          }
        >
          {t('addNominee')}
        </button>
        <span
          className={`text-sm font-medium ${rows.length && total !== 100 ? 'text-red-600' : 'text-slate-600'}`}
        >
          {t('total', { total })}
        </span>
      </div>
      <SubmitButton>{tf('save')}</SubmitButton>
    </form>
  );
}
