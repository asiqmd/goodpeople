import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  authSessions,
  insightJobs,
  savedInsights,
  tenantUsers,
  type FieldCipher,
  type Tx,
} from '@gp/db';
import {
  INSIGHT_METRICS,
  INSIGHT_RETENTION_MS,
  INSIGHT_VERSION,
  insightDefinitionSchema,
  type InsightDefinition,
  type InsightJob,
  type InsightView,
  type SavedInsight,
  type TenantWithAccess,
} from '@gp/shared';
import { and, asc, desc, eq, gt, isNull, lte, sql } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, conflict, forbidden } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { FIELD_CIPHER, TenantDb } from '../../db/db.module.js';
import { tenantSessionPolicy } from '../auth/tenant-session-policy.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import { csv } from '../payroll/disbursement.js';
import { assertInsightActor, InsightsService, isInsightDenied } from './insights.service.js';

type JobRow = typeof insightJobs.$inferSelect;
type Actor = Extract<AuthUser, { kind: 'tenant' }>;
const REPORT_LIMIT = 20;
const TENANT_JOB_LIMIT = 100;
const OWNER_JOB_LIMIT = 10;

function reportOf(row: typeof savedInsights.$inferSelect): SavedInsight {
  if (row.version !== INSIGHT_VERSION)
    throw badRequest('insight_version', 'The saved definition is unavailable');
  return {
    id: row.id,
    definition: insightDefinitionSchema.parse(row.definition),
    version: row.version,
  };
}

function jobOf(
  row: Omit<JobRow, 'ciphertext' | 'scopeRevision' | 'resultRevision'>,
  user: Actor,
): InsightJob {
  return {
    id: row.id,
    reportId: row.reportId,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    status:
      row.expiresAt <= new Date()
        ? 'expired'
        : row.authRevision !== user.revision
          ? 'cancelled'
          : row.status,
  };
}

function renderCsv(view: InsightView) {
  return Buffer.from(
    csv([
      [
        'version',
        'report',
        'company_id',
        'month',
        'country',
        'currency',
        'metric',
        'value',
        'state',
        'issue',
        'time_zone',
        'data_as_of',
        'source_revision',
      ],
      ...view.points.flatMap((point) =>
        INSIGHT_METRICS[view.definition.kind].map((metric) => [
          view.version,
          view.definition.kind,
          'companyId' in view.definition ? view.definition.companyId : '',
          point.month,
          point.country ?? '',
          point.currency ?? '',
          metric,
          point.values[metric] ?? '',
          point.state,
          point.issue ?? '',
          view.timeZone ?? '',
          view.dataAsOf,
          view.sourceRevision,
        ]),
      ),
    ]),
    'utf8',
  );
}

@Injectable()
export class InsightJobsService {
  constructor(
    private readonly db: TenantDb,
    private readonly insights: InsightsService,
    private readonly entitlements: EntitlementsService,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
  ) {}

  list(user: AuthUser, tenant: TenantWithAccess) {
    assertInsightActor(user);
    return this.db.run(async (tx) => {
      const access = await this.insights.authority(tx, user, tenant);
      const rows = await tx
        .select()
        .from(savedInsights)
        .where(eq(savedInsights.ownerId, user.id))
        .orderBy(asc(savedInsights.id))
        .limit(REPORT_LIMIT);
      return rows.map(reportOf).filter((report) => {
        try {
          this.insights.authorize(access, user, report.definition);
          return true;
        } catch (error) {
          if (isInsightDenied(error)) return false;
          throw error;
        }
      });
    }, true);
  }

  save(user: AuthUser, tenant: TenantWithAccess, definition: InsightDefinition) {
    assertInsightActor(user);
    return this.db.run(async (tx) => {
      const access = await this.insights.authority(tx, user, tenant);
      this.insights.authorize(access, user, definition);
      await this.insights.window(tx, definition);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${user.id}, 62))`);
      const existing = await tx
        .select()
        .from(savedInsights)
        .where(eq(savedInsights.ownerId, user.id))
        .limit(REPORT_LIMIT);
      const match = existing.find(
        (row) =>
          row.version === INSIGHT_VERSION &&
          JSON.stringify(reportOf(row).definition) === JSON.stringify(definition),
      );
      if (match) return reportOf(match);
      if (existing.length >= REPORT_LIMIT)
        throw badRequest('insight_saved_limit', 'Remove a saved report before adding another');
      const [row] = await tx
        .insert(savedInsights)
        .values({ tenantId: user.tenantId, ownerId: user.id, definition, version: INSIGHT_VERSION })
        .returning();
      return reportOf(row!);
    });
  }

  remove(user: AuthUser, reportId: string) {
    assertInsightActor(user);
    return this.db.run(async (tx) => {
      const rows = await tx
        .delete(savedInsights)
        .where(and(eq(savedInsights.id, reportId), eq(savedInsights.ownerId, user.id)))
        .returning({ id: savedInsights.id });
      if (!rows.length) throw new NotFoundException('Saved report not found');
    });
  }

  private async owned(tx: Tx, user: Actor, reportId: string) {
    const [row] = await tx
      .select()
      .from(savedInsights)
      .where(and(eq(savedInsights.id, reportId), eq(savedInsights.ownerId, user.id)));
    if (!row) throw new NotFoundException('Saved report not found');
    return reportOf(row);
  }

  private async familyOf(tx: Tx, user: Actor) {
    const [session] = await tx
      .select({ familyId: authSessions.familyId })
      .from(authSessions)
      .where(
        and(
          eq(authSessions.id, user.sessionId!),
          eq(authSessions.subjectId, user.id),
          eq(authSessions.subjectKind, 'tenant'),
          eq(authSessions.tenantId, user.tenantId),
        ),
      );
    if (!session) throw new UnauthorizedException('Current session required');
    return session.familyId;
  }

  enqueue(user: AuthUser, tenant: TenantWithAccess, reportId: string, requestId: string) {
    assertInsightActor(user);
    return this.db.run(async (tx) => {
      const report = await this.owned(tx, user, reportId);
      const access = await this.insights.authority(tx, user, tenant);
      const scopeRevision = this.insights.authorize(access, user, report.definition, true);
      const familyId = await this.familyOf(tx, user);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${user.tenantId}, 63))`);
      const now = new Date();
      const [existing] = await tx
        .select({
          id: insightJobs.id,
          reportId: insightJobs.reportId,
          status: insightJobs.status,
          expiresAt: insightJobs.expiresAt,
          createdAt: insightJobs.createdAt,
          authRevision: insightJobs.authRevision,
          tenantId: insightJobs.tenantId,
          ownerId: insightJobs.ownerId,
          familyId: insightJobs.familyId,
        })
        .from(insightJobs)
        .where(and(eq(insightJobs.ownerId, user.id), eq(insightJobs.id, requestId)));
      if (existing) {
        if (
          existing.reportId !== report.id ||
          existing.familyId !== familyId ||
          existing.authRevision !== user.revision
        )
          throw conflict('insight_request_reuse', 'Use a new export request');
        return jobOf(existing, user);
      }
      const current = await tx
        .select({ owner: insightJobs.ownerId })
        .from(insightJobs)
        .where(gt(insightJobs.expiresAt, now))
        .limit(TENANT_JOB_LIMIT);
      if (
        current.length >= TENANT_JOB_LIMIT ||
        current.filter((r) => r.owner === user.id).length >= OWNER_JOB_LIMIT
      )
        throw badRequest('insight_export_limit', 'The current export quota has been reached');
      const [row] = await tx
        .insert(insightJobs)
        .values({
          id: requestId,
          tenantId: user.tenantId,
          ownerId: user.id,
          reportId: report.id,
          familyId,
          authRevision: user.revision!,
          scopeRevision,
          expiresAt: new Date(now.getTime() + INSIGHT_RETENTION_MS),
        })
        .returning();
      return jobOf(row!, user);
    });
  }

  jobs(user: AuthUser, tenant: TenantWithAccess, reportId: string) {
    assertInsightActor(user);
    return this.db.run(async (tx) => {
      const report = await this.owned(tx, user, reportId);
      this.insights.authorize(
        await this.insights.authority(tx, user, tenant),
        user,
        report.definition,
        true,
      );
      const familyId = await this.familyOf(tx, user);
      const rows = await tx
        .select({
          id: insightJobs.id,
          reportId: insightJobs.reportId,
          status: insightJobs.status,
          expiresAt: insightJobs.expiresAt,
          createdAt: insightJobs.createdAt,
          authRevision: insightJobs.authRevision,
          tenantId: insightJobs.tenantId,
          ownerId: insightJobs.ownerId,
          familyId: insightJobs.familyId,
        })
        .from(insightJobs)
        .where(
          and(
            eq(insightJobs.ownerId, user.id),
            eq(insightJobs.reportId, reportId),
            eq(insightJobs.familyId, familyId),
          ),
        )
        .orderBy(desc(insightJobs.createdAt))
        .limit(OWNER_JOB_LIMIT);
      return rows.map((row) => jobOf(row, user));
    }, true);
  }

  file(user: AuthUser, tenant: TenantWithAccess, jobId: string) {
    assertInsightActor(user);
    return this.db.run(async (tx) => {
      const familyId = await this.familyOf(tx, user);
      const [job] = await tx
        .select()
        .from(insightJobs)
        .where(
          and(
            eq(insightJobs.id, jobId),
            eq(insightJobs.ownerId, user.id),
            eq(insightJobs.familyId, familyId),
          ),
        );
      if (!job || job.expiresAt <= new Date())
        throw new NotFoundException('Export is unavailable or expired');
      const report = await this.owned(tx, user, job.reportId);
      const access = await this.insights.authority(tx, user, tenant);
      const scope = this.insights.authorize(access, user, report.definition, true);
      if (scope !== job.scopeRevision || user.revision !== job.authRevision)
        throw forbidden('insight_authority_changed', 'Export authority has changed');
      if (job.status !== 'ready' || !job.ciphertext)
        throw conflict('insight_not_ready', 'Export is not ready');
      const current = await this.insights.measureAuthorized(tx, report.definition, access.legacyBd);
      if (current.sourceRevision !== job.resultRevision)
        throw conflict(
          'insight_result_changed',
          'The source result changed. Generate a new export.',
        );
      if (job.expiresAt <= new Date()) throw new NotFoundException('Export expired');
      return this.cipher.decryptBytes(
        Buffer.from(job.ciphertext, 'base64'),
        this.cipherContext(job),
      );
    }, true);
  }

  private cipherContext(job: JobRow) {
    return { tenantId: job.tenantId, purpose: `insight:${job.ownerId}:${job.id}:${job.reportId}` };
  }

  /** The scheduler owns a tenant lease. The job row and encrypted result commit together. */
  async runTenant() {
    const tenantId = currentTenantId();
    const tenant = await this.entitlements.forTenant(tenantId);
    await this.db.run(async (tx) => {
      const now = new Date();
      const expired = tx
        .select({ id: insightJobs.id, owner: insightJobs.ownerId })
        .from(insightJobs)
        .where(lte(insightJobs.expiresAt, now))
        .orderBy(asc(insightJobs.expiresAt))
        .limit(100);
      await tx.execute(sql`delete from ${insightJobs} where (id, owner_id) in (${expired})`);
      if (!tenant) return;
      const [queued] = await tx
        .select({ job: insightJobs, report: savedInsights })
        .from(insightJobs)
        .innerJoin(
          savedInsights,
          and(
            eq(savedInsights.id, insightJobs.reportId),
            eq(savedInsights.ownerId, insightJobs.ownerId),
          ),
        )
        .where(and(eq(insightJobs.status, 'queued'), gt(insightJobs.expiresAt, now)))
        .orderBy(asc(insightJobs.createdAt), asc(insightJobs.id))
        .limit(1)
        .for('update', { of: insightJobs, skipLocked: true });
      if (!queued) return;
      const { job } = queued;
      const patch = await this.generate(tx, tenant, job, reportOf(queued.report));
      await tx
        .update(insightJobs)
        .set(patch)
        .where(and(eq(insightJobs.id, job.id), eq(insightJobs.ownerId, job.ownerId)));
    }, true);
  }

  private async generate(
    tx: Tx,
    tenant: TenantWithAccess,
    job: JobRow,
    report: SavedInsight,
  ): Promise<Partial<JobRow>> {
    try {
      const actor = await this.workerActor(tx, job);
      if (!actor) return { status: 'cancelled' };
      const access = await this.insights.authority(tx, actor, tenant);
      if (this.insights.authorize(access, actor, report.definition, true) !== job.scopeRevision)
        return { status: 'cancelled' };
      const view = await this.insights.measureAuthorized(tx, report.definition, access.legacyBd);
      if (job.expiresAt <= new Date()) return { status: 'cancelled' };
      const bytes = this.cipher.encryptBytes(renderCsv(view), this.cipherContext(job));
      return {
        status: 'ready',
        resultRevision: view.sourceRevision,
        ciphertext: bytes.toString('base64'),
      };
    } catch (error) {
      if (isInsightDenied(error) || error instanceof UnauthorizedException)
        return { status: 'cancelled' };
      if (error instanceof BadRequestException) return { status: 'failed' };
      throw error;
    }
  }

  private async workerActor(tx: Tx, job: JobRow): Promise<Actor | null> {
    const [user] = await tx
      .select()
      .from(tenantUsers)
      .where(eq(tenantUsers.id, job.ownerId))
      .for('share');
    if (
      !user ||
      user.disabledAt ||
      user.provisionDisabled ||
      user.authRevision !== job.authRevision
    )
      return null;
    const [root] = await tx
      .select()
      .from(authSessions)
      .where(eq(authSessions.id, job.familyId))
      .for('share');
    if (
      !root ||
      root.subjectKind !== 'tenant' ||
      root.subjectId !== user.id ||
      root.tenantId !== job.tenantId ||
      root.familyRevokedAt
    )
      return null;
    const [session] = await tx
      .select()
      .from(authSessions)
      .where(
        and(
          eq(authSessions.familyId, root.id),
          eq(authSessions.tenantId, job.tenantId),
          eq(authSessions.subjectId, user.id),
          eq(authSessions.subjectKind, 'tenant'),
          isNull(authSessions.revokedAt),
          gt(authSessions.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(authSessions.createdAt))
      .limit(1)
      .for('share');
    if (!session) return null;
    return {
      kind: 'tenant',
      tenantId: job.tenantId,
      id: user.id,
      role: user.role,
      sessionId: session.id,
      revision: user.authRevision,
      mfaAt: session.mfaAt,
      authMethod: session.authMethod,
      policy: await tenantSessionPolicy(tx, user, session),
    };
  }
}
