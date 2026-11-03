import { addDays, emptySurveyTotals, todayIn } from '@gp/shared';
import { and, eq, gte, isNull, lte, or } from 'drizzle-orm';
import type { Tx } from './client.js';
import { CIPHER_FIELDS, type FieldCipher } from './field-cipher.js';
import {
  announcementReceipts,
  announcements,
  assetIssues,
  companyAssets,
  employees,
  engagementSurveys,
  hrRequestMessages,
  hrRequests,
  jobAssignments,
  legalEntities,
  recognitions,
  surveyParticipants,
  tenantUsers,
} from './schema/index.js';
/** Add-only sample records; no messages are delivered and no anonymous answers are invented. */
export async function seedGroupEmployeeServices(
  tx: Tx,
  ctx: { tenantId: string; cipher: FieldCipher },
) {
  if (
    (
      await tx
        .select()
        .from(announcements)
        .where(eq(announcements.title, 'Welcome to Employee services — demo'))
    ).length
  )
    return;
  const [company] = await tx.select().from(legalEntities).where(eq(legalEntities.code, 'MGT'));
  const [admin] = await tx.select().from(tenantUsers).where(eq(tenantUsers.role, 'tenant_admin'));
  const [rahima] = await tx.select().from(employees).where(eq(employees.employeeCode, 'MG-0005'));
  const [shirin] = await tx.select().from(employees).where(eq(employees.employeeCode, 'MG-0004'));
  if (!company || !admin || !rahima || !shirin) return;
  const on = todayIn();
  const people = await tx
    .select({ id: employees.id })
    .from(employees)
    .innerJoin(jobAssignments, eq(jobAssignments.employeeId, employees.id))
    .where(
      and(
        eq(jobAssignments.legalEntityId, company.id),
        lte(jobAssignments.effectiveFrom, on),
        or(isNull(jobAssignments.effectiveTo), gte(jobAssignments.effectiveTo, on)),
        lte(employees.joinedOn, on),
        or(isNull(employees.separatedOn), gte(employees.separatedOn, on)),
      ),
    );
  await tx.insert(announcements).values({
    tenantId: ctx.tenantId,
    legalEntityId: company.id,
    title: 'Welcome to Employee services — demo',
    titleBn: 'কর্মীসেবায় স্বাগতম — নমুনা',
    body: 'Demo: send a private request to your HR team, see issued assets, recognize colleagues and read company news here. Statutory grievances and harassment concerns use the separate grievance channel.',
    bodyBn:
      'নমুনা: এখানে এইচআরকে ব্যক্তিগত অনুরোধ পাঠান, নেওয়া সম্পদ দেখুন, সহকর্মীর অবদানের স্বীকৃতি দিন ও কোম্পানির খবর পড়ুন। বিধিবদ্ধ অভিযোগ ও হয়রানির বিষয় আলাদা অভিযোগ চ্যানেলে জানান।',
    status: 'published',
    createdBy: admin.id,
  });
  const [policy] = await tx
    .insert(announcements)
    .values({
      tenantId: ctx.tenantId,
      legalEntityId: company.id,
      title: 'Workplace care and equipment — demo policy',
      titleBn: 'কর্মস্থল ও সরঞ্জামের যত্ন — নমুনা নীতিমালা',
      body: 'Demo policy: keep shared equipment safe and report a fault to HR. Acknowledgement records that you have read this notice; it is not agreement to new employment terms.',
      bodyBn:
        'নমুনা নীতিমালা: সবার ব্যবহারের সরঞ্জাম নিরাপদে রাখুন ও ত্রুটি এইচআরকে জানান। প্রাপ্তি স্বীকার মানে আপনি নোটিশটি পড়েছেন; চাকরির নতুন শর্তে সম্মতি নয়।',
      status: 'published',
      requiresAcknowledgement: true,
      dueOn: addDays(on, 7),
      createdBy: admin.id,
    })
    .returning();
  if (people.length)
    await tx.insert(announcementReceipts).values(
      people.map((p) => ({
        tenantId: ctx.tenantId,
        announcementId: policy!.id,
        employeeId: p.id,
      })),
    );
  if (people.length >= 5) {
    const [survey] = await tx
      .insert(engagementSurveys)
      .values({
        tenantId: ctx.tenantId,
        legalEntityId: company.id,
        title: 'Employee pulse — demo',
        titleBn: 'কর্মীদের মতামত — নমুনা',
        description:
          'Demo anonymous survey. Results appear only after closing and five responses. No individual answers are stored.',
        descriptionBn:
          'নমুনা বেনামি জরিপ। জরিপ শেষ হলে অন্তত পাঁচটি উত্তর পেলে ফল দেখা যাবে। আলাদা ব্যক্তির উত্তর সংরক্ষণ করা হয় না।',
        questions: [
          { text: 'I have the tools I need', textBn: 'কাজের প্রয়োজনীয় সরঞ্জাম পাই' },
          { text: 'My team supports me', textBn: 'আমার দল আমাকে সহায়তা করে' },
        ],
        threshold: 5,
        closesAt: new Date(`${addDays(on, 7)}T17:00:00+06:00`),
        status: 'open',
        audienceCount: people.length,
        totals: emptySurveyTotals(2),
        createdBy: admin.id,
      })
      .returning();
    await tx
      .insert(surveyParticipants)
      .values(
        people.map((p) => ({ tenantId: ctx.tenantId, surveyId: survey!.id, employeeId: p.id })),
      );
  }
  await tx.insert(recognitions).values({
    tenantId: ctx.tenantId,
    legalEntityId: company.id,
    senderId: shirin.id,
    recipientId: rahima.id,
    value: 'teamwork',
    message: 'Demo: thank you for helping colleagues prepare their workstations.',
  });
  const seal = (value: unknown) =>
    ctx.cipher.encrypt(JSON.stringify(value), {
      tenantId: ctx.tenantId,
      field: CIPHER_FIELDS.hrRequestText,
    });
  const [request] = await tx
    .insert(hrRequests)
    .values({
      tenantId: ctx.tenantId,
      legalEntityId: company.id,
      employeeId: rahima.id,
      category: 'letters',
      priority: 'normal',
      status: 'in_progress',
      assigneeId: admin.id,
      contentEnc: seal({
        subject: 'Demo: employment letter',
        body: 'Please prepare an employment letter for my bank. This is sample data.',
      }),
    })
    .returning();
  await tx.insert(hrRequestMessages).values([
    {
      tenantId: ctx.tenantId,
      requestId: request!.id,
      authorId: admin.id,
      authorName: admin.name,
      bodyEnc: seal('Demo: we are preparing your letter.'),
      internal: false,
    },
    {
      tenantId: ctx.tenantId,
      requestId: request!.id,
      authorId: admin.id,
      authorName: admin.name,
      bodyEnc: seal('Demo internal note: verify the requested dates before issuing.'),
      internal: true,
    },
  ]);
  const [card] = await tx
    .insert(companyAssets)
    .values({
      tenantId: ctx.tenantId,
      legalEntityId: company.id,
      tag: 'GP-DEMO-ID-01',
      name: 'Demo staff ID card',
      nameBn: 'নমুনা কর্মী পরিচয়পত্র',
      kind: 'id_card',
      serialNumber: 'DEMO-0005',
    })
    .returning();
  await tx.insert(assetIssues).values({
    tenantId: ctx.tenantId,
    assetId: card!.id,
    employeeId: rahima.id,
    issuedOn: addDays(on, -10),
    dueOn: addDays(on, 30),
    issueCondition: 'Demo: new and intact.',
  });
  await tx.insert(companyAssets).values({
    tenantId: ctx.tenantId,
    legalEntityId: company.id,
    tag: 'GP-DEMO-LAPTOP-01',
    name: 'Demo work laptop',
    nameBn: 'নমুনা কাজের ল্যাপটপ',
    kind: 'laptop',
    serialNumber: 'DEMO-LAPTOP-01',
  });
}
