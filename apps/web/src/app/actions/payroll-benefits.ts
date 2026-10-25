'use server';

import type {
  EmployeeListItem,
  LoanView,
  Page,
  PayBatchPreview,
  PayBatchView,
  PayrollRunView,
  TaxDeclarationView,
} from '@gp/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { authedFetch } from '@/lib/api';
import { fail, nest, rows } from '@/lib/form';
import type { ActionState } from './platform';

const PAYROLL = '/workspace/payroll';

/** An employee's id from their code, as HR types it. */
async function employeeIdOf(code: string | undefined): Promise<string | null> {
  if (!code) return null;
  const result = await authedFetch<Page<EmployeeListItem>>(
    'tenant',
    `/tenant/employees?search=${encodeURIComponent(code)}&pageSize=5`,
  );
  if (!result.ok) return null;
  return (
    result.data.items.find((e) => e.employeeCode.toLowerCase() === code.trim().toLowerCase())?.id ??
    null
  );
}

const noEmployee = (code: string | undefined): ActionState<never> => ({
  error: code ? `No employee with code ${code}` : 'Enter an employee code',
  issues: [{ path: 'employeeCode', message: code ? `No employee with code ${code}` : 'Required' }],
});

// ── Settings ─────────────────────────────────────────────────────────────────

export async function saveTaxAndFundSettings(_: ActionState, form: FormData): Promise<ActionState> {
  const data = nest(form);
  const vesting = rows(nest(form).vesting).map((v) => ({
    afterYears: Number(v.afterYears),
    percent: Number(v.percent),
  }));
  const result = await authedFetch('tenant', '/tenant/payroll/settings', {
    method: 'PATCH',
    body: {
      autoTax: form.has('autoTax'),
      pfEnabled: form.has('pfEnabled'),
      pfEmployeeRate: data.pfEmployeeRate,
      pfEmployerRate: data.pfEmployerRate,
      pfRecognised: form.has('pfRecognised'),
      pfVesting: vesting,
    },
  });
  if (!result.ok) return fail(result);
  revalidatePath(PAYROLL, 'layout');
  return { ok: true };
}

// ── Loans ────────────────────────────────────────────────────────────────────

export async function createLoan(
  _: ActionState<LoanView>,
  form: FormData,
): Promise<ActionState<LoanView>> {
  const data = nest(form);
  const employeeId = await employeeIdOf(data.employeeCode);
  if (!employeeId) return noEmployee(data.employeeCode);
  const result = await authedFetch<LoanView>('tenant', '/tenant/payroll/loans', {
    method: 'POST',
    body: {
      employeeId,
      kind: data.kind,
      principal: data.principal,
      installment: data.installment,
      startMonth: data.startMonth,
      reason: data.reason,
    },
  });
  if (!result.ok) return fail(result);
  revalidatePath(`${PAYROLL}/loans`);
  return { result: result.data };
}

export async function cancelLoan(id: string): Promise<ActionState> {
  const result = await authedFetch('tenant', `/tenant/payroll/loans/${id}/cancel`, {
    method: 'POST',
  });
  if (!result.ok) return fail(result);
  revalidatePath(`${PAYROLL}/loans`);
  return { ok: true };
}

export async function repayLoan(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  const data = nest(form);
  const result = await authedFetch('tenant', `/tenant/payroll/loans/${id}/repay`, {
    method: 'POST',
    body: { amount: data.amount, date: data.date, note: data.note },
  });
  if (!result.ok) return fail(result);
  revalidatePath(`${PAYROLL}/loans`);
  return { ok: true };
}

// ── Provident fund ───────────────────────────────────────────────────────────

export async function joinFund(
  _: ActionState<{ joined: number }>,
  form: FormData,
): Promise<ActionState<{ joined: number }>> {
  const data = nest(form);
  const codes = String(data.codes ?? '')
    .split(/[\s,]+/)
    .filter(Boolean);
  const everyone = form.get('who') === 'everyone';
  const ids: string[] = [];
  if (!everyone) {
    for (const code of codes) {
      const id = await employeeIdOf(code);
      if (!id) {
        return {
          error: `No employee with code ${code}`,
          issues: [{ path: 'codes', message: `No employee with code ${code}` }],
        };
      }
      ids.push(id);
    }
  }
  const result = await authedFetch<{ joined: number }>('tenant', '/tenant/payroll/pf/members', {
    method: 'POST',
    body: { joinedOn: data.joinedOn, ...(everyone ? { everyone: true } : { employeeIds: ids }) },
  });
  if (!result.ok) return fail(result);
  revalidatePath(`${PAYROLL}/pf`);
  return { result: result.data };
}

export async function leaveFund(
  employeeId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const result = await authedFetch('tenant', `/tenant/payroll/pf/members/${employeeId}/leave`, {
    method: 'POST',
    body: { leftOn: nest(form).leftOn },
  });
  if (!result.ok) return fail(result);
  revalidatePath(`${PAYROLL}/pf`, 'layout');
  return { ok: true };
}

export async function addFundEntry(
  employeeId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const data = nest(form);
  const result = await authedFetch('tenant', `/tenant/payroll/pf/members/${employeeId}/entries`, {
    method: 'POST',
    body: {
      date: data.date,
      kind: data.kind,
      account: data.account,
      amount: data.amount,
      note: data.note,
    },
  });
  if (!result.ok) return fail(result);
  revalidatePath(`${PAYROLL}/pf`, 'layout');
  return { ok: true };
}

export async function postInterest(
  _: ActionState<{ members: number }>,
  form: FormData,
): Promise<ActionState<{ members: number }>> {
  const data = nest(form);
  const result = await authedFetch<{ members: number }>('tenant', '/tenant/payroll/pf/interest', {
    method: 'POST',
    body: { date: data.date, percent: data.percent, note: data.note },
  });
  if (!result.ok) return fail(result);
  revalidatePath(`${PAYROLL}/pf`, 'layout');
  return { result: result.data };
}

// ── Salary tax ───────────────────────────────────────────────────────────────

export async function saveTaxProfile(
  employeeId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const result = await authedFetch('tenant', `/tenant/employees/${employeeId}/tax/profile`, {
    method: 'PUT',
    body: {
      disabled: form.has('disabled'),
      freedomFighter: form.has('freedomFighter'),
      disabledDependants: Number(nest(form).disabledDependants ?? 0),
      // Minimum tax is the same everywhere from 2025-26; the area is kept for earlier years.
      area: null,
    },
  });
  if (!result.ok) return fail(result);
  revalidatePath(`/workspace/employees/${employeeId}`);
  return { ok: true };
}

export async function saveTaxOpening(
  employeeId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const data = nest(form);
  const result = await authedFetch('tenant', `/tenant/employees/${employeeId}/tax/opening`, {
    method: 'PUT',
    body: { fiscalYear: data.fiscalYear, salary: data.salary, tax: data.tax, pf: data.pf ?? '0' },
  });
  if (!result.ok) return fail(result);
  revalidatePath(`/workspace/employees/${employeeId}`);
  return { ok: true };
}

/** An investment declaration: the employee's own (no id) or HR's for someone. */
export async function saveDeclaration(
  employeeId: string | null,
  fiscalYear: string,
  _: ActionState<TaxDeclarationView>,
  form: FormData,
): Promise<ActionState<TaxDeclarationView>> {
  const items = rows(nest(form).items)
    .filter((i) => i.kind && i.declared)
    .map((i) => ({ kind: i.kind, declared: i.declared, note: i.note ?? null }));
  const path = employeeId
    ? `/tenant/employees/${employeeId}/tax/declaration`
    : '/tenant/me/tax/declaration';
  const result = await authedFetch<TaxDeclarationView>(
    'tenant',
    `${path}?fiscalYear=${fiscalYear}`,
    { method: 'PUT', body: { items, submit: form.get('intent') === 'submit' } },
  );
  if (!result.ok) return fail(result);
  revalidatePath(employeeId ? `/workspace/employees/${employeeId}` : '/workspace/payslips');
  revalidatePath(`${PAYROLL}/tax`);
  return { result: result.data };
}

export async function verifyDeclaration(
  employeeId: string,
  fiscalYear: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const verified = rows(nest(form).verified).map((v) => v.amount ?? '0');
  const result = await authedFetch(
    'tenant',
    `/tenant/employees/${employeeId}/tax/declaration/verify?fiscalYear=${fiscalYear}`,
    { method: 'POST', body: { verified } },
  );
  if (!result.ok) return fail(result);
  revalidatePath(`${PAYROLL}/tax`);
  return { ok: true };
}

export async function setTaxDeposit(
  runId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const data = nest(form);
  const result = await authedFetch('tenant', `/tenant/payroll/runs/${runId}/tax-deposit`, {
    method: 'PUT',
    body: { challanNo: data.challanNo, depositedOn: data.depositedOn, amount: data.amount },
  });
  if (!result.ok) return fail(result);
  revalidatePath(`${PAYROLL}/runs/${runId}`);
  return { ok: true };
}

// ── Increments ───────────────────────────────────────────────────────────────

function incrementBody(form: FormData) {
  const data = nest(form);
  return {
    effectiveFrom: data.effectiveFrom,
    basis: data.basis,
    percent: data.percent,
    minServiceMonths: Number(data.minServiceMonths ?? 12),
    ...(data.payGroupId ? { payGroupIds: [data.payGroupId] } : {}),
    ...(data.structureId ? { structureIds: [data.structureId] } : {}),
    reason: data.reason ?? 'Annual increment',
  };
}

export async function previewIncrement(
  form: FormData,
): Promise<PayBatchPreview | { error: string }> {
  const result = await authedFetch<PayBatchPreview>(
    'tenant',
    '/tenant/payroll/increments/preview',
    {
      method: 'POST',
      body: incrementBody(form),
    },
  );
  return result.ok ? result.data : { error: result.error.message };
}

export async function createIncrement(
  _: ActionState<PayBatchView>,
  form: FormData,
): Promise<ActionState<PayBatchView>> {
  const result = await authedFetch<PayBatchView>('tenant', '/tenant/payroll/increments', {
    method: 'POST',
    body: incrementBody(form),
  });
  if (!result.ok) return fail(result);
  revalidatePath(`${PAYROLL}/increments`);
  return { result: result.data };
}

export async function cancelIncrement(id: string): Promise<ActionState> {
  const result = await authedFetch('tenant', `/tenant/payroll/increments/${id}/cancel`, {
    method: 'POST',
  });
  if (!result.ok) return fail(result);
  revalidatePath(`${PAYROLL}/increments`);
  return { ok: true };
}

// ── Bonus runs ───────────────────────────────────────────────────────────────

export async function createBonusRun(
  _: ActionState<PayrollRunView>,
  form: FormData,
): Promise<ActionState<PayrollRunView>> {
  const data = nest(form);
  const result = await authedFetch<PayrollRunView>('tenant', '/tenant/payroll/runs/bonus', {
    method: 'POST',
    body: {
      payGroupId: data.payGroupId,
      festival: data.festival,
      festivalBn: data.festivalBn ?? null,
      religions: form.getAll('religions'),
      unrecorded: form.has('unrecorded'),
      cutOff: data.cutOff,
      paymentDate: data.paymentDate,
      percentOfBasic: Number(data.percentOfBasic ?? 100),
      minServiceMonths: Number(data.minServiceMonths ?? 12),
    },
  });
  if (!result.ok) return fail(result);
  redirect(`${PAYROLL}/runs/${result.data.id}`);
}
