'use client';

import {
  PAY_BASES,
  PAY_COMPONENT_KINDS,
  PAY_FREQUENCIES,
  TAX_TREATMENTS,
  type PayComponentView,
  type PayGroupView,
  type PayPreview,
  type PayRecordView,
  type SalaryStructureView,
  type StructurePreview,
  type WageBoardView,
} from '@gp/shared';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import {
  cancelPayChange,
  createComponent,
  createPayGroup,
  makeDefaultPayGroup,
  previewPay,
  previewStructure,
  proposePay,
  saveStructure,
  setMakerChecker,
  updateComponent,
} from '@/app/actions/payroll';
import type { ActionState } from '@/app/actions/platform';
import { ErrorText, Form, issueFor, SubmitButton } from '../forms';
import { Banner, buttonClass, Field, inputClass } from '../ui';

const taka = (format: ReturnType<typeof useFormatter>, amount: string) =>
  `৳${format.number(Number(amount), { maximumFractionDigits: 2 })}`;

function Errors({ state }: { state: { error?: string; code?: string } | undefined }) {
  if (!state?.error) return null;
  return (
    <Banner tone="red">
      <ErrorText state={state} />
    </Banner>
  );
}

/** Calls `run` a moment after the inputs stop changing, keeping only the latest answer. */
function useDebounced<T>(run: () => Promise<T> | null, deps: unknown[]): T | null {
  const [value, setValue] = useState<T | null>(null);
  const latest = useRef(0);
  useEffect(() => {
    const id = ++latest.current;
    const timer = setTimeout(async () => {
      const pending = run();
      if (!pending) return setValue(null);
      const result = await pending;
      if (id === latest.current) setValue(result);
    }, 350);
    return () => clearTimeout(timer);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- the caller lists what matters
  }, deps);
  return value;
}

// ── Structures ───────────────────────────────────────────────────────────────

/**
 * A structure's lines with a live preview at a sample amount. A structure people are paid
 * on shows its lines read-only: changing them would change past pay.
 */
export function StructureEditor({
  structure,
  components,
  wageBoards,
  canEdit,
}: {
  structure?: SalaryStructureView;
  components: PayComponentView[];
  wageBoards: WageBoardView[];
  canEdit: boolean;
}) {
  const t = useTranslations('payroll');
  const format = useFormatter();
  const [state, action] = useActionState<ActionState<SalaryStructureView>, FormData>(
    saveStructure.bind(null, structure?.id ?? null),
    undefined,
  );
  const [basis, setBasis] = useState(structure?.basis ?? 'gross');
  const [lines, setLines] = useState(structure?.lines ?? [{ component: 'BASIC', formula: '' }]);
  const [sample, setSample] = useState('25000');
  const locked = !canEdit || (structure?.inUse ?? 0) > 0;
  const preview = useDebounced<StructurePreview | { error: string }>(
    () =>
      lines.every((l) => l.component && l.formula) && /^\d+(\.\d{1,2})?$/.test(sample)
        ? previewStructure(basis, sample, lines)
        : null,
    [basis, sample, JSON.stringify(lines)],
  );
  const usable = components.filter((c) => c.calculation === 'structure' && c.isActive);
  const set = (i: number, patch: Partial<(typeof lines)[number]>) =>
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <Form state={state} action={action} className="space-y-4">
      <Errors state={state} />
      {state?.result && <Banner tone="green">{t('saved')}</Banner>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {!structure && (
          <Field label={t('code')} error={issueFor(state, 'code')}>
            <input name="code" required className={`${inputClass} font-mono uppercase`} />
          </Field>
        )}
        <Field label={t('name')} error={issueFor(state, 'name')}>
          <input
            name="name"
            required
            defaultValue={structure?.name}
            disabled={!canEdit}
            className={inputClass}
          />
        </Field>
        <Field label={t('nameBn')}>
          <input
            name="nameBn"
            defaultValue={structure?.nameBn ?? ''}
            disabled={!canEdit}
            className={inputClass}
          />
        </Field>
        <Field label={t('structures.basis')} hint={t(`structures.basisHint.${basis}`)}>
          <select
            name="basis"
            value={basis}
            disabled={locked}
            onChange={(e) => setBasis(e.target.value as typeof basis)}
            className={inputClass}
          >
            {PAY_BASES.map((b) => (
              <option key={b} value={b}>
                {t(`structures.bases.${b}`)}
              </option>
            ))}
          </select>
          {locked && <input type="hidden" name="basis" value={basis} />}
        </Field>
        <Field label={t('structures.wageBoard')}>
          <select
            name="wageBoard"
            defaultValue={structure?.wageBoard ?? ''}
            disabled={!canEdit}
            className={inputClass}
          >
            <option value="">{t('structures.noWageBoard')}</option>
            {wageBoards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{t('structures.lines')}</p>
        {locked && structure && structure.inUse > 0 && (
          <p className="text-xs text-amber-700">
            {t('structures.inUse', { count: structure.inUse })}
          </p>
        )}
        {lines.map((line, i) => (
          <div key={i} className="flex flex-wrap items-start gap-2">
            <select
              name={`lines.${i}.component`}
              value={line.component}
              disabled={locked}
              onChange={(e) => set(i, { component: e.target.value })}
              aria-label={t('structures.component')}
              className={`${inputClass} max-w-48`}
            >
              {usable.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
            <div className="min-w-60 flex-1">
              <input
                name={`lines.${i}.formula`}
                value={line.formula}
                readOnly={locked}
                onChange={(e) => set(i, { formula: e.target.value })}
                aria-label={t('structures.formula')}
                placeholder="round(GROSS * 0.6)"
                className={`${inputClass} font-mono`}
              />
              {issueFor(state, `lines.${i}.formula`) && (
                <span className="mt-1 block text-xs text-red-600">
                  {issueFor(state, `lines.${i}.formula`)}
                </span>
              )}
            </div>
            <span className="w-28 pt-2 text-right text-sm tabular-nums text-slate-600">
              {preview && 'values' in preview && preview.values[line.component]
                ? taka(format, preview.values[line.component]!)
                : ''}
            </span>
            {!locked && (
              <button
                type="button"
                className={`${buttonClass.ghost} pt-2`}
                onClick={() => setLines(lines.filter((_, j) => j !== i))}
              >
                {t('remove')}
              </button>
            )}
          </div>
        ))}
        {locked &&
          lines.map((l, i) => (
            <span key={i}>
              <input type="hidden" name={`lines.${i}.component`} value={l.component} />
            </span>
          ))}
        {!locked && (
          <button
            type="button"
            className={buttonClass.ghost}
            onClick={() =>
              setLines([...lines, { component: usable[0]?.code ?? 'BASIC', formula: '' }])
            }
          >
            + {t('structures.addLine')}
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-lg bg-slate-50 p-3 text-sm">
        <Field
          label={basis === 'gross' ? t('structures.sampleGross') : t('structures.sampleBasic')}
        >
          <input
            value={sample}
            onChange={(e) => setSample(e.target.value)}
            inputMode="decimal"
            className={`${inputClass} w-36 tabular-nums`}
          />
        </Field>
        {preview && 'gross' in preview && preview.gross && (
          <p className="pb-2 font-medium">
            {t('pay.gross')}: {taka(format, preview.gross)}
          </p>
        )}
        {preview && 'problems' in preview && preview.problems.length > 0 && (
          <ul className="pb-2 text-xs text-red-600">
            {preview.problems.map((p, i) => (
              <li key={i}>
                {p.code && <span className="font-mono">{p.code}: </span>}
                {p.message}
              </li>
            ))}
          </ul>
        )}
        <p className="w-full text-xs text-slate-500">{t('structures.formulaHelp')}</p>
      </div>

      {structure && canEdit && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={structure.isActive} />
          {t('active')}
        </label>
      )}
      {canEdit && <SubmitButton>{structure ? t('save') : t('structures.create')}</SubmitButton>}
    </Form>
  );
}

// ── Components ───────────────────────────────────────────────────────────────

export function ComponentForm() {
  const t = useTranslations('payroll');
  const [state, action] = useActionState<ActionState<PayComponentView>, FormData>(
    createComponent,
    undefined,
  );
  return (
    <Form state={state} action={action} className="space-y-4">
      <Errors state={state} />
      {state?.result && <Banner tone="green">{t('saved')}</Banner>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={t('code')} hint={t('components.codeHint')} error={issueFor(state, 'code')}>
          <input name="code" required className={`${inputClass} font-mono uppercase`} />
        </Field>
        <Field label={t('name')} error={issueFor(state, 'name')}>
          <input name="name" required className={inputClass} />
        </Field>
        <Field label={t('nameBn')}>
          <input name="nameBn" className={inputClass} />
        </Field>
        <Field label={t('components.kind')}>
          <select name="kind" defaultValue="earning" className={inputClass}>
            {PAY_COMPONENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`components.kinds.${k}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('components.calculation')}>
          <select name="calculation" defaultValue="fixed" className={inputClass}>
            {(['structure', 'fixed', 'run'] as const).map((c) => (
              <option key={c} value={c}>
                {t(`components.calculations.${c}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('components.tax')}>
          <select name="taxTreatment" defaultValue="taxable" className={inputClass}>
            {TAX_TREATMENTS.map((x) => (
              <option key={x} value={x}>
                {t(`components.taxTreatments.${x}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="inGross" defaultChecked /> {t('components.inGross')}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="prorate" defaultChecked /> {t('components.prorate')}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="inOvertimeBase" /> {t('components.inOvertimeBase')}
        </label>
      </div>
      <SubmitButton variant="secondary">{t('components.create')}</SubmitButton>
    </Form>
  );
}

export function ComponentEditForm({ component }: { component: PayComponentView }) {
  const t = useTranslations('payroll');
  const [state, action] = useActionState<ActionState, FormData>(
    updateComponent.bind(null, component.id),
    undefined,
  );
  return (
    <Form state={state} action={action} className="mt-2 space-y-3 rounded-lg bg-slate-50 p-3">
      <Errors state={state} />
      {state?.ok && <Banner tone="green">{t('saved')}</Banner>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('name')}>
          <input name="name" required defaultValue={component.name} className={inputClass} />
        </Field>
        <Field label={t('nameBn')}>
          <input name="nameBn" defaultValue={component.nameBn ?? ''} className={inputClass} />
        </Field>
        <Field label={t('components.glAccount')} hint={t('components.glAccountHint')}>
          <input name="glAccount" defaultValue={component.glAccount ?? ''} className={inputClass} />
        </Field>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="inGross" defaultChecked={component.inGross} />{' '}
          {t('components.inGross')}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="prorate" defaultChecked={component.prorate} />{' '}
          {t('components.prorate')}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="inOvertimeBase" defaultChecked={component.inOvertimeBase} />{' '}
          {t('components.inOvertimeBase')}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isActive" defaultChecked={component.isActive} />{' '}
          {t('active')}
        </label>
      </div>
      <SubmitButton variant="secondary">{t('save')}</SubmitButton>
    </Form>
  );
}

// ── Pay groups and settings ──────────────────────────────────────────────────

export function PayGroupForm() {
  const t = useTranslations('payroll');
  const [state, action] = useActionState<ActionState<PayGroupView>, FormData>(
    createPayGroup,
    undefined,
  );
  return (
    <Form state={state} action={action} className="space-y-3">
      <Errors state={state} />
      <div className="grid items-end gap-3 sm:grid-cols-4">
        <Field label={t('code')} error={issueFor(state, 'code')}>
          <input name="code" required className={`${inputClass} font-mono uppercase`} />
        </Field>
        <Field label={t('name')}>
          <input name="name" required className={inputClass} />
        </Field>
        <Field label={t('groups.frequency')}>
          <select name="frequency" defaultValue="monthly" className={inputClass}>
            {PAY_FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {t(`groups.frequencies.${f}`)}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="isDefault" /> {t('groups.makeDefault')}
        </label>
      </div>
      <SubmitButton variant="secondary">{t('groups.create')}</SubmitButton>
    </Form>
  );
}

export function MakeDefaultButton({ id }: { id: string }) {
  const t = useTranslations('payroll');
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={buttonClass.ghost}
      onClick={() => start(() => makeDefaultPayGroup(id))}
    >
      {t('groups.makeDefault')}
    </button>
  );
}

export function MakerCheckerSwitch({ on, approvers }: { on: boolean; approvers: number }) {
  const t = useTranslations('payroll');
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionState>();
  return (
    <div className="space-y-3 text-sm">
      <p className="text-slate-600">{t('settings.makerCheckerHint')}</p>
      {on && approvers < 2 && (
        <Banner tone="amber">{t('settings.fewApprovers', { count: approvers })}</Banner>
      )}
      {result?.error && (
        <Banner tone="red">
          <ErrorText state={result} />
        </Banner>
      )}
      <button
        type="button"
        disabled={pending}
        className={buttonClass.secondary}
        onClick={() => {
          if (on && !window.confirm(t('settings.offConfirm'))) return;
          start(async () => setResult(await setMakerChecker(!on)));
        }}
      >
        {on ? t('settings.turnOff') : t('settings.turnOn')}
      </button>
    </div>
  );
}

// ── An employee's pay ────────────────────────────────────────────────────────

/** Proposes a pay change, showing the breakdown and the minimum-wage check as it is filled. */
export function PayChangeForm({
  employeeId,
  current,
  structures,
  payGroups,
  wageBoards,
  fixedComponents,
  today,
}: {
  employeeId: string;
  current: PayRecordView | null;
  structures: SalaryStructureView[];
  payGroups: PayGroupView[];
  wageBoards: WageBoardView[];
  fixedComponents: PayComponentView[];
  today: string;
}) {
  const t = useTranslations('payroll');
  const format = useFormatter();
  const locale = useLocale();
  const form = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState<ActionState<PayRecordView>, FormData>(
    proposePay.bind(null, employeeId),
    undefined,
  );
  const active = structures.filter((s) => s.isActive);
  const [structureId, setStructureId] = useState(current?.structure.id ?? active[0]?.id ?? '');
  const [revision, setRevision] = useState(0);
  const structure = structures.find((s) => s.id === structureId);
  const board = wageBoards.find((b) => b.id === structure?.wageBoard);
  const preview = useDebounced<PayPreview | { error: string }>(
    () => (form.current ? previewPay(employeeId, new FormData(form.current)) : null),
    [structureId, revision],
  );
  const defaultGroup = current?.payGroup.id ?? payGroups.find((g) => g.isDefault)?.id;

  if (state?.result) {
    return (
      <Banner tone="green">
        {state.result.status === 'pending' ? t('pay.sentForApproval') : t('pay.approvedNow')}
      </Banner>
    );
  }
  return (
    <Form
      ref={form}
      state={state}
      action={action}
      onChange={() => setRevision((r) => r + 1)}
      className="space-y-4"
    >
      <Errors state={state} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={t('pay.effectiveFrom')} error={issueFor(state, 'effectiveFrom')}>
          <input
            name="effectiveFrom"
            type="date"
            required
            defaultValue={today}
            className={inputClass}
          />
        </Field>
        <Field label={t('pay.structure')}>
          <select
            name="structureId"
            value={structureId}
            onChange={(e) => setStructureId(e.target.value)}
            className={inputClass}
          >
            {active.map((s) => (
              <option key={s.id} value={s.id}>
                {locale === 'bn' && s.nameBn ? s.nameBn : s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('pay.payGroup')}>
          <select name="payGroupId" defaultValue={defaultGroup} className={inputClass}>
            {payGroups
              .filter((g) => g.isActive)
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
          </select>
        </Field>
        <Field
          label={structure?.basis === 'basic' ? t('pay.basicAmount') : t('pay.grossAmount')}
          error={issueFor(state, 'amount')}
        >
          <input
            name="amount"
            required
            inputMode="decimal"
            defaultValue={
              current?.structure.id === structureId ? current.amount.replace(/\.00$/, '') : ''
            }
            className={`${inputClass} tabular-nums`}
          />
        </Field>
        {board && (
          <Field label={t('pay.wageGrade')} hint={board.name}>
            <select name="wageGrade" defaultValue={current?.wageGrade ?? ''} className={inputClass}>
              <option value="">{t('choose')}</option>
              {board.grades.map((g) => (
                <option key={g.grade} value={g.grade}>
                  {g.name} · {t('pay.atLeast', { gross: taka(format, g.gross) })}
                </option>
              ))}
            </select>
          </Field>
        )}
        {fixedComponents.map((c) => (
          <Field
            key={c.code}
            label={locale === 'bn' && c.nameBn ? c.nameBn : c.name}
            error={issueFor(state, `fixed.${c.code}`)}
          >
            <input
              name={`fixed.${c.code}`}
              inputMode="decimal"
              defaultValue={current?.fixed[c.code]?.replace(/\.00$/, '') ?? ''}
              placeholder="0"
              className={`${inputClass} tabular-nums`}
            />
          </Field>
        ))}
      </div>
      <Field label={t('pay.reason')} error={issueFor(state, 'reason')}>
        <input name="reason" required minLength={3} className={inputClass} />
      </Field>

      {preview && 'lines' in preview && (
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          {preview.problems.length > 0 ? (
            <ul className="text-xs text-red-600">
              {preview.problems.map((p, i) => (
                <li key={i}>{p.message}</li>
              ))}
            </ul>
          ) : (
            <>
              <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {preview.lines.map((l) => (
                  <li key={l.code} className="flex justify-between gap-3">
                    <span className="text-slate-600">
                      {locale === 'bn' && l.nameBn ? l.nameBn : l.name}
                    </span>
                    <span className="tabular-nums">{taka(format, l.amount)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 flex flex-wrap items-center justify-between gap-2 font-medium">
                <span>
                  {t('pay.gross')}: {taka(format, preview.gross)}
                </span>
                {preview.minimumWage && (
                  <span className={preview.minimumWage.meets ? 'text-green-700' : 'text-red-700'}>
                    {preview.minimumWage.meets
                      ? t('pay.meetsMinimum', { grade: preview.minimumWage.grade })
                      : t('pay.belowMinimum', {
                          grade: preview.minimumWage.grade,
                          gross: taka(format, preview.minimumWage.minimumGross),
                        })}
                  </span>
                )}
              </p>
            </>
          )}
        </div>
      )}
      <SubmitButton>{t('pay.propose')}</SubmitButton>
    </Form>
  );
}

export function CancelPayChangeButton({ id }: { id: string }) {
  const t = useTranslations('payroll');
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={buttonClass.ghost}
      onClick={() => {
        if (window.confirm(t('pay.cancelConfirm'))) start(() => cancelPayChange(id));
      }}
    >
      {t('pay.cancel')}
    </button>
  );
}
