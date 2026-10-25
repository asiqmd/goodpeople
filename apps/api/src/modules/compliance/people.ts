import { BD_RULES, ruleOn, type WorkplaceKind } from '@gp/country-packs';
import { documents, employees, jobAssignments, locations, orgUnits, type Tx } from '@gp/db';
import { addMonths, todayIn, type IsoDate } from '@gp/shared';
import { and, eq, gt, inArray, isNull, lte } from 'drizzle-orm';
import { inForceOn } from '../employees/employee.queries.js';
import { certificateOn, type CertificateDoc, type CertificateStatus } from './checker.js';

// Who the compliance pages are about: their workplace, adolescents and their certificates.

export interface Workplace {
  location: string | null;
  orgUnit: string | null;
  workplace: WorkplaceKind;
  timeZone: string;
}

/** Each person's location and unit from the job in force on a date. */
export async function workplacesOn(
  tx: Tx,
  employeeIds: string[],
  on: IsoDate,
): Promise<Map<string, Workplace>> {
  if (employeeIds.length === 0) return new Map();
  const rows = await tx
    .select({
      employeeId: jobAssignments.employeeId,
      location: locations.name,
      kind: locations.kind,
      timeZone: locations.timeZone,
      orgUnit: orgUnits.name,
    })
    .from(jobAssignments)
    .leftJoin(locations, eq(locations.id, jobAssignments.locationId))
    .leftJoin(orgUnits, eq(orgUnits.id, jobAssignments.orgUnitId))
    .where(and(inArray(jobAssignments.employeeId, employeeIds), inForceOn(on)));
  return new Map(
    rows.map((r) => [
      r.employeeId,
      {
        location: r.location,
        orgUnit: r.orgUnit,
        workplace: r.kind === 'factory' ? 'factory' : 'other',
        timeZone: r.timeZone ?? 'Asia/Dhaka',
      },
    ]),
  );
}

export const unknownWorkplace: Workplace = {
  location: null,
  orgUnit: null,
  workplace: 'other',
  timeZone: 'Asia/Dhaka',
};

/** People employed on a date who are not yet adults (s.2, s.34). */
export function adolescentsOn(tx: Tx, on: IsoDate) {
  const adultAge = ruleOn(BD_RULES, 'adolescent.adult_age', on).value;
  return tx
    .select({
      id: employees.id,
      employeeCode: employees.employeeCode,
      fullName: employees.fullName,
      fullNameBn: employees.fullNameBn,
      dateOfBirth: employees.dateOfBirth,
    })
    .from(employees)
    .where(
      and(
        eq(employees.status, 'active'),
        lte(employees.joinedOn, on),
        gt(employees.dateOfBirth, addMonths(on, -12 * adultAge)),
      ),
    )
    .orderBy(employees.fullName);
}

/** Each person's certificate of fitness on a date (s.37). */
export async function certificatesOf(
  tx: Tx,
  employeeIds: string[],
  on: IsoDate,
): Promise<Map<string, CertificateStatus>> {
  if (employeeIds.length === 0) return new Map();
  const months = ruleOn(BD_RULES, 'adolescent.fitness_certificate_months', on).value;
  const rows = await tx
    .select({
      id: documents.id,
      employeeId: documents.employeeId,
      title: documents.title,
      issuedOn: documents.issuedOn,
      expiresOn: documents.expiresOn,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(
      and(
        inArray(documents.employeeId, employeeIds),
        eq(documents.category, 'fitness_certificate'),
        isNull(documents.deletedAt),
      ),
    );
  const docsOf = new Map<string, CertificateDoc[]>();
  for (const r of rows) {
    const list = docsOf.get(r.employeeId) ?? [];
    list.push({ ...r, uploadedOn: todayIn('Asia/Dhaka', r.createdAt) });
    docsOf.set(r.employeeId, list);
  }
  return new Map(employeeIds.map((id) => [id, certificateOn(docsOf.get(id) ?? [], on, months)]));
}
