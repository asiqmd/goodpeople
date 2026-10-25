import {
  committeeMeetings,
  committeeMembers,
  committees,
  employees,
  jobAssignments,
  legalEntities,
  locations,
  tradeUnions,
  type Tx,
} from '@gp/db';
import {
  REQUIRED_COMMITTEES,
  type CommitteeCheckView,
  type CommitteeKind,
  type CommitteeMeetingView,
  type CommitteeMemberView,
  type CommitteeRequirementView,
  type CommitteeSummaryView,
  type CommitteeView,
  type EmployeeRef,
  type EstablishmentStatusView,
  type Gender,
  type Ref,
  type RequiredCommittee,
  type WorkerCategory,
} from '@gp/shared';
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import { inForceOn } from '../employees/employee.queries.js';
import {
  checkCommittee,
  committeeRuleOn,
  isCurrent,
  isRequired,
  lastMeetingOf,
  minutesDueOn,
  minutesLate,
  nextMeetingDue,
  ruleRef,
  termEndOf,
  workforceFor,
  type CommitteeRuleVersion,
  type Headcount,
} from './committee-rules.js';

// Everything the committee checks need, read once: companies and sites, who works where
// today, the committees with their members and meetings, and the unions in each company.

type CommitteeRow = typeof committees.$inferSelect;
type MeetingRow = typeof committeeMeetings.$inferSelect;
interface MemberRow {
  member: typeof committeeMembers.$inferSelect;
  employee: EmployeeRef | null;
  gender: Gender | null;
}

interface HeadcountRow {
  legalEntityId: string;
  locationId: string | null;
  category: WorkerCategory;
  n: number;
}

/** People at work on a date (active, with a job in force), by company, site and category. */
export async function headcounts(tx: Tx, on: string): Promise<HeadcountRow[]> {
  return tx
    .select({
      legalEntityId: jobAssignments.legalEntityId,
      locationId: jobAssignments.locationId,
      category: jobAssignments.workerCategory,
      n: count(),
    })
    .from(employees)
    .innerJoin(jobAssignments, and(eq(jobAssignments.employeeId, employees.id), inForceOn(on)))
    .where(eq(employees.status, 'active'))
    .groupBy(
      jobAssignments.legalEntityId,
      jobAssignments.locationId,
      jobAssignments.workerCategory,
    );
}

export function headcountOf(
  rows: HeadcountRow[],
  legalEntityId: string,
  atSite: (locationId: string | null) => boolean = () => true,
): Headcount {
  let workers = 0;
  let all = 0;
  for (const r of rows) {
    if (r.legalEntityId !== legalEntityId || !atSite(r.locationId)) continue;
    all += r.n;
    if (r.category === 'worker') workers += r.n;
  }
  return { workers, employees: all };
}

export interface CommitteeRecord {
  row: CommitteeRow;
  legalEntity: Ref;
  location: Ref | null;
  members: MemberRow[];
  /** Newest first. */
  meetings: MeetingRow[];
  /** The rule in force on the snapshot's day; null for other committees. */
  rule: CommitteeRuleVersion | null;
  workforce: number;
  /** The newest of its kind for its establishment: the one the law looks at. */
  latest: boolean;
  checks: CommitteeCheckView[];
  summary: CommitteeSummaryView;
}

export interface RelationsSnapshot {
  today: string;
  committees: CommitteeRecord[];
  establishments: EstablishmentStatusView[];
}

const scopeKey = (establishmentId: string, kind: CommitteeKind) => `${establishmentId}:${kind}`;

export async function loadSnapshot(tx: Tx, today: string): Promise<RelationsSnapshot> {
  const entities = await tx
    .select({ id: legalEntities.id, name: legalEntities.name, isActive: legalEntities.isActive })
    .from(legalEntities)
    .orderBy(asc(legalEntities.name));
  const sites = await tx
    .select({ id: locations.id, name: locations.name, legalEntityId: locations.legalEntityId })
    .from(locations);
  const counts = await headcounts(tx, today);
  const rows = await tx
    .select()
    .from(committees)
    .orderBy(asc(committees.formedOn), asc(committees.createdAt));
  const memberRows = await tx
    .select({
      member: committeeMembers,
      employeeCode: employees.employeeCode,
      fullName: employees.fullName,
      fullNameBn: employees.fullNameBn,
      gender: sql<Gender | null>`coalesce(${employees.gender}, ${committeeMembers.gender})`,
    })
    .from(committeeMembers)
    .leftJoin(employees, eq(employees.id, committeeMembers.employeeId))
    .orderBy(asc(committeeMembers.fromOn), asc(committeeMembers.createdAt));
  const meetingRows = await tx
    .select()
    .from(committeeMeetings)
    .orderBy(desc(committeeMeetings.heldOn), desc(committeeMeetings.createdAt));
  const unionRows = await tx
    .select({ legalEntityId: tradeUnions.legalEntityId, n: count() })
    .from(tradeUnions)
    .groupBy(tradeUnions.legalEntityId);

  const entityById = new Map(entities.map((e) => [e.id, { id: e.id, name: e.name }]));
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const unions = new Map(unionRows.map((u) => [u.legalEntityId, u.n]));
  const entityOf = (c: CommitteeRow) =>
    c.legalEntityId ?? siteById.get(c.locationId!)!.legalEntityId;

  // Sites with a committee of their own are establishments for that kind; the company's
  // committee serves everyone else.
  const ownSites = new Map<string, Set<string>>();
  const latest = new Map<string, CommitteeRow>();
  for (const c of rows) {
    latest.set(scopeKey(c.locationId ?? entityOf(c), c.kind), c);
    if (c.locationId) {
      const key = scopeKey(entityOf(c), c.kind);
      ownSites.set(key, (ownSites.get(key) ?? new Set()).add(c.locationId));
    }
  }
  const workforceAt = (entityId: string, locationId: string | null, kind: CommitteeKind) => {
    const own = ownSites.get(scopeKey(entityId, kind));
    return workforceFor(
      kind,
      headcountOf(counts, entityId, (l) =>
        locationId ? l === locationId : l === null || !own?.has(l),
      ),
    );
  };

  const records = rows.map((row): CommitteeRecord => {
    const entityId = entityOf(row);
    const site = row.locationId ? siteById.get(row.locationId)! : null;
    const members = memberRows
      .filter((m) => m.member.committeeId === row.id)
      .map((m) => ({
        member: m.member,
        employee: m.employeeCode
          ? {
              id: m.member.employeeId!,
              employeeCode: m.employeeCode,
              fullName: m.fullName!,
              fullNameBn: m.fullNameBn,
            }
          : null,
        gender: m.gender,
      }));
    const meetings = meetingRows.filter((m) => m.committeeId === row.id);
    const rule = committeeRuleOn(row.kind, today);
    const workforce = workforceAt(entityId, row.locationId, row.kind);
    const checks = rule
      ? checkCommittee(
          {
            kind: row.kind,
            formedOn: row.formedOn,
            endsOn: row.endsOn,
            members: members.map((m) => ({ ...m.member, gender: m.gender })),
            meetings,
          },
          { rule: rule.value, workforce, hasUnion: (unions.get(entityId) ?? 0) > 0, today },
        )
      : [];
    const endsOn = row.endsOn ?? termEndOf(rule?.value ?? null, row.formedOn);
    const inTerm = endsOn === null || endsOn >= today;
    const lastMeetingOn = lastMeetingOf(meetings);
    return {
      row,
      legalEntity: entityById.get(entityId)!,
      location: site && { id: site.id, name: site.name },
      members,
      meetings,
      rule,
      workforce,
      latest: latest.get(scopeKey(row.locationId ?? entityId, row.kind)) === row,
      checks,
      summary: {
        id: row.id,
        kind: row.kind,
        name: row.name,
        legalEntity: entityById.get(entityId)!,
        location: site && { id: site.id, name: site.name },
        formedOn: row.formedOn,
        endsOn,
        inTerm,
        members: members.filter((m) => isCurrent(m.member, today)).length,
        lastMeetingOn,
        nextMeetingDue: inTerm
          ? nextMeetingDue(rule?.value ?? null, row.formedOn, lastMeetingOn)
          : null,
      },
    };
  });
  const recordOf = (establishmentId: string, kind: CommitteeKind) => {
    const row = latest.get(scopeKey(establishmentId, kind));
    return row && records.find((r) => r.row === row);
  };

  const requirement = (
    entityId: string,
    siteId: string | null,
    kind: RequiredCommittee,
  ): CommitteeRequirementView => {
    const rule = committeeRuleOn(kind, today);
    const base = {
      kind,
      minWorkers: rule?.value.minWorkers ?? null,
      rule: rule && ruleRef(rule),
    };
    if (siteId && !ownSites.get(scopeKey(entityId, kind))?.has(siteId)) {
      return {
        ...base,
        required: false,
        workforce: workforceFor(
          kind,
          headcountOf(counts, entityId, (l) => l === siteId),
        ),
        coveredByCompany: true,
        committee: null,
        checks: [],
        ok: true,
      };
    }
    const record = recordOf(siteId ?? entityId, kind);
    const workforce = workforceAt(entityId, siteId, kind);
    const required = isRequired(rule?.value ?? null, workforce);
    const formed: CommitteeCheckView = {
      code: 'formed',
      result: record ? 'ok' : 'fail',
      value: null,
      min: null,
      max: null,
      date: record?.row.formedOn ?? null,
    };
    const checks = record ? [formed, ...record.checks] : required ? [formed] : [];
    return {
      ...base,
      required,
      workforce,
      coveredByCompany: false,
      committee: record?.summary ?? null,
      checks,
      ok: checks.every((c) => c.result !== 'fail'),
    };
  };

  const establishments: EstablishmentStatusView[] = [];
  for (const entity of entities.filter((e) => e.isActive)) {
    const ref = entityById.get(entity.id)!;
    const establishment = (site: Ref | null): EstablishmentStatusView => ({
      id: site?.id ?? entity.id,
      legalEntity: ref,
      location: site,
      ...headcountOf(counts, entity.id, (l) => !site || l === site.id),
      unions: unions.get(entity.id) ?? 0,
      requirements: REQUIRED_COMMITTEES.map((kind) =>
        requirement(entity.id, site?.id ?? null, kind),
      ),
    });
    establishments.push(establishment(null));
    const own = new Set(
      REQUIRED_COMMITTEES.flatMap((kind) => [...(ownSites.get(scopeKey(entity.id, kind)) ?? [])]),
    );
    for (const site of sites
      .filter((s) => own.has(s.id))
      .toSorted((a, b) => a.name.localeCompare(b.name))) {
      establishments.push(establishment({ id: site.id, name: site.name }));
    }
  }
  return { today, committees: records, establishments };
}

/** A committee with its members, meetings and checks. */
export function committeeView(record: CommitteeRecord, today: string): CommitteeView {
  const rule = record.rule?.value ?? null;
  const memberList: CommitteeMemberView[] = record.members.map(({ member, employee, gender }) => ({
    id: member.id,
    employee,
    name: member.name,
    gender,
    side: member.side,
    role: member.role,
    selection: member.selection,
    fromOn: member.fromOn,
    toOn: member.toOn,
    current: isCurrent(member, today),
  }));
  const meetings: CommitteeMeetingView[] = record.meetings.map((m) => {
    const due = minutesDueOn(rule, m.heldOn);
    return {
      id: m.id,
      heldOn: m.heldOn,
      agenda: m.agenda,
      minutes: m.minutes,
      attendees: m.attendees,
      minutesSentOn: m.minutesSentOn,
      minutesDueOn: due,
      minutesLate: minutesLate(due, m.minutesSentOn, today),
      decisions: m.decisions,
    };
  });
  return {
    ...record.summary,
    note: record.row.note,
    workforce: record.workforce,
    rule: record.rule && ruleRef(record.rule),
    checks: record.checks,
    memberList,
    meetings,
  };
}
