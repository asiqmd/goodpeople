'use client';

import {
  INCREMENT_BASES,
  INVESTMENT_KINDS,
  LOAN_KINDS,
  RELIGIONS,
  type DeclarationItemView,
  type PayBatchPreview,
  type PayGroupView,
  type PayrollSettingsView,
  type SalaryStructureView,
  type TaxProfileView,
} from '@gp/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { useActionState, useRef, useState, useTransition } from 'react';
import {
  addFundEntry,
  cancelIncrement,
  cancelLoan,
  createBonusRun,
  createIncrement,
  createLoan,
  joinFund,
  leaveFund,
  markRunPaid,
  openSettlement,
  createWppfYear,
  openWppfRun,
  saveAccounts,
  postInterest,
  previewIncrement,
  repayLoan,
  saveDeclaration,
  saveTaxAndFundSettings,
  saveTaxOpening,
  saveTaxProfile,
  setTaxDeposit,
  verifyDeclaration,
} from '@/app/actions/payroll-benefits';
import type { ActionState } from '@/app/actions/platform';
import { ErrorText, Form, issueFor, SubmitButton } from '../forms';
import { Banner, buttonClass, Field, inputClass } from '../ui';

const taka = (format: ReturnType<typeof useFormatter>, amount: string) =>
  `৳${format.number(Number(amount), { maximumFractionDigits: 2 })}`;

function Errors({ state }: { state: ActionState<unknown> }) {
  if (!state?.error) return null;
  return (
    <Banner tone="red">
      <ErrorText state={state} />
    </Banner>
  );
}

function Saved({ state, children }: { state: ActionState<unknown>; children: React.ReactNode }) {
  return state?.ok || state?.result ? <Banner tone="green">{children}</Banner> : null;
}

/** A button that runs an action, asking first, and shows a refusal beside it. */
function ActionButton({
  label,
  confirm,
  run,
  className = buttonClass.ghost,
}: {
  label: string;
  confirm?: string;
  run: () => Promise<ActionState>;
  className?: string;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionState>();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className={className}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => setResult(await run()));
        }}
      >
        {label}
      </button>
      {result?.error && (
        <span className="text-xs text-red-600">
          <ErrorText state={result} />
        </span>
      )}
    </span>
  );
}

// ── Settings ─────────────────────────────────────────────────────────────────

export function TaxFundSettingsForm({ settings }: { settings: PayrollSettingsView }) {
  const t = useTranslations('payroll.settings');
  const [state, action] = useActionState(saveTaxAndFundSettings, undefined);
  const [steps, setSteps] = useState(settings.pfVesting);
  return (
    <Form state={state} action={action} className="space-y-5 text-sm">
      <Errors state={state} />
      <Saved state={state}>{t('saved')}</Saved>
      <fieldset className="space-y-3">
        <legend className="mb-2 font-semibold text-slate-900">{t('taxTitle')}</legend>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="autoTax" defaultChecked={settings.autoTax} />
          {t('autoTax')}
        </label>
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="mb-2 font-semibold text-slate-900">{t('pfTitle')}</legend>
        {settings.pfRequired.required && !settings.pfEnabled && (
          <Banner tone="amber">
            {t('pfRequired', {
              count: settings.pfRequired.permanentWorkers,
              threshold: settings.pfRequired.threshold ?? 0,
            })}
          </Banner>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" name="pfEnabled" defaultChecked={settings.pfEnabled} />
          {t('pfEnabled')}
        </label>
        <div className="grid max-w-md gap-3 sm:grid-cols-2">
          <Field label={t('pfEmployeeRate')} error={issueFor(state, 'pfEmployeeRate')}>
            <input
              name="pfEmployeeRate"
              defaultValue={Number(settings.pfEmployeeRate)}
              inputMode="decimal"
              className={inputClass}
            />
          </Field>
          <Field label={t('pfEmployerRate')} error={issueFor(state, 'pfEmployerRate')}>
            <input
              name="pfEmployerRate"
              defaultValue={Number(settings.pfEmployerRate)}
              inputMode="decimal"
              className={inputClass}
            />
          </Field>
        </div>
        <p className="text-xs text-slate-500">{t('pfRatesHint')}</p>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="pfRecognised" defaultChecked={settings.pfRecognised} />
          {t('pfRecognised')}
        </label>
        <div>
          <p className="mb-1 font-medium text-slate-800">{t('vesting')}</p>
          <p className="mb-2 text-xs text-slate-500">{t('vestingHint')}</p>
          <div className="space-y-2">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  name={`vesting.${i}.afterYears`}
                  defaultValue={step.afterYears}
                  inputMode="numeric"
                  aria-label={t('afterYears')}
                  className={`${inputClass} w-20`}
                />
                <span className="text-slate-500">{t('yearsKeep')}</span>
                <input
                  name={`vesting.${i}.percent`}
                  defaultValue={step.percent}
                  inputMode="numeric"
                  aria-label={t('percentKept')}
                  className={`${inputClass} w-20`}
                />
                <span className="text-slate-500">%</span>
              </div>
            ))}
            <button
              type="button"
              className={buttonClass.ghost}
              onClick={() =>
                setSteps([
                  ...steps,
                  { afterYears: (steps.at(-1)?.afterYears ?? 0) + 1, percent: 100 },
                ])
              }
            >
              {t('addStep')}
            </button>
          </div>
          {issueFor(state, 'pfVesting') && (
            <p className="mt-1 text-xs text-red-600">{issueFor(state, 'pfVesting')}</p>
          )}
        </div>
      </fieldset>
      <SubmitButton>{t('saveTaxFund')}</SubmitButton>
    </Form>
  );
}

// ── Loans ────────────────────────────────────────────────────────────────────

export function LoanForm({ month }: { month: string }) {
  const t = useTranslations('payroll.loans');
  const [state, action] = useActionState(createLoan, undefined);
  return (
    <Form state={state} action={action} className="space-y-4">
      <Errors state={state} />
      {state?.result && (
        <Banner tone="green">
          {state.result.status === 'pending' ? t('sentForApproval') : t('approvedNow')}
        </Banner>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('employeeCode')} error={issueFor(state, 'employeeCode')}>
          <input name="employeeCode" required className={inputClass} />
        </Field>
        <Field label={t('kind')}>
          <select name="kind" className={inputClass}>
            {LOAN_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kinds.${k}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('startMonth')} error={issueFor(state, 'startMonth')}>
          <input
            type="month"
            name="startMonth"
            defaultValue={month}
            required
            className={inputClass}
          />
        </Field>
        <Field label={t('principal')} error={issueFor(state, 'principal')}>
          <input name="principal" inputMode="decimal" required className={inputClass} />
        </Field>
        <Field label={t('installment')} error={issueFor(state, 'installment')}>
          <input name="installment" inputMode="decimal" required className={inputClass} />
        </Field>
        <Field label={t('reason')} error={issueFor(state, 'reason')}>
          <input name="reason" required maxLength={300} className={inputClass} />
        </Field>
      </div>
      <SubmitButton>{t('create')}</SubmitButton>
    </Form>
  );
}

export function CancelLoanButton({ id }: { id: string }) {
  const t = useTranslations('payroll.loans');
  return (
    <ActionButton label={t('cancel')} confirm={t('cancelConfirm')} run={() => cancelLoan(id)} />
  );
}

export function RepayForm({ id, today }: { id: string; today: string }) {
  const t = useTranslations('payroll.loans');
  const [state, action] = useActionState<ActionState, FormData>(
    repayLoan.bind(null, id),
    undefined,
  );
  return (
    <Form state={state} action={action} className="flex flex-wrap items-end gap-3">
      <Errors state={state} />
      <Field label={t('repayAmount')} error={issueFor(state, 'amount')}>
        <input name="amount" inputMode="decimal" required className={`${inputClass} w-32`} />
      </Field>
      <Field label={t('repayDate')}>
        <input type="date" name="date" defaultValue={today} required className={inputClass} />
      </Field>
      <Field label={t('note')}>
        <input name="note" maxLength={200} className={inputClass} />
      </Field>
      <SubmitButton variant="secondary">{t('repay')}</SubmitButton>
    </Form>
  );
}

// ── Provident fund ───────────────────────────────────────────────────────────

export function JoinFundForm({ today }: { today: string }) {
  const t = useTranslations('payroll.pf');
  const [state, action] = useActionState(joinFund, undefined);
  const [who, setWho] = useState<'codes' | 'everyone'>('codes');
  return (
    <Form state={state} action={action} className="space-y-4 text-sm">
      <Errors state={state} />
      {state?.result && <Banner tone="green">{t('joined', { count: state.result.joined })}</Banner>}
      <div className="flex flex-wrap gap-4">
        {(['codes', 'everyone'] as const).map((value) => (
          <label key={value} className="flex items-center gap-2">
            <input
              type="radio"
              name="who"
              value={value}
              checked={who === value}
              onChange={() => setWho(value)}
            />
            {t(`who.${value}`)}
          </label>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        {who === 'codes' && (
          <Field label={t('codes')} hint={t('codesHint')} error={issueFor(state, 'codes')}>
            <input name="codes" className={inputClass} />
          </Field>
        )}
        <Field label={t('joinedOn')} error={issueFor(state, 'joinedOn')}>
          <input type="date" name="joinedOn" defaultValue={today} required className={inputClass} />
        </Field>
      </div>
      <SubmitButton>{t('join')}</SubmitButton>
    </Form>
  );
}

export function LeaveFundForm({ employeeId, today }: { employeeId: string; today: string }) {
  const t = useTranslations('payroll.pf');
  const [state, action] = useActionState<ActionState, FormData>(
    leaveFund.bind(null, employeeId),
    undefined,
  );
  return (
    <Form
      state={state}
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(t('leaveConfirm'))) e.preventDefault();
      }}
      className="flex flex-wrap items-end gap-3"
    >
      <Errors state={state} />
      <Field label={t('leftOn')}>
        <input type="date" name="leftOn" defaultValue={today} required className={inputClass} />
      </Field>
      <SubmitButton variant="secondary">{t('leave')}</SubmitButton>
    </Form>
  );
}

export function FundEntryForm({ employeeId, today }: { employeeId: string; today: string }) {
  const t = useTranslations('payroll.pf');
  const [state, action] = useActionState<ActionState, FormData>(
    addFundEntry.bind(null, employeeId),
    undefined,
  );
  return (
    <Form state={state} action={action} className="grid gap-3 sm:grid-cols-5 sm:items-end">
      <div className="sm:col-span-5">
        <Errors state={state} />
        <Saved state={state}>{t('entrySaved')}</Saved>
      </div>
      <Field label={t('entryKind')}>
        <select name="kind" className={inputClass}>
          <option value="opening">{t('kinds.opening')}</option>
          <option value="withdrawal">{t('kinds.withdrawal')}</option>
        </select>
      </Field>
      <Field label={t('account')}>
        <select name="account" className={inputClass}>
          <option value="own">{t('accounts.own')}</option>
          <option value="employer">{t('accounts.employer')}</option>
        </select>
      </Field>
      <Field label={t('amount')} error={issueFor(state, 'amount')}>
        <input name="amount" inputMode="decimal" required className={inputClass} />
      </Field>
      <Field label={t('date')}>
        <input type="date" name="date" defaultValue={today} required className={inputClass} />
      </Field>
      <SubmitButton variant="secondary">{t('addEntry')}</SubmitButton>
    </Form>
  );
}

export function InterestForm({ today }: { today: string }) {
  const t = useTranslations('payroll.pf');
  const [state, action] = useActionState(postInterest, undefined);
  return (
    <Form
      state={state}
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(t('interestConfirm'))) e.preventDefault();
      }}
      className="space-y-3 text-sm"
    >
      <Errors state={state} />
      {state?.result && (
        <Banner tone="green">{t('interestPosted', { count: state.result.members })}</Banner>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('interestDate')}>
          <input type="date" name="date" defaultValue={today} required className={inputClass} />
        </Field>
        <Field label={t('interestRate')} error={issueFor(state, 'percent')}>
          <input name="percent" inputMode="decimal" required className={inputClass} />
        </Field>
        <Field label={t('note')}>
          <input name="note" maxLength={200} className={inputClass} />
        </Field>
      </div>
      <SubmitButton variant="secondary">{t('postInterest')}</SubmitButton>
    </Form>
  );
}

// ── Salary tax ───────────────────────────────────────────────────────────────

export function TaxProfileForm({
  employeeId,
  profile,
}: {
  employeeId: string;
  profile: TaxProfileView;
}) {
  const t = useTranslations('payroll.tax');
  const [state, action] = useActionState<ActionState, FormData>(
    saveTaxProfile.bind(null, employeeId),
    undefined,
  );
  return (
    <Form state={state} action={action} className="space-y-3 text-sm">
      <Errors state={state} />
      <Saved state={state}>{t('saved')}</Saved>
      {(['disabled', 'freedomFighter'] as const).map((key) => (
        <label key={key} className="flex items-center gap-2">
          <input type="checkbox" name={key} defaultChecked={profile[key]} />
          {t(`profile.${key}`)}
        </label>
      ))}
      <Field
        label={t('profile.disabledDependants')}
        hint={t('profile.disabledDependantsHint')}
        error={issueFor(state, 'disabledDependants')}
      >
        <input
          name="disabledDependants"
          defaultValue={profile.disabledDependants}
          inputMode="numeric"
          className={`${inputClass} w-24`}
        />
      </Field>
      <SubmitButton variant="secondary">{t('saveProfile')}</SubmitButton>
    </Form>
  );
}

export function TaxOpeningForm({
  employeeId,
  fiscalYear,
}: {
  employeeId: string;
  fiscalYear: string;
}) {
  const t = useTranslations('payroll.tax');
  const [state, action] = useActionState<ActionState, FormData>(
    saveTaxOpening.bind(null, employeeId),
    undefined,
  );
  return (
    <Form state={state} action={action} className="space-y-3 text-sm">
      <Errors state={state} />
      <Saved state={state}>{t('saved')}</Saved>
      <input type="hidden" name="fiscalYear" value={fiscalYear} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('opening.salary')} error={issueFor(state, 'salary')}>
          <input name="salary" inputMode="decimal" required className={inputClass} />
        </Field>
        <Field label={t('opening.tax')} error={issueFor(state, 'tax')}>
          <input name="tax" inputMode="decimal" required className={inputClass} />
        </Field>
        <Field label={t('opening.pf')} error={issueFor(state, 'pf')}>
          <input name="pf" inputMode="decimal" className={inputClass} />
        </Field>
      </div>
      <SubmitButton variant="secondary">{t('opening.save')}</SubmitButton>
    </Form>
  );
}

/** Investments for the rebate, as rows; kept as a draft or sent to payroll. */
export function DeclarationForm({
  employeeId,
  fiscalYear,
  items,
  locked,
}: {
  employeeId: string | null;
  fiscalYear: string;
  items: DeclarationItemView[];
  locked: boolean;
}) {
  const t = useTranslations('payroll.tax');
  const [state, action] = useActionState(
    saveDeclaration.bind(null, employeeId, fiscalYear),
    undefined,
  );
  const [count, setCount] = useState(Math.max(1, items.length));
  if (locked) return <p className="text-sm text-slate-600">{t('declaration.verifiedLocked')}</p>;
  return (
    <Form state={state} action={action} className="space-y-3 text-sm">
      <Errors state={state} />
      {state?.result && (
        <Banner tone="green">
          {state.result.status === 'submitted'
            ? t('declaration.submitted')
            : t('declaration.draftSaved')}
        </Banner>
      )}
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[1.4fr_1fr_1.6fr]">
          <select
            name={`items.${i}.kind`}
            defaultValue={items[i]?.kind ?? ''}
            aria-label={t('declaration.kind')}
            className={inputClass}
          >
            <option value="">{t('declaration.choose')}</option>
            {INVESTMENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`kinds.${k}`)}
              </option>
            ))}
          </select>
          <input
            name={`items.${i}.declared`}
            defaultValue={items[i] ? Number(items[i]!.declared) : ''}
            inputMode="decimal"
            placeholder={t('declaration.amount')}
            aria-label={t('declaration.amount')}
            className={inputClass}
          />
          <input
            name={`items.${i}.note`}
            defaultValue={items[i]?.note ?? ''}
            placeholder={t('declaration.note')}
            aria-label={t('declaration.note')}
            className={inputClass}
          />
        </div>
      ))}
      <button type="button" className={buttonClass.ghost} onClick={() => setCount(count + 1)}>
        {t('declaration.addRow')}
      </button>
      <p className="text-xs text-slate-500">{t('declaration.hint')}</p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" name="intent" value="submit" className={buttonClass.primary}>
          {t('declaration.submit')}
        </button>
        <button type="submit" name="intent" value="draft" className={buttonClass.secondary}>
          {t('declaration.saveDraft')}
        </button>
      </div>
    </Form>
  );
}

export function VerifyDeclarationForm({
  employeeId,
  fiscalYear,
  items,
}: {
  employeeId: string;
  fiscalYear: string;
  items: DeclarationItemView[];
}) {
  const t = useTranslations('payroll.tax');
  const format = useFormatter();
  const [state, action] = useActionState<ActionState, FormData>(
    verifyDeclaration.bind(null, employeeId, fiscalYear),
    undefined,
  );
  return (
    <Form state={state} action={action} className="space-y-2 text-sm">
      <Errors state={state} />
      <Saved state={state}>{t('declaration.verifiedNow')}</Saved>
      {items.map((item, i) => (
        <div key={i} className="grid max-w-md grid-cols-[minmax(0,1fr)_8rem] items-center gap-3">
          <span className="text-slate-700">
            {t(`kinds.${item.kind}`)}: {taka(format, item.declared)}
          </span>
          <input
            name={`verified.${i}.amount`}
            defaultValue={Number(item.verified ?? item.declared)}
            inputMode="decimal"
            aria-label={t('declaration.accepted')}
            className={inputClass}
          />
        </div>
      ))}
      <SubmitButton variant="secondary">{t('declaration.verify')}</SubmitButton>
    </Form>
  );
}

export function TaxDepositForm({
  runId,
  amount,
  today,
}: {
  runId: string;
  amount: string;
  today: string;
}) {
  const t = useTranslations('payroll.tax');
  const [state, action] = useActionState<ActionState, FormData>(
    setTaxDeposit.bind(null, runId),
    undefined,
  );
  return (
    <Form state={state} action={action} className="grid gap-3 sm:grid-cols-4 sm:items-end">
      <div className="sm:col-span-4">
        <Errors state={state} />
        <Saved state={state}>{t('saved')}</Saved>
      </div>
      <Field label={t('deposit.challanNo')} error={issueFor(state, 'challanNo')}>
        <input name="challanNo" required className={inputClass} />
      </Field>
      <Field label={t('deposit.depositedOn')}>
        <input
          type="date"
          name="depositedOn"
          defaultValue={today}
          required
          className={inputClass}
        />
      </Field>
      <Field label={t('deposit.amount')} error={issueFor(state, 'amount')}>
        <input
          name="amount"
          defaultValue={Number(amount)}
          inputMode="decimal"
          required
          className={inputClass}
        />
      </Field>
      <SubmitButton variant="secondary">{t('deposit.save')}</SubmitButton>
    </Form>
  );
}

// ── Increments ───────────────────────────────────────────────────────────────

export function IncrementForm({
  groups,
  structures,
  defaultDate,
}: {
  groups: PayGroupView[];
  structures: SalaryStructureView[];
  defaultDate: string;
}) {
  const t = useTranslations('payroll.increments');
  const format = useFormatter();
  const form = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState(createIncrement, undefined);
  const [preview, setPreview] = useState<PayBatchPreview | { error: string } | null>(null);
  const [pending, start] = useTransition();
  if (state?.result) {
    return (
      <Banner tone="green">
        {state.result.status === 'pending' ? t('sentForApproval') : t('approvedNow')}
      </Banner>
    );
  }
  return (
    <Form
      ref={form}
      state={state}
      action={action}
      onChange={() => setPreview(null)}
      className="space-y-4 text-sm"
    >
      <Errors state={state} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('effectiveFrom')}>
          <input
            type="date"
            name="effectiveFrom"
            defaultValue={defaultDate}
            required
            className={inputClass}
          />
        </Field>
        <Field label={t('percent')} error={issueFor(state, 'percent')}>
          <input
            name="percent"
            defaultValue="5"
            inputMode="decimal"
            required
            className={inputClass}
          />
        </Field>
        <Field label={t('basis')}>
          <select name="basis" className={inputClass}>
            {INCREMENT_BASES.map((b) => (
              <option key={b} value={b}>
                {t(`bases.${b}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('group')}>
          <select name="payGroupId" className={inputClass}>
            <option value="">{t('allGroups')}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('structure')}>
          <select name="structureId" className={inputClass}>
            <option value="">{t('allStructures')}</option>
            {structures.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('minService')} hint={t('minServiceHint')}>
          <input
            name="minServiceMonths"
            defaultValue="12"
            inputMode="numeric"
            className={inputClass}
          />
        </Field>
      </div>
      <Field label={t('reason')}>
        <input name="reason" defaultValue={t('defaultReason')} required className={inputClass} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          className={buttonClass.secondary}
          onClick={() =>
            form.current &&
            start(async () => setPreview(await previewIncrement(new FormData(form.current!))))
          }
        >
          {t('preview')}
        </button>
        {preview && !('error' in preview) && preview.lines.length > 0 && (
          <SubmitButton>{t('create')}</SubmitButton>
        )}
      </div>
      {preview && 'error' in preview && <Banner tone="red">{preview.error}</Banner>}
      {preview && !('error' in preview) && (
        <div className="space-y-2">
          <p className="text-slate-700">
            {t('previewTotals', {
              before: taka(format, preview.grossBefore),
              after: taka(format, preview.grossAfter),
            })}
          </p>
          <table className="w-full text-sm">
            <thead className="text-start text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-1 font-medium">{t('person')}</th>
                <th className="py-1 text-end font-medium">{t('basicBefore')}</th>
                <th className="py-1 text-end font-medium">{t('basicAfter')}</th>
                <th className="py-1 text-end font-medium">{t('grossAfter')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {preview.lines.map((l) => (
                <tr key={l.employee.id}>
                  <td className="py-1">
                    {l.employee.fullName}{' '}
                    <span className="font-mono text-xs text-slate-400">
                      {l.employee.employeeCode}
                    </span>
                  </td>
                  <td className="py-1 text-end tabular-nums text-slate-500">
                    {taka(format, l.basicBefore)}
                  </td>
                  <td className="py-1 text-end tabular-nums">{taka(format, l.basicAfter)}</td>
                  <td className="py-1 text-end tabular-nums">{taka(format, l.grossAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.skipped.length > 0 && (
            <p className="text-xs text-slate-500">
              {t('skipped', { count: preview.skipped.length })}{' '}
              {preview.skipped
                .slice(0, 10)
                .map((s) => `${s.employee.employeeCode} (${t(`skipReasons.${s.reason}`)})`)
                .join(', ')}
            </p>
          )}
        </div>
      )}
    </Form>
  );
}

export function CancelIncrementButton({ id }: { id: string }) {
  const t = useTranslations('payroll.increments');
  return (
    <ActionButton
      label={t('cancel')}
      confirm={t('cancelConfirm')}
      run={() => cancelIncrement(id)}
    />
  );
}

// ── Bonus runs ───────────────────────────────────────────────────────────────

export function BonusRunForm({
  groups,
  defaultDate,
}: {
  groups: PayGroupView[];
  defaultDate: string;
}) {
  const t = useTranslations('payroll.bonus');
  const th = useTranslations('hr.religions');
  const [state, action] = useActionState(createBonusRun, undefined);
  return (
    <Form state={state} action={action} className="space-y-4 text-sm">
      <Errors state={state} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('festival')} error={issueFor(state, 'festival')}>
          <input
            name="festival"
            required
            placeholder={t('festivalExample')}
            className={inputClass}
          />
        </Field>
        <Field label={t('festivalBn')}>
          <input name="festivalBn" className={inputClass} />
        </Field>
        <Field label={t('group')}>
          <select
            name="payGroupId"
            className={inputClass}
            defaultValue={groups.find((g) => g.isDefault)?.id}
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('cutOff')} hint={t('cutOffHint')} error={issueFor(state, 'cutOff')}>
          <input
            type="date"
            name="cutOff"
            defaultValue={defaultDate}
            required
            className={inputClass}
          />
        </Field>
        <Field label={t('percent')} hint={t('percentHint')}>
          <input
            name="percentOfBasic"
            defaultValue="100"
            inputMode="numeric"
            className={inputClass}
          />
        </Field>
        <Field label={t('minService')}>
          <input
            name="minServiceMonths"
            defaultValue="12"
            inputMode="numeric"
            className={inputClass}
          />
        </Field>
      </div>
      <fieldset>
        <legend className="mb-1 font-medium text-slate-800">{t('religions')}</legend>
        <div className="flex flex-wrap gap-4">
          {RELIGIONS.map((r) => (
            <label key={r} className="flex items-center gap-2">
              <input type="checkbox" name="religions" value={r} defaultChecked={r === 'islam'} />
              {th(r)}
            </label>
          ))}
          <label className="flex items-center gap-2">
            <input type="checkbox" name="unrecorded" />
            {t('unrecorded')}
          </label>
        </div>
        {issueFor(state, 'religions') && (
          <p className="mt-1 text-xs text-red-600">{issueFor(state, 'religions')}</p>
        )}
      </fieldset>
      <SubmitButton>{t('create')}</SubmitButton>
    </Form>
  );
}

// ── Payments ─────────────────────────────────────────────────────────────────

export function MarkPaidForm({ runId, today }: { runId: string; today: string }) {
  const t = useTranslations('payroll.payments');
  const [state, action] = useActionState<ActionState, FormData>(
    markRunPaid.bind(null, runId),
    undefined,
  );
  return (
    <Form state={state} action={action} className="flex flex-wrap items-end gap-3">
      <Errors state={state} />
      <Field label={t('paidOn')}>
        <input type="date" name="paidOn" defaultValue={today} required className={inputClass} />
      </Field>
      <SubmitButton variant="secondary">{t('markPaid')}</SubmitButton>
    </Form>
  );
}

const GL_KEYS = [
  'salaryExpense',
  'netPayable',
  'taxPayable',
  'pfPayable',
  'loansReceivable',
  'gratuityExpense',
  'gratuityProvision',
  'wppfPayable',
] as const;

/** The journal's accounts and whether gratuity is provided for. */
export function AccountsForm({ settings }: { settings: PayrollSettingsView }) {
  const t = useTranslations('payroll.settings');
  const [state, action] = useActionState(saveAccounts, undefined);
  return (
    <Form state={state} action={action} className="space-y-4 text-sm">
      <Errors state={state} />
      <Saved state={state}>{t('saved')}</Saved>
      <p className="text-slate-600">{t('accountsHint')}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {GL_KEYS.map((key) => (
          <Field key={key} label={t(`gl.${key}`)} error={issueFor(state, `glAccounts.${key}`)}>
            <input
              name={`gl.${key}`}
              defaultValue={settings.glAccounts[key]}
              required
              className={inputClass}
            />
          </Field>
        ))}
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" name="gratuityEnabled" defaultChecked={settings.gratuityEnabled} />
        {t('gratuityEnabled')}
      </label>
      <SubmitButton>{t('saveTaxFund')}</SubmitButton>
    </Form>
  );
}

export function OpenSettlementButton({ separationId }: { separationId: string }) {
  const t = useTranslations('payroll.settlements');
  return (
    <ActionButton
      label={t('open')}
      className={buttonClass.secondary}
      run={() => openSettlement(separationId)}
    />
  );
}

// ── Workers' participation fund ──────────────────────────────────────────────

export function WppfYearForm({
  suggested,
}: {
  suggested: { start: string; end: string; year: string };
}) {
  const t = useTranslations('payroll.wppf');
  const [state, action] = useActionState(createWppfYear, undefined);
  return (
    <Form state={state} action={action} className="space-y-3 text-sm">
      <Errors state={state} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('accountingYear')} error={issueFor(state, 'accountingYear')}>
          <input
            name="accountingYear"
            defaultValue={suggested.year}
            required
            className={inputClass}
          />
        </Field>
        <Field label={t('yearStart')}>
          <input
            type="date"
            name="yearStart"
            defaultValue={suggested.start}
            required
            className={inputClass}
          />
        </Field>
        <Field label={t('yearEnd')} error={issueFor(state, 'yearEnd')}>
          <input
            type="date"
            name="yearEnd"
            defaultValue={suggested.end}
            required
            className={inputClass}
          />
        </Field>
        <Field label={t('netProfit')} error={issueFor(state, 'netProfit')}>
          <input name="netProfit" inputMode="decimal" required className={inputClass} />
        </Field>
        <Field label={t('minServiceMonths')} hint={t('minServiceMonthsHint')}>
          <input
            type="number"
            name="minServiceMonths"
            min={0}
            max={12}
            placeholder="6"
            className={inputClass}
          />
        </Field>
      </div>
      <SubmitButton>{t('create')}</SubmitButton>
    </Form>
  );
}

export function WppfRunForm({
  yearId,
  groups,
  today,
}: {
  yearId: string;
  groups: Pick<PayGroupView, 'id' | 'name'>[];
  today: string;
}) {
  const t = useTranslations('payroll.wppf');
  const [state, action] = useActionState(openWppfRun.bind(null, yearId), undefined);
  return (
    <Form state={state} action={action} className="flex flex-wrap items-end gap-3 text-sm">
      <Errors state={state} />
      <Field label={t('payGroup')}>
        <select name="payGroupId" required className={inputClass}>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('paymentDate')} error={issueFor(state, 'paymentDate')}>
        <input
          type="date"
          name="paymentDate"
          defaultValue={today}
          required
          className={inputClass}
        />
      </Field>
      <SubmitButton variant="secondary">{t('openRun')}</SubmitButton>
    </Form>
  );
}
