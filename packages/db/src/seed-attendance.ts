import { createHash, randomBytes } from 'node:crypto';
import { addDays, weekdayOf, zonedInstant } from '@gp/shared';
import { eq, inArray } from 'drizzle-orm';
import type { Tx } from './client.js';
import {
  approvalSteps,
  attendanceDevices,
  attendancePunches,
  attendanceSettings,
  edgeAgents,
  employees,
  locations,
  regularizationRequests,
  rosterEntries,
  shiftAssignments,
  shifts,
} from './schema/index.js';

const DHAKA = 'Asia/Dhaka';
/** Attendance went live on 1 October 2026; the seed punches cover 1–23 October. */
const TRACKING_FROM = '2026-10-01';
const LAST_SEEDED_DAY = '2026-10-23';

/** Small, stable variations so the punches look real but the seed is repeatable. */
function jitter(key: string, range: number): number {
  return createHash('sha256').update(key).digest().readUInt32BE(0) % range;
}

const time = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** Head office staff punch from the web app, inside the office geofence. */
const HEAD_OFFICE = ['MG-0001', 'MG-0002', 'MG-0009'];

/** Exceptions on top of the usual 07:48–07:59 in and 17:00–17:14 out at the factory. */
const SPECIAL: Record<string, Record<string, { in?: string; out?: string } | 'absent'>> = {
  'MG-0005': {
    '2026-10-06': { in: '08:22' },
    '2026-10-13': { out: '19:10' },
    '2026-10-15': 'absent',
    '2026-10-20': { out: '' },
  },
  'MG-0006': { '2026-10-08': { out: '12:30' } },
  'MG-0007': { '2026-10-21': 'absent' },
  'MG-0004': { '2026-10-07': { out: '19:05' }, '2026-10-14': { out: '19:02' } },
};

/** Attendance for the internal "My Group" tenant. Runs after seedGroupLeave. */
export async function seedGroupAttendance(tx: Tx, ctx: { tenantId: string }) {
  const { tenantId } = ctx;
  await tx
    .update(attendanceSettings)
    .set({ trackingFrom: TRACKING_FROM })
    .where(eq(attendanceSettings.tenantId, tenantId));
  // The head office gets a geofence so its staff can punch from the web app.
  await tx
    .update(locations)
    .set({ latitude: 23.7925, longitude: 90.4078, geofenceRadiusM: 200 })
    .where(eq(locations.code, 'HO'));

  const shift = await tx
    .insert(shifts)
    .values([
      {
        tenantId,
        code: 'F-DAY',
        name: 'Factory day',
        nameBn: 'কারখানা দিন',
        startTime: '08:00',
        endTime: '17:00',
        lateGraceMinutes: 5,
      },
      {
        tenantId,
        code: 'F-NIGHT',
        name: 'Factory night',
        nameBn: 'কারখানা রাত',
        startTime: '20:00',
        endTime: '05:00',
        lateGraceMinutes: 5,
      },
    ])
    .returning({ id: shifts.id, code: shifts.code });
  const dayShift = shift.find((s) => s.code === 'F-DAY')!.id;
  const nightShift = shift.find((s) => s.code === 'F-NIGHT')!.id;

  const staff = new Map(
    (
      await tx
        .select({ id: employees.id, code: employees.employeeCode })
        .from(employees)
        .where(
          inArray(employees.employeeCode, [
            'MG-0003',
            'MG-0004',
            'MG-0005',
            'MG-0006',
            'MG-0007',
            'MG-0008',
            'MG-0010',
            ...HEAD_OFFICE,
          ]),
        )
    ).map((e) => [e.code, e.id]),
  );
  const factory = ['MG-0003', 'MG-0004', 'MG-0005', 'MG-0006', 'MG-0007', 'MG-0010'];
  await tx.insert(shiftAssignments).values(
    factory.map((code) => ({
      tenantId,
      employeeId: staff.get(code)!,
      shiftId: dayShift,
      effectiveFrom: '2026-01-01',
    })),
  );
  // MG-0010 is enrolled on the device but HR has not entered her PIN, so her punches wait.
  for (const code of ['MG-0003', 'MG-0004', 'MG-0005', 'MG-0006', 'MG-0007', 'MG-0008']) {
    await tx
      .update(employees)
      .set({ attendancePin: `1${code.slice(-3)}` })
      .where(eq(employees.employeeCode, code));
  }

  // Narayanganj rotates: six day shifts, a day off, six night shifts, a day off.
  const pattern = [...Array(6).fill(dayShift), null, ...Array(6).fill(nightShift), null] as (
    string | null
  )[];
  const roster: { date: string; shiftId: string | null }[] = [];
  for (let d = TRACKING_FROM, i = 0; d <= '2026-11-30'; d = addDays(d, 1), i++) {
    roster.push({ date: d, shiftId: pattern[i % pattern.length]! });
  }
  await tx
    .insert(rosterEntries)
    .values(roster.map((r) => ({ tenantId, employeeId: staff.get('MG-0008')!, ...r })));

  // The agents' tokens are random and thrown away: create a real one in Attendance settings.
  const agents = await tx
    .insert(edgeAgents)
    .values(
      ['Gazipur gate PC', 'Narayanganj office PC'].map((name) => {
        const secret = randomBytes(32).toString('base64url');
        return {
          tenantId,
          name,
          tokenHash: createHash('sha256').update(secret).digest('hex'),
          tokenPrefix: secret.slice(0, 6),
          agentVersion: '0.1.0',
          queued: 0,
          lastSeenAt: new Date(`${LAST_SEEDED_DAY}T12:00:00Z`),
        };
      }),
    )
    .returning({ id: edgeAgents.id, name: edgeAgents.name });
  const locationId = new Map(
    (await tx.select({ id: locations.id, code: locations.code }).from(locations)).map((l) => [
      l.code,
      l.id,
    ]),
  );
  const [gzpLocation, nrjLocation] = [locationId.get('GZP')!, locationId.get('NRJ')!];
  const devices = await tx
    .insert(attendanceDevices)
    .values([
      {
        tenantId,
        agentId: agents[0]!.id,
        locationId: gzpLocation,
        vendor: 'zkteco',
        serialNumber: 'CKJW221960112',
        name: 'Gazipur main gate',
        lastSeenAt: new Date(`${LAST_SEEDED_DAY}T12:00:00Z`),
      },
      {
        tenantId,
        agentId: agents[1]!.id,
        locationId: nrjLocation,
        vendor: 'hikvision',
        serialNumber: '44:19:b6:2a:10:07',
        name: 'Narayanganj entrance',
        lastSeenAt: new Date(`${LAST_SEEDED_DAY}T12:00:00Z`),
      },
    ])
    .returning({ id: attendanceDevices.id });

  const punches: (typeof attendancePunches.$inferInsert)[] = [];
  const devicePunch = (device: string, code: string, date: string, at: string) => {
    const pin = `1${code.slice(-3)}`;
    punches.push({
      tenantId,
      employeeId: code === 'MG-0010' ? null : staff.get(code)!,
      deviceId: device,
      deviceUserId: pin,
      punchedAt: zonedInstant(date, at, DHAKA),
      source: 'device',
    });
  };
  const webPunch = (code: string, date: string, at: string) =>
    punches.push({
      tenantId,
      employeeId: staff.get(code)!,
      punchedAt: zonedInstant(date, at, DHAKA),
      source: 'web',
      latitude: 23.7925 + jitter(`${code}${date}${at}lat`, 40) / 100_000,
      longitude: 90.4078,
      accuracyM: 15,
      distanceM: jitter(`${code}${date}${at}lat`, 40),
      insideGeofence: true,
    });
  for (let d = TRACKING_FROM; d <= LAST_SEEDED_DAY; d = addDays(d, 1)) {
    // The head office works Sunday to Thursday on the general shift.
    if (weekdayOf(d) !== 5 && weekdayOf(d) !== 6) {
      for (const code of HEAD_OFFICE) {
        webPunch(code, d, time(530 + jitter(`${code}${d}in`, 20)));
        webPunch(code, d, time(1080 + jitter(`${code}${d}out`, 25)));
      }
    }
    if (weekdayOf(d) !== 5) {
      for (const code of factory) {
        const special = SPECIAL[code]?.[d];
        if (special === 'absent') continue;
        const inAt = special?.in ?? time(468 + jitter(`${code}${d}in`, 12));
        const outAt = special?.out ?? time(1020 + jitter(`${code}${d}out`, 15));
        devicePunch(devices[0]!.id, code, d, inAt);
        if (outAt) devicePunch(devices[0]!.id, code, d, outAt);
      }
    }
    const rostered = roster.find((r) => r.date === d)!.shiftId;
    if (rostered === dayShift) {
      devicePunch(devices[1]!.id, 'MG-0008', d, time(475 + jitter(`${d}n-in`, 8)));
      devicePunch(devices[1]!.id, 'MG-0008', d, time(1022 + jitter(`${d}n-out`, 10)));
    } else if (rostered === nightShift) {
      devicePunch(devices[1]!.id, 'MG-0008', d, time(1195 + jitter(`${d}n-in`, 8)));
      devicePunch(devices[1]!.id, 'MG-0008', addDays(d, 1), time(302 + jitter(`${d}n-out`, 10)));
    }
  }
  await tx.insert(attendancePunches).values(punches);

  // Rahima's exit was not read on 20 October; her supervisor has the correction to approve.
  const [rahimaUser] = await tx
    .select({ userId: employees.userId })
    .from(employees)
    .where(eq(employees.employeeCode, 'MG-0005'));
  const [request] = await tx
    .insert(regularizationRequests)
    .values({
      tenantId,
      employeeId: staff.get('MG-0005')!,
      date: '2026-10-20',
      kind: 'missed_punch',
      outTime: '17:06',
      reason: 'The fingerprint reader did not read my finger at the exit',
      appliedBy: rahimaUser!.userId!,
    })
    .returning({ id: regularizationRequests.id });
  await tx.insert(approvalSteps).values({
    tenantId,
    subjectType: 'regularization',
    subjectId: request!.id,
    stepNo: 1,
    kind: 'manager',
    approverEmployeeId: staff.get('MG-0004')!,
    status: 'pending',
  });
}
