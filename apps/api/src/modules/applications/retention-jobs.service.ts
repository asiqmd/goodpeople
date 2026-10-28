import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { applications, candidates, jobOpenings, recruitmentSettings } from '@gp/db';
import { DEFAULT_CANDIDATE_RETENTION_MONTHS, ENDED_OPENING_STATUSES } from '@gp/shared';
import { and, eq, isNotNull, isNull, notExists, notInArray, or, sql } from 'drizzle-orm';
import { runInTenantContext } from '../../common/request-context.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { TenantDb } from '../../db/db.module.js';
import type { FileStore } from '../../storage/file-store.js';
import { FILE_STORE } from '../../storage/storage.module.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import { eraseCandidate } from './erasure.js';

/** At most this many candidates are erased in one workspace a run; the next run does the rest. */
const BATCH = 500;

/**
 * Once a day, erases candidates the workspace may no longer keep (Personal Data Protection
 * Ordinance 2025: data kept only for the time stated): every application of theirs closed,
 * nothing done for longer than the workspace's retention months, not in its talent pool, and
 * never hired. A legal duty rather than a feature, so it runs in every workspace.
 */
@Injectable()
export class CandidateRetentionJobs implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CandidateRetentionJobs.name);
  private timers: NodeJS.Timeout[] = [];
  private running: Promise<void> | undefined;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(FILE_STORE) private readonly store: FileStore,
    private readonly entitlements: EntitlementsService,
    private readonly tenantDb: TenantDb,
  ) {}

  onApplicationBootstrap() {
    if (!this.config.BACKGROUND_JOBS) return;
    const erase = () => {
      this.running ??= this.everyTenant().finally(() => (this.running = undefined));
    };
    this.timers = [setInterval(erase, 24 * 60 * 60_000), setTimeout(erase, 120_000)];
    for (const timer of this.timers) timer.unref();
  }

  async onApplicationShutdown() {
    for (const timer of this.timers) clearInterval(timer);
    await this.running?.catch(() => undefined);
  }

  private async everyTenant() {
    for (const tenant of await this.entitlements.all()) {
      try {
        const erased = await runInTenantContext(tenant.id, () => this.eraseExpired());
        if (erased) this.logger.log(`Erased ${erased} candidates in ${tenant.slug}`);
      } catch (error) {
        this.logger.error(`Erasing candidates failed for ${tenant.slug}`, error as Error);
      }
    }
  }

  /**
   * Erases the current workspace's candidates whose time is up, as of `now`. Erased candidates
   * are not erased again, so running it twice changes nothing. Returns how many were erased.
   */
  async eraseExpired(now = new Date()): Promise<number> {
    const erased = await this.tenantDb.run(async (tx) => {
      const [settings] = await tx
        .select({ months: recruitmentSettings.retentionMonths })
        .from(recruitmentSettings);
      const cutoff = new Date(now);
      cutoff.setUTCMonth(
        cutoff.getUTCMonth() - (settings?.months ?? DEFAULT_CANDIDATE_RETENTION_MONTHS),
      );
      // An application is still alive until it is rejected or withdrawn, or its opening ended;
      // a hired one keeps the person for good.
      const alive = tx
        .select({ one: sql`1` })
        .from(applications)
        .innerJoin(jobOpenings, eq(jobOpenings.id, applications.openingId))
        .where(
          and(
            eq(applications.candidateId, candidates.id),
            or(
              eq(applications.stage, 'hired'),
              isNotNull(applications.employeeId),
              and(
                notInArray(applications.stage, ['rejected', 'withdrawn']),
                notInArray(jobOpenings.status, [...ENDED_OPENING_STATUSES]),
              ),
            ),
          ),
        );
      // The last thing that happened: to the person, their applications and their history,
      // or the opening ending under an application still in progress.
      const lastActivity = sql`greatest(
        ${candidates.updatedAt},
        (select max(greatest(a.updated_at, a.stage_changed_at,
            case when a.stage not in ('rejected', 'withdrawn')
              then coalesce(o.closed_at, o.updated_at) end))
          from ${applications} a join ${jobOpenings} o on o.id = a.opening_id
          where a.candidate_id = ${candidates.id}),
        (select max(e.created_at) from application_events e
          join ${applications} a on a.id = e.application_id
          where a.candidate_id = ${candidates.id})
      )`;
      const due = await tx
        .select({ id: candidates.id })
        .from(candidates)
        .where(
          and(
            isNull(candidates.erasedAt),
            eq(candidates.talentPool, false),
            notExists(alive),
            sql`${lastActivity} < ${cutoff.toISOString()}::timestamptz`,
          ),
        )
        .limit(BATCH);
      const keys: string[] = [];
      for (const { id } of due) {
        const key = await eraseCandidate(tx, id, { actorUserId: null, reason: 'retention' });
        if (key) keys.push(key);
      }
      return { count: due.length, keys };
    });
    for (const key of erased.keys) await this.store.delete(key).catch(() => undefined);
    return erased.count;
  }
}
