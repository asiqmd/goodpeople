import { supportAccessGrants, supportAccessSessions, type Database, type Tx } from '@gp/db';
import { and, desc, eq, gt, isNull, lte } from 'drizzle-orm';
import type { AuthedRequest } from '../../common/auth-user.js';
import { forbidden } from '../../common/errors.js';

// What every request, refresh and sign-out of a `support` login checks. Plain functions, so the
// access guard and the auth service use them without depending on the support-access module.

/** The longest one support session lasts, however long the workspace's grant runs. */
export const SUPPORT_SESSION_HOURS = 8;
const HOUR_MS = 3_600_000;

type Grant = typeof supportAccessGrants.$inferSelect;
type Session = typeof supportAccessSessions.$inferSelect;
export interface OpenSupportSession {
  session: Session;
  grant: Grant;
}

/** Whether a grant lets support in at `now`. */
export const isActiveGrant = (
  grant: Pick<Grant, 'startsAt' | 'endsAt' | 'revokedAt'>,
  now = new Date(),
) => !grant.revokedAt && grant.startsAt <= now && grant.endsAt > now;

/** When a session started at `startedAt` ends: with the grant, or after the session limit. */
export const sessionEndsAt = (grantEndsAt: Date, startedAt: Date) =>
  new Date(Math.min(grantEndsAt.getTime(), startedAt.getTime() + SUPPORT_SESSION_HOURS * HOUR_MS));

/**
 * A support login's session that has not ended, on a grant that still runs: found by the
 * login (on each request) or by its refresh-token session (on a refresh).
 */
export async function openSupportSession(
  db: Database | Tx,
  by: { tenantUserId: string; tenantId: string } | { authSessionId: string },
  now = new Date(),
): Promise<OpenSupportSession | null> {
  const [row] = await db
    .select({ session: supportAccessSessions, grant: supportAccessGrants })
    .from(supportAccessSessions)
    .innerJoin(supportAccessGrants, eq(supportAccessGrants.id, supportAccessSessions.grantId))
    .where(
      and(
        'authSessionId' in by
          ? eq(supportAccessSessions.authSessionId, by.authSessionId)
          : and(
              eq(supportAccessSessions.tenantUserId, by.tenantUserId),
              eq(supportAccessGrants.tenantId, by.tenantId),
            ),
        isNull(supportAccessSessions.endedAt),
        gt(
          supportAccessSessions.startedAt,
          new Date(now.getTime() - SUPPORT_SESSION_HOURS * HOUR_MS),
        ),
        isNull(supportAccessGrants.revokedAt),
        lte(supportAccessGrants.startsAt, now),
        gt(supportAccessGrants.endsAt, now),
      ),
    )
    .orderBy(desc(supportAccessSessions.startedAt))
    .limit(1);
  return row ?? null;
}

const perRequest = new WeakMap<AuthedRequest, Promise<OpenSupportSession | null>>();

/** The open session of the support login making this request, looked up once per request. */
export function supportSessionOf(
  db: Database,
  req: AuthedRequest,
): Promise<OpenSupportSession | null> {
  const user = req.user;
  if (user?.kind !== 'tenant' || user.role !== 'support') return Promise.resolve(null);
  let found = perRequest.get(req);
  if (!found) {
    found = openSupportSession(db, { tenantUserId: user.id, tenantId: user.tenantId });
    perRequest.set(req, found);
  }
  return found;
}

/** A support login may only read, and only while its session and the grant last. */
export function checkSupportRequest(
  found: OpenSupportSession | null,
  method: string,
): asserts found is OpenSupportSession {
  if (!found) {
    throw forbidden('support_access_ended', 'Support access to this workspace has ended');
  }
  if (method !== 'GET' && method !== 'HEAD') {
    throw forbidden('support_read_only', 'Good People support can look but not change anything');
  }
}

/** A refresh replaces the session's refresh token: the support session follows it. */
export const followRefresh = (tx: Tx, from: string, to: string) =>
  tx
    .update(supportAccessSessions)
    .set({ authSessionId: to })
    .where(eq(supportAccessSessions.authSessionId, from));

/** Signing a support login out ends the support session it belongs to. */
export const endSupportSessionOf = (db: Database, authSessionId: string) =>
  db
    .update(supportAccessSessions)
    .set({ endedAt: new Date() })
    .where(
      and(
        eq(supportAccessSessions.authSessionId, authSessionId),
        isNull(supportAccessSessions.endedAt),
      ),
    );
