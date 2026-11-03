import {
  WORKFORCE_METRICS,
  WORKFORCE_VERSION,
  type WorkforceMetric,
  type WorkforceValue,
  type WorkforceIssue,
} from '@gp/shared';

export interface WorkforceJob {
  id: string;
  employeeId: string;
  legalEntityId: string;
  locationId: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  managerId: string | null;
}
export interface WorkforcePerson {
  id: string;
  userId: string | null;
  joinedOn: string;
  separatedOn: string | null;
}
export interface WorkforceInput {
  people: WorkforcePerson[];
  jobs: WorkforceJob[];
  companies: string[];
  asOf: string;
  locationId?: string;
  locations: { id: string; legalEntityId: string }[];
  visible: (employeeId: string, companyId: string) => boolean;
  includeUnassigned: boolean;
}

/** Arithmetic over already scoped, minimal employment facts. No identity, salary or model data. */
export function workforceFigures(input: WorkforceInput): Map<string, WorkforceValue[]> {
  const counts = new Map(
    input.companies.map((id) => [id, { headcount: 0, joiners: 0, leavers: 0 }]),
  );
  const issues = new Map(
    input.companies.map((id) => [
      id,
      new Map<WorkforceMetric, Set<WorkforceIssue>>(WORKFORCE_METRICS.map((m) => [m, new Set()])),
    ]),
  );
  const jobsByPerson = new Map<string, WorkforceJob[]>();
  for (const job of input.jobs) {
    const list = jobsByPerson.get(job.employeeId) ?? [];
    list.push(job);
    jobsByPerson.set(job.employeeId, list);
  }
  const from = input.asOf.slice(0, 7) + '-01';
  for (const person of input.people) {
    const history = jobsByPerson.get(person.id) ?? [];
    const candidates = input.companies.filter(
      (c) =>
        input.visible(person.id, c) &&
        (history.some((j) => j.legalEntityId === c) ||
          (input.includeUnassigned && history.length === 0)),
    );
    if (!candidates.length) continue;
    const events: [WorkforceMetric, string][] = [];
    if (person.joinedOn <= input.asOf && (!person.separatedOn || person.separatedOn > input.asOf))
      events.push(['headcount', input.asOf]);
    if (person.joinedOn >= from && person.joinedOn <= input.asOf)
      events.push(['joiners', person.joinedOn]);
    if (person.separatedOn && person.separatedOn >= from && person.separatedOn <= input.asOf)
      events.push(['leavers', person.separatedOn]);
    for (const [metric, day] of events) {
      const active = history.filter(
        (j) => j.effectiveFrom <= day && (!j.effectiveTo || j.effectiveTo >= day),
      );
      if (active.length !== 1) {
        // Do not guess a company/site across a gap or choose one side of an overlap.
        for (const company of candidates)
          issues
            .get(company)!
            .get(metric)!
            .add(active.length ? 'overlapping_assignments' : 'missing_assignment');
        continue;
      }
      const job = active[0]!;
      if (!counts.has(job.legalEntityId) || !input.visible(person.id, job.legalEntityId)) continue;
      const site = job.locationId
        ? input.locations.find((l) => l.id === job.locationId)
        : undefined;
      if (job.locationId && (!site || site.legalEntityId !== job.legalEntityId)) {
        issues.get(job.legalEntityId)!.get(metric)!.add('invalid_location');
        continue;
      }
      if (input.locationId && job.locationId !== input.locationId) continue;
      counts.get(job.legalEntityId)![metric]++;
    }
  }
  return new Map(
    input.companies.map((company) => [
      company,
      WORKFORCE_METRICS.map((id) => {
        const gaps = [...issues.get(company)!.get(id)!].toSorted();
        return {
          id,
          version: WORKFORCE_VERSION,
          unit: 'people' as const,
          value: gaps.length ? null : counts.get(company)![id],
          state: gaps.length ? ('incomplete' as const) : ('current' as const),
          issues: gaps,
        };
      }),
    ]),
  );
}
