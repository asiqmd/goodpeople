import { Inject, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import {
  runAsTenant,
  employees,
  jobAssignments,
  legalEntities,
  locations,
  orgUnits,
  designations,
  attendanceDays,
  type Database,
  type Tx,
} from '@gp/db';
import { addDays, todayIn, type ApiScope, type PublicEmployeeV1 } from '@gp/shared';
import { and, asc, eq, gt, inArray, lte, gte, sql, type SQL } from 'drizzle-orm';
import { DB } from '../../db/db.module.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { resolveService, type ServicePrincipal } from './authority.js';
import { PublicAuth, integrationError } from './public-auth.js';
const querySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
    cursor: z.string().max(2500).optional(),
    company_id: z.uuid().optional(),
    employee_id: z.uuid().optional(),
    date_from: z.iso.date().optional(),
    date_to: z.iso.date().optional(),
    status: z
      .string()
      .regex(/^[a-z_]{1,32}$/)
      .optional(),
  })
  .strict();
/** Latest effective employment reference, including the last job of a separated person. */
export const latestJob = (employeeColumn: SQL | typeof employees.id) =>
  sql`(select j.id from job_assignments j where j.tenant_id=${employees.tenantId} and j.employee_id=${employeeColumn} and j.effective_from<=${todayIn()}::date order by j.effective_from desc,j.id desc limit 1)`;
@Injectable()
export class PublicDirectory {
  constructor(
    @Inject(DB) private db: Database,
    @Inject(APP_CONFIG) private config: AppConfig,
    private auth: PublicAuth,
  ) {}
  async list(principal: ServicePrincipal, resource: string, raw: unknown) {
    const parsed = querySchema.safeParse(raw);
    if (!parsed.success)
      integrationError(400, 'invalid_query', 'Unsupported filters or pagination');
    const q = parsed.data;
    const allowed =
      resource === 'attendance'
        ? ['company_id', 'employee_id', 'date_from', 'date_to', 'limit', 'cursor']
        : resource === 'employees'
          ? ['company_id', 'status', 'limit', 'cursor']
          : ['company_id', 'limit', 'cursor'];
    if (Object.keys(raw as object).some((k) => !allowed.includes(k)))
      integrationError(400, 'invalid_query', 'Filter does not apply to resource');
    const scope: ApiScope =
      resource === 'attendance'
        ? 'attendance:read'
        : resource === 'employees'
          ? 'employees:read'
          : 'org:read';
    if (!principal.scopes.includes(scope))
      integrationError(403, 'insufficient_scope', 'Scope is required');
    await this.auth.access(
      principal.tenantId,
      resource === 'attendance' ? 'attendance' : 'core_hr',
    );
    return runAsTenant(this.db, principal.tenantId, async (tx) => {
      const p = await resolveService(tx, principal);
      let after: string | undefined;
      const fingerprint = JSON.stringify([
        resource,
        { ...q, cursor: undefined, limit: undefined },
        p.authority,
      ]);
      if (q.cursor) after = this.readCursor(q.cursor, p, fingerprint);
      const companies = q.company_id
        ? p.companyIds.filter((c) => c === q.company_id)
        : p.companyIds;
      if (!companies.length) return { data: [], page: { next_cursor: null, has_more: false } };
      const rows =
        resource === 'employees'
          ? await this.employeeRows(tx, p, companies, q.status, after, q.limit)
          : resource === 'attendance'
            ? await this.attendanceRows(tx, p, companies, q, after)
            : await this.orgRows(tx, p, resource, companies, after, q.limit);
      const has = rows.length > q.limit,
        data = rows.slice(0, q.limit);
      return {
        data,
        page: {
          has_more: has,
          next_cursor: has ? this.cursor(String(data.at(-1)!.id), p, fingerprint) : null,
        },
      };
    });
  }
  async employee(p: ServicePrincipal, id: string) {
    if (!z.uuid().safeParse(id).success) integrationError(404, 'not_found', 'Resource not found');
    if (!p.scopes.includes('employees:read'))
      integrationError(403, 'insufficient_scope', 'Scope is required');
    await this.auth.access(p.tenantId);
    return runAsTenant(this.db, p.tenantId, async (tx) => {
      const current = await resolveService(tx, p);
      const rows = await this.employeeRows(
        tx,
        current,
        current.companyIds,
        undefined,
        undefined,
        1,
        id,
      );
      if (!rows.length) integrationError(404, 'not_found', 'Resource not found');
      return { data: rows[0] };
    });
  }
  private async employeeRows(
    tx: Tx,
    p: ServicePrincipal,
    companies: string[],
    status: string | undefined,
    after: string | undefined,
    limit: number,
    id?: string,
  ): Promise<PublicEmployeeV1[]> {
    const rows = await tx
      .select({
        id: employees.id,
        code: employees.employeeCode,
        name: employees.fullName,
        status: employees.status,
        companyId: jobAssignments.legalEntityId,
        jobId: jobAssignments.id,
        siteId: jobAssignments.locationId,
        unitId: jobAssignments.orgUnitId,
        designationId: jobAssignments.designationId,
        effectiveFrom: jobAssignments.effectiveFrom,
      })
      .from(employees)
      .innerJoin(jobAssignments, eq(jobAssignments.id, latestJob(employees.id)))
      .where(
        and(
          inArray(jobAssignments.legalEntityId, companies),
          after ? gt(employees.id, after) : undefined,
          id ? eq(employees.id, id) : undefined,
          status ? sql`${employees.status}::text=${status}` : undefined,
        ),
      )
      .orderBy(asc(employees.id))
      .limit(limit + 1);
    return rows.map((r) => ({
      id: r.id,
      company_id: r.companyId,
      ...(p.fields.includes('employee_code') ? { employee_code: r.code } : {}),
      ...(p.fields.includes('display_name') ? { display_name: r.name } : {}),
      ...(p.fields.includes('employment_status') ? { employment_status: r.status } : {}),
      ...(p.fields.includes('job_reference')
        ? {
            job: {
              id: r.jobId,
              site_id: r.siteId,
              unit_id: r.unitId,
              designation_id: r.designationId,
              effective_from: r.effectiveFrom,
            },
          }
        : {}),
    }));
  }
  private async orgRows(
    tx: Tx,
    p: ServicePrincipal,
    resource: string,
    companies: string[],
    after: string | undefined,
    limit: number,
  ) {
    const named = p.fields.includes('org_names');
    if (resource === 'companies')
      return tx
        .select({
          id: legalEntities.id,
          ...(named ? { code: legalEntities.code, name: legalEntities.name } : {}),
        })
        .from(legalEntities)
        .where(
          and(
            inArray(legalEntities.id, companies),
            after ? gt(legalEntities.id, after) : undefined,
          ),
        )
        .orderBy(asc(legalEntities.id))
        .limit(limit + 1);
    if (resource === 'sites')
      return tx
        .select({
          id: locations.id,
          company_id: locations.legalEntityId,
          ...(named ? { code: locations.code, name: locations.name } : {}),
        })
        .from(locations)
        .where(
          and(
            inArray(locations.legalEntityId, companies),
            after ? gt(locations.id, after) : undefined,
          ),
        )
        .orderBy(asc(locations.id))
        .limit(limit + 1);
    if (resource === 'units')
      return tx
        .select({
          id: orgUnits.id,
          company_id: orgUnits.legalEntityId,
          parent_id: orgUnits.parentId,
          ...(named ? { code: orgUnits.code, name: orgUnits.name } : {}),
        })
        .from(orgUnits)
        .where(
          and(
            inArray(orgUnits.legalEntityId, companies),
            after ? gt(orgUnits.id, after) : undefined,
          ),
        )
        .orderBy(asc(orgUnits.id))
        .limit(limit + 1);
    if (resource === 'designations')
      return tx
        .select({
          id: designations.id,
          ...(named ? { code: designations.code, name: designations.name } : {}),
        })
        .from(designations)
        .where(
          and(
            sql`exists(select 1 from job_assignments j where j.tenant_id=${designations.tenantId} and j.designation_id=${designations.id} and j.legal_entity_id in (${sql.join(
              companies.map((c) => sql`${c}::uuid`),
              sql`,`,
            )}) and j.effective_from<=${todayIn()}::date and (j.effective_to is null or j.effective_to>=${todayIn()}::date))`,
            after ? gt(designations.id, after) : undefined,
          ),
        )
        .orderBy(asc(designations.id))
        .limit(limit + 1);
    integrationError(404, 'not_found', 'Resource not found');
  }
  private async attendanceRows(
    tx: Tx,
    p: ServicePrincipal,
    companies: string[],
    q: z.infer<typeof querySchema>,
    after: string | undefined,
  ) {
    const from = q.date_from ?? addDays(todayIn(), -30),
      to = q.date_to ?? addDays(todayIn(), -1);
    if (from > to || to > todayIn() || Date.parse(to) - Date.parse(from) > 92 * 86400_000)
      integrationError(400, 'invalid_query', 'Use a date range of at most 93 days through today');
    const rows = await tx
      .select({
        id: attendanceDays.id,
        employee_id: attendanceDays.employeeId,
        date: attendanceDays.date,
        company_id: sql<string>`j.legal_entity_id`,
        ...(p.fields.includes('attendance_status')
          ? { status: attendanceDays.status, day_type: attendanceDays.dayType }
          : {}),
        ...(p.fields.includes('attendance_minutes')
          ? {
              worked_minutes: attendanceDays.workedMinutes,
              overtime_minutes: attendanceDays.overtimeMinutes,
              late_minutes: attendanceDays.lateMinutes,
              early_out_minutes: attendanceDays.earlyOutMinutes,
            }
          : {}),
      })
      .from(attendanceDays)
      .innerJoin(
        sql`lateral (select j.legal_entity_id from job_assignments j where j.tenant_id=${attendanceDays.tenantId} and j.employee_id=${attendanceDays.employeeId} and j.effective_from<=${attendanceDays.date} order by j.effective_from desc,j.id desc limit 1) j`,
        sql`true`,
      )
      .where(
        and(
          sql`j.legal_entity_id in (${sql.join(
            companies.map((c) => sql`${c}::uuid`),
            sql`,`,
          )})`,
          sql`${attendanceDays.date}<${todayIn()}::date`,
          gte(attendanceDays.date, from),
          lte(attendanceDays.date, to),
          q.employee_id ? eq(attendanceDays.employeeId, q.employee_id) : undefined,
          after ? gt(attendanceDays.id, after) : undefined,
        ),
      )
      .orderBy(asc(attendanceDays.id))
      .limit(q.limit + 1);
    return rows.map((r) => ({ ...r, finalized: r.date < todayIn() }));
  }
  private cursor(after: string, p: ServicePrincipal, context: string) {
    const body = Buffer.from(
      JSON.stringify({ after, c: p.id, t: p.tenantId, context, exp: Date.now() + 900000 }),
    ).toString('base64url');
    return `${body}.${createHmac('sha256', this.config.JWT_ACCESS_SECRET + ':cursor:v1')
      .update(body)
      .digest('base64url')}`;
  }
  private readCursor(cursor: string, p: ServicePrincipal, context: string): string {
    try {
      const [body, signature, ...extra] = cursor.split('.');
      const expected = createHmac('sha256', this.config.JWT_ACCESS_SECRET + ':cursor:v1')
        .update(body!)
        .digest();
      const given = Buffer.from(signature!, 'base64url');
      if (extra.length || given.length !== expected.length || !timingSafeEqual(given, expected))
        throw new Error('signature');
      const value = JSON.parse(Buffer.from(body!, 'base64url').toString());
      if (
        value.c !== p.id ||
        value.t !== p.tenantId ||
        value.context !== context ||
        value.exp < Date.now() ||
        !z.uuid().safeParse(value.after).success
      )
        throw new Error('binding');
      return value.after;
    } catch {
      integrationError(400, 'invalid_cursor', 'Start a new page sequence');
    }
  }
}
