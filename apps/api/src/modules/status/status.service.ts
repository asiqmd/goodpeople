import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  statusChecks,
  statusDays,
  statusIncidents,
  statusIncidentUpdates,
  type Database,
} from '@gp/db';
import {
  addDays,
  INCIDENT_STATUSES,
  isFinished,
  MAINTENANCE_STATUSES,
  STATUS_COMPONENTS,
  STATUS_HISTORY_DAYS,
  todayIn,
  worstState,
  type CreateIncidentInput,
  type IncidentUpdateInput,
  type IncidentView,
  type PublicStatus,
} from '@gp/shared';
import { and, desc, eq, gte, inArray, isNotNull, isNull, ne, or } from 'drizzle-orm';
import type { PlatformUser } from '../../common/auth-user.js';
import { badRequest } from '../../common/errors.js';
import { DB } from '../../db/db.module.js';
import { AuditService } from '../audit/audit.service.js';
import {
  componentState,
  dhakaMidnight,
  endedAt,
  historyOf,
  inProgress,
  stateOf,
  upcoming,
  uptimeOf,
} from './status-state.js';

/** The public page is computed at most this often, however many people (and banners) ask. */
const CACHE_MS = 30_000;
const WEEK_MS = 7 * 86_400_000;
/** Checks older than this say nothing about now (the checks may have stopped). */
const FRESH_CHECKS_MS = 15 * 60_000;
/** Finished incidents the console lists after the open ones. */
const CONSOLE_FINISHED = 30;

type IncidentRow = typeof statusIncidents.$inferSelect;
type UpdateRow = typeof statusIncidentUpdates.$inferSelect;

function viewOf(row: IncidentRow, updates: UpdateRow[]): IncidentView {
  return {
    id: row.id,
    kind: row.kind,
    titleEn: row.titleEn,
    titleBn: row.titleBn,
    impact: stateOf(row),
    status: row.status,
    components: row.components,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    updates: updates.map((u) => ({
      id: u.id,
      status: u.status,
      bodyEn: u.bodyEn,
      bodyBn: u.bodyBn,
      createdAt: u.createdAt.toISOString(),
    })),
  };
}

const time = (d: Date | null) => d?.getTime() ?? 0;

/** The status page, and the incidents and maintenance platform staff post on it. */
@Injectable()
export class StatusService {
  private cached: { until: number; status: Promise<PublicStatus> } | undefined;

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  /** What the public page and the in-app banner show; computed at most every 30 seconds. */
  publicStatus(): Promise<PublicStatus> {
    const now = Date.now();
    if (!this.cached || this.cached.until <= now) {
      const status = this.build(new Date(now));
      this.cached = { until: now + CACHE_MS, status };
      // A failure is not kept: the next request tries again.
      status.catch(() => {
        if (this.cached?.status === status) this.cached = undefined;
      });
    }
    return this.cached.status;
  }

  /** Forgets the cached page: after every change, and for tests. */
  clearCache(): void {
    this.cached = undefined;
  }

  /** The page as it stands at `now`, uncached. */
  async build(now = new Date()): Promise<PublicStatus> {
    const firstDay = addDays(todayIn('Asia/Dhaka', now), 1 - STATUS_HISTORY_DAYS);
    const since = dhakaMidnight(firstDay);
    const fresh = new Date(now.getTime() - FRESH_CHECKS_MS);
    const [incidents, days, checks] = await Promise.all([
      // Everything that touched the days shown, is still open, or is still to come.
      this.db
        .select()
        .from(statusIncidents)
        .where(
          or(
            gte(statusIncidents.resolvedAt, since),
            and(
              isNull(statusIncidents.resolvedAt),
              or(
                ne(statusIncidents.kind, 'maintenance'),
                eq(statusIncidents.status, 'in_progress'),
                isNull(statusIncidents.endsAt),
                gte(statusIncidents.endsAt, since),
              ),
            ),
          ),
        ),
      this.db.select().from(statusDays).where(gte(statusDays.day, firstDay)),
      Promise.all(
        STATUS_COMPONENTS.map((component) =>
          this.db
            .select({ ok: statusChecks.ok })
            .from(statusChecks)
            .where(and(eq(statusChecks.component, component), gte(statusChecks.checkedAt, fresh)))
            .orderBy(desc(statusChecks.checkedAt))
            .limit(3),
        ),
      ),
    ]);
    const components = STATUS_COMPONENTS.map((key, n) => {
      const counts = days.filter((d) => d.component === key);
      return {
        key,
        state: componentState(
          key,
          incidents,
          checks[n]!.map((c) => c.ok),
          now,
        ),
        days: historyOf(key, counts, incidents, now),
        uptime: uptimeOf(counts),
      };
    });
    // Under way first, newest first; then maintenance to come, soonest first.
    const order = (i: IncidentRow) =>
      inProgress(i, now) ? [0, -time(i.startsAt)] : [1, time(i.startsAt)];
    const active = incidents
      .filter((i) => inProgress(i, now) || upcoming(i, now, WEEK_MS))
      .toSorted((a, b) => {
        const [x, y] = [order(a), order(b)];
        return x[0]! - y[0]! || x[1]! - y[1]!;
      });
    const recent = incidents
      .filter((i) => {
        const end = endedAt(i, now);
        return end !== null && now.getTime() - end.getTime() <= WEEK_MS;
      })
      .toSorted((a, b) => time(endedAt(b, now)) - time(endedAt(a, now)));
    const updates = await this.updatesOf([...active, ...recent].map((i) => i.id));
    return {
      generatedAt: now.toISOString(),
      overall: worstState(components.map((c) => c.state)),
      components,
      active: active.map((i) => viewOf(i, updates.get(i.id) ?? [])),
      recent: recent.map((i) => viewOf(i, updates.get(i.id) ?? [])),
    };
  }

  /** For the console: open incidents and unfinished maintenance, then the latest finished. */
  async incidents(): Promise<IncidentView[]> {
    const [open, finished] = await Promise.all([
      this.db
        .select()
        .from(statusIncidents)
        .where(isNull(statusIncidents.resolvedAt))
        .orderBy(desc(statusIncidents.startsAt)),
      this.db
        .select()
        .from(statusIncidents)
        .where(isNotNull(statusIncidents.resolvedAt))
        .orderBy(desc(statusIncidents.resolvedAt))
        .limit(CONSOLE_FINISHED),
    ]);
    const rows = [...open, ...finished];
    const updates = await this.updatesOf(rows.map((r) => r.id));
    return rows.map((r) => viewOf(r, updates.get(r.id) ?? []));
  }

  async incident(id: string): Promise<IncidentView> {
    const [row] = await this.db.select().from(statusIncidents).where(eq(statusIncidents.id, id));
    if (!row) throw new NotFoundException('No such incident or maintenance');
    return viewOf(row, (await this.updatesOf([id])).get(id) ?? []);
  }

  /** Posts an incident or a maintenance window, with its first update. */
  async create(actor: PlatformUser, input: CreateIncidentInput): Promise<IncidentView> {
    const now = new Date();
    const startsAt = input.startsAt ? new Date(input.startsAt) : now;
    const endsAt = input.kind === 'maintenance' && input.endsAt ? new Date(input.endsAt) : null;
    if (endsAt && endsAt <= startsAt) {
      throw badRequest('maintenance_window', 'The maintenance must end after it starts');
    }
    const id = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(statusIncidents)
        .values({
          kind: input.kind,
          titleEn: input.titleEn,
          titleBn: input.titleBn,
          impact: input.kind === 'incident' ? input.impact : null,
          status: input.status,
          components: STATUS_COMPONENTS.filter((c) => input.components.includes(c)),
          startsAt,
          endsAt,
          resolvedAt: isFinished(input.status) ? now : null,
          createdBy: actor.id,
        })
        .returning({ id: statusIncidents.id });
      await tx.insert(statusIncidentUpdates).values({
        incidentId: row!.id,
        status: input.status,
        bodyEn: input.bodyEn,
        bodyBn: input.bodyBn,
        createdBy: actor.id,
      });
      await this.audit.record(tx, {
        actorId: actor.id,
        action: 'status.incident.create',
        tenantId: null,
        reason: `${input.kind === 'incident' ? 'Incident' : 'Maintenance'}: ${input.titleEn}`,
        after: { id: row!.id, ...input },
      });
      return row!.id;
    });
    this.clearCache();
    return this.incident(id);
  }

  /** A new status and text; a finished status resolves it, and an incident may change impact. */
  async postUpdate(
    actor: PlatformUser,
    id: string,
    input: IncidentUpdateInput,
  ): Promise<IncidentView> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(statusIncidents)
        .where(eq(statusIncidents.id, id))
        .for('update');
      if (!row) throw new NotFoundException('No such incident or maintenance');
      const statuses: readonly string[] =
        row.kind === 'incident' ? INCIDENT_STATUSES : MAINTENANCE_STATUSES;
      if (!statuses.includes(input.status)) {
        throw badRequest('status_kind_mismatch', `That status is not one for ${row.kind}`);
      }
      const now = new Date();
      const change = {
        status: input.status,
        impact: row.kind === 'incident' ? (input.impact ?? row.impact) : null,
        resolvedAt: isFinished(input.status) ? (row.resolvedAt ?? now) : null,
        updatedAt: now,
      };
      await tx.update(statusIncidents).set(change).where(eq(statusIncidents.id, id));
      await tx.insert(statusIncidentUpdates).values({
        incidentId: id,
        status: input.status,
        bodyEn: input.bodyEn,
        bodyBn: input.bodyBn,
        createdBy: actor.id,
      });
      await this.audit.record(tx, {
        actorId: actor.id,
        action: 'status.incident.update',
        tenantId: null,
        reason: `${row.kind === 'incident' ? 'Incident' : 'Maintenance'}: ${row.titleEn}`,
        before: { status: row.status, impact: row.impact },
        after: { id, status: change.status, impact: change.impact },
      });
    });
    this.clearCache();
    return this.incident(id);
  }

  /** Each incident's updates, newest first. */
  private async updatesOf(ids: string[]): Promise<Map<string, UpdateRow[]>> {
    const byIncident = new Map<string, UpdateRow[]>();
    if (ids.length === 0) return byIncident;
    const rows = await this.db
      .select()
      .from(statusIncidentUpdates)
      .where(inArray(statusIncidentUpdates.incidentId, ids))
      .orderBy(desc(statusIncidentUpdates.createdAt));
    for (const row of rows) {
      const list = byIncident.get(row.incidentId) ?? [];
      list.push(row);
      byIncident.set(row.incidentId, list);
    }
    return byIncident;
  }
}
