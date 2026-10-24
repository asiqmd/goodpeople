import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  attendanceDevices,
  attendancePunches,
  edgeAgents,
  employees,
  locations,
  runAsTenant,
  type Database,
  type Tx,
} from '@gp/db';
import {
  addDays,
  localParts,
  type DeviceUpdateInput,
  type DeviceVendor,
  type DeviceView,
  type EdgeAgentCreated,
  type EdgeAgentInput,
  type EdgeAgentView,
  type EdgeHeartbeatInput,
  type EdgeHeartbeatResult,
  type EdgePunchesInput,
  type EdgePunchesResult,
  type UnmatchedPunchGroup,
} from '@gp/shared';
import { and, asc, count, eq, inArray, isNotNull, isNull, max, min, sql } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { currentTenantId } from '../../common/request-context.js';
import { DB, TenantDb } from '../../db/db.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { AttendanceProcessor } from './processor.service.js';

export interface EdgeAgentIdentity {
  tenantId: string;
  agentId: string;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const TOKEN = new RegExp(`^gpe\\.(${UUID})\\.(${UUID})\\.([A-Za-z0-9_-]{32,})$`);
const sha256 = (value: string) => createHash('sha256').update(value).digest();

const VENDOR_NAMES: Record<DeviceVendor, string> = {
  zkteco: 'ZKTeco',
  hikvision: 'Hikvision',
  other: 'Device',
};

function toAgentView(a: typeof edgeAgents.$inferSelect): EdgeAgentView {
  return {
    id: a.id,
    name: a.name,
    tokenPrefix: a.tokenPrefix,
    agentVersion: a.agentVersion,
    queued: a.queued,
    lastSeenAt: a.lastSeenAt?.toISOString() ?? null,
    revokedAt: a.revokedAt?.toISOString() ?? null,
    createdAt: a.createdAt.toISOString(),
  };
}

/**
 * Edge Agents, the devices behind them and what they upload. An agent's token names its
 * workspace, so uploads are scoped by row-level security like any other request.
 */
@Injectable()
export class DevicesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tenantDb: TenantDb,
    private readonly processor: AttendanceProcessor,
    private readonly audit: TenantAuditService,
  ) {}

  // ── Agents (HR) ────────────────────────────────────────────────────────────

  agents(): Promise<EdgeAgentView[]> {
    return this.tenantDb.run(async (tx) =>
      (await tx.select().from(edgeAgents).orderBy(asc(edgeAgents.createdAt))).map(toAgentView),
    );
  }

  /** The token is shown once; only its hash is kept. */
  createAgent(actor: AuthUser, input: EdgeAgentInput): Promise<EdgeAgentCreated> {
    return this.tenantDb.run(async (tx) => {
      const secret = randomBytes(32).toString('base64url');
      const [row] = await tx
        .insert(edgeAgents)
        .values({
          tenantId: currentTenantId(),
          name: input.name,
          tokenHash: sha256(secret).toString('hex'),
          tokenPrefix: secret.slice(0, 6),
          createdBy: actor.id,
        })
        .returning();
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'attendance.agent.create',
        entityType: 'edge_agent',
        entityId: row!.id,
        after: { name: input.name },
      });
      return { ...toAgentView(row!), token: `gpe.${row!.tenantId}.${row!.id}.${secret}` };
    });
  }

  revokeAgent(actor: AuthUser, id: string): Promise<EdgeAgentView> {
    return this.tenantDb.run(async (tx) => {
      const [row] = await tx
        .update(edgeAgents)
        .set({ revokedAt: new Date() })
        .where(and(eq(edgeAgents.id, id), isNull(edgeAgents.revokedAt)))
        .returning();
      if (!row) throw new NotFoundException('Agent not found or already revoked');
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'attendance.agent.revoke',
        entityType: 'edge_agent',
        entityId: id,
      });
      return toAgentView(row);
    });
  }

  // ── Devices (HR) ───────────────────────────────────────────────────────────

  devices(): Promise<DeviceView[]> {
    return this.tenantDb.run((tx) => this.loadDevices(tx));
  }

  private async loadDevices(tx: Tx, id?: string): Promise<DeviceView[]> {
    const rows = await tx
      .select({
        d: attendanceDevices,
        location: { id: locations.id, name: locations.name },
        agent: { id: edgeAgents.id, name: edgeAgents.name },
      })
      .from(attendanceDevices)
      .leftJoin(locations, eq(locations.id, attendanceDevices.locationId))
      .leftJoin(edgeAgents, eq(edgeAgents.id, attendanceDevices.agentId))
      .where(id ? eq(attendanceDevices.id, id) : undefined)
      .orderBy(asc(attendanceDevices.name));
    return rows.map(({ d, location, agent }) => ({
      id: d.id,
      serialNumber: d.serialNumber,
      vendor: d.vendor,
      name: d.name,
      location: location?.id ? location : null,
      agent: agent?.id ? agent : null,
      lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
    }));
  }

  updateDevice(actor: AuthUser, id: string, input: DeviceUpdateInput): Promise<DeviceView> {
    return this.tenantDb.run(async (tx) => {
      const [row] = await tx
        .update(attendanceDevices)
        .set(input)
        .where(eq(attendanceDevices.id, id))
        .returning({ id: attendanceDevices.id });
      if (!row) throw new NotFoundException('Device not found');
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'attendance.device.update',
        entityType: 'attendance_device',
        entityId: id,
        after: input,
      });
      return (await this.loadDevices(tx, id))[0]!;
    });
  }

  /** Device users no employee is enrolled as yet: HR sets the PIN to claim their punches. */
  unmatched(): Promise<UnmatchedPunchGroup[]> {
    return this.tenantDb.run(async (tx) => {
      const rows = await tx
        .select({
          deviceUserId: attendancePunches.deviceUserId,
          deviceId: attendanceDevices.id,
          deviceName: attendanceDevices.name,
          serialNumber: attendanceDevices.serialNumber,
          punches: count(),
          first: min(attendancePunches.punchedAt),
          last: max(attendancePunches.punchedAt),
        })
        .from(attendancePunches)
        .leftJoin(attendanceDevices, eq(attendanceDevices.id, attendancePunches.deviceId))
        .where(
          and(
            isNull(attendancePunches.employeeId),
            isNull(attendancePunches.voidedAt),
            isNotNull(attendancePunches.deviceUserId),
          ),
        )
        .groupBy(
          attendancePunches.deviceUserId,
          attendanceDevices.id,
          attendanceDevices.name,
          attendanceDevices.serialNumber,
        )
        .orderBy(asc(attendancePunches.deviceUserId));
      return rows.map((r) => ({
        deviceUserId: r.deviceUserId!,
        device: r.deviceId
          ? { id: r.deviceId, name: r.deviceName!, serialNumber: r.serialNumber! }
          : null,
        punches: r.punches,
        first: r.first!.toISOString(),
        last: r.last!.toISOString(),
      }));
    });
  }

  // ── The agent's own endpoints ──────────────────────────────────────────────

  /** Checks an agent token; null when it is malformed, unknown or revoked. */
  async authenticate(token: string): Promise<EdgeAgentIdentity | null> {
    const match = TOKEN.exec(token);
    if (!match) return null;
    const [, tenantId, agentId, secret] = match as unknown as [string, string, string, string];
    const [agent] = await runAsTenant(this.db, tenantId, (tx) =>
      tx.select().from(edgeAgents).where(eq(edgeAgents.id, agentId)),
    );
    if (!agent || agent.revokedAt) return null;
    const expected = Buffer.from(agent.tokenHash, 'hex');
    const actual = sha256(secret);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    return { tenantId, agentId };
  }

  heartbeat(agent: EdgeAgentIdentity, input: EdgeHeartbeatInput): Promise<EdgeHeartbeatResult> {
    return this.tenantDb.run(async (tx) => {
      await tx
        .update(edgeAgents)
        .set({ agentVersion: input.agentVersion, queued: input.queued, lastSeenAt: new Date() })
        .where(eq(edgeAgents.id, agent.agentId));
      if (input.devices.length) {
        await this.upsertDevices(
          tx,
          agent,
          input.devices.map((d) => ({
            serialNumber: d.serialNumber,
            vendor: d.vendor,
            lastSeenAt: new Date(d.lastSeenAt),
            lastIp: d.ip ?? null,
          })),
        );
      }
      return { serverTime: new Date().toISOString(), agentId: agent.agentId };
    });
  }

  /**
   * Stores buffered punches. The same device, user and second is one punch, so an agent can
   * safely resend after a lost response. Punches from device users without a matching PIN are
   * kept unmatched until HR sets it.
   */
  ingest(agent: EdgeAgentIdentity, input: EdgePunchesInput): Promise<EdgePunchesResult> {
    return this.tenantDb.run(async (tx) => {
      const seen = new Map<string, DeviceVendor>();
      for (const p of input.punches) seen.set(p.deviceSerial, p.vendor);
      const devices = await this.upsertDevices(
        tx,
        agent,
        [...seen].map(([serialNumber, vendor]) => ({
          serialNumber,
          vendor,
          lastSeenAt: new Date(),
          lastIp: null,
        })),
      );
      const deviceId = new Map(devices.map((d) => [d.serialNumber, d.id]));
      const pins = [...new Set(input.punches.map((p) => p.deviceUserId))];
      const enrolled = await tx
        .select({ id: employees.id, pin: employees.attendancePin })
        .from(employees)
        .where(inArray(employees.attendancePin, pins));
      const employeeOf = new Map(enrolled.map((e) => [e.pin!, e.id]));

      const inserted = await tx
        .insert(attendancePunches)
        .values(
          input.punches.map((p) => ({
            tenantId: agent.tenantId,
            employeeId: employeeOf.get(p.deviceUserId) ?? null,
            punchedAt: new Date(p.punchedAt),
            source: 'device' as const,
            direction: p.direction,
            deviceId: deviceId.get(p.deviceSerial)!,
            deviceUserId: p.deviceUserId,
          })),
        )
        .onConflictDoNothing({
          target: [
            attendancePunches.tenantId,
            attendancePunches.deviceId,
            attendancePunches.deviceUserId,
            attendancePunches.punchedAt,
          ],
        })
        .returning({
          employeeId: attendancePunches.employeeId,
          punchedAt: attendancePunches.punchedAt,
        });
      await tx
        .update(edgeAgents)
        .set({ lastSeenAt: new Date() })
        .where(eq(edgeAgents.id, agent.agentId));

      const matched = inserted.filter((p) => p.employeeId);
      if (matched.length) {
        // Device clocks follow the site; Bangladesh dates are close enough to pick the days.
        const dates = matched.map((p) => localParts(p.punchedAt, 'Asia/Dhaka').date).toSorted();
        await this.processor.processSince(
          tx,
          [...new Set(matched.map((p) => p.employeeId!))],
          addDays(dates[0]!, -1),
          addDays(dates.at(-1)!, 1),
        );
      }
      return {
        accepted: inserted.length,
        duplicates: input.punches.length - inserted.length,
        unmatched: inserted.length - matched.length,
      };
    });
  }

  private upsertDevices(
    tx: Tx,
    agent: EdgeAgentIdentity,
    devices: {
      serialNumber: string;
      vendor: DeviceVendor;
      lastSeenAt: Date;
      lastIp: string | null;
    }[],
  ) {
    return tx
      .insert(attendanceDevices)
      .values(
        devices.map((d) => ({
          tenantId: agent.tenantId,
          agentId: agent.agentId,
          vendor: d.vendor,
          serialNumber: d.serialNumber,
          name: `${VENDOR_NAMES[d.vendor]} ${d.serialNumber}`,
          lastSeenAt: d.lastSeenAt,
          lastIp: d.lastIp,
        })),
      )
      .onConflictDoUpdate({
        target: [attendanceDevices.tenantId, attendanceDevices.serialNumber],
        set: {
          agentId: agent.agentId,
          lastSeenAt: sql`greatest(${attendanceDevices.lastSeenAt}, excluded.last_seen_at)`,
          lastIp: sql`coalesce(excluded.last_ip, ${attendanceDevices.lastIp})`,
        },
      })
      .returning({ id: attendanceDevices.id, serialNumber: attendanceDevices.serialNumber });
  }
}
