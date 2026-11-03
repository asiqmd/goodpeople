import { can, type OrgSnapshot, type Permission } from '@gp/shared';
import { notFound } from 'next/navigation';
import { authedFetch, currentTenantUser } from './api';
export async function serviceData<T>(path: string): Promise<T> {
  const response = await authedFetch<T>('tenant', `/tenant${path}`);
  if (!response.ok) {
    if ([403, 404].includes(response.error.statusCode)) notFound();
    throw new Error(response.error.message);
  }
  return response.data;
}
export async function serviceOrg(permission: Permission) {
  if (!can((await currentTenantUser())?.role, permission)) notFound();
  return serviceData<OrgSnapshot>('/org');
}
