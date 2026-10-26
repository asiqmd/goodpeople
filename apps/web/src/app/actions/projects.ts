'use server';

import type { AllocationView, DonorView, ProjectView } from '@gp/shared';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { authedFetch } from '@/lib/api';
import { fail } from '@/lib/form';
import type { ActionState } from './platform';

const PAGES = '/workspace/projects';

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim();
const orNull = (form: FormData, name: string) => text(form, name) || null;

/** A project's fields from its form; an empty optional field clears it. */
const projectBody = (form: FormData) => ({
  legalEntityId: text(form, 'legalEntityId'),
  code: text(form, 'code'),
  name: text(form, 'name'),
  nameBn: orNull(form, 'nameBn'),
  donorId: orNull(form, 'donorId'),
  grantReference: orNull(form, 'grantReference'),
  fd6ApprovalNo: orNull(form, 'fd6ApprovalNo'),
  fd6ApprovedOn: orNull(form, 'fd6ApprovedOn'),
  startsOn: text(form, 'startsOn'),
  endsOn: orNull(form, 'endsOn'),
  approvedBudget: orNull(form, 'approvedBudget'),
  staffBudget: orNull(form, 'staffBudget'),
  note: orNull(form, 'note'),
});

export async function createDonor(
  _: ActionState<DonorView>,
  form: FormData,
): Promise<ActionState<DonorView>> {
  const result = await authedFetch<DonorView>('tenant', '/tenant/donors', {
    method: 'POST',
    body: { code: text(form, 'code'), name: text(form, 'name'), country: orNull(form, 'country') },
  });
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true, result: result.data };
}

export async function setDonorActive(id: string, isActive: boolean): Promise<ActionState> {
  const result = await authedFetch('tenant', `/tenant/donors/${id}`, {
    method: 'PATCH',
    body: { isActive },
  });
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true };
}

/** Adds a project and opens it. */
export async function createProject(
  _: ActionState<ProjectView>,
  form: FormData,
): Promise<ActionState<ProjectView>> {
  const result = await authedFetch<ProjectView>('tenant', '/tenant/projects', {
    method: 'POST',
    body: projectBody(form),
  });
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  redirect(`${PAGES}/${result.data.id}`);
}

export async function updateProject(
  id: string,
  _: ActionState<ProjectView>,
  form: FormData,
): Promise<ActionState<ProjectView>> {
  const result = await authedFetch<ProjectView>('tenant', `/tenant/projects/${id}`, {
    method: 'PATCH',
    body: projectBody(form),
  });
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true, result: result.data };
}

export async function closeProject(id: string): Promise<ActionState> {
  const result = await authedFetch('tenant', `/tenant/projects/${id}/close`, { method: 'POST' });
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true };
}

export async function addAllocation(
  projectId: string,
  _: ActionState<AllocationView>,
  form: FormData,
): Promise<ActionState<AllocationView>> {
  const result = await authedFetch<AllocationView>(
    'tenant',
    `/tenant/projects/${projectId}/allocations`,
    {
      method: 'POST',
      body: {
        employeeId: text(form, 'employeeId'),
        percent: text(form, 'percent'),
        costKind: text(form, 'costKind') || 'programme',
        fromOn: text(form, 'fromOn'),
        toOn: orNull(form, 'toOn'),
      },
    },
  );
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true, result: result.data };
}

export async function endAllocation(
  id: string,
  _: ActionState<AllocationView>,
  form: FormData,
): Promise<ActionState<AllocationView>> {
  const result = await authedFetch<AllocationView>('tenant', `/tenant/allocations/${id}/end`, {
    method: 'POST',
    body: { toOn: text(form, 'toOn') },
  });
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true, result: result.data };
}

export async function deleteAllocation(id: string): Promise<ActionState> {
  const result = await authedFetch('tenant', `/tenant/allocations/${id}`, { method: 'DELETE' });
  if (!result.ok) return fail(result);
  revalidatePath(PAGES, 'layout');
  return { ok: true };
}
