import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  CIPHER_FIELDS,
  costCentres,
  designations,
  employees,
  grades,
  importBatches,
  legalEntities,
  locations,
  orgUnits,
  type FieldCipher,
  type Tx,
} from '@gp/db';
import {
  BD_DIVISIONS,
  BLOOD_GROUPS,
  EMPLOYMENT_TYPES,
  GENDERS,
  MARITAL_STATUSES,
  MAX_IMPORT_ROWS,
  RELIGIONS,
  WORKER_CATEGORIES,
  hireEmployeeSchema,
  type HireEmployeeInput,
  type ImportBatchView,
  type ImportRowReport,
  type TenantWithAccess,
} from '@gp/shared';
import ExcelJS from 'exceljs';
import { cellText } from '../../common/sheets.js';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { currentTenantId } from '../../common/request-context.js';
import { FIELD_CIPHER, TenantDb } from '../../db/db.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { EmployeesService } from '../employees/employees.service.js';

type BatchRow = typeof importBatches.$inferSelect;

/** A spreadsheet column: its header, and where its value goes in a hire. */
interface Column {
  key: string;
  required?: boolean;
  hint: string;
}

/** The import template's columns, in order. Codes refer to the Lists sheet. */
export const IMPORT_COLUMNS: readonly Column[] = [
  { key: 'employee_code', required: true, hint: 'Unique in the workspace, e.g. MG-0101' },
  { key: 'full_name', required: true, hint: 'As on the NID' },
  { key: 'full_name_bn', hint: 'In Bangla' },
  { key: 'father_name', required: true, hint: '' },
  { key: 'mother_name', required: true, hint: '' },
  { key: 'spouse_name', hint: '' },
  { key: 'date_of_birth', required: true, hint: 'YYYY-MM-DD or an Excel date' },
  { key: 'gender', required: true, hint: GENDERS.join(' / ') },
  { key: 'religion', hint: RELIGIONS.join(' / ') },
  { key: 'marital_status', hint: MARITAL_STATUSES.join(' / ') },
  { key: 'blood_group', hint: BLOOD_GROUPS.join(' / ') },
  { key: 'mobile_phone', required: true, hint: '01XXXXXXXXX' },
  { key: 'work_email', hint: '' },
  { key: 'personal_email', hint: '' },
  { key: 'nid', hint: '10, 13 or 17 digits; an NID, birth registration or passport is needed' },
  { key: 'birth_registration', hint: '17 digits' },
  { key: 'passport', hint: 'e.g. A12345678' },
  { key: 'tin', hint: '12 digits' },
  { key: 'present_address', required: true, hint: 'House, road, village' },
  { key: 'present_upazila', hint: '' },
  { key: 'present_district', required: true, hint: 'e.g. Gazipur' },
  { key: 'present_division', required: true, hint: 'Division code, see Lists' },
  { key: 'present_postcode', hint: '4 digits' },
  { key: 'permanent_address', hint: 'Leave the permanent columns empty if the same as present' },
  { key: 'permanent_upazila', hint: '' },
  { key: 'permanent_district', hint: '' },
  { key: 'permanent_division', hint: '' },
  { key: 'permanent_postcode', hint: '' },
  { key: 'emergency_name', hint: 'Name, relation and phone, or none of them' },
  { key: 'emergency_relation', hint: '' },
  { key: 'emergency_phone', hint: '' },
  { key: 'joined_on', required: true, hint: 'YYYY-MM-DD' },
  { key: 'probation_ends_on', hint: 'Empty: the Labour Act period for probationers' },
  { key: 'legal_entity', required: true, hint: 'Code, see Lists' },
  { key: 'location', hint: 'Code' },
  { key: 'org_unit', hint: 'Code' },
  { key: 'designation', hint: 'Code' },
  { key: 'grade', hint: 'Code' },
  { key: 'cost_centre', hint: 'Code' },
  { key: 'manager', hint: 'Employee code of the manager, existing or earlier in this file' },
  { key: 'employment_type', required: true, hint: EMPLOYMENT_TYPES.join(' / ') },
  { key: 'worker_category', required: true, hint: WORKER_CATEGORIES.join(' / ') },
  { key: 'attendance_pin', hint: 'Number on the attendance devices' },
];

/** Where a hire field's validation error shows in the spreadsheet. */
const COLUMN_OF: Record<string, string> = {
  employeeCode: 'employee_code',
  fullName: 'full_name',
  fullNameBn: 'full_name_bn',
  fatherName: 'father_name',
  motherName: 'mother_name',
  spouseName: 'spouse_name',
  dateOfBirth: 'date_of_birth',
  maritalStatus: 'marital_status',
  bloodGroup: 'blood_group',
  mobilePhone: 'mobile_phone',
  workEmail: 'work_email',
  personalEmail: 'personal_email',
  'identity.nid': 'nid',
  'identity.birthRegistration': 'birth_registration',
  'identity.passport': 'passport',
  'identity.tin': 'tin',
  'presentAddress.line': 'present_address',
  'presentAddress.upazila': 'present_upazila',
  'presentAddress.district': 'present_district',
  'presentAddress.division': 'present_division',
  'presentAddress.postcode': 'present_postcode',
  'permanentAddress.line': 'permanent_address',
  'permanentAddress.upazila': 'permanent_upazila',
  'permanentAddress.district': 'permanent_district',
  'permanentAddress.division': 'permanent_division',
  'permanentAddress.postcode': 'permanent_postcode',
  'emergencyContact.name': 'emergency_name',
  'emergencyContact.relation': 'emergency_relation',
  'emergencyContact.phone': 'emergency_phone',
  joinedOn: 'joined_on',
  probationEndsOn: 'probation_ends_on',
  'job.legalEntityId': 'legal_entity',
  'job.employmentType': 'employment_type',
  'job.workerCategory': 'worker_category',
};

/** A placeholder manager id for a manager who is earlier in the same file. */
const LATER = '00000000-0000-4000-8000-000000000000';

interface ParsedRow {
  row: number;
  input: HireEmployeeInput;
  managerCode: string | null;
  attendancePin: string | null;
  valid: boolean;
}

const MS_PER_DAY = 86_400_000;

/** Records by lower-cased code, for matching what people type in a spreadsheet. */
const byCode = async <T extends { id: string; code: string | null }>(rows: Promise<T[]>) =>
  new Map((await rows).filter((r) => r.code).map((r) => [r.code!.toLowerCase(), r.id]));

/**
 * Bulk hiring from a spreadsheet. Uploading checks every row with the same rules as the
 * hire form and keeps the rows (encrypted: they hold identity numbers) for a day; nothing is
 * created until HR commits.
 */
@Injectable()
export class ImportsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly employeesService: EmployeesService,
    private readonly audit: TenantAuditService,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
  ) {}

  /** The template: an empty Employees sheet, the codes to use, and instructions. */
  template(): Promise<Buffer> {
    return this.tenantDb.run(async (tx) => {
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Good People';
      const sheet = wb.addWorksheet('Employees', { views: [{ state: 'frozen', ySplit: 1 }] });
      sheet.columns = IMPORT_COLUMNS.map((c) => ({
        header: c.key,
        key: c.key,
        width: Math.max(14, c.key.length + 4),
      }));
      sheet.getRow(1).eachCell((cell, n) => {
        const column = IMPORT_COLUMNS[n - 1]!;
        cell.font = { bold: column.required === true };
        if (column.hint) cell.note = column.hint;
      });
      // Text format keeps leading zeros in phone numbers, NIDs and PINs.
      for (const key of [
        'mobile_phone',
        'emergency_phone',
        'nid',
        'birth_registration',
        'tin',
        'attendance_pin',
      ]) {
        sheet.getColumn(key).numFmt = '@';
      }

      const lists = wb.addWorksheet('Lists');
      const listColumns: [string, string[]][] = [
        [
          'legal_entity',
          (await tx.select().from(legalEntities)).map((r) => `${r.code ?? ''} · ${r.name}`),
        ],
        ['location', (await tx.select().from(locations)).map((r) => `${r.code} · ${r.name}`)],
        ['org_unit', (await tx.select().from(orgUnits)).map((r) => `${r.code} · ${r.name}`)],
        ['designation', (await tx.select().from(designations)).map((r) => `${r.code} · ${r.name}`)],
        ['grade', (await tx.select().from(grades)).map((r) => `${r.code} · ${r.name}`)],
        ['cost_centre', (await tx.select().from(costCentres)).map((r) => `${r.code} · ${r.name}`)],
        ['division', BD_DIVISIONS.map((d) => `${d.code} · ${d.name}`)],
        ['employment_type', [...EMPLOYMENT_TYPES]],
        ['worker_category', [...WORKER_CATEGORIES]],
        ['gender', [...GENDERS]],
        ['religion', [...RELIGIONS]],
        ['blood_group', [...BLOOD_GROUPS]],
      ];
      lists.columns = listColumns.map(([key]) => ({ header: key, key, width: 30 }));
      lists.getRow(1).font = { bold: true };
      const longest = Math.max(...listColumns.map(([, v]) => v.length));
      for (let i = 0; i < longest; i++) {
        lists.addRow(
          Object.fromEntries(listColumns.map(([key, values]) => [key, values[i] ?? ''])),
        );
      }

      const help = wb.addWorksheet('Instructions');
      help.getColumn(1).width = 110;
      for (const line of [
        'Fill one employee per row on the Employees sheet. Bold columns are required.',
        'Use the code before the "·" from the Lists sheet for legal entity, location, unit, designation, grade, cost centre and division.',
        'Dates as YYYY-MM-DD. Phone numbers as 01XXXXXXXXX.',
        'Give an NID, a birth registration number or a passport number for everyone.',
        'Upload the file: every row is checked first, and nothing is created until you confirm.',
        'Logins are not created by the import; add them from the employee page.',
      ]) {
        help.addRow([line]);
      }
      return Buffer.from(await wb.xlsx.writeBuffer());
    });
  }

  /** Reads and checks an uploaded file. Nothing is created yet. */
  async upload(
    actor: AuthUser,
    file: { originalname: string; buffer: Buffer } | undefined,
  ): Promise<ImportBatchView> {
    if (!file) throw new BadRequestException('Attach the filled-in template');
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(file.buffer as unknown as ArrayBuffer);
    } catch {
      throw new BadRequestException('This is not an Excel (.xlsx) file');
    }
    const sheet = wb.getWorksheet('Employees') ?? wb.worksheets[0];
    if (!sheet) throw new BadRequestException('The file has no sheets');
    const headers = new Map<number, string>();
    sheet.getRow(1).eachCell((cell, n) => headers.set(n, cellText(cell.value).toLowerCase()));
    const missingHeaders = IMPORT_COLUMNS.filter(
      (c) => c.required && ![...headers.values()].includes(c.key),
    ).map((c) => c.key);
    if (missingHeaders.length) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: `The file is missing these columns: ${missingHeaders.join(', ')}. Start from the template.`,
        code: 'bad_template',
      });
    }
    const records: { row: number; values: Record<string, string> }[] = [];
    sheet.eachRow({ includeEmpty: false }, (row, n) => {
      if (n === 1) return;
      const values: Record<string, string> = {};
      row.eachCell((cell, col) => {
        const key = headers.get(col);
        if (key) values[key] = cellText(cell.value);
      });
      if (Object.values(values).some((v) => v !== '')) records.push({ row: n, values });
    });
    if (records.length === 0) throw new BadRequestException('The Employees sheet has no rows');
    if (records.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(`At most ${MAX_IMPORT_ROWS} employees per file`);
    }

    return this.tenantDb.run(async (tx) => {
      const { parsed, report } = await this.check(tx, records);
      const tenantId = currentTenantId();
      const [batch] = await tx
        .insert(importBatches)
        .values({
          tenantId,
          kind: 'employees',
          fileName: file.originalname.slice(0, 200),
          totalRows: parsed.length,
          validRows: parsed.filter((p) => p.valid).length,
          report,
          createdBy: actor.id,
          expiresAt: new Date(Date.now() + MS_PER_DAY),
        })
        .returning();
      const rowsEnc = this.cipher
        .encryptBytes(Buffer.from(JSON.stringify(parsed)), {
          tenantId,
          purpose: `import:${batch!.id}`,
        })
        .toString('base64');
      await tx.update(importBatches).set({ rowsEnc }).where(eq(importBatches.id, batch!.id));
      return toBatchView(batch!);
    });
  }

  /** Maps codes to records and validates each row as a hire. */
  private async check(tx: Tx, records: { row: number; values: Record<string, string> }[]) {
    const refs = {
      legal_entity: await byCode(
        tx.select({ id: legalEntities.id, code: legalEntities.code }).from(legalEntities),
      ),
      location: await byCode(tx.select({ id: locations.id, code: locations.code }).from(locations)),
      org_unit: await byCode(tx.select({ id: orgUnits.id, code: orgUnits.code }).from(orgUnits)),
      designation: await byCode(
        tx.select({ id: designations.id, code: designations.code }).from(designations),
      ),
      grade: await byCode(tx.select({ id: grades.id, code: grades.code }).from(grades)),
      cost_centre: await byCode(
        tx.select({ id: costCentres.id, code: costCentres.code }).from(costCentres),
      ),
    };
    const codes = records.map((r) => r.values.employee_code).filter(Boolean) as string[];
    const existing = codes.length
      ? new Set(
          (
            await tx
              .select({ code: employees.employeeCode })
              .from(employees)
              .where(inArray(employees.employeeCode, codes))
          ).map((e) => e.code.toLowerCase()),
        )
      : new Set<string>();
    const tenantId = currentTenantId();
    const nidHashes = records
      .map((r) => r.values.nid)
      .filter(Boolean)
      .map((nid) => this.cipher.blindIndex(nid!, { tenantId, field: CIPHER_FIELDS.nid }));
    const existingNids = nidHashes.length
      ? new Set(
          (
            await tx
              .select({ h: employees.nidHash })
              .from(employees)
              .where(inArray(employees.nidHash, nidHashes))
          ).map((e) => e.h),
        )
      : new Set<string | null>();
    const pins = records.map((r) => r.values.attendance_pin).filter(Boolean) as string[];
    const existingPins = pins.length
      ? new Set(
          (
            await tx
              .select({ pin: employees.attendancePin })
              .from(employees)
              .where(inArray(employees.attendancePin, pins))
          ).map((e) => e.pin),
        )
      : new Set<string | null>();
    const managers = new Set(
      (await tx.select({ code: employees.employeeCode }).from(employees)).map((e) =>
        e.code.toLowerCase(),
      ),
    );

    const seenCodes = new Set<string>();
    const seenNids = new Set<string>();
    const seenPins = new Set<string>();
    const parsed: ParsedRow[] = [];
    const report: ImportRowReport[] = [];
    for (const { row, values: v } of records) {
      const errors: ImportRowReport['errors'] = [];
      const ref = (key: keyof typeof refs) => {
        const code = v[key];
        if (!code) return undefined;
        const id = refs[key].get(code.toLowerCase());
        if (!id)
          errors.push({ column: key, message: `No ${key.replace('_', ' ')} with code ${code}` });
        return id;
      };
      const optional = (key: string) => v[key] || undefined;
      // A phone typed as a number loses its leading zero in Excel.
      for (const key of ['mobile_phone', 'emergency_phone']) {
        if (/^1\d{9}$/.test(v[key] ?? '')) v[key] = `0${v[key]}`;
      }
      const address = (prefix: 'present' | 'permanent') => ({
        line: v[`${prefix}_address`] ?? '',
        upazila: optional(`${prefix}_upazila`),
        district: v[`${prefix}_district`] ?? '',
        division: (v[`${prefix}_division`] ?? '').toLowerCase(),
        postcode: optional(`${prefix}_postcode`),
      });
      const present = address('present');
      const samePermanent = !['address', 'district', 'division'].some((k) => v[`permanent_${k}`]);
      const managerCode = v.manager || null;
      const manager = managerCode?.toLowerCase();
      if (manager && !managers.has(manager) && !seenCodes.has(manager)) {
        errors.push({
          column: 'manager',
          message: `No employee with code ${v.manager} here or earlier in the file`,
        });
      }
      const input = {
        employeeCode: v.employee_code ?? '',
        fullName: v.full_name ?? '',
        fullNameBn: optional('full_name_bn'),
        fatherName: v.father_name ?? '',
        motherName: v.mother_name ?? '',
        spouseName: optional('spouse_name'),
        dateOfBirth: v.date_of_birth ?? '',
        gender: (v.gender ?? '').toLowerCase(),
        religion: optional('religion')?.toLowerCase(),
        maritalStatus: optional('marital_status')?.toLowerCase(),
        bloodGroup: optional('blood_group')?.toUpperCase(),
        mobilePhone: v.mobile_phone ?? '',
        workEmail: optional('work_email'),
        personalEmail: optional('personal_email'),
        presentAddress: present,
        permanentAddress: samePermanent ? present : address('permanent'),
        emergencyContact:
          v.emergency_name || v.emergency_relation || v.emergency_phone
            ? {
                name: v.emergency_name ?? '',
                relation: v.emergency_relation ?? '',
                phone: v.emergency_phone ?? '',
              }
            : undefined,
        identity: {
          nid: optional('nid'),
          birthRegistration: optional('birth_registration'),
          passport: optional('passport'),
          tin: optional('tin'),
        },
        joinedOn: v.joined_on ?? '',
        probationEndsOn: optional('probation_ends_on'),
        job: {
          legalEntityId: ref('legal_entity') ?? (v.legal_entity ? LATER : ''),
          locationId: ref('location'),
          orgUnitId: ref('org_unit'),
          designationId: ref('designation'),
          gradeId: ref('grade'),
          costCentreId: ref('cost_centre'),
          managerId: managerCode ? LATER : undefined,
          employmentType: (v.employment_type ?? '').toLowerCase(),
          workerCategory: (v.worker_category ?? '').toLowerCase(),
        },
      };
      const result = hireEmployeeSchema.safeParse(input);
      if (!result.success) {
        for (const issue of result.error.issues) {
          const path = issue.path.join('.');
          if (path === 'job.legalEntityId' && errors.some((e) => e.column === 'legal_entity'))
            continue;
          errors.push({ column: COLUMN_OF[path] ?? path, message: issue.message });
        }
      }
      const code = input.employeeCode.toLowerCase();
      if (code && (existing.has(code) || seenCodes.has(code))) {
        errors.push({ column: 'employee_code', message: 'This employee code is already in use' });
      }
      if (input.identity.nid) {
        const hash = this.cipher.blindIndex(input.identity.nid, {
          tenantId,
          field: CIPHER_FIELDS.nid,
        });
        if (existingNids.has(hash) || seenNids.has(hash)) {
          errors.push({ column: 'nid', message: 'Another employee already has this NID' });
        }
        seenNids.add(hash);
      }
      const pin = v.attendance_pin || null;
      if (pin && (existingPins.has(pin) || seenPins.has(pin))) {
        errors.push({
          column: 'attendance_pin',
          message: 'Another employee already uses this PIN',
        });
      }
      if (pin) seenPins.add(pin);
      if (code) seenCodes.add(code);
      const valid = errors.length === 0;
      parsed.push({
        row,
        input: (result.success ? result.data : input) as HireEmployeeInput,
        managerCode,
        attendancePin: pin,
        valid,
      });
      if (!valid) {
        report.push({
          row,
          employeeCode: v.employee_code ?? null,
          fullName: v.full_name ?? null,
          errors,
        });
      }
    }
    return { parsed, report };
  }

  list(): Promise<ImportBatchView[]> {
    return this.tenantDb.run(async (tx) =>
      (await tx.select().from(importBatches).orderBy(desc(importBatches.createdAt)).limit(20)).map(
        toBatchView,
      ),
    );
  }

  get(id: string): Promise<ImportBatchView> {
    return this.tenantDb.run(async (tx) => toBatchView(await this.batch(tx, id)));
  }

  private async batch(tx: Tx, id: string): Promise<BatchRow> {
    const [batch] = await tx
      .select()
      .from(importBatches)
      .where(eq(importBatches.id, id))
      .for('update');
    if (!batch) throw new NotFoundException('Import not found');
    if (batch.status === 'validated' && batch.expiresAt < new Date()) {
      await tx
        .update(importBatches)
        .set({ status: 'expired', rowsEnc: null })
        .where(eq(importBatches.id, id));
      return { ...batch, status: 'expired', rowsEnc: null };
    }
    return batch;
  }

  /** Hires the checked rows, in file order, in one transaction: all of them or none. */
  commit(
    actor: AuthUser,
    tenant: TenantWithAccess,
    id: string,
    options: { onlyValid: boolean },
  ): Promise<ImportBatchView> {
    return this.tenantDb.run(async (tx) => {
      const batch = await this.batch(tx, id);
      if (batch.status !== 'validated' || !batch.rowsEnc) {
        throw new BadRequestException(`This import is ${batch.status}; upload the file again`);
      }
      const rows = JSON.parse(
        this.cipher
          .decryptBytes(Buffer.from(batch.rowsEnc, 'base64'), {
            tenantId: batch.tenantId,
            purpose: `import:${batch.id}`,
          })
          .toString('utf8'),
      ) as ParsedRow[];
      const valid = rows.filter((r) => r.valid);
      if (!options.onlyValid && valid.length < rows.length) {
        throw new BadRequestException(
          'Some rows have problems: fix the file, or import only the valid rows',
        );
      }
      if (valid.length === 0) throw new BadRequestException('No valid rows to import');
      await this.employeesService.checkLimit(tx, tenant.access.limits.max_employees, valid.length);

      const created = new Map<string, string>();
      for (const row of valid) {
        let managerId: string | undefined;
        if (row.managerCode) {
          const code = row.managerCode.toLowerCase();
          managerId =
            created.get(code) ??
            (
              await tx
                .select({ id: employees.id })
                .from(employees)
                .where(sql`lower(${employees.employeeCode}) = ${code}`)
            )[0]?.id;
        }
        const employeeId = await this.employeesService.insertHire(tx, actor, {
          ...row.input,
          job: { ...row.input.job, managerId },
        });
        if (row.attendancePin) {
          await tx
            .update(employees)
            .set({ attendancePin: row.attendancePin })
            .where(eq(employees.id, employeeId));
        }
        created.set(row.input.employeeCode.toLowerCase(), employeeId);
      }
      const [done] = await tx
        .update(importBatches)
        .set({
          status: 'committed',
          committedAt: new Date(),
          imported: valid.length,
          rowsEnc: null,
        })
        .where(eq(importBatches.id, id))
        .returning();
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'employee.import',
        entityType: 'import_batch',
        entityId: id,
        after: {
          fileName: batch.fileName,
          imported: valid.length,
          skipped: rows.length - valid.length,
        },
      });
      return toBatchView(done!);
    });
  }
}

function toBatchView(b: BatchRow): ImportBatchView {
  return {
    id: b.id,
    fileName: b.fileName,
    status: b.status,
    totalRows: b.totalRows,
    validRows: b.validRows,
    rows: b.report as ImportRowReport[],
    imported: b.imported,
    createdAt: b.createdAt.toISOString(),
    committedAt: b.committedAt?.toISOString() ?? null,
  };
}
