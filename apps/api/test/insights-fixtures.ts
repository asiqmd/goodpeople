import {
  attendanceDays,
  attendanceSettings,
  CIPHER_FIELDS,
  learningCourses,
  learningEnrolments,
  learningSessions,
  leaveLedger,
  leaveRequests,
  leaveTypes,
  payGroups,
  payrollRunItems,
  payrollRuns,
  resolveStatutoryContext,
  type FieldCipher,
  type Tx,
} from '@gp/db';
import { addDays, addMonths, Decimal } from '@gp/shared';

export async function lockedFixture(
  tx: Tx,
  cipher: FieldCipher,
  tenantId: string,
  group: string,
  month: string,
  people: string[],
  kind: 'regular' | 'adjustment' | 'wppf' = 'regular',
  status: 'locked' | 'cancelled' = 'locked',
) {
  const periodStart = month + '-01',
    periodEnd = addDays(addMonths(periodStart, 1), -1);
  const seal = (
    field: typeof CIPHER_FIELDS.runTotals | typeof CIPHER_FIELDS.runResults,
    value: unknown,
  ) => cipher.encrypt(JSON.stringify(value), { tenantId, field });
  const earnings = new Decimal('100.01').times(people.length).toFixed(2);
  const employerCost = new Decimal('5.49').times(people.length).toFixed(2);
  const [run] = await tx
    .insert(payrollRuns)
    .values({
      tenantId,
      payGroupId: group,
      periodStart,
      periodEnd,
      paymentDue: periodEnd,
      paymentDate: periodEnd,
      kind,
      status,
      headcount: people.length,
      lockedAt: new Date(),
      statutoryContext: await resolveStatutoryContext(tx, tenantId, group, periodStart, periodEnd),
      totalsEnc: seal(CIPHER_FIELDS.runTotals, {
        earnings,
        employerCost,
        deductions: '0.00',
        net: earnings,
      }),
    })
    .returning({ id: payrollRuns.id });
  await tx.insert(payrollRunItems).values(
    people.map((employeeId) => ({
      tenantId,
      runId: run!.id,
      employeeId,
      status: 'ok' as const,
      resultEnc: seal(CIPHER_FIELDS.runResults, {
        lines: [],
        variables: { otHours: '0' },
        earnings: '100.01',
        employerCost: '5.49',
        deductions: '0.00',
        net: '100.01',
      }),
    })),
  );
  return run!.id;
}

export async function seedInsightRecords(
  tx: Tx,
  input: {
    tenantId: string;
    actorId: string;
    company: string;
    people: string[];
    month: string;
    cipher: FieldCipher;
  },
) {
  const { tenantId, actorId, company, people, month, cipher } = input;
  const from = month + '-01',
    through = addDays(addMonths(from, 1), -1);
  const coverage = { trackingFrom: from, processedThrough: through };
  await tx
    .insert(attendanceSettings)
    .values({ tenantId, ...coverage })
    .onConflictDoUpdate({
      target: attendanceSettings.tenantId,
      set: coverage,
    });
  await tx.insert(attendanceDays).values(
    people.map((employeeId) => ({
      tenantId,
      employeeId,
      date: month + '-05',
      dayType: 'working' as const,
      status: 'present' as const,
      workedMinutes: 450,
    })),
  );
  const [leave] = await tx
    .insert(leaveTypes)
    .values({
      tenantId,
      code: 'INSIGHT-FIXTURE',
      name: 'Synthetic leave',
      accrual: 'annual_grant',
      daysPerYear: 12,
    })
    .returning({ id: leaveTypes.id });
  const requests = await tx
    .insert(leaveRequests)
    .values(
      people.map((employeeId) => ({
        tenantId,
        employeeId,
        startDate: month + '-10',
        endDate: month + '-10',
        days: 1,
        leaveTypeId: leave!.id,
        reason: 'Synthetic leave record',
        status: 'approved' as const,
        appliedBy: actorId,
      })),
    )
    .returning({ id: leaveRequests.id, employeeId: leaveRequests.employeeId });
  await tx.insert(leaveLedger).values(
    requests.map((r) => ({
      tenantId,
      employeeId: r.employeeId,
      leaveTypeId: leave!.id,
      leaveYear: Number(month.slice(0, 4)),
      kind: 'taken' as const,
      days: -1,
      requestId: r.id,
      createdBy: actorId,
      createdAt: new Date(month + '-07T06:00:00Z'),
    })),
  );
  const [course] = await tx
    .insert(learningCourses)
    .values({
      tenantId,
      code: 'INSIGHT-FIXTURE',
      name: 'Synthetic training',
      nameBn: 'Synthetic training',
      category: 'other',
    })
    .returning({ id: learningCourses.id });
  const [session] = await tx
    .insert(learningSessions)
    .values({
      tenantId,
      courseId: course!.id,
      legalEntityId: company,
      startsAt: new Date(month + '-08T06:00:00Z'),
      endsAt: new Date(month + '-08T08:00:00Z'),
      trainer: 'Synthetic trainer',
      venue: 'Synthetic venue',
      capacity: 20,
      status: 'completed',
      createdBy: actorId,
    })
    .returning({ id: learningSessions.id });
  await tx.insert(learningEnrolments).values(
    people.map((employeeId) => ({
      tenantId,
      sessionId: session!.id,
      employeeId,
      enrolledBy: actorId,
      status: 'attended' as const,
    })),
  );
  const [group] = await tx
    .insert(payGroups)
    .values({
      tenantId,
      legalEntityId: company,
      code: 'INSIGHT-FIXTURE',
      name: 'Synthetic payroll',
      frequency: 'monthly',
    })
    .returning({ id: payGroups.id });
  const run = await lockedFixture(tx, cipher, tenantId, group!.id, month, people);
  await lockedFixture(tx, cipher, tenantId, group!.id, month, people.slice(0, 1), 'wppf');
  await lockedFixture(
    tx,
    cipher,
    tenantId,
    group!.id,
    month,
    people.slice(0, 1),
    'regular',
    'cancelled',
  );
  return {
    group: group!.id,
    run,
    leaveType: leave!.id,
    firstRequest: requests[0]!.id,
    learningSession: session!.id,
  };
}
