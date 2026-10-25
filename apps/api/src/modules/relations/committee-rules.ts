import {
  BD_RULES,
  ruleOn,
  type CommitteeRule,
  type ResolvedRule,
  type UnionThreshold,
} from '@gp/country-packs';
import {
  addDays,
  addMonths,
  daysInclusive,
  type CheckResult,
  type CommitteeCheckCode,
  type CommitteeCheckView,
  type CommitteeKind,
  type CommitteeRole,
  type CommitteeSelection,
  type CommitteeSide,
  type Gender,
  type RuleRefView,
} from '@gp/shared';

// The Labour Act's committee and trade union rules applied to a workspace's records, as pure
// functions of the facts and a date, so every rule version can be tested on its own dates.

export type CommitteeRuleVersion = ResolvedRule<CommitteeRule>;

const RULE_KEYS = {
  participation: 'committee.participation',
  safety: 'committee.safety',
  complaint: 'committee.complaint',
} as const;

/** The rule for a kind of committee on a date; null for other committees, or before the law had one. */
export function committeeRuleOn(kind: CommitteeKind, on: string): CommitteeRuleVersion | null {
  if (kind === 'other') return null;
  const rule = ruleOn(BD_RULES, RULE_KEYS[kind], on);
  return rule.value ? { ...rule, value: rule.value } : null;
}

export const ruleRef = (rule: ResolvedRule<unknown>): RuleRefView => ({
  key: rule.key,
  from: rule.from,
  reference: { act: rule.reference.act, section: rule.reference.section },
  status: rule.status,
  ...(rule.note ? { note: rule.note } : {}),
});

export interface Headcount {
  /** Active employees whose job is a worker's (not staff). */
  workers: number;
  employees: number;
}

/**
 * The participation and safety committees go by workers ordinarily employed (s.205, s.90A);
 * the complaint committee serves everyone in the establishment (s.332A).
 */
export const workforceFor = (kind: CommitteeKind, count: Headcount) =>
  kind === 'complaint' ? count.employees : count.workers;

/** "Every establishment" (a threshold of 0) means every one with people in it. */
export const isRequired = (rule: CommitteeRule | null, workforce: number) =>
  rule !== null && workforce >= Math.max(rule.minWorkers, 1);

/** At least the smallest committee in the size table, at most the row for the workforce. */
export function sizeRange(rule: CommitteeRule, workforce: number) {
  const row =
    rule.sizes.find((s) => s.upToWorkers === null || workforce <= s.upToWorkers) ??
    rule.sizes.at(-1)!;
  return { min: rule.sizes[0]!.maxMembers, max: row.maxMembers };
}

/** The day before the anniversary: a term from 29 February ends on 28 February. */
export function termEndOf(rule: CommitteeRule | null, formedOn: string): string | null {
  if (!rule?.termYears) return null;
  const [y, m, d] = formedOn.split('-').map(Number) as [number, number, number];
  // Date.UTC rolls 29 February of a common year over to 1 March.
  const anniversary = new Date(Date.UTC(y + rule.termYears, m - 1, d)).toISOString();
  return addDays(anniversary.slice(0, 10), -1);
}

/** The day by which the committee must meet again; null where the law sets no rhythm. */
export const nextMeetingDue = (
  rule: CommitteeRule | null,
  formedOn: string,
  lastMeetingOn: string | null,
) => (rule?.meetEveryMonths ? addMonths(lastMeetingOn ?? formedOn, rule.meetEveryMonths) : null);

/** The day by which a meeting's minutes must reach the Director of Labour. */
export const minutesDueOn = (rule: CommitteeRule | null, heldOn: string) =>
  rule?.minutesWithinDays == null ? null : addDays(heldOn, rule.minutesWithinDays);

/** Sent after the due day, or not sent and the due day has passed. */
export const minutesLate = (dueOn: string | null, sentOn: string | null, today: string) =>
  dueOn !== null && (sentOn ? sentOn > dueOn : today > dueOn);

export const isCurrent = (period: { fromOn: string; toOn: string | null }, on: string) =>
  period.fromOn <= on && (period.toOn === null || period.toOn >= on);

export const daysBetween = (from: string, to: string) => daysInclusive(from, to) - 1;

export interface MemberFacts {
  side: CommitteeSide;
  role: CommitteeRole;
  selection: CommitteeSelection;
  /** Null for members from outside, whose gender is not recorded. */
  gender: Gender | null;
  fromOn: string;
  toOn: string | null;
}

export interface CommitteeFacts {
  kind: CommitteeKind;
  formedOn: string;
  endsOn: string | null;
  members: MemberFacts[];
  meetings: { heldOn: string; minutesSentOn: string | null }[];
}

export interface CheckContext {
  rule: CommitteeRule;
  /** The headcount the rule is applied to (see workforceFor). */
  workforce: number;
  /** Whether the company has a trade union (worker members are then nominated by it). */
  hasUnion: boolean;
  today: string;
}

const check = (
  code: CommitteeCheckCode,
  result: boolean | CheckResult,
  found: Partial<Omit<CommitteeCheckView, 'code' | 'result'>> = {},
): CommitteeCheckView => ({
  code,
  result: typeof result === 'boolean' ? (result ? 'ok' : 'fail') : result,
  value: null,
  min: null,
  max: null,
  date: null,
  ...found,
});

export const lastMeetingOf = (meetings: { heldOn: string }[]) =>
  meetings.reduce<string | null>((last, m) => (last && last >= m.heldOn ? last : m.heldOn), null);

/** Whether a committee meets the law today, check by check. */
export function checkCommittee(c: CommitteeFacts, ctx: CheckContext): CommitteeCheckView[] {
  const { rule, today } = ctx;
  const end = c.endsOn ?? termEndOf(rule, c.formedOn);
  const inTerm = end === null || end >= today;
  const members = c.members.filter((m) => isCurrent(m, today));
  const workers = members.filter((m) => m.side === 'worker');
  const employer = members.length - workers.length;
  const { min, max } = sizeRange(rule, ctx.workforce);
  const out = [
    check('in_term', inTerm, { date: end }),
    check('size', members.length >= min && members.length <= max, {
      value: members.length,
      min,
      max,
    }),
  ];

  if (c.kind === 'participation') {
    // Workers' representatives at least as many as the employer's, nominated by the unions
    // where there are any, else elected by secret ballot (s.205; Labour Rules 2015, r.183–197).
    out.push(
      check('balance', workers.length >= employer, { value: workers.length, min: employer }),
    );
    const wanted: CommitteeSelection = ctx.hasUnion ? 'nominated' : 'elected';
    const wrong = workers.filter((m) => m.selection !== wanted).length;
    out.push(
      check(ctx.hasUnion ? 'workers_nominated' : 'workers_elected', wrong === 0, { value: wrong }),
    );
  }
  if (c.kind === 'safety') {
    // Equal numbers from the employer and the workers (s.90A; Labour Rules 2015, r.81, r.83).
    out.push(
      check('balance', workers.length === employer, {
        value: workers.length,
        min: employer,
        max: employer,
      }),
    );
  }

  if (rule.womanChairAndMajority) {
    // s.332A: chaired by a woman, and women the majority of its members.
    const chair = members.find((m) => m.role === 'chair');
    out.push(
      check(
        'woman_chair',
        !chair ? 'fail' : chair.gender === null ? 'unknown' : chair.gender === 'female',
      ),
    );
    const women = members.filter((m) => m.gender === 'female').length;
    const unknown = members.filter((m) => m.gender === null).length;
    const majority = Math.floor(members.length / 2) + 1;
    out.push(
      check(
        'women_majority',
        women >= majority ? 'ok' : women + unknown >= majority ? 'unknown' : 'fail',
        { value: women, min: majority },
      ),
    );
  }

  if (inTerm && rule.meetEveryMonths) {
    const last = lastMeetingOf(c.meetings);
    const due = nextMeetingDue(rule, c.formedOn, last)!;
    out.push(
      check('meetings', today <= due, {
        value: daysBetween(last ?? c.formedOn, today),
        date: due,
      }),
    );
  }
  if (rule.minutesWithinDays !== null) {
    const late = c.meetings.filter((m) =>
      minutesLate(minutesDueOn(rule, m.heldOn), m.minutesSentOn, today),
    ).length;
    out.push(check('minutes', late === 0, { value: late, max: rule.minutesWithinDays }));
  }
  return out;
}

/** The members a union needs to register for its company's workers, by the rule on a date. */
export function unionMembersNeeded(workers: number, on: string) {
  const rule = ruleOn(BD_RULES, 'union.min_members', on);
  const threshold: UnionThreshold = rule.value;
  const required = threshold.byWorkforce
    ? (
        threshold.byWorkforce.find((r) => r.upToWorkers === null || workers <= r.upToWorkers) ??
        threshold.byWorkforce.at(-1)!
      ).members
    : Math.ceil((workers * (threshold.percentOfWorkers ?? 0)) / 100);
  return { required, rule };
}

export const unionLimitOn = (on: string) => ruleOn(BD_RULES, 'union.max_per_establishment', on);

/** Subscriptions deducted are deposited with the union within this many days (s.204). */
export const depositRuleOn = (on: string) => ruleOn(BD_RULES, 'union.checkoff_deposit_days', on);
