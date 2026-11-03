'use server';

import type { CompensationRoundView } from '@gp/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { authedFetch } from '@/lib/api';
import { fail, nest, rows } from '@/lib/form';
import type { ActionState } from './platform';

const base = '/workspace/performance/compensation';
const refresh = () => revalidatePath(base, 'layout');

export async function createCompensation(
  _: ActionState<CompensationRoundView>,
  form: FormData,
): Promise<ActionState<CompensationRoundView>> {
  const data = nest(form);
  const result = await authedFetch<CompensationRoundView>('tenant', '/tenant/compensation', {
    method: 'POST',
    body: {
      name: data.name,
      legalEntityId: data.legalEntityId,
      effectiveFrom: data.effectiveFrom,
      cycleId: data.cycleId || null,
      rmgAnnual: data.rmgAnnual === 'on',
      matrix: data.matrix,
      ranges: rows(data.ranges).filter((r) => r.minimum || r.maximum),
      budgets: [
        { orgUnitId: null, monthlyAmount: data.companyBudget },
        ...rows(data.units).filter((r) => r.monthlyAmount),
      ],
    },
  });
  if (!result.ok) return fail(result);
  refresh();
  redirect(`${base}/${result.data.id}`);
}

export async function proposeCompensation(
  id: string,
  lineId: string,
  _: ActionState<CompensationRoundView>,
  form: FormData,
): Promise<ActionState<CompensationRoundView>> {
  const result = await authedFetch<CompensationRoundView>(
    'tenant',
    `/tenant/compensation/${id}/lines/${lineId}`,
    {
      method: 'PATCH',
      body: {
        percent: String(form.get('percent')),
        reason: String(form.get('reason')),
        version: Number(form.get('version')),
        submit: form.get('intent') === 'submit',
      },
    },
  );
  if (!result.ok) return fail(result);
  refresh();
  return { ok: true, result: result.data };
}

export async function changeCompensationBudgets(
  id: string,
  _: ActionState<CompensationRoundView>,
  form: FormData,
): Promise<ActionState<CompensationRoundView>> {
  const data = nest(form);
  const result = await authedFetch<CompensationRoundView>(
    'tenant',
    `/tenant/compensation/${id}/budgets`,
    {
      method: 'PATCH',
      body: {
        budgets: [
          { orgUnitId: null, monthlyAmount: data.companyBudget },
          ...rows(data.units).filter((r) => r.monthlyAmount),
        ],
      },
    },
  );
  if (!result.ok) return fail(result);
  refresh();
  return { ok: true, result: result.data };
}

export async function moveCompensation(
  id: string,
  move: 'export' | 'cancel',
): Promise<ActionState<CompensationRoundView>> {
  const result = await authedFetch<CompensationRoundView>(
    'tenant',
    `/tenant/compensation/${id}/${move}`,
    { method: 'POST' },
  );
  if (!result.ok) return fail(result);
  refresh();
  revalidatePath('/workspace/approvals');
  return { ok: true, result: result.data };
}
