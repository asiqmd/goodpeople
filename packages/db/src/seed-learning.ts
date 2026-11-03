import { addDays, todayIn } from '@gp/shared';
import { eq, inArray } from 'drizzle-orm';
import type { Tx } from './client.js';
import {
  designations,
  employees,
  fireDrills,
  learningCertificates,
  learningCourses,
  learningEnrolments,
  learningRequirements,
  learningSessions,
  legalEntities,
  locations,
  tenantUsers,
} from './schema/index.js';
import { trainingExpiry } from '@gp/shared';
/** Add-only demo learning records; never enrol people or issue records outside this seed. */
export async function seedGroupLearning(tx: Tx, ctx: { tenantId: string }) {
  if (
    (await tx.select().from(learningCourses).where(eq(learningCourses.code, 'GP_FIRE_SAFETY')))
      .length
  )
    return;
  const [company] = await tx.select().from(legalEntities).where(eq(legalEntities.code, 'MGT'));
  const [site] = await tx.select().from(locations).where(eq(locations.code, 'GZP'));
  const operators = await tx
    .select()
    .from(designations)
    .where(inArray(designations.code, ['SO', 'SSO']));
  const [person] = await tx.select().from(employees).where(eq(employees.employeeCode, 'MG-0005'));
  const [admin] = await tx.select().from(tenantUsers).where(eq(tenantUsers.role, 'tenant_admin'));
  if (!company || !site || !operators.length || !person || !admin) return;
  const today = todayIn();
  const definitions = [
    {
      code: 'GP_FIRE_SAFETY',
      name: 'Fire safety and safe evacuation',
      nameBn: 'অগ্নি নিরাপত্তা ও নিরাপদে বের হওয়া',
      category: 'fire_safety' as const,
      validityMonths: 12,
    },
    {
      code: 'GP_HEALTH_SAFETY',
      name: 'Health and safety at work',
      nameBn: 'কর্মক্ষেত্রে স্বাস্থ্য ও নিরাপত্তা',
      category: 'health_safety' as const,
      validityMonths: 1,
    },
    {
      code: 'GP_ANTI_HARASSMENT',
      name: 'Respect at work and preventing harassment',
      nameBn: 'কর্মক্ষেত্রে মর্যাদা ও হয়রানি প্রতিরোধ',
      category: 'anti_harassment' as const,
      validityMonths: 12,
    },
  ];
  for (let i = 0; i < definitions.length; i++) {
    const definition = definitions[i]!;
    const [course] = await tx
      .insert(learningCourses)
      .values({ ...definition, tenantId: ctx.tenantId })
      .returning();
    await tx.insert(learningRequirements).values(
      operators.map((designation) => ({
        tenantId: ctx.tenantId,
        courseId: course!.id,
        legalEntityId: company.id,
        designationId: designation.id,
        effectiveFrom: '2024-01-01',
        graceDays: 30,
      })),
    );
    const day = addDays(today, i === 0 ? -14 : i === 1 ? -80 : 3);
    const startsAt = new Date(`${day}T09:00:00+06:00`);
    const endsAt = new Date(`${day}T10:00:00+06:00`);
    const [session] = await tx
      .insert(learningSessions)
      .values({
        tenantId: ctx.tenantId,
        courseId: course!.id,
        legalEntityId: company.id,
        locationId: site.id,
        startsAt,
        endsAt,
        trainer: 'My Group safety and HR team',
        venue: 'Gazipur training room',
        capacity: 30,
        status: i < 2 ? 'completed' : 'planned',
        createdBy: admin.id,
        note: i < 2 ? 'Seeded demo attendance register' : null,
      })
      .returning();
    const [enrolment] = await tx
      .insert(learningEnrolments)
      .values({
        tenantId: ctx.tenantId,
        sessionId: session!.id,
        employeeId: person.id,
        status: i < 2 ? 'attended' : 'enrolled',
        enrolledBy: admin.id,
      })
      .returning();
    if (i < 2)
      await tx.insert(learningCertificates).values({
        tenantId: ctx.tenantId,
        enrolmentId: enrolment!.id,
        employeeId: person.id,
        courseId: course!.id,
        legalEntityId: company.id,
        courseName: course!.name,
        courseNameBn: course!.nameBn,
        trainer: 'My Group safety and HR team',
        completedOn: day,
        expiresOn: trainingExpiry(day, definition.validityMonths),
        recordedBy: admin.id,
      });
  }
  await tx.insert(fireDrills).values({
    tenantId: ctx.tenantId,
    legalEntityId: company.id,
    locationId: site.id,
    heldOn: addDays(today, -20),
    nextDueOn: addDays(today, 160),
    participants: 10,
    evacuationSeconds: 180,
    conductor: 'My Group safety officer',
    findings: 'Demo: one exit needed clearer signs',
    actions: 'Demo: replace signs and brief the line supervisors',
    recordedBy: admin.id,
  });
}
