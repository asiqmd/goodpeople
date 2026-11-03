import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { anomalyFindings, type FieldCipher, type Tx } from '@gp/db';
import {
  ANOMALY_VERSION,
  anomalyDefinitionSchema,
  type AnomalyCatalog,
  type AnomalyDefinition,
  type AnomalyEvidence,
  type AnomalyFinding,
  type AnomalyInbox,
  type AnomalyReview,
  type TenantWithAccess,
} from '@gp/shared';
import { randomUUID } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, conflict, forbidden } from '../../common/errors.js';
import { RateLimiter } from '../../common/rate-limit.js';
import { FIELD_CIPHER, TenantDb } from '../../db/db.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { AnomalyDetector, latestReviewMonth } from './anomaly-detector.js';
import { assertInsightActor, InsightsService } from './insights.service.js';

type Finding = typeof anomalyFindings.$inferSelect;
type Actor = Extract<AuthUser, { kind: 'tenant' }>;
const scopeKey = (definition: AnomalyDefinition) =>
  'companyId' in definition ? definition.companyId : 'workspace';
const historyPageSize = 20;

const definitionOf = (row: Finding) =>
  anomalyDefinitionSchema.parse({
    rule: row.rule,
    month: row.month,
    ...(row.scopeKey === 'workspace' ? {} : { companyId: row.scopeKey }),
  });

const sameScope = (definition: AnomalyDefinition) =>
  and(
    eq(anomalyFindings.rule, definition.rule),
    eq(anomalyFindings.month, definition.month),
    eq(anomalyFindings.scopeKey, scopeKey(definition)),
  );

const canReleaseOthers = (actor: Actor) => actor.role === 'tenant_admin' && !actor.policy?.custom;

@Injectable()
export class AnomaliesService {
  constructor(
    private readonly db: TenantDb,
    private readonly insights: InsightsService,
    private readonly detector: AnomalyDetector,
    private readonly audit: TenantAuditService,
    private readonly limiter: RateLimiter,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
  ) {}

  private async access(tx: Tx, actor: Actor, tenant: TenantWithAccess) {
    if (!tenant.access.features.includes('anomaly_review'))
      throw forbidden('anomaly_feature', 'Anomaly review is unavailable for this workspace');
    const access = await this.insights.authority(tx, actor, tenant);
    return {
      catalog: {
        latestMonth: latestReviewMonth(),
        assignmentCoverage: access.workforceGlobal && access.legacyBd,
        payrollMovement: access.payroll && access.legacyBd,
        companies: access.bdAttendanceCompanies,
      } satisfies AnomalyCatalog,
      canReview: access.canReview,
    };
  }

  private async authorize(
    tx: Tx,
    actor: Actor,
    tenant: TenantWithAccess,
    definition: AnomalyDefinition,
    write = false,
  ) {
    const { catalog, canReview } = await this.access(tx, actor, tenant);
    if (definition.month > catalog.latestMonth)
      throw badRequest('anomaly_month', 'Choose a completed month');
    const allowed =
      'companyId' in definition
        ? catalog.companies.some((company) => company.id === definition.companyId)
        : definition.rule === 'assignment_coverage'
          ? catalog.assignmentCoverage
          : catalog.payrollMovement;
    if (!allowed) throw new NotFoundException('Anomaly scope not found');
    const review = canReview('companyId' in definition ? definition.companyId : undefined);
    if (write && (!review || tenant.access.accessState !== 'full'))
      throw forbidden('anomaly_review_scope', 'This scope requires anomaly review permission');
    return review && tenant.access.accessState === 'full';
  }

  private async reserve(actor: Actor) {
    await this.limiter.hit('anomaly:actor:' + actor.tenantId + ':' + actor.id, 20, 60_000);
    await this.limiter.hit('anomaly:tenant:' + actor.tenantId, 80, 60_000);
  }

  private async lock(tx: Tx, actor: Actor, definition: AnomalyDefinition) {
    const key = [
      'anomaly',
      actor.tenantId,
      definition.rule,
      scopeKey(definition),
      definition.month,
    ];
    const result = await tx.execute<{ acquired: boolean }>(
      sql`select pg_try_advisory_xact_lock(hashtextextended(${key.join(':')}, 0)) as acquired`,
    );
    if (!result.rows[0]?.acquired)
      throw conflict('anomaly_busy', 'This check is in progress; retry');
  }

  private async write<T>(run: (tx: Tx) => Promise<T>) {
    try {
      return await this.db.run(run, true);
    } catch (error) {
      const e = error as { code?: string; cause?: { code?: string } };
      if (['40001', '23505'].includes(e.cause?.code ?? e.code ?? ''))
        throw conflict('anomaly_busy', 'The review changed; refresh and retry');
      throw error;
    }
  }

  private seal(value: unknown, row: Pick<Finding, 'tenantId' | 'id'>, purpose: string) {
    return this.cipher
      .encryptBytes(Buffer.from(JSON.stringify(value)), {
        tenantId: row.tenantId,
        purpose: 'anomaly:' + row.id + ':' + purpose,
      })
      .toString('base64');
  }

  private open<T>(value: string, row: Finding, purpose: string): T {
    return JSON.parse(
      this.cipher
        .decryptBytes(Buffer.from(value, 'base64'), {
          tenantId: row.tenantId,
          purpose: 'anomaly:' + row.id + ':' + purpose,
        })
        .toString('utf8'),
    ) as T;
  }

  private finding(row: Finding, actor: Actor): AnomalyFinding {
    return {
      id: row.id,
      definition: definitionOf(row),
      version: row.version,
      sourceVersion: row.sourceVersion,
      sourceRevision: row.sourceRevision,
      measuredAt: row.measuredAt.toISOString(),
      evidence: this.open<AnomalyEvidence>(row.evidenceEnc, row, 'evidence'),
      status: row.status,
      ownedByMe: row.assigneeId === actor.id,
      supersededAt: row.supersededAt?.toISOString() ?? null,
      reason: row.reasonEnc ? this.open<string>(row.reasonEnc, row, 'reason') : null,
      resolution:
        row.resolvedAt && row.resolutionRevision
          ? { sourceRevision: row.resolutionRevision, measuredAt: row.resolvedAt.toISOString() }
          : null,
    };
  }

  private record(tx: Tx, actor: Actor, action: string, after: Finding, before?: Finding) {
    const summary = (row: Finding) => ({
      status: row.status,
      assigneeId: row.assigneeId,
      supersededAt: row.supersededAt,
      resolvedAt: row.resolvedAt,
    });
    return this.audit.record(tx, {
      actorUserId: actor.id,
      action: 'anomaly.' + action,
      entityType: 'anomaly_finding',
      entityId: after.id,
      before: before && summary(before),
      after: summary(after),
    });
  }

  catalog(user: AuthUser, tenant: TenantWithAccess): Promise<AnomalyCatalog> {
    assertInsightActor(user);
    return this.db.run(async (tx) => (await this.access(tx, user, tenant)).catalog, true);
  }

  inbox(
    user: AuthUser,
    tenant: TenantWithAccess,
    definition: AnomalyDefinition,
    before?: string,
  ): Promise<AnomalyInbox> {
    assertInsightActor(user);
    return this.db.run(async (tx) => {
      const canReview = await this.authorize(tx, user, tenant, definition);
      const filter = sameScope(definition);
      const [cursor] = before
        ? await tx
            .select()
            .from(anomalyFindings)
            .where(and(filter, eq(anomalyFindings.id, before)))
        : [];
      if (before && !cursor) throw new NotFoundException('Anomaly page not found');
      const rows = await tx
        .select()
        .from(anomalyFindings)
        .where(
          and(
            filter,
            cursor
              ? sql`((${anomalyFindings.supersededAt} is null), ${anomalyFindings.measuredAt}, ${anomalyFindings.id})
                < (${cursor.supersededAt === null}, ${cursor.measuredAt}::timestamptz, ${cursor.id}::uuid)`
              : undefined,
          ),
        )
        .orderBy(
          sql`(${anomalyFindings.supersededAt} is null) desc`,
          desc(anomalyFindings.measuredAt),
          desc(anomalyFindings.id),
        )
        .limit(historyPageSize + 1);
      return {
        canReview,
        canRelease: canReview && canReleaseOthers(user),
        findings: rows.slice(0, historyPageSize).map((row) => this.finding(row, user)),
        next: rows.length > historyPageSize ? rows[historyPageSize - 1]!.id : null,
      };
    }, true);
  }

  async scan(user: AuthUser, tenant: TenantWithAccess, definition: AnomalyDefinition) {
    assertInsightActor(user);
    return this.write(async (tx) => {
      await this.authorize(tx, user, tenant, definition, true);
      await this.reserve(user);
      await this.lock(tx, user, definition);
      const filter = sameScope(definition);
      const evaluation = await this.detector.evaluate(tx, user, definition);
      const [current] = await tx
        .select()
        .from(anomalyFindings)
        .where(and(filter, isNull(anomalyFindings.supersededAt)))
        .for('update');
      if (
        current &&
        evaluation.state === 'detected' &&
        current.version === evaluation.version &&
        current.sourceRevision === evaluation.sourceRevision
      )
        return { evaluation, findingId: current.id };

      if (current) {
        const [superseded] = await tx
          .update(anomalyFindings)
          .set({ supersededAt: new Date(evaluation.measuredAt) })
          .where(eq(anomalyFindings.id, current.id))
          .returning();
        await this.record(tx, user, 'supersede', superseded!, current);
      }
      if (evaluation.state !== 'detected') return { evaluation, findingId: null };

      const [existing] = await tx
        .select()
        .from(anomalyFindings)
        .where(
          and(
            filter,
            eq(anomalyFindings.version, evaluation.version),
            eq(anomalyFindings.sourceRevision, evaluation.sourceRevision),
          ),
        );
      if (existing) {
        // The same evidence can recur after a correction. Preserve the finding ID and
        // audit history, and send a previously resolved finding back for human review.
        const [revived] = await tx
          .update(anomalyFindings)
          .set({
            supersededAt: null,
            ...(existing.status === 'resolved'
              ? {
                  status: 'open' as const,
                  assigneeId: null,
                  resolutionRevision: null,
                  resolvedAt: null,
                }
              : {}),
          })
          .where(eq(anomalyFindings.id, existing.id))
          .returning();
        await this.record(tx, user, 'recur', revived!, existing);
        return { evaluation, findingId: existing.id };
      }

      const identity = { id: randomUUID(), tenantId: user.tenantId };
      const [created] = await tx
        .insert(anomalyFindings)
        .values({
          ...identity,
          rule: definition.rule,
          month: definition.month,
          scopeKey: scopeKey(definition),
          version: evaluation.version,
          sourceVersion: evaluation.sourceVersion,
          sourceRevision: evaluation.sourceRevision,
          measuredAt: new Date(evaluation.measuredAt),
          evidenceEnc: this.seal(evaluation.evidence, identity, 'evidence'),
        })
        .returning();
      await this.record(tx, user, 'detect', created!);
      return { evaluation, findingId: identity.id };
    });
  }

  review(user: AuthUser, tenant: TenantWithAccess, id: string, review: AnomalyReview) {
    assertInsightActor(user);
    return this.write(async (tx) => {
      const [found] = await tx.select().from(anomalyFindings).where(eq(anomalyFindings.id, id));
      if (!found) throw new NotFoundException('Finding not found');
      const definition = definitionOf(found);
      await this.authorize(tx, user, tenant, definition, true);
      await this.reserve(user);
      await this.lock(tx, user, definition);
      const [row] = await tx
        .select()
        .from(anomalyFindings)
        .where(eq(anomalyFindings.id, id))
        .for('update');
      if (!row) throw new NotFoundException('Finding not found');
      const { action } = review;
      const activeReview = row.status === 'assigned' || row.status === 'acknowledged';
      if (action === 'claim' ? row.status !== 'open' : !activeReview)
        throw conflict('anomaly_status', 'The finding cannot move from its current review state');
      if (
        action !== 'claim' &&
        row.assigneeId !== user.id &&
        !(action === 'release' && canReleaseOthers(user))
      )
        throw forbidden('anomaly_owner', 'This action requires the assigned reviewer');
      if (action === 'acknowledge' && row.status !== 'assigned')
        throw conflict('anomaly_status', 'This finding is already acknowledged');

      const change: Partial<Finding> = {};
      if (action === 'release') {
        change.status = 'open';
        change.assigneeId = null;
      } else {
        const result = await this.detector.evaluate(tx, user, definition);
        const stillCurrent =
          !row.supersededAt &&
          result.state === 'detected' &&
          row.version === ANOMALY_VERSION &&
          row.sourceRevision === result.sourceRevision;
        const corrected = result.state === 'clear';
        if (action === 'resolve') {
          if (!corrected)
            throw conflict(
              'anomaly_correction',
              'A new source check must show the finding is corrected',
            );
          change.status = 'resolved';
          change.resolvedAt = new Date(result.measuredAt);
          change.resolutionRevision = result.sourceRevision;
          change.supersededAt = row.supersededAt ?? change.resolvedAt;
        } else if (action === 'claim' && (stillCurrent || corrected)) {
          change.status = 'assigned';
          change.assigneeId = user.id;
          if (corrected) change.supersededAt = row.supersededAt ?? new Date(result.measuredAt);
        } else if (stillCurrent && action === 'acknowledge') {
          change.status = 'acknowledged';
        } else if (stillCurrent && action === 'dismiss') {
          change.status = 'dismissed';
          change.reasonEnc = this.seal(review.reason, row, 'reason');
        } else {
          throw conflict('anomaly_stale', 'The source evidence changed; run the check again');
        }
      }
      const [updated] = await tx
        .update(anomalyFindings)
        .set(change)
        .where(eq(anomalyFindings.id, row.id))
        .returning();
      await this.record(tx, user, action, updated!, row);
      return this.finding(updated!, user);
    });
  }
}
