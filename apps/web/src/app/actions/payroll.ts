'use server';

import type {
  PayComponentView,
  PayGroupView,
  PayPreview,
  PayRecordView,
  PayrollRunView,
  SalaryStructureView,
  StructurePreview,
} from '@gp/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { authedFetch } from '@/lib/api';
import { fail, nest, rows } from '@/lib/form';
import type { ActionState } from './platform';

const SETUP = '/workspace/payroll';

/** Structure lines from the editor's lines.N.component / lines.N.formula fields. */
function linesOf(form: FormData) {
  return rows(nest(form).lines).filter((l) => l.component || l.formula);
}

// ── Components ───────────────────────────────────────────────────────────────

export async function createComponent(
  _: ActionState<PayComponentView>,
  form: FormData,
): Promise<ActionState<PayComponentView>> {
  const data = nest(form);
  const result = await authedFetch<PayComponentView>('tenant', '/tenant/payroll/components', {
    method: 'POST',
    body: {
      code: data.code,
      name: data.name,
      nameBn: data.nameBn ?? null,
      kind: data.kind,
      calculation: data.calculation,
      taxTreatment: data.taxTreatment,
      inGross: form.has('inGross'),
      inOvertimeBase: form.has('inOvertimeBase'),
      prorate: form.has('prorate'),
    },
  });
  if (!result.ok) return fail(result);
  revalidatePath(SETUP);
  return { result: result.data };
}

export async function updateComponent(
  id: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const data = nest(form);
  const result = await authedFetch('tenant', `/tenant/payroll/components/${id}`, {
    method: 'PATCH',
    body: {
      name: data.name,
      nameBn: data.nameBn ?? null,
      inGross: form.has('inGross'),
      inOvertimeBase: form.has('inOvertimeBase'),
      prorate: form.has('prorate'),
      isActive: form.has('isActive'),
      glAccount: data.glAccount ?? null,
    },
  });
  if (!result.ok) return fail(result);
  revalidatePath(SETUP);
  return { ok: true };
}

// ── Structures ───────────────────────────────────────────────────────────────

export async function previewStructure(
  basis: string,
  amount: string,
  lines: { component: string; formula: string }[],
): Promise<StructurePreview | { error: string }> {
  const result = await authedFetch<StructurePreview>(
    'tenant',
    '/tenant/payroll/structures/preview',
    {
      method: 'POST',
      body: { basis, amount, lines },
    },
  );
  return result.ok ? result.data : { error: result.error.message };
}

export async function saveStructure(
  id: string | null,
  _: ActionState<SalaryStructureView>,
  form: FormData,
): Promise<ActionState<SalaryStructureView>> {
  const data = nest(form);
  const body = {
    name: data.name,
    nameBn: data.nameBn ?? null,
    basis: data.basis,
    lines: linesOf(form),
    wageBoard: data.wageBoard ?? null,
    ...(id ? { isActive: form.has('isActive') } : { code: data.code }),
  };
  const result = await authedFetch<SalaryStructureView>(
    'tenant',
    id ? `/tenant/payroll/structures/${id}` : '/tenant/payroll/structures',
    { method: id ? 'PATCH' : 'POST', body },
  );
  if (!result.ok) return fail(result);
  revalidatePath(SETUP);
  return { result: result.data };
}

// ── Pay groups and settings ──────────────────────────────────────────────────

export async function createPayGroup(
  _: ActionState<PayGroupView>,
  form: FormData,
): Promise<ActionState<PayGroupView>> {
  const data = nest(form);
  const result = await authedFetch<PayGroupView>('tenant', '/tenant/payroll/pay-groups', {
    method: 'POST',
    body: {
      code: data.code,
      name: data.name,
      frequency: data.frequency,
      isDefault: form.has('isDefault'),
    },
  });
  if (!result.ok) return fail(result);
  revalidatePath(SETUP);
  return { result: result.data };
}

export async function makeDefaultPayGroup(id: string): Promise<void> {
  await authedFetch('tenant', `/tenant/payroll/pay-groups/${id}`, {
    method: 'PATCH',
    body: { isDefault: true },
  });
  revalidatePath(SETUP);
}

export async function setMakerChecker(makerChecker: boolean): Promise<ActionState> {
  const result = await authedFetch('tenant', '/tenant/payroll/settings', {
    method: 'PATCH',
    body: { makerChecker },
  });
  if (!result.ok) return fail(result);
  revalidatePath(SETUP);
  return { ok: true };
}

// ── An employee's pay ────────────────────────────────────────────────────────

/** The pay-change form's fields: structure, group, amount, grade and fixed.CODE amounts. */
function payBody(form: FormData) {
  const data = nest(form);
  return {
    effectiveFrom: data.effectiveFrom,
    structureId: data.structureId,
    payGroupId: data.payGroupId,
    amount: data.amount,
    wageGrade: data.wageGrade ?? null,
    fixed: data.fixed ?? {},
    reason: data.reason,
  };
}

export async function previewPay(
  employeeId: string,
  form: FormData,
): Promise<PayPreview | { error: string }> {
  const { reason: _, ...body } = payBody(form);
  if (!body.structureId || !body.amount) return { error: '' };
  const result = await authedFetch<PayPreview>(
    'tenant',
    `/tenant/employees/${employeeId}/pay/preview`,
    { method: 'POST', body },
  );
  return result.ok ? result.data : { error: result.error.message };
}

export async function proposePay(
  employeeId: string,
  _: ActionState<PayRecordView>,
  form: FormData,
): Promise<ActionState<PayRecordView>> {
  const result = await authedFetch<PayRecordView>('tenant', `/tenant/employees/${employeeId}/pay`, {
    method: 'POST',
    body: payBody(form),
  });
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/employees');
  revalidatePath('/workspace', 'layout');
  return { result: result.data };
}

export async function cancelPayChange(id: string): Promise<void> {
  await authedFetch('tenant', `/tenant/pay-changes/${id}/cancel`, { method: 'POST' });
  revalidatePath('/workspace/employees');
  revalidatePath('/workspace', 'layout');
}

// ── Runs ─────────────────────────────────────────────────────────────────────

const RUNS = '/workspace/payroll/runs';

export async function createRun(
  _: ActionState<PayrollRunView>,
  form: FormData,
): Promise<ActionState<PayrollRunView>> {
  const data = nest(form);
  const result = await authedFetch<PayrollRunView>('tenant', '/tenant/payroll/runs', {
    method: 'POST',
    body: { payGroupId: data.payGroupId, month: data.month, paymentDate: data.paymentDate },
  });
  if (!result.ok) return fail(result);
  redirect(`${RUNS}/${result.data.id}`);
}

/** Computes, submits, cancels or publishes a run. */
export async function runStep(
  id: string,
  step: 'compute' | 'submit' | 'cancel' | 'publish',
): Promise<ActionState> {
  const result = await authedFetch('tenant', `/tenant/payroll/runs/${id}/${step}`, {
    method: 'POST',
  });
  if (!result.ok) return fail(result);
  revalidatePath(RUNS, 'layout');
  return { ok: true };
}

export async function createAdjustment(parentId: string): Promise<ActionState> {
  const result = await authedFetch<PayrollRunView>(
    'tenant',
    `/tenant/payroll/runs/${parentId}/adjustments`,
    { method: 'POST', body: {} },
  );
  if (!result.ok) return fail(result);
  redirect(`${RUNS}/${result.data.id}`);
}

/** An amount entered for one person in a run: an advance to recover, arrears, a bonus. */
export async function setRunInput(
  runId: string,
  employeeId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const data = nest(form);
  const result = await authedFetch('tenant', `/tenant/payroll/runs/${runId}/inputs`, {
    method: 'PUT',
    body: { employeeId, component: data.component, amount: data.amount, note: data.note },
  });
  if (!result.ok) return fail(result);
  revalidatePath(RUNS, 'layout');
  return { ok: true };
}

export async function removeRunInput(
  runId: string,
  employeeId: string,
  component: string,
): Promise<ActionState> {
  const result = await authedFetch('tenant', `/tenant/payroll/runs/${runId}/inputs/remove`, {
    method: 'POST',
    body: { employeeId, component },
  });
  if (!result.ok) return fail(result);
  revalidatePath(RUNS, 'layout');
  return { ok: true };
}
