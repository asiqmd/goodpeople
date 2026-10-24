import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { attendancePunches, employees } from '@gp/db';
import {
  GEOFENCE_TOLERANCE_M,
  addDays,
  distanceMeters,
  localParts,
  zonedInstant,
  type AttendanceProfileInput,
  type ManualPunchInput,
  type MyAttendanceToday,
  type PunchView,
  type SelfPunchInput,
  type VoidPunchInput,
  OFFLINE_PUNCH_MAX_HOURS,
} from '@gp/shared';
import { and, desc, eq, isNotNull, isNull, lte } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, conflict, forbidden } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { TenantDb } from '../../db/db.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { DocumentsService } from '../documents/documents.service.js';
import { employeeOfUser } from '../employees/employee.queries.js';
import { AttendanceService, punchesOf, timeZoneOf } from './attendance.service.js';
import { toPunchView } from './attendance-views.js';
import { AttendanceProcessor, settingsOf } from './processor.service.js';

/** The days a punch can belong to: the one it happened on, or yesterday's night shift. */
const daysAround = (at: Date, timeZone: string) => {
  const date = localParts(at, timeZone).date;
  return { from: addDays(date, -1), to: date };
};

/** Punching from the apps, HR's manual punches and corrections, and device PINs. */
@Injectable()
export class PunchesService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly processor: AttendanceProcessor,
    private readonly attendance: AttendanceService,
    private readonly documents: DocumentsService,
    private readonly audit: TenantAuditService,
  ) {}

  /**
   * In or out from the web or mobile app. With a geofence the employee must be inside their
   * location's radius, allowing for the phone's reported accuracy up to 50 m.
   */
  async selfPunch(
    user: AuthUser,
    input: SelfPunchInput,
    selfie?: { originalname: string; buffer: Buffer },
  ): Promise<MyAttendanceToday> {
    await this.tenantDb.run(async (tx) => {
      const me = await employeeOfUser(tx, user.id);
      if (!me) throw new NotFoundException('No employee record is linked to your login');
      // One punch at a time per person, so a double tap cannot record two.
      await tx
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.id, me.id))
        .for('update');
      if (me.status !== 'active') throw forbidden('separated', 'Separated employees cannot punch');
      // A resend from the app's offline queue: already recorded, nothing to do.
      if (input.clientId) {
        const [seen] = await tx
          .select({ id: attendancePunches.id })
          .from(attendancePunches)
          .where(eq(attendancePunches.clientId, input.clientId));
        if (seen) return;
      }
      const punchedAt = input.punchedAt ? new Date(input.punchedAt) : new Date();
      const offline = input.punchedAt !== undefined;
      if (offline) {
        if (input.source !== 'mobile') {
          throw badRequest('offline_mobile_only', 'Only the mobile app sends punches later');
        }
        if (punchedAt.getTime() > Date.now() + 2 * 60_000) {
          throw badRequest('future_punch', 'A punch cannot be in the future');
        }
        if (Date.now() - punchedAt.getTime() > OFFLINE_PUNCH_MAX_HOURS * 3_600_000) {
          throw badRequest(
            'offline_punch_too_old',
            `Punches recorded offline must arrive within ${OFFLINE_PUNCH_MAX_HOURS} hours; ask for a correction instead`,
          );
        }
      }
      const settings = await settingsOf(tx);
      if (settings.selfPunch === 'off') {
        throw forbidden('self_punch_disabled', 'Punching from the app is turned off');
      }
      const { day, timeZone } = await this.attendance.currentDay(tx, me);
      const geofence = await this.attendance.geofenceOf(tx, day.plan.locationId);
      const hasPosition = input.latitude !== undefined && input.longitude !== undefined;
      const distanceM =
        geofence && hasPosition
          ? Math.round(
              distanceMeters(geofence, { latitude: input.latitude!, longitude: input.longitude! }),
            )
          : null;
      const insideGeofence =
        distanceM === null
          ? null
          : distanceM <= geofence!.radiusM + Math.min(input.accuracyM ?? 0, GEOFENCE_TOLERANCE_M);
      if (settings.selfPunch === 'geofenced') {
        if (!geofence) {
          throw badRequest(
            'no_geofence',
            'Your work location has no geofence yet; ask HR to set one',
          );
        }
        if (!hasPosition) throw badRequest('location_required', 'Allow location access to punch');
        if (!insideGeofence) {
          throw badRequest(
            'outside_geofence',
            `You are about ${distanceM} m away, outside the ${geofence.radiusM} m allowed`,
          );
        }
      }
      if (settings.requireSelfie && !selfie) {
        throw badRequest('selfie_required', 'Take a photo to punch');
      }
      const [last] = await tx
        .select({ punchedAt: attendancePunches.punchedAt })
        .from(attendancePunches)
        .where(
          and(
            eq(attendancePunches.employeeId, me.id),
            isNull(attendancePunches.voidedAt),
            // An offline punch is compared with what was recorded around its own time.
            offline
              ? lte(attendancePunches.punchedAt, new Date(punchedAt.getTime() + 60_000))
              : undefined,
          ),
        )
        .orderBy(desc(attendancePunches.punchedAt))
        .limit(1);
      if (last && Math.abs(punchedAt.getTime() - last.punchedAt.getTime()) < 60_000) {
        // A double tap saved offline is dropped quietly; the queue must not get stuck on it.
        if (offline) return;
        throw conflict('too_soon', 'You punched less than a minute ago');
      }
      const today = (await punchesOf(tx, me.id, day.opensAt, day.closesAt)).filter(
        (p) => !p.voided,
      );
      const photo = selfie
        ? await this.documents.save(tx, {
            employeeId: me.id,
            category: 'punch_selfie',
            title: `Punch ${punchedAt.toISOString()}`,
            fileName: selfie.originalname || 'selfie.jpg',
            bytes: selfie.buffer,
            source: 'upload',
            visibleToEmployee: true,
            uploadedBy: user.id,
          })
        : null;
      await tx.insert(attendancePunches).values({
        tenantId: currentTenantId(),
        employeeId: me.id,
        punchedAt,
        source: input.source,
        // The order of punches decides in and out; a late arrival's place is not known here.
        direction: offline ? 'unknown' : today.length % 2 === 0 ? 'in' : 'out',
        offline,
        clientId: input.clientId ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        accuracyM: input.accuracyM ?? null,
        distanceM,
        insideGeofence,
        selfieDocumentId: photo?.id ?? null,
        createdBy: user.id,
      });
      await this.processor.process(tx, {
        employeeIds: [me.id],
        ...daysAround(punchedAt, timeZone),
      });
    });
    return this.attendance.today(user);
  }

  /** HR records a punch the devices missed, in the employee's local time. */
  manualPunch(actor: AuthUser, employeeId: string, input: ManualPunchInput): Promise<PunchView> {
    return this.tenantDb.run(async (tx) => {
      const [employee] = await tx.select().from(employees).where(eq(employees.id, employeeId));
      if (!employee) throw new NotFoundException('Employee not found');
      const plan = await this.processor.planFor(tx, employeeId, input.date);
      const timeZone = plan?.timeZone ?? (await timeZoneOf(tx, employeeId));
      const punchedAt = zonedInstant(input.date, input.time, timeZone);
      if (punchedAt > new Date())
        throw badRequest('future_punch', 'A punch cannot be in the future');
      const [row] = await tx
        .insert(attendancePunches)
        .values({
          tenantId: currentTenantId(),
          employeeId,
          punchedAt,
          source: 'manual',
          note: input.reason,
          createdBy: actor.id,
        })
        .returning();
      await this.processor.processSince(tx, [employeeId], addDays(input.date, -1), input.date);
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'attendance.punch.manual',
        entityType: 'attendance_punch',
        entityId: row!.id,
        after: { employeeId, ...input },
      });
      return toPunchView(row!, null);
    });
  }

  /** Punches are never deleted; a wrong one is voided with a reason and stops counting. */
  voidPunch(actor: AuthUser, punchId: string, input: VoidPunchInput): Promise<PunchView> {
    return this.tenantDb.run(async (tx) => {
      const [punch] = await tx
        .select()
        .from(attendancePunches)
        .where(eq(attendancePunches.id, punchId))
        .for('update');
      if (!punch) throw new NotFoundException('Punch not found');
      if (punch.voidedAt) throw new ConflictException('This punch is already voided');
      const [row] = await tx
        .update(attendancePunches)
        .set({ voidedAt: new Date(), voidedBy: actor.id, voidReason: input.reason })
        .where(eq(attendancePunches.id, punchId))
        .returning();
      if (punch.employeeId) {
        const timeZone = await timeZoneOf(tx, punch.employeeId);
        const { from, to } = daysAround(punch.punchedAt, timeZone);
        await this.processor.processSince(tx, [punch.employeeId], from, to);
      }
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'attendance.punch.void',
        entityType: 'attendance_punch',
        entityId: punchId,
        after: { reason: input.reason },
      });
      return toPunchView(row!, null);
    });
  }

  /**
   * Sets the number an employee is enrolled under on the devices. Device punches already
   * received under that number are linked to them and their days processed.
   */
  setProfile(
    actor: AuthUser,
    employeeId: string,
    input: AttendanceProfileInput,
  ): Promise<{ attendancePin: string | null; linkedPunches: number }> {
    return this.tenantDb.run(async (tx) => {
      const [employee] = await tx.select().from(employees).where(eq(employees.id, employeeId));
      if (!employee) throw new NotFoundException('Employee not found');
      await tx
        .update(employees)
        .set({ attendancePin: input.attendancePin, updatedAt: new Date() })
        .where(eq(employees.id, employeeId));
      const linked = input.attendancePin
        ? await tx
            .update(attendancePunches)
            .set({ employeeId })
            .where(
              and(
                eq(attendancePunches.deviceUserId, input.attendancePin),
                isNull(attendancePunches.employeeId),
                isNotNull(attendancePunches.deviceId),
              ),
            )
            .returning({ punchedAt: attendancePunches.punchedAt })
        : [];
      if (linked.length) {
        const timeZone = await timeZoneOf(tx, employeeId);
        const dates = linked.map((p) => localParts(p.punchedAt, timeZone).date).toSorted();
        await this.processor.processSince(tx, [employeeId], addDays(dates[0]!, -1), dates.at(-1)!);
      }
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'attendance.profile.update',
        entityType: 'employee',
        entityId: employeeId,
        before: { attendancePin: employee.attendancePin },
        after: { attendancePin: input.attendancePin, linkedPunches: linked.length },
      });
      return { attendancePin: input.attendancePin, linkedPunches: linked.length };
    });
  }
}
