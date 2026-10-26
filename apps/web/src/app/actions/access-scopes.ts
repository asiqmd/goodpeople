'use server';

import type { UserEntityScopeView } from '@gp/shared';
import { revalidatePath } from 'next/cache';
import { authedFetch } from '@/lib/api';
import { fail } from '@/lib/form';
import type { ActionState } from './platform';

/** The companies a login may see people of; none ticked: every company. */
export async function setUserCompanies(
  userId: string,
  _: ActionState,
  form: FormData,
): Promise<ActionState> {
  const result = await authedFetch<UserEntityScopeView>(
    'tenant',
    `/tenant/users/${userId}/scopes`,
    { method: 'PUT', body: { legalEntityIds: form.getAll('legalEntityId').map(String) } },
  );
  if (!result.ok) return fail(result);
  revalidatePath('/workspace/users');
  return { ok: true };
}
