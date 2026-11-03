import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import {
  authSessions,
  authProofs,
  CIPHER_FIELDS,
  externalIdentities,
  identityConnections,
  runAsTenant,
  scimUsers,
  tenants,
  tenantUsers,
  type Database,
  type FieldCipher,
} from '@gp/db';
import { and, eq, isNull, lt } from 'drizzle-orm';
import * as oidc from 'openid-client';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, forbidden } from '../../common/errors.js';
import { RateLimiter } from '../../common/rate-limit.js';
import { runInTenantContext } from '../../common/request-context.js';
import { SecurityState } from '../../common/security-state.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { DB, FIELD_CIPHER } from '../../db/db.module.js';
import { AuthService, type TenantLoginResult } from '../auth/auth.service.js';
import { identityAdmin, identityEvent } from './identity.service.js';
import { oidcFetch } from './oidc-network.js';

type Connection = typeof identityConnections.$inferSelect;
interface Flow {
  id: string;
  tenantId: string;
  connectionId: string;
  fingerprint: string;
  verifier: string;
  nonce: string;
  binding: string;
  client: 'web' | 'mobile';
  linkUserId?: string;
  localSessionId?: string;
  test: boolean;
}
type Completion = { result: TenantLoginResult } | { linked: true; test: boolean };
export const bindingHash = (value: string) =>
  createHash('sha256').update(value).digest('base64url');
const TTL = 5 * 60_000;
const failed = () =>
  new UnauthorizedException('Single sign-on could not be completed; start again');
@Injectable()
export class OidcService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly state: SecurityState,
    private readonly limiter: RateLimiter,
    private readonly auth: AuthService,
  ) {}
  webOrigin() {
    return this.config.WEB_ORIGIN.replace(/\/$/, '');
  }
  async startForUser(
    actor: AuthUser,
    binding: string,
    ip: string,
    connectionId?: string,
    test = false,
  ) {
    if (actor.kind !== 'tenant') throw failed();
    const [tenant] = await this.db
      .select({ slug: tenants.slug })
      .from(tenants)
      .where(eq(tenants.id, actor.tenantId));
    if (!tenant) throw failed();
    return this.start(
      { tenant: tenant.slug, binding, client: 'web' },
      ip,
      actor,
      connectionId,
      test,
    );
  }
  async accountStatus(actor: AuthUser) {
    if (actor.kind !== 'tenant') return { available: false, linked: false };
    return runAsTenant(this.db, actor.tenantId, async (tx) => {
      const connections = await tx
        .select({ id: identityConnections.id })
        .from(identityConnections)
        .where(eq(identityConnections.enabled, true));
      const linked = await tx
        .select({ id: externalIdentities.id })
        .from(externalIdentities)
        .where(eq(externalIdentities.userId, actor.id));
      return { available: connections.length > 0, linked: linked.length > 0 };
    });
  }
  callback() {
    return new URL('/auth/sso/callback', this.config.API_ORIGIN).href;
  }
  async start(
    input: { tenant: string; binding: string; client: 'web' | 'mobile' },
    ip: string,
    actor?: AuthUser,
    connectionId?: string,
    test = false,
  ) {
    await this.limiter.hit(`sso-start:${ip}`, 30, 60_000);
    if (!/^[A-Za-z0-9_-]{43}$/.test(input.binding))
      throw badRequest('invalid_binding', 'A browser or app binding is required');
    if (test && actor) identityAdmin(actor);
    const [tenant] = await this.db.select().from(tenants).where(eq(tenants.slug, input.tenant));
    if (
      !tenant ||
      tenant.status === 'suspended' ||
      tenant.status === 'archived' ||
      (actor?.kind === 'tenant' && actor.tenantId !== tenant.id)
    )
      throw failed();
    const connection = await runAsTenant(this.db, tenant.id, async (tx) => {
      const [row] = await tx
        .select()
        .from(identityConnections)
        .where(
          and(
            eq(identityConnections.enabled, true),
            connectionId ? eq(identityConnections.id, connectionId) : undefined,
          ),
        )
        .orderBy(identityConnections.createdAt)
        .limit(1);
      return row;
    });
    if (!connection) throw failed();
    if (actor) {
      if (actor.kind !== 'tenant' || actor.role === 'support' || !actor.sessionId) throw failed();
      const [session] = await this.db
        .select()
        .from(authSessions)
        .where(eq(authSessions.id, actor.sessionId));
      if (
        !session ||
        session.revokedAt ||
        (Date.now() - session.authenticatedAt.getTime() > TTL &&
          (!actor.mfaAt || Date.now() - actor.mfaAt.getTime() > TTL))
      )
        throw forbidden(
          'recent_auth_required',
          'Sign in again or confirm MFA before linking accounts',
        );
    }
    const client = await this.client(connection);
    const state = oidc.randomState(),
      flow: Flow = {
        id: randomBytes(24).toString('base64url'),
        tenantId: tenant.id,
        connectionId: connection.id,
        fingerprint: this.fingerprint(connection),
        verifier: oidc.randomPKCECodeVerifier(),
        nonce: oidc.randomNonce(),
        binding: input.binding,
        client: input.client,
        linkUserId: actor?.id,
        localSessionId: actor?.sessionId,
        test,
      };
    await this.state.put(`sso:flow:${state}`, flow, TTL);
    const url = oidc.buildAuthorizationUrl(client, {
      response_type: 'code',
      scope: 'openid profile',
      redirect_uri: this.callback(),
      state,
      nonce: flow.nonce,
      code_challenge: await oidc.calculatePKCECodeChallenge(flow.verifier),
      code_challenge_method: 'S256',
      prompt: test ? 'login' : 'select_account',
    });
    return { url: url.href, flowId: flow.id, expiresInSeconds: TTL / 1000 };
  }
  async complete(
    parameters: Record<string, unknown>,
  ): Promise<{ flowId: string; client: 'web' | 'mobile' }> {
    if (typeof parameters.state !== 'string') throw failed();
    const flow = await this.state.take<Flow>(`sso:flow:${parameters.state}`);
    if (!flow) throw failed();
    try {
      const [connection] = await runAsTenant(this.db, flow.tenantId, (tx) =>
        tx.select().from(identityConnections).where(eq(identityConnections.id, flow.connectionId)),
      );
      if (!connection?.enabled || this.fingerprint(connection) !== flow.fingerprint) throw failed();
      const client = await this.client(connection),
        url = new URL(this.callback());
      for (const [k, v] of Object.entries(parameters)) {
        if (typeof v !== 'string') throw failed();
        url.searchParams.set(k, v);
      }
      const tokens = await oidc.authorizationCodeGrant(client, url, {
        expectedState: parameters.state,
        expectedNonce: flow.nonce,
        pkceCodeVerifier: flow.verifier,
        idTokenExpected: true,
      });
      const claims = tokens.claims();
      if (!claims?.sub || claims.iss !== connection.issuer) throw failed();
      const userId = await runInTenantContext(flow.tenantId, () =>
        runAsTenant(this.db, flow.tenantId, async (tx) => {
          const [current] = await tx
            .select()
            .from(identityConnections)
            .where(eq(identityConnections.id, flow.connectionId))
            .for('share');
          if (!current?.enabled || this.fingerprint(current) !== flow.fingerprint) throw failed();
          const [existing] = await tx
            .select()
            .from(externalIdentities)
            .where(
              and(
                eq(externalIdentities.connectionId, connection.id),
                eq(externalIdentities.issuer, claims.iss),
                eq(externalIdentities.subject, claims.sub),
              ),
            );
          let id = existing?.userId;
          if (flow.linkUserId) {
            const [user] = await tx
              .select()
              .from(tenantUsers)
              .where(eq(tenantUsers.id, flow.linkUserId))
              .for('update');
            const [candidate] = await tx
              .select()
              .from(authSessions)
              .where(eq(authSessions.id, flow.localSessionId!));
            const [family] = candidate
              ? await tx
                  .select()
                  .from(authSessions)
                  .where(eq(authSessions.id, candidate.familyId))
                  .for('share')
              : [];
            const [session] = await tx
              .select()
              .from(authSessions)
              .where(eq(authSessions.id, flow.localSessionId!))
              .for('share');
            if (
              !family ||
              family.familyRevokedAt ||
              !session ||
              session.revokedAt ||
              session.expiresAt.getTime() <= Date.now() ||
              session.subjectId !== flow.linkUserId ||
              session.tenantId !== flow.tenantId ||
              !user ||
              user.disabledAt ||
              user.provisionDisabled ||
              user.role === 'support'
            )
              throw failed();
            if (
              flow.test &&
              (user.role !== 'tenant_admin' ||
                !session.mfaAt ||
                Date.now() - session.mfaAt.getTime() > TTL)
            )
              throw failed();
            if (existing && existing.userId !== flow.linkUserId) throw failed();
            const [linked] = await tx
              .select()
              .from(externalIdentities)
              .where(
                and(
                  eq(externalIdentities.connectionId, connection.id),
                  eq(externalIdentities.userId, flow.linkUserId),
                ),
              );
            if (linked && linked.subject !== claims.sub)
              throw forbidden(
                'identity_already_linked',
                'This login is already linked to another identity',
              );
            id = flow.linkUserId;
          }
          if (!id) {
            // An explicit SCIM externalId binding is the only automatic link. Never email.
            const claim = connection.provisioningClaim === 'oid' ? claims.oid : claims.sub;
            if (typeof claim !== 'string' || !claim) throw failed();
            const [managed] = await tx
              .select()
              .from(scimUsers)
              .where(
                and(
                  eq(scimUsers.connectionId, connection.id),
                  eq(scimUsers.externalId, claim),
                  eq(scimUsers.active, true),
                  isNull(scimUsers.deletedAt),
                ),
              )
              .for('update');
            if (!managed) throw failed();
            id = managed.userId;
            const [user] = await tx
              .select()
              .from(tenantUsers)
              .where(eq(tenantUsers.id, id))
              .for('share');
            if (
              !user ||
              user.disabledAt ||
              user.provisionDisabled ||
              user.role !== 'employee' ||
              user.emergencyLocal
            )
              throw failed();
          }
          if (!existing)
            await tx.insert(externalIdentities).values({
              tenantId: flow.tenantId,
              connectionId: connection.id,
              issuer: claims.iss,
              subject: claims.sub,
              userId: id,
            });
          if (flow.test) {
            const first = current.testedBy ?? id;
            await tx
              .update(identityConnections)
              .set({
                testedBy: first,
                secondTestBy: first !== id ? id : current.secondTestBy,
                testedAt: new Date(),
              })
              .where(eq(identityConnections.id, current.id));
          }
          await identityEvent(
            tx,
            id,
            'user',
            flow.linkUserId ? 'identity.linked' : 'identity.sso_verified',
            connection.id,
            { test: flow.test },
          );
          return id;
        }),
      );
      const completion: Completion =
        flow.linkUserId && flow.test
          ? { linked: true, test: flow.test }
          : { result: await this.auth.finishFederated(flow.tenantId, userId, connection.id) };
      await this.state.put(`sso:result:${flow.id}:${flow.binding}`, completion, 60_000);
      return { flowId: flow.id, client: flow.client };
    } catch {
      throw failed();
    }
  }
  async exchange(flowId: string, verifier: string, ip: string): Promise<Completion | undefined> {
    await this.limiter.hit(`sso-exchange:${ip}:${flowId}`, 60, 60_000);
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(verifier) || !/^[A-Za-z0-9_-]{32}$/.test(flowId))
      throw failed();
    const result = await this.state.take<Completion>(
      `sso:result:${flowId}:${bindingHash(verifier)}`,
    );
    if (!result) return undefined;
    await this.db.delete(authProofs).where(lt(authProofs.expiresAt, new Date()));
    const used = await this.db
      .insert(authProofs)
      .values({
        hash: bindingHash(`sso-handoff:${flowId}`),
        kind: 'sso-handoff',
        expiresAt: new Date(Date.now() + TTL),
      })
      .onConflictDoNothing()
      .returning();
    if (!used.length) throw failed();
    return result;
  }
  private fingerprint(c: Connection) {
    return bindingHash([c.issuer, c.clientId, c.clientSecretEnc, c.provisioningClaim].join('\n'));
  }
  private async client(c: Connection) {
    const secret = this.cipher.decrypt(c.clientSecretEnc, {
      tenantId: c.tenantId,
      field: CIPHER_FIELDS.oidcSecret,
    });
    const insecure = process.env.NODE_ENV !== 'production';
    const fetch = oidcFetch(this.config.OIDC_PRIVATE_HOSTS, insecure);
    const config = await oidc.discovery(
      new URL(c.issuer),
      c.clientId,
      { id_token_signed_response_alg: 'RS256' },
      oidc.ClientSecretPost(secret),
      {
        [oidc.customFetch]: fetch,
        timeout: 5,
        execute: [
          ...(insecure ? [oidc.allowInsecureRequests] : []),
          oidc.enableNonRepudiationChecks,
        ],
      },
    );
    if (config.serverMetadata().issuer !== c.issuer) throw failed();
    if (
      config.serverMetadata().code_challenge_methods_supported &&
      !config.serverMetadata().code_challenge_methods_supported?.includes('S256')
    )
      throw badRequest('pkce_required', 'The identity provider must support S256 PKCE');
    return config;
  }
}
