import { Injectable, NotFoundException } from '@nestjs/common';
import {
  companyLegalProfiles,
  employees,
  jobAssignments,
  legalEntities,
  locations,
  type Tx,
} from '@gp/db';
import {
  grantMatches,
  policyCan,
  todayIn,
  WORKFORCE_DEFINITIONS,
  WORKFORCE_METRICS,
  WORKFORCE_VERSION,
  type AnalyticsCatalog,
  type AnalyticsCompany,
  type AnalyticsLocation,
  type Permission,
  type WorkforceQuery,
  type WorkforceView,
} from '@gp/shared';
import { and, asc, eq, inArray, lte, sql, type SQL } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, forbidden } from '../../common/errors.js';
import { TenantDb } from '../../db/db.module.js';
import { entityScopeOf } from '../access-scopes/entity-scope.js';
import { workforceFigures } from './workforce.js';

const RIGHTS: Permission[] = ['analytics.view', 'employees.read'];
type Profile = Pick<
  typeof companyLegalProfiles.$inferSelect,
  | 'id'
  | 'legalEntityId'
  | 'countryCode'
  | 'currency'
  | 'businessTimeZone'
  | 'calendar'
  | 'effectiveFrom'
  | 'effectiveTo'
>;
type Company = Pick<typeof legalEntities.$inferSelect, 'id' | 'code' | 'name' | 'countryCode'>;
function businessDay(zone: string | null, now: Date): string | null {
  if (!zone) return null;
  try {
    return todayIn(zone, now);
  } catch {
    return null;
  }
}
function context(company: Company, profiles: Profile[], now: Date, on?: string): AnalyticsCompany {
  const history = profiles.filter((p) => p.legalEntityId === company.id);
  const matching = history.filter((p) => {
    const day = on ?? businessDay(p.businessTimeZone, now);
    return day && p.effectiveFrom <= day && (!p.effectiveTo || p.effectiveTo >= day);
  });
  if (
    matching.length === 1 &&
    matching[0]!.calendar === 'gregorian' &&
    businessDay(matching[0]!.businessTimeZone, now)
  ) {
    const p = matching[0]!;
    return {
      ...company,
      countryCode: p.countryCode,
      currency: p.currency,
      timeZone: p.businessTimeZone,
      timeZoneSource: 'dated_profile',
      calendar: p.calendar,
      contextSource: 'dated_profile',
      profileId: p.id,
    };
  }
  if (!history.length && company.countryCode === 'BD')
    return {
      ...company,
      currency: 'BDT',
      timeZone: 'Asia/Dhaka',
      timeZoneSource: 'legacy_bd',
      calendar: 'gregorian',
      contextSource: 'legacy_bd',
      profileId: null,
    };
  return {
    ...company,
    currency: null,
    timeZone: null,
    timeZoneSource: 'unavailable',
    calendar: null,
    contextSource: 'unavailable',
    profileId: null,
  };
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly tenantDb: TenantDb) {}

  private async snapshot<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    // A revocation racing the authority share locks may serialize-fail. Retry once;
    // TenantDb then rechecks the original session revision against current authority.
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.tenantDb.run(fn, true);
      } catch (error) {
        const e = error as { code?: string; cause?: { code?: string } };
        if (attempt || (e.code !== '40001' && e.cause?.code !== '40001')) throw error;
      }
    }
  }

  private async metadata(tx: Tx, user: AuthUser, query: WorkforceQuery, now: Date) {
    if (user.kind !== 'tenant' || user.role === 'support' || user.selfService)
      throw forbidden('role_not_allowed', 'Analytics is for authorized workspace users');
    const all = await tx
      .select({
        id: legalEntities.id,
        code: legalEntities.code,
        name: legalEntities.name,
        countryCode: legalEntities.countryCode,
      })
      .from(legalEntities)
      .orderBy(asc(legalEntities.id));
    const legacy = user.policy?.custom ? null : await entityScopeOf(tx, user.id);
    const allowed = all.filter((c) =>
      user.policy?.custom
        ? RIGHTS.every((p) => policyCan(user.policy!, p, c.id))
        : legacy === null || legacy.includes(c.id),
    );
    if (!allowed.length)
      throw forbidden(
        'analytics_scope',
        'No company has both analytics and source-data permission',
      );
    if (query.companyIds?.some((id) => !allowed.some((c) => c.id === id)))
      throw new NotFoundException('Analytics scope not found');
    const profiles = await tx
      .select({
        id: companyLegalProfiles.id,
        legalEntityId: companyLegalProfiles.legalEntityId,
        countryCode: companyLegalProfiles.countryCode,
        currency: companyLegalProfiles.currency,
        businessTimeZone: companyLegalProfiles.businessTimeZone,
        calendar: companyLegalProfiles.calendar,
        effectiveFrom: companyLegalProfiles.effectiveFrom,
        effectiveTo: companyLegalProfiles.effectiveTo,
      })
      .from(companyLegalProfiles);
    const sites: AnalyticsLocation[] = await tx
      .select({
        id: locations.id,
        legalEntityId: locations.legalEntityId,
        name: locations.name,
        code: locations.code,
        timeZone: locations.timeZone,
      })
      .from(locations)
      .where(
        inArray(
          locations.legalEntityId,
          allowed.map((c) => c.id),
        ),
      )
      .orderBy(asc(locations.id));
    let selected = allowed.filter((c) => !query.companyIds || query.companyIds.includes(c.id));
    let selectedSite: AnalyticsLocation | undefined;
    if (query.locationId) {
      const site = sites.find(
        (s) => s.id === query.locationId && selected.some((c) => c.id === s.legalEntityId),
      );
      if (!site) throw new NotFoundException('Analytics scope not found');
      selectedSite = site;
      selected = selected.filter((c) => c.id === site.legalEntityId);
    }
    const current = all.map((c) => context(c, profiles, now));
    const days = selected
      .map((c) =>
        businessDay(selectedSite?.timeZone ?? current.find((v) => v.id === c.id)!.timeZone, now),
      )
      .filter((v): v is string => !!v)
      .toSorted();
    const maxAsOf = days[0] ?? todayIn('UTC', now);
    const asOf = query.asOf ?? maxAsOf;
    if (asOf < '1900-01-01' || asOf > maxAsOf)
      throw badRequest(
        'analytics_date',
        'Choose an as-of date between 1900-01-01 and the earliest selected business today',
      );
    const companies = selected.map((c) => {
      const value = context(c, profiles, now, asOf);
      if (!selectedSite || value.contextSource === 'unavailable') return value;
      if (!businessDay(selectedSite.timeZone, now))
        return {
          ...value,
          contextSource: 'unavailable' as const,
          timeZone: null,
          timeZoneSource: 'unavailable' as const,
        };
      return { ...value, timeZone: selectedSite.timeZone, timeZoneSource: 'site' as const };
    });
    const allRelationships = (company: string) =>
      !user.policy?.custom ||
      RIGHTS.every((p) =>
        user.policy!.grants.some(
          (g) => grantMatches(g, company) && g.permissions.includes(p) && g.relationship === 'all',
        ),
      );
    const scope = selected.every((c) => allRelationships(c.id))
      ? ('companies' as const)
      : ('relationship' as const);
    return {
      all,
      allowed,
      selected,
      companies,
      current,
      sites,
      asOf,
      maxAsOf,
      scope,
      allRelationships,
    };
  }

  catalog(user: AuthUser, query: WorkforceQuery): Promise<AnalyticsCatalog> {
    return this.snapshot(async (tx) => {
      const now = new Date(),
        meta = await this.metadata(tx, user, query, now);
      return {
        version: WORKFORCE_VERSION,
        metrics: WORKFORCE_DEFINITIONS,
        companies: meta.companies,
        locations: meta.sites.filter((s) => meta.selected.some((c) => c.id === s.legalEntityId)),
        defaultAsOf: meta.asOf,
        maxAsOf: meta.maxAsOf,
        scope: meta.scope,
      };
    });
  }

  workforce(user: AuthUser, query: WorkforceQuery, transaction?: Tx): Promise<WorkforceView> {
    const measure = async (tx: Tx): Promise<WorkforceView> => {
      const now = new Date(),
        meta = await this.metadata(tx, user, query, now);
      if (meta.companies.length > 50)
        throw badRequest('analytics_limit', 'Select at most 50 companies');
      const currentDays = new Map(meta.current.map((c) => [c.id, businessDay(c.timeZone, now)]));
      const dateOf = (alias: string) => {
        const cases = [...currentDays]
          .filter(([, day]) => day)
          .map(([id, day]) => sql`when ${id}::uuid then ${day}::date`);
        return cases.length
          ? sql`(case ${sql.raw(alias + '.legal_entity_id')} ${sql.join(cases, sql` `)} else null::date end)`
          : sql`null::date`;
      };
      const active = (alias: string) =>
        sql`${sql.raw(alias + '.effective_from')} <= ${dateOf(alias)} and (${sql.raw(alias + '.effective_to')} is null or ${sql.raw(alias + '.effective_to')} >= ${dateOf(alias)})`;
      const own = sql`${employees.userId} = ${user.id}::uuid`;
      const direct = sql`exists(select 1 from job_assignments aj where aj.employee_id=${employees.id} and ${active('aj')} and ${employees.joinedOn}<=${dateOf('aj')} and (${employees.separatedOn} is null or ${employees.separatedOn}>${dateOf('aj')}) and aj.manager_id in (select me.id from employees me where me.user_id=${user.id}::uuid) and not exists(select 1 from job_assignments ax where ax.employee_id=aj.employee_id and ax.id<>aj.id and ${active('ax')}))`;
      const relationship = (permission: Permission, company: string): SQL => {
        if (user.kind !== 'tenant' || !user.policy?.custom) return sql`true`;
        const matches = user.policy.grants.filter(
          (g) => grantMatches(g, company) && g.permissions.includes(permission),
        );
        if (matches.some((g) => g.relationship === 'all')) return sql`true`;
        const clauses = matches.map((g) => (g.relationship === 'own' ? own : direct));
        return clauses.length ? sql`(${sql.join(clauses, sql` or `)})` : sql`false`;
      };
      const unrestricted =
        meta.allowed.length === meta.all.length &&
        meta.allowed.every((c) => meta.allRelationships(c.id));
      const candidates = meta.companies.map(
        (c) =>
          sql`(exists(select 1 from job_assignments hj where hj.employee_id=${employees.id} and hj.legal_entity_id=${c.id}::uuid) and ${relationship('analytics.view', c.id)} and ${relationship('employees.read', c.id)})`,
      );
      if (unrestricted)
        candidates.push(
          sql`not exists(select 1 from job_assignments nj where nj.employee_id=${employees.id})`,
        );
      const people = await tx
        .select({
          id: employees.id,
          userId: employees.userId,
          joinedOn: employees.joinedOn,
          separatedOn: employees.separatedOn,
        })
        .from(employees)
        .where(and(lte(employees.joinedOn, meta.asOf), sql`(${sql.join(candidates, sql` or `)})`))
        .orderBy(asc(employees.id))
        .limit(10001);
      if (people.length > 10000)
        throw badRequest(
          'analytics_limit',
          'This query exceeds 10,000 eligible employment records; narrow the company scope',
        );
      const jobs = people.length
        ? await tx
            .select({
              id: jobAssignments.id,
              employeeId: jobAssignments.employeeId,
              legalEntityId: jobAssignments.legalEntityId,
              locationId: jobAssignments.locationId,
              effectiveFrom: jobAssignments.effectiveFrom,
              effectiveTo: jobAssignments.effectiveTo,
              managerId: jobAssignments.managerId,
            })
            .from(jobAssignments)
            .where(
              inArray(
                jobAssignments.employeeId,
                people.map((p) => p.id),
              ),
            )
            .orderBy(asc(jobAssignments.id))
            .limit(50001)
        : [];
      if (jobs.length > 50000)
        throw badRequest(
          'analytics_limit',
          'This query exceeds 50,000 assignment records; narrow the company scope',
        );
      const ownRows = await tx
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.userId, user.id));
      const ownIds = new Set(ownRows.map((p) => p.id));
      const peopleById = new Map(people.map((p) => [p.id, p]));
      const currentJobs = new Map<string, typeof jobs>();
      for (const job of jobs) {
        const day = currentDays.get(job.legalEntityId);
        if (
          day &&
          job.effectiveFrom <= day &&
          (!job.effectiveTo || job.effectiveTo >= day) &&
          peopleById.get(job.employeeId)!.joinedOn <= day &&
          (!peopleById.get(job.employeeId)!.separatedOn ||
            peopleById.get(job.employeeId)!.separatedOn! > day)
        ) {
          const list = currentJobs.get(job.employeeId) ?? [];
          list.push(job);
          currentJobs.set(job.employeeId, list);
        }
      }
      const visible = (id: string, company: string) =>
        user.kind === 'tenant' &&
        (!user.policy?.custom ||
          RIGHTS.every(
            (p) =>
              policyCan(user.policy!, p, company) &&
              user.policy!.grants.some(
                (g) =>
                  grantMatches(g, company) &&
                  g.permissions.includes(p) &&
                  (g.relationship === 'all' ||
                    (g.relationship === 'own'
                      ? ownIds.has(id)
                      : currentJobs.get(id)?.length === 1 &&
                        ownIds.has(currentJobs.get(id)![0]!.managerId ?? ''))),
              ),
          ));
      const figures = workforceFigures({
        people,
        jobs,
        companies: meta.companies.map((c) => c.id),
        asOf: meta.asOf,
        locationId: query.locationId,
        locations: meta.sites,
        visible,
        includeUnassigned: unrestricted,
      });
      const result = meta.companies.map((c) => ({
        ...c,
        businessToday: businessDay(c.timeZone, now),
        metrics: figures.get(c.id)!.map((v) =>
          c.contextSource === 'unavailable'
            ? {
                ...v,
                value: null,
                state: 'unavailable' as const,
                issues: ['unsupported_context' as const],
              }
            : v.state === 'current' && businessDay(c.timeZone, now) === meta.asOf
              ? { ...v, state: 'provisional' as const }
              : v,
        ),
      }));
      const metrics = WORKFORCE_METRICS.map((id) => {
        const values = result.map((c) => c.metrics.find((m) => m.id === id)!);
        const state = values.some((v) => v.state === 'unavailable')
          ? ('unavailable' as const)
          : values.some((v) => v.state === 'incomplete')
            ? ('incomplete' as const)
            : values.some((v) => v.state === 'provisional')
              ? ('provisional' as const)
              : ('current' as const);
        return {
          id,
          version: WORKFORCE_VERSION,
          unit: 'people' as const,
          state,
          value: values.some((v) => v.value === null)
            ? null
            : values.reduce((sum, v) => sum + v.value!, 0),
          issues: [...new Set(values.flatMap((v) => v.issues))].toSorted(),
        };
      });
      // Hash only authorized, date-bounded source facts. Hidden-company history is used
      // internally to detect conflicts, never emitted or mixed into the public revision.
      const permittedJobs = jobs
        .filter(
          (j) =>
            j.effectiveFrom <= meta.asOf &&
            visible(j.employeeId, j.legalEntityId) &&
            meta.companies.some((c) => c.id === j.legalEntityId),
        )
        .map((j) => ({
          id: j.id,
          employeeId: j.employeeId,
          company: j.legalEntityId,
          location: j.locationId,
          from: j.effectiveFrom,
          through: j.effectiveTo && j.effectiveTo <= meta.asOf ? j.effectiveTo : null,
        }));
      const permittedPersonIds = new Set(permittedJobs.map((j) => j.employeeId)),
        assignedPersonIds = new Set(jobs.map((j) => j.employeeId));
      const permittedPeople = people
        .filter(
          (p) => permittedPersonIds.has(p.id) || (unrestricted && !assignedPersonIds.has(p.id)),
        )
        .map((p) => ({
          id: p.id,
          joinedOn: p.joinedOn,
          separatedOn: p.separatedOn && p.separatedOn <= meta.asOf ? p.separatedOn : null,
        }));
      const sourceRevision = createHash('sha256')
        .update(
          JSON.stringify({
            version: WORKFORCE_VERSION,
            asOf: meta.asOf,
            locationId: query.locationId ?? null,
            companies: meta.companies,
            people: permittedPeople,
            jobs: permittedJobs,
            metrics,
          }),
        )
        .digest('hex');
      const stamp = await tx.execute(sql`select transaction_timestamp() as cutoff`);
      return {
        version: WORKFORCE_VERSION,
        asOf: meta.asOf,
        period: { from: meta.asOf.slice(0, 7) + '-01', through: meta.asOf },
        locationId: query.locationId ?? null,
        computedAt: new Date().toISOString(),
        dataAsOf: new Date(stamp.rows[0]!.cutoff as string).toISOString(),
        sourceRevision,
        sourceReferences: [
          'Core HR: continuous-service dates',
          'Core HR: effective-dated assignments',
          'International: dated company context',
        ],
        scope: meta.scope,
        coverage: 'authorized_assignment_history',
        cache: 'none',
        metrics,
        companies: result,
      };
    };
    return transaction ? measure(transaction) : this.snapshot(measure);
  }
}
