import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  designations,
  documentCounters,
  documents,
  employeeNominees,
  employees,
  grades,
  jobAssignments,
  leaveLedger,
  leaveTypes,
  legalEntities,
  letterTemplates,
  locations,
  orgUnits,
  separations,
  type Tx,
} from '@gp/db';
import { BD_LETTER_TEMPLATES } from '@gp/country-packs';
import {
  fillTemplate,
  formatAddress,
  placeholdersIn,
  todayIn,
  type ApiError,
  type DocumentView,
  type EmploymentType,
  type IdCardsInput,
  type LetterGenerateInput,
  type LetterLanguage,
  type LetterPreview,
  type LetterTemplateUpdate,
  type LetterTemplateView,
} from '@gp/shared';
import { and, asc, desc, eq, inArray, lte, ne, sql } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { currentTenantId } from '../../common/request-context.js';
import { TenantDb } from '../../db/db.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { DocumentsService } from '../documents/documents.service.js';
import { inForceOn } from '../employees/employee.queries.js';
import { PdfService } from './pdf.service.js';
import {
  idCardsHtml,
  letterHtml,
  serviceBookHtml,
  type IdCard,
  type Letterhead,
  type ServiceBookSection,
} from './render.js';

type TemplateRow = typeof letterTemplates.$inferSelect;

const EMPLOYMENT_TYPE_BN: Record<EmploymentType, string> = {
  permanent: 'স্থায়ী',
  probationer: 'শিক্ষানবিশ',
  apprentice: 'শিক্ষাধীন',
  badli: 'বদলি',
  casual: 'সাময়িক',
  temporary: 'অস্থায়ী',
  seasonal: 'মৌসুমি',
  contractual: 'চুক্তিভিত্তিক',
};

const JOB_EVENT_LABELS: Record<string, [string, string]> = {
  hire: ['Joined', 'যোগদান'],
  confirmation: ['Confirmed', 'স্থায়ীকরণ'],
  transfer: ['Transfer', 'বদলি'],
  promotion: ['Promotion', 'পদোন্নতি'],
  increment: ['Increment', 'বেতন বৃদ্ধি'],
  redesignation: ['Redesignation', 'পদবি পরিবর্তন'],
  change: ['Change', 'পরিবর্তন'],
  separation: ['Separation', 'চাকরি ত্যাগ'],
};

const defaultOf = (row: Pick<TemplateRow, 'code' | 'language'>) =>
  BD_LETTER_TEMPLATES.find((d) => d.code === row.code && d.language === row.language);

function toTemplateView(row: TemplateRow): LetterTemplateView {
  const original = defaultOf(row);
  return {
    id: row.id,
    code: row.code,
    language: row.language,
    name: row.name,
    subject: row.subject,
    body: row.body,
    isActive: row.isActive,
    customized:
      !original ||
      original.name !== row.name ||
      original.subject !== row.subject ||
      original.body !== row.body,
    extraFields: placeholdersIn(`${row.subject}\n${row.body}`).filter((p) =>
      p.startsWith('extra.'),
    ),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** A date as the reader writes it: "24 October 2026" or "২৪ অক্টোবর, ২০২৬". */
const longDate = (iso: string | null | undefined, language: LetterLanguage) =>
  iso
    ? new Intl.DateTimeFormat(language === 'bn' ? 'bn-BD' : 'en-GB', {
        dateStyle: 'long',
        timeZone: 'UTC',
      }).format(new Date(`${iso}T00:00:00Z`))
    : null;

const pick = (
  language: LetterLanguage,
  en: string | null | undefined,
  bn: string | null | undefined,
) => (language === 'bn' && bn ? bn : en) ?? null;

/**
 * Letters from templates, ID cards and service books, all as PDFs. Generated letters are
 * numbered per legal entity and year and saved in the employee's documents.
 */
@Injectable()
export class LettersService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly vault: DocumentsService,
    private readonly pdf: PdfService,
    private readonly audit: TenantAuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Templates ──────────────────────────────────────────────────────────────

  templates(): Promise<LetterTemplateView[]> {
    return this.tenantDb.run(async (tx) =>
      (
        await tx
          .select()
          .from(letterTemplates)
          .orderBy(asc(letterTemplates.code), asc(letterTemplates.language))
      ).map(toTemplateView),
    );
  }

  updateTemplate(
    actor: AuthUser,
    id: string,
    input: LetterTemplateUpdate,
  ): Promise<LetterTemplateView> {
    return this.tenantDb.run(async (tx) => {
      const [row] = await tx
        .update(letterTemplates)
        .set({ ...input, updatedBy: actor.id, updatedAt: new Date() })
        .where(eq(letterTemplates.id, id))
        .returning();
      if (!row) throw new NotFoundException('Letter template not found');
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'letter.template.update',
        entityType: 'letter_template',
        entityId: id,
        after: input,
      });
      return toTemplateView(row);
    });
  }

  /** Back to the country pack's text. */
  resetTemplate(actor: AuthUser, id: string): Promise<LetterTemplateView> {
    return this.tenantDb.run(async (tx) => {
      const [current] = await tx.select().from(letterTemplates).where(eq(letterTemplates.id, id));
      if (!current) throw new NotFoundException('Letter template not found');
      const original = defaultOf(current);
      if (!original)
        throw new BadRequestException('This template has no standard text to go back to');
      const [row] = await tx
        .update(letterTemplates)
        .set({
          name: original.name,
          subject: original.subject,
          body: original.body,
          updatedBy: actor.id,
          updatedAt: new Date(),
        })
        .where(eq(letterTemplates.id, id))
        .returning();
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'letter.template.reset',
        entityType: 'letter_template',
        entityId: id,
      });
      return toTemplateView(row!);
    });
  }

  // ── Letters ────────────────────────────────────────────────────────────────

  /** Everything a template can say about an employee, in the letter's language. */
  private async context(tx: Tx, employeeId: string, language: LetterLanguage, date: string) {
    const [employee] = await tx.select().from(employees).where(eq(employees.id, employeeId));
    if (!employee) throw new NotFoundException('Employee not found');
    const jobs = await tx
      .select({
        job: jobAssignments,
        designation: designations,
        unit: orgUnits,
        location: locations,
        grade: grades,
        entity: legalEntities,
      })
      .from(jobAssignments)
      .innerJoin(legalEntities, eq(legalEntities.id, jobAssignments.legalEntityId))
      .leftJoin(designations, eq(designations.id, jobAssignments.designationId))
      .leftJoin(orgUnits, eq(orgUnits.id, jobAssignments.orgUnitId))
      .leftJoin(locations, eq(locations.id, jobAssignments.locationId))
      .leftJoin(grades, eq(grades.id, jobAssignments.gradeId))
      .where(eq(jobAssignments.employeeId, employeeId))
      .orderBy(desc(jobAssignments.effectiveFrom));
    // The job on the letter's date; for someone who has left, their last one.
    const current = jobs.find((j) => j.job.effectiveFrom <= date) ?? jobs.at(-1);
    const change = jobs.find((j) => j.job.effectiveFrom <= date && j.job.event !== 'hire');
    const [separation] = await tx
      .select()
      .from(separations)
      .where(
        and(
          eq(separations.employeeId, employeeId),
          ne(separations.status, 'cancelled'),
          ne(separations.status, 'rejected'),
        ),
      )
      .orderBy(desc(separations.createdAt))
      .limit(1);
    const entity = current?.entity;
    const companyAddress = entity?.address ? formatAddress(entity.address, language) : '';
    const letterhead: Letterhead = {
      name: entity?.legalName ?? entity?.name ?? '',
      details: [
        companyAddress,
        entity?.tin ? `TIN ${entity.tin}` : null,
        entity?.bin ? `BIN ${entity.bin}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    };
    const values: Record<string, string | null> = {
      'employee.name': pick(language, employee.fullName, employee.fullNameBn),
      'employee.code': employee.employeeCode,
      'employee.fatherName': employee.fatherName,
      'employee.motherName': employee.motherName,
      'employee.address': formatAddress(employee.presentAddress, language),
      'employee.permanentAddress': formatAddress(employee.permanentAddress, language),
      'employee.joinedOn': longDate(employee.joinedOn, language),
      'employee.dateOfBirth': longDate(employee.dateOfBirth, language),
      'job.designation': pick(language, current?.designation?.name, current?.designation?.nameBn),
      'job.department': pick(language, current?.unit?.name, current?.unit?.nameBn),
      'job.location': current?.location?.name ?? null,
      'job.grade': current?.grade?.name ?? null,
      'job.employmentType': current
        ? language === 'bn'
          ? EMPLOYMENT_TYPE_BN[current.job.employmentType]
          : current.job.employmentType.replace('_', ' ')
        : null,
      'company.name': letterhead.name,
      'company.address': companyAddress,
      'letter.date': longDate(date, language),
      'probation.endsOn': longDate(employee.probationEndsOn, language),
      'confirmation.date': longDate(employee.confirmedOn, language),
      'change.effectiveFrom': longDate(change?.job.effectiveFrom, language),
      'change.reason': change?.job.reason ?? null,
      'separation.noticeDate': longDate(separation?.noticeDate, language),
      'separation.lastWorkingDay': longDate(separation?.lastWorkingDay, language),
    };
    return { employee, current, letterhead, values };
  }

  private async template(tx: Tx, id: string): Promise<TemplateRow> {
    const [row] = await tx.select().from(letterTemplates).where(eq(letterTemplates.id, id));
    if (!row?.isActive) throw new NotFoundException('Letter template not found');
    return row;
  }

  private async compose(
    tx: Tx,
    employeeId: string,
    input: Pick<LetterGenerateInput, 'templateId' | 'date' | 'extra'>,
    refNo: string,
  ) {
    const template = await this.template(tx, input.templateId);
    const date = input.date ?? todayIn();
    const ctx = await this.context(tx, employeeId, template.language, date);
    const values: Record<string, string | null> = {
      ...ctx.values,
      'letter.refNo': refNo,
      ...Object.fromEntries(Object.entries(input.extra ?? {}).map(([k, v]) => [`extra.${k}`, v])),
    };
    const subject = fillTemplate(template.subject, values);
    const body = fillTemplate(template.body, values);
    // change.reason is optional: an empty line is better than a blocked letter.
    const missing = [...new Set([...subject.missing, ...body.missing])].filter(
      (m) => m !== 'change.reason',
    );
    const html = letterHtml({
      language: template.language,
      letterhead: ctx.letterhead,
      refNo,
      date: values['letter.date']!,
      subject: subject.text,
      body: body.text.replace(/\{\{\s*change\.reason\s*\}\}/g, ''),
    });
    return { template, ctx, html, missing, date };
  }

  preview(employeeId: string, input: LetterGenerateInput): Promise<LetterPreview> {
    return this.tenantDb.run(async (tx) => {
      const { html, missing } = await this.compose(tx, employeeId, input, '—');
      return { html, missing };
    });
  }

  /** Issues the letter: numbers it, renders the PDF and files it with the employee's documents. */
  generate(actor: AuthUser, employeeId: string, input: LetterGenerateInput): Promise<DocumentView> {
    return this.tenantDb.run(async (tx) => {
      const draft = await this.compose(tx, employeeId, input, '—');
      if (draft.missing.length) {
        const body: ApiError = {
          statusCode: 400,
          error: 'Bad Request',
          message: `Fill in ${draft.missing.join(', ')} before issuing this letter`,
          code: 'missing_fields',
          issues: draft.missing.map((m) => ({ path: m, message: 'No value' })),
        };
        throw new BadRequestException(body);
      }
      const year = Number(draft.date.slice(0, 4));
      const prefix = draft.ctx.current?.entity.code ?? 'HR';
      const refNo = `${prefix}/HR/${year}/${String(await this.nextNumber(tx, `letter:${prefix}`, year)).padStart(4, '0')}`;
      const { html, template, ctx } = await this.compose(tx, employeeId, input, refNo);
      const bytes = await this.pdf.render(html);
      const row = await this.vault.save(tx, {
        employeeId,
        category: 'letter',
        title: template.name,
        fileName: `${template.code}-${ctx.employee.employeeCode}-${refNo.replace(/\//g, '-')}.pdf`,
        bytes,
        source: 'generated',
        refNo,
        letterTemplateId: template.id,
        issuedOn: draft.date,
        visibleToEmployee: input.visibleToEmployee,
        uploadedBy: actor.id,
      });
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'letter.generate',
        entityType: 'document',
        entityId: row.id,
        after: { employeeId, template: template.code, language: template.language, refNo },
      });
      if (input.visibleToEmployee) {
        await this.notifications.notify(tx, {
          event: 'letter.issued',
          recipients: [{ employeeId }],
          values: { 'letter.title': template.name },
          link: '/workspace/profile',
          data: { documentId: row.id },
        });
      }
      return (await this.vault.load(tx, eq(documents.id, row.id)))[0]!;
    });
  }

  private async nextNumber(tx: Tx, key: string, year: number): Promise<number> {
    const [row] = await tx
      .insert(documentCounters)
      .values({ tenantId: currentTenantId(), key, year, value: 1 })
      .onConflictDoUpdate({
        target: [documentCounters.tenantId, documentCounters.key, documentCounters.year],
        set: { value: sql`${documentCounters.value} + 1` },
      })
      .returning({ value: documentCounters.value });
    return row!.value;
  }

  // ── ID cards and service book ──────────────────────────────────────────────

  idCards(input: IdCardsInput): Promise<Buffer> {
    return this.tenantDb.run(async (tx) => {
      const today = todayIn();
      const rows = await tx
        .select({
          e: employees,
          designation: designations,
          unit: orgUnits,
          entity: legalEntities,
        })
        .from(employees)
        .leftJoin(
          jobAssignments,
          and(eq(jobAssignments.employeeId, employees.id), inForceOn(today)),
        )
        .leftJoin(legalEntities, eq(legalEntities.id, jobAssignments.legalEntityId))
        .leftJoin(designations, eq(designations.id, jobAssignments.designationId))
        .leftJoin(orgUnits, eq(orgUnits.id, jobAssignments.orgUnitId))
        .where(inArray(employees.id, input.employeeIds))
        .orderBy(asc(employees.employeeCode));
      if (rows.length === 0) throw new NotFoundException('Employee not found');
      const photos = await this.vault.photos(
        tx,
        rows.map((r) => r.e.id),
      );
      const { language } = input;
      const entity = rows[0]!.entity;
      const cards: IdCard[] = rows.map(({ e, designation, unit }) => ({
        name: pick(language, e.fullName, e.fullNameBn) ?? e.fullName,
        code: e.employeeCode,
        designation: pick(language, designation?.name, designation?.nameBn) ?? '',
        department: pick(language, unit?.name, unit?.nameBn) ?? '',
        bloodGroup: e.bloodGroup ?? '—',
        joinedOn: longDate(e.joinedOn, language) ?? '',
        emergency: e.emergencyContact
          ? `${e.emergencyContact.name} (${e.emergencyContact.relation}) ${e.emergencyContact.phone}`
          : e.mobilePhone,
        photo: photos.get(e.id) ?? null,
      }));
      return this.pdf.render(
        idCardsHtml({
          language,
          company: {
            name: entity?.legalName ?? entity?.name ?? '',
            details: '',
            address: entity?.address ? formatAddress(entity.address, language) : '',
          },
          validUntil: longDate(input.validUntil, language),
          cards,
        }),
      );
    });
  }

  /** The service book (Labour Act s.6): particulars, nominees, job history and leave taken. */
  serviceBook(
    employeeId: string,
    language: LetterLanguage,
  ): Promise<{ fileName: string; bytes: Buffer }> {
    return this.tenantDb.run(async (tx) => {
      const today = todayIn();
      const ctx = await this.context(tx, employeeId, language, today);
      const e = ctx.employee;
      const bn = language === 'bn';
      const t = (en: string, b: string) => (bn ? b : en);
      const d = (iso: string | null) => longDate(iso, language) ?? '—';
      const n = (value: number) =>
        new Intl.NumberFormat(bn ? 'bn-BD' : 'en-GB', { useGrouping: false }).format(value);
      const jobs = await tx
        .select({
          job: jobAssignments,
          designation: designations,
          unit: orgUnits,
          location: locations,
          grade: grades,
        })
        .from(jobAssignments)
        .leftJoin(designations, eq(designations.id, jobAssignments.designationId))
        .leftJoin(orgUnits, eq(orgUnits.id, jobAssignments.orgUnitId))
        .leftJoin(locations, eq(locations.id, jobAssignments.locationId))
        .leftJoin(grades, eq(grades.id, jobAssignments.gradeId))
        .where(eq(jobAssignments.employeeId, employeeId))
        .orderBy(asc(jobAssignments.effectiveFrom));
      const nominees = await tx
        .select()
        .from(employeeNominees)
        .where(eq(employeeNominees.employeeId, employeeId));
      const leave = await tx
        .select({
          year: leaveLedger.leaveYear,
          code: leaveTypes.code,
          name: leaveTypes.name,
          nameBn: leaveTypes.nameBn,
          days: sql<string>`-sum(${leaveLedger.days})`,
        })
        .from(leaveLedger)
        .innerJoin(leaveTypes, eq(leaveTypes.id, leaveLedger.leaveTypeId))
        .where(
          and(
            eq(leaveLedger.employeeId, employeeId),
            inArray(leaveLedger.kind, ['taken', 'reversal']),
            lte(leaveLedger.leaveYear, Number(today.slice(0, 4))),
          ),
        )
        .groupBy(leaveLedger.leaveYear, leaveTypes.code, leaveTypes.name, leaveTypes.nameBn)
        .orderBy(asc(leaveLedger.leaveYear), asc(leaveTypes.code));
      const sections: ServiceBookSection[] = [
        {
          title: t('Particulars', 'বিবরণ'),
          rows: [
            [t('Name', 'নাম'), bn && e.fullNameBn ? `${e.fullNameBn} (${e.fullName})` : e.fullName],
            [t('Employee ID', 'কর্মী নম্বর'), e.employeeCode],
            [t("Father's name", 'পিতার নাম'), e.fatherName],
            [t("Mother's name", 'মাতার নাম'), e.motherName],
            [t("Spouse's name", 'স্বামী/স্ত্রীর নাম'), e.spouseName ?? '—'],
            [t('Date of birth', 'জন্ম তারিখ'), d(e.dateOfBirth)],
            [t('Permanent address', 'স্থায়ী ঠিকানা'), formatAddress(e.permanentAddress, language)],
            [t('Present address', 'বর্তমান ঠিকানা'), formatAddress(e.presentAddress, language)],
            [t('Blood group', 'রক্তের গ্রুপ'), e.bloodGroup ?? '—'],
            [t('Joined', 'যোগদান'), d(e.joinedOn)],
            [t('Confirmed', 'স্থায়ীকরণ'), d(e.confirmedOn)],
            [t('Left', 'চাকরি ত্যাগ'), d(e.separatedOn)],
          ],
        },
        {
          title: t('Employment', 'চাকরির ইতিহাস'),
          table: {
            head: [
              t('From', 'থেকে'),
              t('To', 'পর্যন্ত'),
              t('Event', 'ঘটনা'),
              t('Designation', 'পদবি'),
              t('Grade', 'গ্রেড'),
              t('Department', 'বিভাগ'),
              t('Location', 'কর্মস্থল'),
            ],
            body: jobs.map((j) => [
              d(j.job.effectiveFrom),
              j.job.effectiveTo ? d(j.job.effectiveTo) : t('now', 'বর্তমান'),
              JOB_EVENT_LABELS[j.job.event]?.[bn ? 1 : 0] ?? j.job.event,
              pick(language, j.designation?.name, j.designation?.nameBn) ?? '—',
              j.grade?.name ?? '—',
              pick(language, j.unit?.name, j.unit?.nameBn) ?? '—',
              j.location?.name ?? '—',
            ]),
          },
        },
        {
          title: t('Nominees', 'মনোনীত ব্যক্তি'),
          table: {
            head: [t('Name', 'নাম'), t('Relation', 'সম্পর্ক'), t('Share', 'অংশ')],
            body: nominees.map((nominee) => [
              nominee.name,
              nominee.relation,
              `${n(nominee.sharePercent)}%`,
            ]),
          },
          empty: t('No nominees recorded.', 'কোনো মনোনীত ব্যক্তি নেই।'),
        },
        {
          title: t('Leave taken', 'গৃহীত ছুটি'),
          table: {
            head: [t('Year', 'বছর'), t('Leave', 'ছুটি'), t('Days', 'দিন')],
            body: leave.map((l) => [
              n(l.year),
              pick(language, l.name, l.nameBn) ?? l.code,
              n(Number(l.days)),
            ]),
          },
          empty: t('No leave recorded.', 'কোনো ছুটির রেকর্ড নেই।'),
        },
      ];
      const bytes = await this.pdf.render(
        serviceBookHtml({
          language,
          company: ctx.letterhead,
          title: t('Service book', 'সার্ভিস বই'),
          subtitle: `${ctx.values['employee.name']} · ${e.employeeCode}`,
          sections,
          footer: t(
            `Kept under section 6 of the Bangladesh Labour Act 2006. Printed on ${d(today)}.`,
            `বাংলাদেশ শ্রম আইন ২০০৬-এর ধারা ৬ অনুযায়ী সংরক্ষিত। মুদ্রণ: ${d(today)}।`,
          ),
        }),
      );
      return { fileName: `service-book-${e.employeeCode}.pdf`, bytes };
    });
  }
}
