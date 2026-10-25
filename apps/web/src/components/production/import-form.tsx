'use client';

import type { ProductionImportResult } from '@gp/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { importProduction } from '@/app/actions/production';
import type { ActionState } from '@/app/actions/platform';
import { ErrorText, Form, SubmitButton } from '../forms';
import { Banner, Field } from '../ui';

/** Uploads a production sheet and shows what was saved and each row that was not, and why. */
export function ImportForm() {
  const t = useTranslations('production.import');
  const format = useFormatter();
  const [state, action] = useActionState<ActionState<ProductionImportResult>, FormData>(
    importProduction,
    undefined,
  );
  const result = state?.ok ? state.result : undefined;
  return (
    <div className="space-y-4">
      <Form state={state} action={action} className="space-y-3">
        {state?.error && (
          <Banner tone="red">
            <ErrorText state={state} />
          </Banner>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t('file')} hint={t('fileHint')}>
            <input
              name="file"
              type="file"
              required
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="block text-sm"
            />
          </Field>
          <SubmitButton>{t('upload')}</SubmitButton>
        </div>
      </Form>
      {result && (
        <div className="space-y-3">
          <Banner tone={result.problems.length ? 'amber' : 'green'}>
            {t('result', {
              file: result.fileName,
              rows: result.rows,
              saved: result.saved,
              removed: result.removed,
              unchanged: result.unchanged,
              problems: result.problems.length,
            })}
          </Banner>
          {result.problems.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-500">
                  <tr>
                    <th className="py-2 pr-3 font-medium">{t('row')}</th>
                    <th className="py-2 pr-3 font-medium">{t('employeeCode')}</th>
                    <th className="py-2 pr-3 font-medium">{t('date')}</th>
                    <th className="py-2 pr-3 font-medium">{t('operationCode')}</th>
                    <th className="py-2 pr-3 text-right font-medium">{t('quantity')}</th>
                    <th className="py-2 font-medium">{t('problem')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {result.problems.map((p) => (
                    <tr key={p.row}>
                      <td className="py-1.5 pr-3 tabular-nums text-slate-500">
                        {format.number(p.row)}
                      </td>
                      <td className="py-1.5 pr-3 font-mono text-xs">{p.employeeCode}</td>
                      <td className="py-1.5 pr-3">{p.date}</td>
                      <td className="py-1.5 pr-3 font-mono text-xs">{p.operationCode}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{p.quantity}</td>
                      <td className="py-1.5 text-red-700">
                        {t.has(`problems.${p.code}`) ? t(`problems.${p.code}`) : p.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
