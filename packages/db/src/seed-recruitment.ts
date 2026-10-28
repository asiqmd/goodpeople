import { addDays, DEFAULT_SCORECARD_CRITERIA, todayIn, zonedInstant } from '@gp/shared';
import type { Tx } from './client.js';
import {
  applicationEvents,
  applications,
  candidates,
  designations,
  employees,
  interviewPanel,
  interviews,
  jobOpenings,
  legalEntities,
  locations,
  orgUnits,
  recruitmentSettings,
} from './schema/index.js';

// Phase 4 M1: My Group hiring sewing operators through its careers page, with candidates at
// each stage and an interview tomorrow, and an approved opening for HR still to be posted.
// Run once: skipped when the workspace already has openings.

const byCode = async <T extends { id: string; code: string | null }>(rows: Promise<T[]>) =>
  new Map((await rows).map((r) => [r.code, r.id]));

export async function seedGroupRecruitment(tx: Tx, ctx: { tenantId: string }) {
  const { tenantId } = ctx;
  if ((await tx.select({ id: jobOpenings.id }).from(jobOpenings).limit(1)).length) return;

  const entity = await byCode(
    tx.select({ id: legalEntities.id, code: legalEntities.code }).from(legalEntities),
  );
  const unit = await byCode(tx.select({ id: orgUnits.id, code: orgUnits.code }).from(orgUnits));
  const place = await byCode(tx.select({ id: locations.id, code: locations.code }).from(locations));
  const role = await byCode(
    tx.select({ id: designations.id, code: designations.code }).from(designations),
  );
  const person = new Map(
    (await tx.select({ id: employees.id, code: employees.employeeCode }).from(employees)).map(
      (e) => [e.code, e.id],
    ),
  );

  await tx.insert(recruitmentSettings).values({
    tenantId,
    careersEnabled: true,
    introEn:
      'My Group makes garments in Gazipur and food in Narayanganj. We train new operators on the line, pay on the 7th of every month and keep the Labour Act.',
    introBn:
      'মাই গ্রুপ গাজীপুরে পোশাক ও নারায়ণগঞ্জে খাদ্যপণ্য তৈরি করে। নতুন অপারেটরদের আমরা লাইনেই প্রশিক্ষণ দিই, প্রতি মাসের ৭ তারিখে বেতন দিই এবং শ্রম আইন মেনে চলি।',
    retentionMonths: 12,
    privacyEmail: 'hr@my-group.test',
  });

  const today = todayIn();
  const [sewing] = await tx
    .insert(jobOpenings)
    .values({
      tenantId,
      legalEntityId: entity.get('MGT')!,
      orgUnitId: unit.get('MGT-L1'),
      locationId: place.get('GZP'),
      designationId: role.get('SO'),
      title: 'Sewing operators, line 1 (winter order)',
      employmentType: 'probationer',
      headcount: 3,
      reason: 'new_position',
      budgetMin: '12500',
      budgetMax: '14000',
      hiringManagerEmployeeId: person.get('MG-0004'),
      justification: 'The winter order adds a shift on line 1 from December.',
      status: 'open',
      postTitleEn: 'Sewing Machine Operator',
      postTitleBn: 'সেলাই মেশিন অপারেটর',
      descriptionEn: [
        'We are hiring three sewing machine operators for line 1 at our Gazipur factory.',
        '',
        '- Single-needle and overlock machines',
        '- At least six months on a garment line, or our own training',
        '- 8 hours a day, overtime paid at twice the hourly rate',
        '',
        'Bring your national ID card when you come for the interview.',
      ].join('\n'),
      descriptionBn: [
        'গাজীপুর কারখানার ১ নম্বর লাইনে আমরা তিনজন সেলাই মেশিন অপারেটর নিচ্ছি।',
        '',
        '- সিঙ্গেল নিডল ও ওভারলক মেশিন',
        '- পোশাক লাইনে অন্তত ছয় মাসের অভিজ্ঞতা, অথবা আমাদের প্রশিক্ষণ',
        '- দিনে ৮ ঘণ্টা, ওভারটাইম ঘণ্টাপ্রতি দ্বিগুণ হারে',
        '',
        'সাক্ষাৎকারে আসার সময় জাতীয় পরিচয়পত্র সঙ্গে আনবেন।',
      ].join('\n'),
      showSalary: true,
      closesOn: addDays(today, 30),
      publishedAt: new Date(),
      scorecardCriteria: [...DEFAULT_SCORECARD_CRITERIA],
    })
    .returning({ id: jobOpenings.id });

  await tx.insert(jobOpenings).values({
    tenantId,
    legalEntityId: entity.get('MGT')!,
    orgUnitId: unit.get('MGT-HR'),
    locationId: place.get('HO'),
    designationId: role.get('HRE'),
    title: 'HR executive, head office',
    employmentType: 'probationer',
    headcount: 1,
    reason: 'replacement',
    budgetMin: '35000',
    budgetMax: '45000',
    hiringManagerEmployeeId: person.get('MG-0001'),
    justification: 'Replaces the HR executive who leaves at the end of November.',
    status: 'approved',
    scorecardCriteria: [...DEFAULT_SCORECARD_CRITERIA],
  });

  const people = [
    { name: 'Shapla Begum', phone: '+8801711000101', source: 'careers_page', stage: 'applied' },
    { name: 'Mohammad Rana', phone: '+8801811000102', source: 'walk_in', stage: 'screening' },
    { name: 'Taslima Khatun', phone: '+8801911000103', source: 'referral', stage: 'interview' },
  ] as const;
  for (const p of people) {
    const [candidate] = await tx
      .insert(candidates)
      .values({
        tenantId,
        fullName: p.name,
        phone: p.phone,
        source: p.source,
        language: 'bn',
        referredByEmployeeId: p.source === 'referral' ? person.get('MG-0005') : null,
        consentAt: new Date(),
      })
      .returning({ id: candidates.id });
    const [application] = await tx
      .insert(applications)
      .values({
        tenantId,
        openingId: sewing!.id,
        candidateId: candidate!.id,
        stage: p.stage,
        source: p.source,
      })
      .returning({ id: applications.id });
    await tx.insert(applicationEvents).values({
      tenantId,
      applicationId: application!.id,
      kind: 'stage',
      toStage: 'applied',
      note: p.source,
    });
    if (p.stage !== 'applied') {
      await tx.insert(applicationEvents).values({
        tenantId,
        applicationId: application!.id,
        kind: 'stage',
        fromStage: 'applied',
        toStage: p.stage,
      });
    }
    if (p.stage === 'interview') {
      const tomorrow = addDays(today, 1);
      const [interview] = await tx
        .insert(interviews)
        .values({
          tenantId,
          applicationId: application!.id,
          kind: 'in_person',
          startsAt: zonedInstant(tomorrow, '10:00', 'Asia/Dhaka'),
          endsAt: zonedInstant(tomorrow, '10:30', 'Asia/Dhaka'),
          location: 'Gazipur factory, HR room',
          icsUid: `seed-${application!.id}@goodpeople`,
        })
        .returning({ id: interviews.id });
      await tx
        .insert(interviewPanel)
        .values({ tenantId, interviewId: interview!.id, employeeId: person.get('MG-0004')! });
    }
  }
}
