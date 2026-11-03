import { MfaService } from '../auth/mfa.service.js';
import { RateLimiter } from '../../common/rate-limit.js';
import { authSessions } from '@gp/db';
import {
  Inject,
  Injectable,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { tenantPlacements, tenants, plans, platformAuditLog, type Database } from '@gp/db';
import { type PlacementInput } from '@gp/shared';
import { and, eq, desc } from 'drizzle-orm';
import { createPublicKey, createHash, randomUUID, verify } from 'node:crypto';
import { z } from 'zod';
import { DB } from '../../db/db.module.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import type { AuthUser } from '../../common/auth-user.js';
const receiptSchema = z
  .object({
    customer_id: z.string().min(2).max(100),
    mode: z.literal('dedicated'),
    installation_id: z.uuid(),
    tenant_id: z.uuid(),
    challenge: z.uuid(),
    api_origin: z.url(),
    web_origin: z.url(),
    license_id: z.uuid(),
    release: z.string().max(80),
    issued_at: z.iso.datetime(),
    expires_at: z.iso.datetime(),
    database_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
@Injectable()
export class PlacementsService {
  constructor(
    @Inject(DB) private db: Database,
    @Inject(APP_CONFIG) private config: AppConfig,
    private mfa: MfaService,
    private limiter: RateLimiter,
  ) {}
  private admin(actor: AuthUser, recent = true) {
    if (
      this.config.DEPLOYMENT_MODE !== 'managed' ||
      actor.kind !== 'platform' ||
      actor.role !== 'super_admin'
    )
      throw new ForbiddenException('Placement registry requires control-plane administration');
    if (recent && (!actor.mfaAt || Date.now() - actor.mfaAt.getTime() > 300000))
      throw new ForbiddenException({
        code: 'recent_mfa_required',
        message: 'Confirm MFA before changing placement',
      });
  }
  async stepUp(actor: AuthUser, code: string) {
    this.admin(actor, false);
    if (!actor.sessionId) throw new ForbiddenException('A current session is required');
    await this.limiter.hit('placement-step-up:' + actor.id, 5, 900000);
    if (!(await this.mfa.check({ kind: 'platform', id: actor.id }, code)))
      throw new ForbiddenException('Invalid authenticator code');
    await this.db
      .update(authSessions)
      .set({ mfaAt: new Date() })
      .where(eq(authSessions.id, actor.sessionId));
    return { confirmed: true };
  }
  private origin(raw: string) {
    const url = new URL(raw);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    )
      throw new BadRequestException('Use an HTTPS origin without credentials or paths');
    return url.origin;
  }
  async list(actor: AuthUser) {
    this.admin(actor, false);
    return this.db
      .select({
        id: tenantPlacements.id,
        tenantId: tenantPlacements.tenantId,
        installationId: tenantPlacements.installationId,
        region: tenantPlacements.region,
        routeKey: tenantPlacements.routeKey,
        webOrigin: tenantPlacements.webOrigin,
        apiOrigin: tenantPlacements.apiOrigin,
        status: tenantPlacements.status,
        version: tenantPlacements.version,
        residency: tenantPlacements.residency,
      })
      .from(tenantPlacements)
      .orderBy(desc(tenantPlacements.createdAt));
  }
  async create(actor: AuthUser, input: PlacementInput) {
    this.admin(actor);
    const apiOrigin = this.origin(input.apiOrigin),
      webOrigin = this.origin(input.webOrigin);
    try {
      if (createPublicKey(input.proofPublicKey).asymmetricKeyType !== 'ed25519') throw new Error();
    } catch {
      throw new BadRequestException('Use an Ed25519 installation proof public key');
    }
    return this.db.transaction(async (tx) => {
      const [plan] = await tx.select().from(plans).where(eq(plans.code, 'enterprise'));
      if (!plan) throw new ConflictException('Enterprise catalogue missing');
      const [tenant] = await tx
        .insert(tenants)
        .values({
          name: input.name,
          slug: input.slug,
          industryTemplate: 'corporate',
          status: 'suspended',
          billingMode: 'license',
          planId: plan.id,
          bypassReason: 'Dedicated placement control-plane metadata; no business provisioning',
        })
        .returning();
      const [placement] = await tx
        .insert(tenantPlacements)
        .values({
          tenantId: tenant!.id,
          installationId: input.installationId,
          customerId: input.customerId,
          region: input.region,
          routeKey: input.routeKey,
          apiOrigin,
          webOrigin,
          proofPublicKey: input.proofPublicKey,
          challenge: randomUUID(),
          challengeExpiresAt: new Date(Date.now() + 1200000),
          residency: input.residency,
        })
        .returning();
      await tx.insert(platformAuditLog).values({
        actorId: actor.id,
        tenantId: tenant!.id,
        action: 'placement.create',
        reason: input.reason,
        after: {
          installationId: input.installationId,
          routeKey: input.routeKey,
          proofKeyFingerprint: createHash('sha256').update(input.proofPublicKey).digest('hex'),
        },
      });
      return {
        id: placement!.id,
        tenantId: tenant!.id,
        installationId: input.installationId,
        challenge: placement!.challenge,
        challengeExpiresAt: placement!.challengeExpiresAt,
      };
    });
  }
  async challenge(actor: AuthUser, id: string, reason: string) {
    this.admin(actor);
    return this.db.transaction(async (tx) => {
      const [p] = await tx
        .select()
        .from(tenantPlacements)
        .where(eq(tenantPlacements.id, id))
        .for('update');
      if (!p || p.status === 'active')
        throw new ConflictException('Only a pending or disabled placement can request a challenge');
      const challenge = randomUUID(),
        expiresAt = new Date(Date.now() + 1200000);
      await tx
        .update(tenantPlacements)
        .set({
          challenge,
          challengeExpiresAt: expiresAt,
          version: p.version + 1,
          status: 'provisioning',
        })
        .where(eq(tenantPlacements.id, id));
      await tx
        .insert(platformAuditLog)
        .values({ actorId: actor.id, tenantId: p.tenantId, action: 'placement.challenge', reason });
      return { challenge, expiresAt };
    });
  }
  async activate(actor: AuthUser, id: string, receipt: string, reason: string) {
    this.admin(actor);
    return this.db.transaction(async (tx) => {
      const [p] = await tx
        .select()
        .from(tenantPlacements)
        .where(eq(tenantPlacements.id, id))
        .for('update');
      if (!p || p.status !== 'provisioning' || p.challengeExpiresAt.getTime() <= Date.now())
        throw new ConflictException('Placement challenge is unavailable');
      let proof: z.infer<typeof receiptSchema>;
      try {
        const [prefix, payload, sig, ...extra] = receipt.split('.');
        if (
          prefix !== 'gpready1' ||
          extra.length ||
          !payload ||
          !sig ||
          !/^[a-zA-Z0-9_-]+$/.test(payload) ||
          !/^[a-zA-Z0-9_-]+$/.test(sig) ||
          Buffer.from(sig, 'base64url').length !== 64 ||
          !verify(
            null,
            Buffer.from(`${prefix}.${payload}`),
            createPublicKey(p.proofPublicKey),
            Buffer.from(sig, 'base64url'),
          )
        )
          throw new Error();
        proof = receiptSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
        if (
          proof.customer_id !== p.customerId ||
          proof.installation_id !== p.installationId ||
          proof.tenant_id !== p.tenantId ||
          proof.challenge !== p.challenge ||
          proof.web_origin !== p.webOrigin ||
          proof.api_origin !== p.apiOrigin ||
          Date.parse(proof.issued_at) > Date.now() + 30000 ||
          Date.parse(proof.expires_at) <= Date.now() ||
          Date.parse(proof.expires_at) <= Date.parse(proof.issued_at) ||
          Date.parse(proof.expires_at) - Date.parse(proof.issued_at) > 600000
        )
          throw new Error();
      } catch {
        throw new BadRequestException('Invalid installation readiness receipt');
      }
      await tx
        .update(tenantPlacements)
        .set({ status: 'active', receiptAccepted: true, version: p.version + 1 })
        .where(eq(tenantPlacements.id, id));
      await tx.insert(platformAuditLog).values({
        actorId: actor.id,
        tenantId: p.tenantId,
        action: 'placement.activate',
        reason,
        after: {
          installationId: p.installationId,
          licenseId: proof.license_id,
          release: proof.release,
          databaseFingerprint: proof.database_fingerprint,
        },
      });
      return { active: true };
    });
  }
  async disable(actor: AuthUser, id: string, reason: string) {
    this.admin(actor);
    return this.db.transaction(async (tx) => {
      const [p] = await tx
        .update(tenantPlacements)
        .set({ status: 'disabled' })
        .where(eq(tenantPlacements.id, id))
        .returning();
      if (!p) throw new ConflictException('Placement unavailable');
      await tx
        .insert(platformAuditLog)
        .values({ actorId: actor.id, tenantId: p.tenantId, action: 'placement.disable', reason });
      return { disabled: true };
    });
  }
  async route(slug: string) {
    if (this.config.DEPLOYMENT_MODE !== 'managed') return { kind: 'local' };
    const [p] = await this.db
      .select({ webOrigin: tenantPlacements.webOrigin, apiOrigin: tenantPlacements.apiOrigin })
      .from(tenantPlacements)
      .innerJoin(tenants, eq(tenants.id, tenantPlacements.tenantId))
      .where(and(eq(tenants.slug, slug), eq(tenantPlacements.status, 'active')));
    return p
      ? {
          kind: 'dedicated',
          webOrigin: this.origin(p.webOrigin),
          apiOrigin: this.origin(p.apiOrigin),
        }
      : { kind: 'local' };
  }
}
