import { addDays, todayIn, weekdayOf, zonedInstant, type Address } from '@gp/shared';
import { eq } from 'drizzle-orm';
import {
  attendancePunches,
  attendanceSettings,
  createDb,
  designations,
  employees,
  grades,
  hashPassword,
  jobAssignments,
  legalEntities,
  loadRootEnv,
  locations,
  orgUnits,
  plans,
  platformUsers,
  provisionCountryDefaults,
  requireEnv,
  scopeToTenant,
  seedAdminEmail,
  tenants,
  tenantUsers,
} from '../index.js';

/**
 * A large workspace for measuring performance: `scale-test` with 5,000 employees (one
 * manager per 25), 500 logins and device punches for every working day of this month so far.
 * Run after the normal seed: `pnpm --filter @gp/db seed:scale`. Refuses if it already exists.
 */

const SLUG = 'scale-test';
const EMPLOYEES = Number(process.env.SCALE_EMPLOYEES ?? 5000);
const TEAM_SIZE = 25;
const LOGINS = 500;
const BATCH = 1000;
const address: Address = { line: 'Plot 12, BSCIC', district: 'Gazipur', division: 'dhaka' };

const chunks = <T>(rows: T[], size: number) =>
  Array.from({ length: Math.ceil(rows.length / size) }, (_, i) =>
    rows.slice(i * size, (i + 1) * size),
  );

loadRootEnv();
const { db, pool } = createDb(requireEnv('DATABASE_OWNER_URL'), { max: 2 });
const started = Date.now();
try {
  const [existing] = await db.select().from(tenants).where(eq(tenants.slug, SLUG));
  if (existing) {
    console.log(`${SLUG} already exists; drop it with \`pnpm db:reset\` to seed it again`);
    process.exit(0);
  }
  const [plan] = await db.select().from(plans).where(eq(plans.code, 'enterprise'));
  const [admin] = await db.select().from(platformUsers).limit(1);
  if (!plan || !admin) throw new Error('Run the normal seed first (plans and a super admin)');
  const passwordHash = await hashPassword(requireEnv('SEED_PASSWORD'));
  const today = todayIn();
  const monthStart = `${today.slice(0, 8)}01`;

  await db.transaction(async (tx) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({
        slug: SLUG,
        name: 'Scale Test Garments',
        industryTemplate: 'rmg',
        billingMode: 'internal',
        planId: plan.id,
        bypassReason: 'Performance measurements',
        grantedBy: admin.id,
      })
      .returning();
    const tenantId = tenant!.id;
    await scopeToTenant(tx, tenantId);
    await provisionCountryDefaults(tx, tenantId, { countryPack: 'BD', today });
    await tx
      .update(attendanceSettings)
      .set({ trackingFrom: monthStart })
      .where(eq(attendanceSettings.tenantId, tenantId));

    const [entity] = await tx
      .insert(legalEntities)
      .values({
        tenantId,
        name: 'Scale Test Garments Ltd',
        code: 'STG',
        tin: '123456789012',
        registrationNo: 'C-123456',
      })
      .returning();
    const sites = await tx
      .insert(locations)
      .values(
        ['Gazipur', 'Ashulia', 'Narayanganj'].map((name, i) => ({
          tenantId,
          legalEntityId: entity!.id,
          code: `F${i + 1}`,
          name: `${name} factory`,
          kind: 'factory' as const,
        })),
      )
      .returning();
    const units = await tx
      .insert(orgUnits)
      .values(
        Array.from({ length: 40 }, (_, i) => ({
          tenantId,
          legalEntityId: entity!.id,
          kind: 'line' as const,
          code: `L${String(i + 1).padStart(2, '0')}`,
          name: `Sewing line ${i + 1}`,
        })),
      )
      .returning();
    const [operator, supervisor] = await tx
      .insert(designations)
      .values([
        {
          tenantId,
          code: 'SMO',
          name: 'Sewing machine operator',
          workerCategory: 'worker' as const,
        },
        { tenantId, code: 'LSV', name: 'Line supervisor', workerCategory: 'staff' as const },
      ])
      .returning();
    const [grade] = await tx
      .insert(grades)
      .values({ tenantId, code: 'G5', name: 'Grade 5', rank: 5 })
      .returning();

    // Logins first: managers (every 25th person) and the first workers get one.
    const people = Array.from({ length: EMPLOYEES }, (_, i) => ({
      code: `ST-${String(i + 1).padStart(5, '0')}`,
      manager: i % TEAM_SIZE === 0,
      login: i < LOGINS || i % TEAM_SIZE === 0,
    }));
    const userIds = new Map<string, string>();
    for (const batch of chunks(
      people.filter((p) => p.login),
      BATCH,
    )) {
      const rows = await tx
        .insert(tenantUsers)
        .values(
          batch.map((p) => ({
            tenantId,
            email: `${p.code.toLowerCase()}@scale.test`,
            name: `Employee ${p.code}`,
            passwordHash,
            role: 'employee' as const,
          })),
        )
        .returning({ id: tenantUsers.id, email: tenantUsers.email });
      for (const r of rows) userIds.set(r.email!.split('@')[0]!.toUpperCase(), r.id);
    }
    await tx.insert(tenantUsers).values({
      tenantId,
      email: seedAdminEmail(SLUG),
      name: 'Scale Test Admin',
      passwordHash,
      role: 'tenant_admin',
    });

    const ids: string[] = [];
    for (const [b, batch] of chunks(people, BATCH).entries()) {
      const rows = await tx
        .insert(employees)
        .values(
          batch.map((p, i) => ({
            tenantId,
            employeeCode: p.code,
            userId: userIds.get(p.code) ?? null,
            fullName: `Employee ${p.code}`,
            fatherName: 'Abdul Karim',
            motherName: 'Hosne Ara',
            dateOfBirth: `199${(b + i) % 10}-0${((b + i) % 9) + 1}-15`,
            gender: (i % 3 === 0 ? 'male' : 'female') as 'male' | 'female',
            mobilePhone: `+88017${String(10_000_000 + b * BATCH + i).slice(-8)}`,
            presentAddress: address,
            permanentAddress: address,
            joinedOn: '2024-01-01',
            attendancePin: String(10_000 + b * BATCH + i),
          })),
        )
        .returning({ id: employees.id });
      ids.push(...rows.map((r) => r.id));
    }

    for (const batch of chunks(
      people.map((p, i) => ({ ...p, i })),
      BATCH,
    )) {
      await tx.insert(jobAssignments).values(
        batch.map(({ manager, i }) => ({
          tenantId,
          employeeId: ids[i]!,
          event: 'hire' as const,
          effectiveFrom: '2024-01-01',
          legalEntityId: entity!.id,
          locationId: sites[i % sites.length]!.id,
          orgUnitId: units[Math.floor(i / 125) % units.length]!.id,
          designationId: manager ? supervisor!.id : operator!.id,
          gradeId: grade!.id,
          managerId: manager ? null : ids[i - (i % TEAM_SIZE)]!,
          employmentType: 'permanent' as const,
          workerCategory: manager ? ('staff' as const) : ('worker' as const),
        })),
      );
    }

    // Two device punches per working day (Friday off), with a few late arrivals.
    const days: string[] = [];
    for (let d = monthStart; d < today; d = addDays(d, 1)) if (weekdayOf(d) !== 5) days.push(d);
    const punches = days.flatMap((day, dayIndex) =>
      ids.flatMap((employeeId, i) => {
        if ((i + dayIndex) % 40 === 0) return []; // absent now and then
        const late = (i * 7 + dayIndex) % 30 === 0 ? 25 : 0;
        const inMinute = 50 + ((i + dayIndex) % 9) + late;
        return [
          { at: zonedInstant(day, `07:${String(inMinute % 60).padStart(2, '0')}`, 'Asia/Dhaka') },
          {
            at: zonedInstant(
              day,
              `17:${String((i + dayIndex) % 15).padStart(2, '0')}`,
              'Asia/Dhaka',
            ),
          },
        ].map(({ at }) => ({
          tenantId,
          employeeId,
          punchedAt: at,
          source: 'device' as const,
          deviceUserId: String(10_000 + i),
        }));
      }),
    );
    for (const batch of chunks(punches, 5000)) await tx.insert(attendancePunches).values(batch);
    console.log(
      `${SLUG}: ${ids.length} employees, ${userIds.size + 1} logins, ${punches.length} punches over ${days.length} days`,
    );
  });
  console.log(
    `Seeded in ${((Date.now() - started) / 1000).toFixed(1)} s. Admin: ${seedAdminEmail(SLUG)}`,
  );
} finally {
  await pool.end();
}
