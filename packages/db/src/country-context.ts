import { createHash } from 'node:crypto';
import { and, eq, lte, or, gte, isNull, sql, inArray } from 'drizzle-orm';
import {
  companyLegalProfiles,
  payGroups,
  employeePay,
  employees,
  employmentStatutoryProfiles,
} from './schema/index.js';
import type { Tx } from './client.js';
import { countryManifest } from '@gp/country-packs';
export async function resolveStatutoryContext(
  tx: Tx,
  tenantId: string,
  groupId: string,
  from: string,
  to: string,
) {
  const [group] = await tx.select().from(payGroups).where(eq(payGroups.id, groupId));
  if (!group) throw new Error('pay_group_missing');
  await tx.execute(
    sql`select gp_assert_bd_context(${tenantId}::uuid,${group.legalEntityId}::uuid,${from}::date)`,
  );
  const profiles = await tx
    .select()
    .from(companyLegalProfiles)
    .where(
      and(
        lte(companyLegalProfiles.effectiveFrom, to),
        or(isNull(companyLegalProfiles.effectiveTo), gte(companyLegalProfiles.effectiveTo, from)),
        ...(group.legalEntityId
          ? [eq(companyLegalProfiles.legalEntityId, group.legalEntityId)]
          : []),
      ),
    );
  if (profiles.some((p) => p.effectiveFrom > from || (p.effectiveTo && p.effectiveTo < to)))
    throw new Error('country_profile_boundary_requires_split_run');
  if (group.currency !== 'BDT') throw new Error('country_pack_unreviewed');
  const members = await tx
    .select({ id: employees.id, citizenship: employees.nationality })
    .from(employeePay)
    .innerJoin(employees, eq(employees.id, employeePay.employeeId))
    .where(
      and(
        eq(employeePay.payGroupId, groupId),
        eq(employeePay.status, 'approved'),
        lte(employeePay.effectiveFrom, to),
      ),
    );
  const uniqueMembers = [...new Map(members.map((m) => [m.id, m])).values()];
  if (uniqueMembers.some((m) => m.citizenship !== 'BD'))
    throw new Error('cohort_country_unreviewed');
  const employmentProfiles = uniqueMembers.length
    ? await tx
        .select()
        .from(employmentStatutoryProfiles)
        .where(
          and(
            inArray(
              employmentStatutoryProfiles.employeeId,
              uniqueMembers.map((m) => m.id),
            ),
            lte(employmentStatutoryProfiles.effectiveFrom, to),
            or(
              isNull(employmentStatutoryProfiles.effectiveTo),
              gte(employmentStatutoryProfiles.effectiveTo, from),
            ),
          ),
        )
    : [];
  if (
    employmentProfiles.some(
      (p) =>
        p.citizenship !== 'BD' ||
        p.insuranceClass !== 'BD_general' ||
        !['permanent', 'probationer', 'temporary', 'casual', 'badli', 'apprentice'].includes(
          p.contractClass,
        ),
    )
  )
    throw new Error('cohort_profile_unreviewed');
  const cohorts = uniqueMembers
    .map((m) => ({
      employeeId: m.id,
      source: employmentProfiles.some((p) => p.employeeId === m.id)
        ? 'dated_employment_profile'
        : 'explicit_legacy_bd_employee',
      versions: employmentProfiles
        .filter((p) => p.employeeId === m.id)
        .map((p) => ({
          id: p.id,
          from: p.effectiveFrom,
          to: p.effectiveTo,
          classificationHash: createHash('sha256')
            .update(JSON.stringify([p.citizenship, p.insuranceClass, p.contractClass]))
            .digest('hex'),
        }))
        .toSorted((a, b) => a.from.localeCompare(b.from)),
    }))
    .toSorted((a, b) => a.employeeId.localeCompare(b.employeeId));
  return {
    ...countryManifest({
      countryCode: 'BD',
      regime: 'BD_PRIVATE',
      currency: group.currency,
      calendar: 'gregorian',
      date: from,
      through: to,
    }),
    cohorts,
    companies: profiles
      .map((p) => ({
        id: p.legalEntityId,
        profileId: p.id,
        timeZone: p.businessTimeZone,
        calendar: p.calendar,
        regime: p.regime,
      }))
      .toSorted((a, b) => a.id.localeCompare(b.id)),
  };
}
