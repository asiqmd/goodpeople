'use client';

import {
  DEFAULT_INCREMENT_MATRIX,
  RANGE_BANDS,
  type CompensationLineView,
  type CompensationRoundView,
  type OrgSnapshot,
  type OutcomeCycle,
} from '@gp/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { useActionState, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import {
  changeCompensationBudgets,
  createCompensation,
  moveCompensation,
  proposeCompensation,
} from '@/app/actions/compensation';
import type { ActionState } from '@/app/actions/platform';
import { ErrorText, Form, SubmitButton } from '@/components/forms';
import { Banner, buttonClass, Field, inputClass } from '@/components/ui';

function Result({ state }: { state: ActionState<CompensationRoundView> }) {
  const t = useTranslations('compensation');
  return (
    <>
      {state?.error && (
        <Banner tone="red">
          {state.code && t.has(`errors.${state.code}`) ? (
            t(`errors.${state.code}`)
          ) : (
            <ErrorText state={state} />
          )}
          {state.issues?.map((i) => (
            <p key={i.path}>
              {i.path}: {i.message}
            </p>
          ))}
        </Banner>
      )}
      {state?.ok && <Banner tone="green">{t('saved')}</Banner>}
    </>
  );
}

function ProposalButtons() {
  const t = useTranslations('compensation');
  const { pending } = useFormStatus();
  return (
    <div className="flex gap-2">
      <button
        type="submit"
        disabled={pending}
        className={buttonClass.secondary}
        name="intent"
        value="save"
      >
        {t('save')}
      </button>
      <button
        type="submit"
        disabled={pending}
        className={buttonClass.primary}
        name="intent"
        value="submit"
      >
        {t('submit')}
      </button>
    </div>
  );
}

function BudgetFields({
  org,
  companyId,
  round,
}: {
  org: OrgSnapshot;
  companyId: string;
  round?: CompensationRoundView;
}) {
  const t = useTranslations('compensation');
  return (
    <div className="space-y-4">
      <Field label={t('companyBudget')} hint={t('budgetHint')}>
        <input
          type="number"
          name="companyBudget"
          min="0"
          step="0.01"
          required
          defaultValue={round?.budgets.find((b) => !b.orgUnitId)?.monthlyAmount}
          className={inputClass}
        />
      </Field>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium">{t('unitBudgets')}</legend>
        {org.orgUnits
          .filter((u) => u.legalEntityId === companyId && u.isActive)
          .map((u, i) => (
            <Field key={u.id} label={u.name}>
              <input type="hidden" name={`units.${i}.orgUnitId`} value={u.id} />
              <input
                type="number"
                name={`units.${i}.monthlyAmount`}
                min="0"
                step="0.01"
                defaultValue={round?.budgets.find((b) => b.orgUnitId === u.id)?.monthlyAmount}
                className={inputClass}
              />
            </Field>
          ))}
      </fieldset>
    </div>
  );
}

export function CompensationForm({ org, cycles }: { org: OrgSnapshot; cycles: OutcomeCycle[] }) {
  const t = useTranslations('compensation');
  const f = useFormatter();
  const [companyId, setCompanyId] = useState(org.legalEntities[0]?.id ?? '');
  const [state, action] = useActionState(createCompensation, undefined);
  return (
    <Form state={state} action={action} className="space-y-6">
      <Result state={state} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('name')}>
          <input name="name" required minLength={2} maxLength={120} className={inputClass} />
        </Field>
        <Field label={t('company')}>
          <select
            name="legalEntityId"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className={inputClass}
          >
            {org.legalEntities
              .filter((e) => e.isActive)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label={t('effectiveFrom')}>
          <input type="date" name="effectiveFrom" required className={inputClass} />
        </Field>
      </div>
      <Field label={t('cycle')}>
        <select name="cycleId" className={inputClass}>
          <option value="">{t('noCycle')}</option>
          {cycles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="rmgAnnual" className="mt-1" />
        <span>
          {t('rmgAnnual')}
          <span className="block text-xs text-slate-500">{t('rmgHint')}</span>
        </span>
      </label>
      <BudgetFields key={companyId} org={org} companyId={companyId} />
      <fieldset className="space-y-2">
        <legend className="font-medium">{t('ranges')}</legend>
        <p className="text-xs text-slate-500">{t('rangesHint')}</p>
        <div className="grid grid-cols-3 gap-2 text-sm font-medium">
          <span>{t('grade')}</span>
          <span>{t('minimum')}</span>
          <span>{t('maximum')}</span>
        </div>
        {org.grades
          .filter((g) => g.isActive)
          .map((g, i) => (
            <div className="grid grid-cols-3 items-center gap-2 text-sm" key={g.id}>
              <span>{g.name}</span>
              <input name={`ranges.${i}.gradeId`} type="hidden" value={g.id} />
              <input
                aria-label={`${g.name} ${t('minimum')}`}
                name={`ranges.${i}.minimum`}
                type="number"
                min="0"
                step="0.01"
                className={inputClass}
              />
              <input
                aria-label={`${g.name} ${t('maximum')}`}
                name={`ranges.${i}.maximum`}
                type="number"
                min="0"
                step="0.01"
                className={inputClass}
              />
            </div>
          ))}
      </fieldset>
      <fieldset className="space-y-2 overflow-x-auto">
        <legend className="font-medium">{t('matrix')}</legend>
        <p className="text-xs text-slate-500">{t('matrixHint')}</p>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="p-2 text-start">{t('rating')}</th>
              {RANGE_BANDS.map((band) => (
                <th key={band} className="p-2 text-start">
                  {t(`bands.${band}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(DEFAULT_INCREMENT_MATRIX).map(([rating, bands]) => (
              <tr key={rating}>
                <th className="p-2 text-start">{f.number(Number(rating))}</th>
                {RANGE_BANDS.map((band) => (
                  <td key={band} className="p-2">
                    <input
                      aria-label={`${t('rating')} ${rating}: ${t(`bands.${band}`)}`}
                      name={`matrix.${rating}.${band}`}
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      required
                      defaultValue={bands[band]}
                      className={inputClass}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </fieldset>
      <SubmitButton>{t('create')}</SubmitButton>
    </Form>
  );
}

export function ProposalForm({ roundId, line }: { roundId: string; line: CompensationLineView }) {
  const t = useTranslations('compensation');
  const [state, action] = useActionState(
    proposeCompensation.bind(null, roundId, line.id),
    undefined,
  );
  return (
    <Form state={state} action={action} className="space-y-3 border-t border-slate-100 pt-3">
      <Result state={state} />
      <input type="hidden" name="version" value={line.version} />
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <Field label={t('percent')}>
          <input
            type="number"
            name="percent"
            min="0"
            max="100"
            step="0.01"
            required
            defaultValue={line.percent}
            className={inputClass}
          />
        </Field>
        <Field label={t('reason')}>
          <input
            name="reason"
            minLength={5}
            maxLength={500}
            required
            defaultValue={line.reason ?? ''}
            className={inputClass}
          />
        </Field>
      </div>
      <ProposalButtons />
    </Form>
  );
}

export function BudgetsForm({ org, round }: { org: OrgSnapshot; round: CompensationRoundView }) {
  const t = useTranslations('compensation');
  const [state, action] = useActionState(changeCompensationBudgets.bind(null, round.id), undefined);
  return (
    <Form state={state} action={action} className="space-y-4">
      <Result state={state} />
      <BudgetFields org={org} companyId={round.company.id} round={round} />
      <SubmitButton variant="secondary">{t('saveBudgets')}</SubmitButton>
    </Form>
  );
}

export function RoundActions({ id }: { id: string }) {
  const t = useTranslations('compensation');
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionState<CompensationRoundView>>();
  return (
    <div className="space-y-3">
      <Result state={state} />
      <p className="text-sm text-slate-600">{t('exportHint')}</p>
      <div className="flex flex-wrap gap-2">
        {(['export', 'cancel'] as const).map((move) => (
          <button
            key={move}
            type="button"
            disabled={pending}
            className={move === 'export' ? buttonClass.primary : buttonClass.secondary}
            onClick={() => {
              start(async () => setState(await moveCompensation(id, move)));
            }}
          >
            {pending ? '…' : t(move)}
          </button>
        ))}
      </div>
    </div>
  );
}
