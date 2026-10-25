'use client';

import {
  PLAN_CODES,
  VAT_SERVICE_CODES,
  type BillingOverview,
  type BillingSettingsView,
  type OnlineMethod,
  type PartnerView,
  type StatementMatchView,
} from '@gp/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import {
  addCoupon,
  addPartner,
  addPrice,
  assignPartner,
  cancelPlan,
  choosePlan,
  issueCreditNote,
  issueInvoices,
  payInvoice,
  recordDeduction,
  recordPayment,
  reviewDeduction,
  saveBillingSettings,
  uploadStatement,
} from '@/app/actions/billing';
import type { ActionState } from '@/app/actions/platform';
import { ErrorText, Form, issueFor, SubmitButton } from './forms';
import { Banner, buttonClass, Field, inputClass } from './ui';

type Formatter = ReturnType<typeof useFormatter>;
/** Taka in the reader's digits, with paisa when there are any. */
const taka = (format: Formatter, amount: string | number) =>
  `৳${format.number(Number(amount), { maximumFractionDigits: 2 })}`;

function Errors({ state }: { state: ActionState<unknown> }) {
  if (!state?.error || state.issues?.length) return null;
  return (
    <Banner tone="red">
      <ErrorText state={state} />
    </Banner>
  );
}

function Saved({ state, children }: { state: ActionState<unknown>; children: React.ReactNode }) {
  return state?.ok ? <Banner tone="green">{children}</Banner> : null;
}

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());

// ── The workspace ────────────────────────────────────────────────────────────

/** Plans with their seat prices and what this month's people would cost, and who is billed. */
export function ChoosePlanForm({ overview }: { overview: BillingOverview }) {
  const t = useTranslations('billing');
  const tp = useTranslations('pricing.plans');
  const format = useFormatter();
  const [state, action] = useActionState(choosePlan, undefined);
  const paid = overview.billingMode === 'paid';
  // The page re-renders as paid once a plan is chosen; the message is for what was done.
  const [wasPaid] = useState(paid);
  const [chosen, setChosen] = useState(
    paid && overview.quotes.some((q) => q.planCode === overview.planCode)
      ? overview.planCode
      : 'business',
  );
  return (
    <Form state={state} action={action} className="space-y-4">
      <Errors state={state} />
      <Saved state={state}>{wasPaid ? t('planChanged') : t('planChosen')}</Saved>
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="sr-only">{t('plan')}</legend>
        {overview.quotes.map((q) => (
          <label
            key={q.planCode}
            className={`flex cursor-pointer flex-col rounded-xl p-4 text-sm ring-1 ${
              chosen === q.planCode ? 'bg-brand-50 ring-2 ring-brand-600' : 'ring-slate-200'
            } ${q.price ? '' : 'cursor-not-allowed opacity-60'}`}
          >
            <span className="flex items-center gap-2 font-semibold">
              <input
                type="radio"
                name="planCode"
                value={q.planCode}
                checked={chosen === q.planCode}
                disabled={!q.price}
                onChange={() => setChosen(q.planCode)}
              />
              {tp(q.planCode)}
            </span>
            {q.price ? (
              <>
                <span className="mt-2 text-slate-700">
                  {t('staffSeat', { price: taka(format, q.price.staffSeat) })}
                </span>
                <span className="text-slate-700">
                  {t('workerSeat', { price: taka(format, q.price.workerSeat) })}
                </span>
                {Number(q.price.minimum) > 0 && (
                  <span className="text-xs text-slate-500">
                    {t('minimum', { price: taka(format, q.price.minimum) })}
                  </span>
                )}
                {q.estimate && (
                  <span className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-600">
                    {t('estimate', { amount: taka(format, q.estimate) })}
                  </span>
                )}
              </>
            ) : (
              <span className="mt-2 text-slate-500">{t('noPrice')}</span>
            )}
          </label>
        ))}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('buyerName')} error={issueFor(state, 'buyerName')}>
          <input
            name="buyerName"
            required
            defaultValue={overview.buyer?.name ?? ''}
            className={inputClass}
          />
        </Field>
        <Field label={t('buyerBin')} hint={t('buyerBinHint')} error={issueFor(state, 'buyerBin')}>
          <input name="buyerBin" defaultValue={overview.buyer?.bin ?? ''} className={inputClass} />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t('buyerAddress')} error={issueFor(state, 'buyerAddress')}>
            <textarea
              name="buyerAddress"
              required
              rows={2}
              defaultValue={overview.buyer?.address ?? ''}
              className={inputClass}
            />
          </Field>
        </div>
        {!overview.coupon && (
          <Field label={t('coupon')} hint={t('couponHint')} error={issueFor(state, 'couponCode')}>
            <input name="couponCode" autoComplete="off" className={`${inputClass} uppercase`} />
          </Field>
        )}
      </div>
      <p className="text-xs text-slate-500">{t('arrearsNote')}</p>
      <SubmitButton>{paid ? t('changePlan') : t('choose')}</SubmitButton>
    </Form>
  );
}

export function CancelPlanButton() {
  const t = useTranslations('billing');
  const [state, action] = useActionState(cancelPlan, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(t('cancelConfirm'))) e.preventDefault();
      }}
    >
      <Errors state={state} />
      <button className={buttonClass.ghost}>{t('cancel')}</button>
    </form>
  );
}

function PayButton({ invoiceId, method }: { invoiceId: string; method: OnlineMethod }) {
  const t = useTranslations('billing.methods');
  const [state, action] = useActionState(payInvoice.bind(null, invoiceId, method), undefined);
  return (
    <form action={action}>
      <SubmitButton variant={method === 'fake' ? 'secondary' : 'primary'}>{t(method)}</SubmitButton>
      {state?.error && (
        <p className="mt-1 text-xs text-red-600">
          <ErrorText state={state} />
        </p>
      )}
    </form>
  );
}

export function PayButtons({
  invoiceId,
  gateways,
}: {
  invoiceId: string;
  gateways: OnlineMethod[];
}) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      {gateways.map((m) => (
        <PayButton key={m} invoiceId={invoiceId} method={m} />
      ))}
    </div>
  );
}

/** VAT (VDS, Mushak-6.6) or income tax (TDS) the company withheld from this invoice. */
export function DeductionForm({
  invoiceId,
  limits,
}: {
  invoiceId: string;
  limits: { vds: string; tds: string };
}) {
  const t = useTranslations('billing.deduction');
  const format = useFormatter();
  const [state, action] = useActionState(recordDeduction.bind(null, invoiceId), undefined);
  return (
    <Form state={state} action={action} className="space-y-3 text-sm">
      <Errors state={state} />
      <Saved state={state}>{t('saved')}</Saved>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label={t('kind')}>
          <select name="kind" className={inputClass} defaultValue="vds">
            <option value="vds">{t('vds')}</option>
            <option value="tds">{t('tds')}</option>
          </select>
        </Field>
        <Field
          label={t('amount')}
          hint={t('limits', { vds: taka(format, limits.vds), tds: taka(format, limits.tds) })}
          error={issueFor(state, 'amount')}
        >
          <input name="amount" required inputMode="decimal" className={inputClass} />
        </Field>
        <Field label={t('certificateNo')} error={issueFor(state, 'certificateNo')}>
          <input name="certificateNo" required className={inputClass} />
        </Field>
        <Field label={t('certificateDate')}>
          <input
            name="certificateDate"
            type="date"
            required
            defaultValue={today()}
            className={inputClass}
          />
        </Field>
      </div>
      <SubmitButton variant="secondary">{t('record')}</SubmitButton>
    </Form>
  );
}

// ── The platform console ─────────────────────────────────────────────────────

export function BillingSettingsForm({ settings }: { settings: BillingSettingsView | null }) {
  const t = useTranslations('platform.billing.settings');
  const [state, action] = useActionState(saveBillingSettings, undefined);
  return (
    <Form state={state} action={action} className="space-y-4 text-sm">
      <Errors state={state} />
      <Saved state={state}>{t('saved')}</Saved>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('supplierName')} error={issueFor(state, 'supplierName')}>
          <input
            name="supplierName"
            required
            defaultValue={settings?.supplierName}
            className={inputClass}
          />
        </Field>
        <Field label={t('bin')} error={issueFor(state, 'bin')}>
          <input name="bin" required defaultValue={settings?.bin} className={inputClass} />
        </Field>
        <Field label={t('supplierAddress')} error={issueFor(state, 'supplierAddress')}>
          <input
            name="supplierAddress"
            required
            defaultValue={settings?.supplierAddress}
            className={inputClass}
          />
        </Field>
        <Field label={t('tin')} error={issueFor(state, 'tin')}>
          <input name="tin" defaultValue={settings?.tin ?? ''} className={inputClass} />
        </Field>
        <Field label={t('serviceCode')} hint={t('serviceCodeHint')}>
          <select
            name="serviceCode"
            defaultValue={settings?.serviceCode ?? 'S099.10'}
            className={inputClass}
          >
            {VAT_SERVICE_CODES.map((c) => (
              <option key={c} value={c}>
                {t(`codes.${c.replace('.', '_')}`)}
              </option>
            ))}
          </select>
        </Field>
        <label className="flex items-start gap-2 self-end pb-2">
          <input
            type="checkbox"
            name="startupExempt"
            defaultChecked={settings?.startupExempt}
            className="mt-1"
          />
          <span>{t('startupExempt')}</span>
        </label>
        <Field label={t('dueDays')} error={issueFor(state, 'dueDays')}>
          <input
            name="dueDays"
            type="number"
            min={1}
            max={60}
            required
            defaultValue={settings?.dueDays ?? 10}
            className={inputClass}
          />
        </Field>
        <Field label={t('graceDays')} hint={t('graceHint')} error={issueFor(state, 'graceDays')}>
          <input
            name="graceDays"
            type="number"
            min={0}
            max={60}
            required
            defaultValue={settings?.graceDays ?? 7}
            className={inputClass}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t('bankDetails')} error={issueFor(state, 'bankDetails')}>
            <textarea
              name="bankDetails"
              required
              rows={4}
              defaultValue={settings?.bankDetails}
              className={inputClass}
            />
          </Field>
        </div>
      </div>
      <SubmitButton>{t('save')}</SubmitButton>
    </Form>
  );
}

export function PriceForm() {
  const t = useTranslations('platform.billing.prices');
  const tp = useTranslations('pricing.plans');
  const [state, action] = useActionState(addPrice, undefined);
  return (
    <Form state={state} action={action} className="space-y-3 text-sm">
      <Errors state={state} />
      <Saved state={state}>{t('saved')}</Saved>
      <div className="grid gap-3 sm:grid-cols-5">
        <Field label={t('plan')}>
          <select name="planCode" className={inputClass}>
            {PLAN_CODES.map((c) => (
              <option key={c} value={c}>
                {tp(c)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('staffSeat')} error={issueFor(state, 'staffSeat')}>
          <input name="staffSeat" required inputMode="decimal" className={inputClass} />
        </Field>
        <Field label={t('workerSeat')} error={issueFor(state, 'workerSeat')}>
          <input name="workerSeat" required inputMode="decimal" className={inputClass} />
        </Field>
        <Field label={t('minimum')} error={issueFor(state, 'minimum')}>
          <input
            name="minimum"
            required
            defaultValue="0"
            inputMode="decimal"
            className={inputClass}
          />
        </Field>
        <Field label={t('from')} error={issueFor(state, 'effectiveFrom')}>
          <input name="effectiveFrom" type="date" required className={inputClass} />
        </Field>
      </div>
      <SubmitButton variant="secondary">{t('add')}</SubmitButton>
    </Form>
  );
}

export function CouponForm() {
  const t = useTranslations('platform.billing.coupons');
  const [state, action] = useActionState(addCoupon, undefined);
  return (
    <Form state={state} action={action} className="space-y-3 text-sm">
      <Errors state={state} />
      <Saved state={state}>{t('saved')}</Saved>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Field label={t('code')} error={issueFor(state, 'code')}>
          <input name="code" required className={`${inputClass} uppercase`} />
        </Field>
        <Field label={t('offKind')}>
          <select name="offKind" className={inputClass}>
            <option value="percent">{t('percent')}</option>
            <option value="amount">{t('amount')}</option>
          </select>
        </Field>
        <Field
          label={t('off')}
          error={issueFor(state, 'percentOff') ?? issueFor(state, 'amountOff')}
        >
          <input name="off" required inputMode="decimal" className={inputClass} />
        </Field>
        <Field label={t('months')} hint={t('monthsHint')}>
          <input name="months" type="number" min={1} max={36} className={inputClass} />
        </Field>
        <Field label={t('maxRedemptions')}>
          <input name="maxRedemptions" type="number" min={1} className={inputClass} />
        </Field>
        <Field label={t('validUntil')}>
          <input name="validUntil" type="date" className={inputClass} />
        </Field>
      </div>
      <SubmitButton variant="secondary">{t('add')}</SubmitButton>
    </Form>
  );
}

export function PartnerForm() {
  const t = useTranslations('platform.billing.partners');
  const [state, action] = useActionState(addPartner, undefined);
  return (
    <Form state={state} action={action} className="space-y-3 text-sm">
      <Errors state={state} />
      <Saved state={state}>{t('saved')}</Saved>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label={t('name')} error={issueFor(state, 'name')}>
          <input name="name" required className={inputClass} />
        </Field>
        <Field label={t('email')} error={issueFor(state, 'email')}>
          <input name="email" type="email" required className={inputClass} />
        </Field>
        <Field label={t('address')} error={issueFor(state, 'address')}>
          <input name="address" required className={inputClass} />
        </Field>
        <Field label={t('bin')}>
          <input name="bin" className={inputClass} />
        </Field>
        <Field label={t('discount')} error={issueFor(state, 'discountPercent')}>
          <input
            name="discountPercent"
            type="number"
            min={0}
            max={100}
            step="0.5"
            required
            defaultValue={15}
            className={inputClass}
          />
        </Field>
      </div>
      <SubmitButton variant="secondary">{t('add')}</SubmitButton>
    </Form>
  );
}

export function AssignPartnerForm({
  partners,
  tenants,
}: {
  partners: PartnerView[];
  tenants: { id: string; name: string; slug: string }[];
}) {
  const t = useTranslations('platform.billing.partners');
  const [state, action] = useActionState(assignPartner, undefined);
  return (
    <Form state={state} action={action} className="space-y-3 text-sm">
      <Errors state={state} />
      <Saved state={state}>{t('assigned')}</Saved>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('workspace')}>
          <select name="tenantId" required className={inputClass}>
            {tenants.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} ({x.slug})
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('partner')}>
          <select name="partnerId" className={inputClass}>
            <option value="">{t('noPartner')}</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('reason')} error={issueFor(state, 'reason')}>
          <input name="reason" required minLength={5} className={inputClass} />
        </Field>
      </div>
      <SubmitButton variant="secondary">{t('assign')}</SubmitButton>
    </Form>
  );
}

export function IssueInvoicesForm({ month }: { month: string }) {
  const t = useTranslations('platform.billing.invoices');
  const [state, action] = useActionState(issueInvoices, undefined);
  return (
    <Form state={state} action={action} className="flex flex-wrap items-end gap-3 text-sm">
      <Field label={t('month')} error={issueFor(state, 'month')}>
        <input name="month" type="month" required defaultValue={month} className={inputClass} />
      </Field>
      <SubmitButton variant="secondary">{t('issue')}</SubmitButton>
      {state?.error && (
        <p className="w-full text-xs text-red-600">
          <ErrorText state={state} />
        </p>
      )}
      {state?.ok && state.result && (
        <p className="w-full text-xs text-green-700">
          {t('issued', { count: state.result.issued })}
        </p>
      )}
    </Form>
  );
}

export function StatementForm() {
  const t = useTranslations('platform.billing.statement');
  const format = useFormatter();
  const [state, action] = useActionState(uploadStatement, undefined);
  const result: StatementMatchView | undefined = state?.result;
  return (
    <Form state={state} action={action} className="space-y-3 text-sm">
      <Errors state={state} />
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('file')} hint={t('hint')}>
          <input
            name="file"
            type="file"
            required
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="block text-sm"
          />
        </Field>
        <SubmitButton variant="secondary">{t('upload')}</SubmitButton>
      </div>
      {result && (
        <div className="space-y-2">
          <Banner tone={result.recorded.length ? 'green' : 'slate'}>
            {t('summary', {
              rows: result.rows,
              recorded: result.recorded.length,
              unmatched: result.unmatched.length,
            })}
          </Banner>
          {result.recorded.length > 0 && (
            <ul className="list-inside list-disc text-slate-700">
              {result.recorded.map((r) => (
                <li key={`${r.invoiceNumber}-${r.reference}`}>
                  {r.invoiceNumber}: {taka(format, r.amount)} ({r.reference})
                </li>
              ))}
            </ul>
          )}
          {result.unmatched.length > 0 && (
            <details>
              <summary className="cursor-pointer text-slate-600">{t('unmatched')}</summary>
              <ul className="mt-1 list-inside list-disc text-slate-600">
                {result.unmatched.map((r, i) => (
                  <li key={i}>
                    {r.date} · {taka(format, r.amount)} · {r.narration}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </Form>
  );
}

export function PaymentForm({ invoiceId }: { invoiceId: string }) {
  const t = useTranslations('platform.billing.payment');
  const [state, action] = useActionState(recordPayment.bind(null, invoiceId), undefined);
  return (
    <Form state={state} action={action} className="space-y-2 text-sm">
      <Errors state={state} />
      <Saved state={state}>{t('saved')}</Saved>
      <div className="grid gap-2 sm:grid-cols-4">
        <select name="method" aria-label={t('method')} className={inputClass}>
          <option value="bank_transfer">{t('bank_transfer')}</option>
          <option value="cheque">{t('cheque')}</option>
        </select>
        <input
          name="amount"
          required
          inputMode="decimal"
          placeholder={t('amount')}
          aria-label={t('amount')}
          className={inputClass}
        />
        <input
          name="reference"
          required
          placeholder={t('reference')}
          aria-label={t('reference')}
          className={inputClass}
        />
        <input
          name="receivedOn"
          type="date"
          required
          defaultValue={today()}
          aria-label={t('receivedOn')}
          className={inputClass}
        />
      </div>
      <SubmitButton variant="secondary">{t('record')}</SubmitButton>
    </Form>
  );
}

export function CreditNoteForm({ invoiceId }: { invoiceId: string }) {
  const t = useTranslations('platform.billing.credit');
  const [state, action] = useActionState(issueCreditNote.bind(null, invoiceId), undefined);
  return (
    <Form state={state} action={action} className="space-y-2 text-sm">
      <Errors state={state} />
      <Saved state={state}>{t('saved')}</Saved>
      <div className="grid gap-2 sm:grid-cols-3">
        <input
          name="amount"
          required
          inputMode="decimal"
          placeholder={t('amount')}
          aria-label={t('amount')}
          className={inputClass}
        />
        <input
          name="reason"
          required
          minLength={5}
          placeholder={t('reason')}
          aria-label={t('reason')}
          className={`${inputClass} sm:col-span-2`}
        />
      </div>
      <SubmitButton variant="secondary">{t('issue')}</SubmitButton>
    </Form>
  );
}

/** Accepts or rejects tax a customer withheld, once its certificate has been checked. */
export function ReviewDeductionForm({ settlementId }: { settlementId: string }) {
  const t = useTranslations('platform.billing.review');
  const [accepted, accept] = useActionState(
    reviewDeduction.bind(null, settlementId, true),
    undefined,
  );
  const [rejected, reject] = useActionState(
    reviewDeduction.bind(null, settlementId, false),
    undefined,
  );
  const state = rejected?.error ? rejected : accepted;
  return (
    <Form state={state} action={accept} className="flex flex-wrap items-center gap-2 text-sm">
      <input
        name="reason"
        required
        minLength={3}
        placeholder={t('reason')}
        aria-label={t('reason')}
        className={`${inputClass} w-56`}
      />
      <SubmitButton variant="secondary">{t('accept')}</SubmitButton>
      <button formAction={reject} className={buttonClass.ghost}>
        {t('reject')}
      </button>
      {state?.error && (
        <span className="text-xs text-red-600">
          <ErrorText state={state} />
        </span>
      )}
    </Form>
  );
}
