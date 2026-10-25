import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { kiosks, locations, runAsTenant, type Database, type Tx } from '@gp/db';
import type { KioskCreated, KioskInput, KioskView } from '@gp/shared';
import { and, asc, eq, isNull, lt, or, type SQL } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { DB, TenantDb } from '../../db/db.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { newKioskToken, parseKioskToken, secretMatches } from './kiosk-tokens.js';

export interface KioskIdentity {
  tenantId: string;
  kioskId: string;
}

/** How often a kiosk's "last seen" is written; every request would be a write per tap. */
const SEEN_EVERY_MS = 60_000;

/** HR's kiosks, and checking the device token each kiosk sends. */
@Injectable()
export class KiosksService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
  ) {}

  list(): Promise<KioskView[]> {
    return this.tenantDb.run((tx) => this.views(tx));
  }

  /** The token is shown once; only its secret's hash is kept. */
  create(actor: AuthUser, input: KioskInput): Promise<KioskCreated> {
    return this.tenantDb.run(async (tx) => {
      const [location] = await tx
        .select({ id: locations.id })
        .from(locations)
        .where(eq(locations.id, input.locationId));
      if (!location) throw badRequest('location_not_found', 'Choose a site of this workspace');
      const id = randomUUID();
      const secret = newKioskToken(currentTenantId(), id);
      await tx.insert(kiosks).values({
        id,
        tenantId: currentTenantId(),
        locationId: input.locationId,
        name: input.name,
        tokenPrefix: secret.tokenPrefix,
        secretHash: secret.secretHash,
        createdBy: actor.id,
      });
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'kiosk.create',
        entityType: 'kiosk',
        entityId: id,
        after: input,
      });
      const [view] = await this.views(tx, eq(kiosks.id, id));
      return { ...view!, token: secret.token };
    });
  }

  revoke(actor: AuthUser, id: string): Promise<KioskView> {
    return this.tenantDb.run(async (tx) => {
      const [row] = await tx
        .update(kiosks)
        .set({ revokedAt: new Date() })
        .where(and(eq(kiosks.id, id), isNull(kiosks.revokedAt)))
        .returning({ id: kiosks.id });
      if (!row) throw new NotFoundException('Kiosk not found or already revoked');
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'kiosk.revoke',
        entityType: 'kiosk',
        entityId: id,
      });
      const [view] = await this.views(tx, eq(kiosks.id, id));
      return view!;
    });
  }

  /** Checks a device token; null when it is malformed, unknown or revoked. */
  async authenticate(token: string): Promise<KioskIdentity | null> {
    const parsed = parseKioskToken(token);
    if (!parsed) return null;
    const [kiosk] = await runAsTenant(this.db, parsed.tenantId, (tx) =>
      tx
        .select({ secretHash: kiosks.secretHash, revokedAt: kiosks.revokedAt })
        .from(kiosks)
        .where(eq(kiosks.id, parsed.kioskId)),
    );
    if (!kiosk || kiosk.revokedAt || !secretMatches(kiosk.secretHash, parsed.secret)) return null;
    return { tenantId: parsed.tenantId, kioskId: parsed.kioskId };
  }

  async seen(kiosk: KioskIdentity): Promise<void> {
    const now = new Date();
    await runAsTenant(this.db, kiosk.tenantId, (tx) =>
      tx
        .update(kiosks)
        .set({ lastSeenAt: now })
        .where(
          and(
            eq(kiosks.id, kiosk.kioskId),
            or(
              isNull(kiosks.lastSeenAt),
              lt(kiosks.lastSeenAt, new Date(now.getTime() - SEEN_EVERY_MS)),
            ),
          ),
        ),
    );
  }

  /** The kiosk itself, for its own screen. */
  async device(kiosk: KioskIdentity): Promise<KioskView> {
    const [view] = await runAsTenant(this.db, kiosk.tenantId, (tx) =>
      this.views(tx, eq(kiosks.id, kiosk.kioskId)),
    );
    if (!view) throw new NotFoundException('Kiosk not found');
    return view;
  }

  private async views(tx: Tx, where?: SQL): Promise<KioskView[]> {
    const rows = await tx
      .select({ kiosk: kiosks, location: { id: locations.id, name: locations.name } })
      .from(kiosks)
      .leftJoin(locations, eq(locations.id, kiosks.locationId))
      .where(where)
      .orderBy(asc(kiosks.createdAt));
    return rows.map(({ kiosk: k, location }) => ({
      id: k.id,
      name: k.name,
      location,
      tokenPrefix: k.tokenPrefix,
      lastSeenAt: k.lastSeenAt?.toISOString() ?? null,
      revokedAt: k.revokedAt?.toISOString() ?? null,
      createdAt: k.createdAt.toISOString(),
    }));
  }
}
