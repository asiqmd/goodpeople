import { HR_ROLES, type TenantRole } from '@gp/shared';

export const isHrRole = (role: TenantRole | undefined) =>
  !!role && (HR_ROLES as readonly string[]).includes(role);
