'use server';

import type { InvoiceView, StatementMatchView } from '@gp/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { authedFetch, authedUpload } from '@/lib/api';
import { fail, nest } from '@/lib/form';
import type { ActionState } from './platform';

const WORKSPACE = '/workspace/billing';
const CONSOLE = '/platform/billing';

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();
const optional = (form: FormData, name: string) => text(form, name) || undefined;
const orNull = (form: FormData, name: string) => text(form, name) || null;

// ── The workspace ────────────────────────────────────────────────────────────

/** Chooses (or changes) the plan, with a coupon and who invoices are addressed to. */
export async function choosePlan(_: ActionState, form: FormData): Promise<ActionState> {
  const result = await authedFetch('tenant', '/tenant/billing/plan', {
    method: 'POST',
    body: {
      planCode: text(form, 'planCode'),
      couponCode: optional(form, 'couponCode'),
      buyerName: text(form, 'buyerName'),
      buyerAddress: text(form, 'buyerAddress'),
      buyerBin: optional(form, 'buyerBin'),
    },
  });
  if (!result.ok) return fail(result);
  // The plan changes what the whole workspace shows.
  revalidatePath('/workspace', 'layout');
  return { ok: true };
}

export async function cancelPlan(): Promise<ActionState> {
  const result = await authedFetch('tenant', '/tenant/billing/cancel', { method: 'POST' });
  if (!result.ok) return fail(result);
  revalidatePath(WORKSPACE);
  return { ok: true };
}

/** Starts an online payment and sends the browser on to the gateway's page. */
export async function payInvoice(invoiceId: string, method: string): Promise<ActionState> {
  const result = await authedFetch<{ redirectUrl: string }>(
    'tenant',
    `/tenant/billing/invoices/${invoiceId}/pay`,
    { method: 'POST', body: { method } },
  );
  if (!result.ok) return fail(result);
  redirect(result.data.redirectUrl);
}

/** VAT or income tax the company withheld, with its certificate. */
export async function recordDeduction(
  invoiceId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const result = await authedFetch<InvoiceView>(
    'tenant',
    `/tenant/billing/invoices/${invoiceId}/deductions`,
    { method: 'POST', body: nest(form) },
  );
  if (!result.ok) return fail(result);
  revalidatePath(WORKSPACE);
  return { ok: true };
}

// ── The platform console ─────────────────────────────────────────────────────

async function platformWrite(path: string, body: unknown, method = 'POST'): Promise<ActionState> {
  const result = await authedFetch('platform', path, { method, body });
  if (!result.ok) return fail(result);
  revalidatePath(CONSOLE, 'layout');
  return { ok: true };
}

export async function saveBillingSettings(_: ActionState, form: FormData): Promise<ActionState> {
  return platformWrite(
    '/platform/billing/settings',
    {
      supplierName: text(form, 'supplierName'),
      supplierAddress: text(form, 'supplierAddress'),
      bin: text(form, 'bin'),
      tin: orNull(form, 'tin'),
      serviceCode: text(form, 'serviceCode'),
      startupExempt: form.get('startupExempt') === 'on',
      dueDays: text(form, 'dueDays'),
      graceDays: text(form, 'graceDays'),
      bankDetails: text(form, 'bankDetails'),
    },
    'PUT',
  );
}

export async function addPrice(_: ActionState, form: FormData): Promise<ActionState> {
  return platformWrite('/platform/billing/prices', nest(form));
}

export async function addCoupon(_: ActionState, form: FormData): Promise<ActionState> {
  const off = text(form, 'off');
  const byPercent = text(form, 'offKind') === 'percent';
  return platformWrite('/platform/billing/coupons', {
    code: text(form, 'code'),
    percentOff: byPercent && off ? off : null,
    amountOff: !byPercent && off ? off : null,
    months: orNull(form, 'months'),
    maxRedemptions: orNull(form, 'maxRedemptions'),
    validUntil: orNull(form, 'validUntil'),
  });
}

export async function addPartner(_: ActionState, form: FormData): Promise<ActionState> {
  return platformWrite('/platform/billing/partners', {
    ...nest(form),
    bin: orNull(form, 'bin'),
  });
}

export async function assignPartner(_: ActionState, form: FormData): Promise<ActionState> {
  return platformWrite(
    `/platform/billing/tenants/${text(form, 'tenantId')}/partner`,
    { partnerId: orNull(form, 'partnerId'), reason: text(form, 'reason') },
    'PATCH',
  );
}

export async function issueInvoices(
  _: ActionState<{ issued: number }>,
  form: FormData,
): Promise<ActionState<{ issued: number }>> {
  const result = await authedFetch<{ issued: number }>('platform', '/platform/billing/issue', {
    method: 'POST',
    body: { month: text(form, 'month') },
  });
  if (!result.ok) return fail(result);
  revalidatePath(CONSOLE, 'layout');
  return { ok: true, result: result.data };
}

export async function recordPayment(
  invoiceId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  return platformWrite(`/platform/billing/invoices/${invoiceId}/payments`, nest(form));
}

export async function issueCreditNote(
  invoiceId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  return platformWrite(`/platform/billing/invoices/${invoiceId}/credit-notes`, nest(form));
}

export async function reviewDeduction(
  settlementId: string,
  accept: boolean,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  return platformWrite(`/platform/billing/settlements/${settlementId}/review`, {
    accept,
    reason: text(form, 'reason'),
  });
}

export async function uploadStatement(
  _: ActionState<StatementMatchView>,
  form: FormData,
): Promise<ActionState<StatementMatchView>> {
  const result = await authedUpload<StatementMatchView>(
    '/platform/billing/statements',
    form,
    'platform',
  );
  if (!result.ok) return fail(result);
  revalidatePath(CONSOLE, 'layout');
  return { ok: true, result: result.data };
}
