import { z } from 'zod';
import type { WorkspaceUserView } from './account-types.js';

// Phase 3 M4 (the group pack): the companies a shared-service HR login may see. A login limited
// to none sees every company, as before; a workspace admin always does.

export const userEntityScopeSchema = z.object({
  /** The companies the login may see people of; none: every company. */
  legalEntityIds: z
    .array(z.uuid())
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, 'Each company can appear once'),
});
export type UserEntityScopeInput = z.infer<typeof userEntityScopeSchema>;

export interface UserEntityScopeView {
  userId: string;
  /** Empty: every company. */
  legalEntities: { id: string; code: string | null; name: string }[];
}

/** A login in the users list, with the companies it is limited to (none: every company). */
export interface WorkspaceUserListItem extends WorkspaceUserView {
  legalEntityIds: string[];
}
