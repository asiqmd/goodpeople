import { DEFAULT_COMPETENCIES, DEFAULT_RATING_GUIDE, type Rating } from '@gp/shared';
import { eq } from 'drizzle-orm';
import type { Tx } from './client.js';
import {
  designations,
  employees,
  goals,
  orgUnits,
  performanceSettings,
  reviewCycles,
  reviews,
  tenantUsers,
} from './schema/index.js';

// Phase 4 M2: My Group's last annual review, released (the input M3's increment round reads),
// and this half-year's cycle under way: Rahima at her self review with goals agreed by her line
// supervisor Shirin, and three operators without logins waiting for Shirin's review.
// Run once: skipped when the workspace already has review cycles.

const competencies = [...DEFAULT_COMPETENCIES];
const rated = (r: Rating) =>
  Object.fromEntries(competencies.map((c) => [c.key, { rating: r }])) as Record<
    string,
    { rating: number }
  >;

export async function seedGroupPerformance(tx: Tx, ctx: { tenantId: string }) {
  const { tenantId } = ctx;
  if ((await tx.select({ id: reviewCycles.id }).from(reviewCycles).limit(1)).length) return;

  const person = new Map(
    (await tx.select({ id: employees.id, code: employees.employeeCode }).from(employees)).map(
      (e) => [e.code, e.id],
    ),
  );
  const [line1] = await tx
    .select({ id: orgUnits.id })
    .from(orgUnits)
    .where(eq(orgUnits.code, 'MGT-L1'));
  const [senior] = await tx
    .select({ id: designations.id })
    .from(designations)
    .where(eq(designations.code, 'SSO'));
  const [admin] = await tx
    .select({ id: tenantUsers.id })
    .from(tenantUsers)
    .where(eq(tenantUsers.role, 'tenant_admin'))
    .limit(1);

  await tx.insert(performanceSettings).values({
    tenantId,
    competencies,
    ratingGuide: Object.fromEntries(Object.entries(DEFAULT_RATING_GUIDE)),
  });

  const released = new Date('2026-08-10T10:00:00+06:00');
  const [annual] = await tx
    .insert(reviewCycles)
    .values({
      tenantId,
      name: 'Annual review 2025-26',
      periodStart: '2025-07-01',
      periodEnd: '2026-06-30',
      selfReview: true,
      competencies,
      selfDueOn: '2026-07-15',
      managerDueOn: '2026-07-25',
      calibrationDueOn: '2026-08-05',
      status: 'released',
      launchedAt: new Date('2026-07-01T09:00:00+06:00'),
      releasedAt: released,
      createdByUserId: admin?.id,
    })
    .returning({ id: reviewCycles.id });
  const outcomes: [
    string,
    string,
    Rating,
    { increment: boolean; promote?: boolean; plan?: boolean },
  ][] = [
    ['MG-0002', 'MG-0001', 4, { increment: true }],
    ['MG-0005', 'MG-0004', 3, { increment: true }],
    ['MG-0006', 'MG-0004', 4, { increment: true, promote: true }],
    ['MG-0007', 'MG-0004', 2, { increment: false, plan: true }],
    ['MG-0010', 'MG-0004', 3, { increment: true }],
  ];
  for (const [code, manager, rating, rec] of outcomes) {
    await tx.insert(reviews).values({
      tenantId,
      cycleId: annual!.id,
      employeeId: person.get(code)!,
      managerEmployeeId: person.get(manager),
      status: code === 'MG-0005' ? 'acknowledged' : 'released',
      managerAnswers: {
        goals: {},
        competencies: rated(rating),
        overall: 'Reviewed with the line.',
      },
      managerSubmittedAt: new Date('2026-07-24T15:00:00+06:00'),
      proposedRating: rating,
      finalRating: rating,
      recommendations: {
        increment: rec.increment,
        promotionDesignationId: rec.promote ? (senior?.id ?? null) : null,
        plan: !!rec.plan,
      },
      calibratedByUserId: admin?.id,
      calibratedAt: new Date('2026-08-04T12:00:00+06:00'),
      releasedAt: released,
      ...(code === 'MG-0005'
        ? {
            acknowledgedAt: new Date('2026-08-12T09:30:00+06:00'),
            employeeAgrees: true,
            employeeComment: 'Thank you. I want to learn the overlock machine this year.',
          }
        : {}),
    });
  }

  const [half] = await tx
    .insert(reviewCycles)
    .values({
      tenantId,
      name: 'Half-year review, July–December 2026',
      periodStart: '2026-07-01',
      periodEnd: '2026-12-31',
      selfReview: true,
      peerReview: true,
      competencies,
      goalsDueOn: '2026-08-15',
      selfDueOn: '2026-11-20',
      peerDueOn: '2026-11-25',
      managerDueOn: '2026-12-05',
      calibrationDueOn: '2026-12-12',
      status: 'active',
      launchedAt: new Date('2026-07-05T09:00:00+06:00'),
      createdByUserId: admin?.id,
    })
    .returning({ id: reviewCycles.id });
  await tx.insert(reviews).values(
    [
      { code: 'MG-0005', status: 'self' as const },
      { code: 'MG-0006', status: 'manager' as const },
      { code: 'MG-0007', status: 'manager' as const },
      { code: 'MG-0010', status: 'manager' as const },
    ].map((r) => ({
      tenantId,
      cycleId: half!.id,
      employeeId: person.get(r.code)!,
      managerEmployeeId: person.get('MG-0004'),
      status: r.status,
    })),
  );

  const [lineGoal] = await tx
    .insert(goals)
    .values({
      tenantId,
      orgUnitId: line1!.id,
      cycleId: half!.id,
      title: 'Line 1 meets 90% of its daily output target',
      kind: 'kpi',
      measureUnit: '%',
      target: '90',
      direction: 'higher',
      source: 'production_target',
      startsOn: '2026-07-01',
      dueOn: '2026-12-31',
      status: 'agreed',
      agreedAt: new Date('2026-07-10T10:00:00+06:00'),
      createdByUserId: admin?.id,
    })
    .returning({ id: goals.id });
  const agreed = {
    tenantId,
    employeeId: person.get('MG-0005')!,
    cycleId: half!.id,
    startsOn: '2026-07-01',
    dueOn: '2026-12-31',
    status: 'agreed' as const,
    agreedAt: new Date('2026-08-12T11:00:00+06:00'),
  };
  await tx.insert(goals).values([
    {
      ...agreed,
      parentGoalId: lineGoal!.id,
      title: 'Meet my daily output target',
      kind: 'kpi' as const,
      measureUnit: '%',
      target: '90',
      direction: 'higher' as const,
      source: 'production_target' as const,
      weight: '40',
    },
    {
      ...agreed,
      title: 'Come to work on every working day',
      kind: 'kpi' as const,
      measureUnit: '%',
      target: '95',
      direction: 'higher' as const,
      source: 'attendance_rate' as const,
      weight: '30',
    },
    {
      ...agreed,
      title: 'Learn the overlock machine',
      kind: 'objective' as const,
      keyResults: [
        { text: 'Two weeks of training with the line supervisor', done: true },
        { text: 'Sew a full bundle on the overlock without rework', done: false },
      ],
      progress: 50,
      weight: '30',
    },
  ]);
}
