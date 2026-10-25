import { z } from 'zod';
import type { EmployeeRef } from './attendance-types.js';
import { GENDERS, type Gender } from './hr.js';
import type { Ref } from './hr-types.js';
import { moneySchema } from './payroll-schemas.js';

// Industrial relations records (Phase 3 M3): the committees the Labour Act requires
// (participation s.205, safety s.90A, complaint s.332A), their meetings, and trade unions
// with their members and subscriptions deducted from wages (check-off, s.204).

export const COMMITTEE_KINDS = ['participation', 'safety', 'complaint', 'other'] as const;
export type CommitteeKind = (typeof COMMITTEE_KINDS)[number];

/** The committees the Act requires, checked in every establishment. */
export const REQUIRED_COMMITTEES = [
  'participation',
  'safety',
  'complaint',
] as const satisfies readonly CommitteeKind[];
export type RequiredCommittee = (typeof REQUIRED_COMMITTEES)[number];

export const COMMITTEE_SIDES = ['employer', 'worker'] as const;
export type CommitteeSide = (typeof COMMITTEE_SIDES)[number];

export const COMMITTEE_ROLES = ['chair', 'co_chair', 'secretary', 'member'] as const;
export type CommitteeRole = (typeof COMMITTEE_ROLES)[number];

export const COMMITTEE_SELECTIONS = ['nominated', 'elected'] as const;
export type CommitteeSelection = (typeof COMMITTEE_SELECTIONS)[number];

export const UNION_ROLES = [
  'member',
  'president',
  'general_secretary',
  'treasurer',
  'office_bearer',
] as const;
export type UnionRole = (typeof UNION_ROLES)[number];

/** A decision a committee meeting took, followed up at the next meetings. */
export interface CommitteeDecision {
  text: string;
  dueOn: string | null;
  done: boolean;
}

/**
 * What is checked of a committee: that it was formed and is in its term, its size for the
 * workforce, the balance of its sides, how worker members were chosen (by the unions, or by
 * ballot where there is none), a woman chairing and women the majority (complaint), that it
 * meets often enough and sends its minutes in time.
 */
export const COMMITTEE_CHECKS = [
  'formed',
  'in_term',
  'size',
  'balance',
  'workers_nominated',
  'workers_elected',
  'woman_chair',
  'women_majority',
  'meetings',
  'minutes',
] as const;
export type CommitteeCheckCode = (typeof COMMITTEE_CHECKS)[number];

/** `unknown`: the records cannot tell, e.g. the gender of a member from outside. */
export const CHECK_RESULTS = ['ok', 'fail', 'unknown'] as const;
export type CheckResult = (typeof CHECK_RESULTS)[number];

const isoDate = z.iso.date();
const id = z.uuid();
const name = z.string().trim().min(2).max(160);
const note = z.string().trim().max(2000).nullable().optional();
const longText = z.string().trim().max(20_000).nullable().optional();
const employeeCode = z.string().trim().min(1).max(40);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use a month like 2026-05');
const notBefore = (from: string, to: string | null | undefined) => !to || to >= from;

// ── Committees ───────────────────────────────────────────────────────────────

const committeeFields = {
  name,
  formedOn: isoDate,
  /** Left out: the end of the term the law sets (two years for participation and safety). */
  endsOn: isoDate.nullable().optional(),
  note,
};

export const committeeInputSchema = z
  .object({
    kind: z.enum(COMMITTEE_KINDS),
    /** The company it serves, and the site (a factory) when it serves only that site. */
    legalEntityId: id,
    locationId: id.nullable().optional(),
    ...committeeFields,
  })
  .refine((c) => notBefore(c.formedOn, c.endsOn), {
    path: ['endsOn'],
    message: 'The term cannot end before the committee was formed',
  });
export type CommitteeInput = z.infer<typeof committeeInputSchema>;

export const committeeUpdateSchema = z
  .object(committeeFields)
  .partial()
  .refine((c) => !c.formedOn || notBefore(c.formedOn, c.endsOn), {
    path: ['endsOn'],
    message: 'The term cannot end before the committee was formed',
  });
export type CommitteeUpdate = z.infer<typeof committeeUpdateSchema>;

/** An employee (by id or code), or someone from outside by name. */
export const committeeMemberInputSchema = z
  .object({
    employeeId: id.optional(),
    employeeCode: employeeCode.optional(),
    name: name.optional(),
    /** A member from outside: counts towards a complaint committee's women (s.332A). */
    gender: z.enum(GENDERS).optional(),
    side: z.enum(COMMITTEE_SIDES),
    role: z.enum(COMMITTEE_ROLES).default('member'),
    selection: z.enum(COMMITTEE_SELECTIONS),
    fromOn: isoDate,
    toOn: isoDate.nullable().optional(),
  })
  .refine((m) => m.employeeId || m.employeeCode || m.name, {
    path: ['employeeCode'],
    message: 'Give an employee code, or the name of a member from outside',
  })
  .refine((m) => notBefore(m.fromOn, m.toOn), {
    path: ['toOn'],
    message: 'Cannot end before it starts',
  });
export type CommitteeMemberInput = z.infer<typeof committeeMemberInputSchema>;

export const committeeMemberEndSchema = z.object({ toOn: isoDate });
export type CommitteeMemberEnd = z.infer<typeof committeeMemberEndSchema>;

export const committeeDecisionSchema = z.object({
  text: z.string().trim().min(2).max(1000),
  dueOn: isoDate.nullable().default(null),
  done: z.boolean().default(false),
});

const meetingFields = {
  heldOn: isoDate,
  agenda: longText,
  minutes: longText,
  attendees: z.coerce.number().int().min(0).max(1000).nullable().optional(),
  /** When the minutes went to the Director of Labour (participation: within 7 days). */
  minutesSentOn: isoDate.nullable().optional(),
  decisions: z.array(committeeDecisionSchema).max(50),
};

export const committeeMeetingInputSchema = z
  .object({ ...meetingFields, decisions: meetingFields.decisions.default([]) })
  .refine((m) => notBefore(m.heldOn, m.minutesSentOn), {
    path: ['minutesSentOn'],
    message: 'Minutes cannot be sent before the meeting',
  });
export type CommitteeMeetingInput = z.infer<typeof committeeMeetingInputSchema>;

export const committeeMeetingUpdateSchema = z
  .object(meetingFields)
  .partial()
  .refine((m) => !m.heldOn || notBefore(m.heldOn, m.minutesSentOn), {
    path: ['minutesSentOn'],
    message: 'Minutes cannot be sent before the meeting',
  });
export type CommitteeMeetingUpdate = z.infer<typeof committeeMeetingUpdateSchema>;

export const decisionDoneSchema = z.object({ done: z.boolean() });
export type DecisionDoneInput = z.infer<typeof decisionDoneSchema>;

// ── Trade unions ─────────────────────────────────────────────────────────────

const unionFields = {
  name,
  registrationNo: z.string().trim().max(60).nullable().optional(),
  registeredOn: isoDate.nullable().optional(),
  federation: z.string().trim().max(200).nullable().optional(),
  /** The collective bargaining agent (s.202); one per company. */
  isCba: z.boolean(),
  /** Subscriptions deducted from consenting members' wages (s.204). */
  checkOff: z.boolean(),
  monthlySubscription: moneySchema.nullable().optional(),
  note,
};
const checkOffNeedsSubscription = (u: {
  checkOff?: boolean;
  monthlySubscription?: string | null;
}) => !u.checkOff || Number(u.monthlySubscription ?? 0) > 0;

export const tradeUnionInputSchema = z
  .object({
    legalEntityId: id,
    ...unionFields,
    isCba: unionFields.isCba.default(false),
    checkOff: unionFields.checkOff.default(false),
  })
  .refine(checkOffNeedsSubscription, {
    path: ['monthlySubscription'],
    message: 'Check-off needs the monthly subscription',
  });
export type TradeUnionInput = z.infer<typeof tradeUnionInputSchema>;

/** A check-off union's subscription stays set; checked against the stored union too. */
export const tradeUnionUpdateSchema = z.object(unionFields).partial();
export type TradeUnionUpdate = z.infer<typeof tradeUnionUpdateSchema>;

const consent = isoDate.nullable().optional();

export const unionMemberInputSchema = z
  .object({
    employeeId: id.optional(),
    employeeCode: employeeCode.optional(),
    role: z.enum(UNION_ROLES).default('member'),
    joinedOn: isoDate,
    /** The member's written consent to deduction from wages; none: they pay directly. */
    checkOffConsentOn: consent,
  })
  .refine((m) => m.employeeId || m.employeeCode, {
    path: ['employeeCode'],
    message: 'Give an employee code',
  });
export type UnionMemberInput = z.infer<typeof unionMemberInputSchema>;

export const unionMembersBulkSchema = z.object({
  employeeCodes: z.array(employeeCode).min(1).max(2000),
  joinedOn: isoDate,
  checkOffConsentOn: consent,
});
export type UnionMembersBulkInput = z.infer<typeof unionMembersBulkSchema>;

export const unionMemberUpdateSchema = z.object({
  role: z.enum(UNION_ROLES).optional(),
  checkOffConsentOn: consent,
});
export type UnionMemberUpdate = z.infer<typeof unionMemberUpdateSchema>;

export const unionMemberEndSchema = z.object({ leftOn: isoDate });
export type UnionMemberEnd = z.infer<typeof unionMemberEndSchema>;

export const checkOffQuerySchema = z.object({ month, unionId: id.optional() });
export type CheckOffQuery = z.infer<typeof checkOffQuerySchema>;

// ── Views ────────────────────────────────────────────────────────────────────

/** The version of a country-pack rule applied, with its legal reference. */
export interface RuleRefView {
  key: string;
  from: string;
  reference: { act: string; section: string };
  status: 'verified' | 'needs_review';
  note?: string;
}

export interface CommitteeCheckView {
  code: CommitteeCheckCode;
  result: CheckResult;
  /**
   * What was found: members (size), worker members (balance), members chosen the wrong
   * way, women (women_majority), days since the last meeting, meetings whose minutes are late.
   */
  value: number | null;
  /** The bounds the law sets: members, the employer's members, a majority, days for minutes. */
  min: number | null;
  max: number | null;
  /** The date that matters: the term's end, or the next meeting's due date. */
  date: string | null;
}

export interface CommitteeMemberView {
  id: string;
  /** Null for a member from outside the company. */
  employee: EmployeeRef | null;
  name: string;
  /** From the employee's record; null for members from outside (not recorded). */
  gender: Gender | null;
  side: CommitteeSide;
  role: CommitteeRole;
  selection: CommitteeSelection;
  fromOn: string;
  toOn: string | null;
  current: boolean;
}

export interface CommitteeMeetingView {
  id: string;
  heldOn: string;
  agenda: string | null;
  minutes: string | null;
  attendees: number | null;
  minutesSentOn: string | null;
  /** When the minutes must reach the Director of Labour; null where the law sets no limit. */
  minutesDueOn: string | null;
  minutesLate: boolean;
  decisions: CommitteeDecision[];
}

export interface CommitteeSummaryView {
  id: string;
  kind: CommitteeKind;
  name: string;
  legalEntity: Ref;
  location: Ref | null;
  formedOn: string;
  endsOn: string | null;
  inTerm: boolean;
  members: number;
  lastMeetingOn: string | null;
  nextMeetingDue: string | null;
}

export interface CommitteeView extends CommitteeSummaryView {
  note: string | null;
  /** The headcount its rule is applied to (workers; everyone for the complaint committee). */
  workforce: number;
  rule: RuleRefView | null;
  checks: CommitteeCheckView[];
  memberList: CommitteeMemberView[];
  meetings: CommitteeMeetingView[];
}

export interface CommitteeRequirementView {
  kind: RequiredCommittee;
  /** Whether the law requires it here today. */
  required: boolean;
  /** The headcount the rule is applied to: workers, or everyone for the complaint committee. */
  workforce: number;
  minWorkers: number | null;
  /** Null when the law had no such committee on the date. */
  rule: RuleRefView | null;
  /** A site without its own committee of this kind is served by the company's. */
  coveredByCompany: boolean;
  committee: CommitteeSummaryView | null;
  checks: CommitteeCheckView[];
  ok: boolean;
}

/**
 * An establishment: a company, or one of its sites that has committees of its own. A
 * company's row counts the people not at sites with their own committee of each kind.
 */
export interface EstablishmentStatusView {
  /** The legal entity's id, or the site's. */
  id: string;
  legalEntity: Ref;
  location: Ref | null;
  /** Active employees whose job is a worker's (not staff), and all active employees. */
  workers: number;
  employees: number;
  unions: number;
  requirements: CommitteeRequirementView[];
}

export interface RelationsStatusView {
  asOf: string;
  establishments: EstablishmentStatusView[];
}

export interface RelationsCheckResult {
  /** Alerts raised or brought up to date, and those resolved because the cause went away. */
  open: number;
  resolved: number;
  notified: number;
}

export interface UnionMemberView {
  id: string;
  employee: EmployeeRef;
  role: UnionRole;
  joinedOn: string;
  leftOn: string | null;
  checkOffConsentOn: string | null;
  current: boolean;
}

/** Members a union needs to register, for its company's workforce (s.179). */
export interface UnionThresholdView {
  workers: number;
  required: number;
  members: number;
  ok: boolean;
  rule: RuleRefView;
}

export interface TradeUnionSummaryView {
  id: string;
  legalEntity: Ref;
  name: string;
  registrationNo: string | null;
  registeredOn: string | null;
  federation: string | null;
  isCba: boolean;
  checkOff: boolean;
  monthlySubscription: string | null;
  note: string | null;
  members: number;
  consenting: number;
  threshold: UnionThresholdView;
}

export interface TradeUnionView extends TradeUnionSummaryView {
  memberList: UnionMemberView[];
}

/** Unions in one company against the most the law allows in an establishment. */
export interface UnionCountView {
  legalEntity: Ref;
  unions: number;
  max: number | null;
  over: boolean;
  rule: RuleRefView;
}

export interface UnionListView {
  unions: TradeUnionSummaryView[];
  counts: UnionCountView[];
}

/** Why a code in a bulk add was left out: a worker is in one union at a time (s.193). */
export const UNION_SKIP_REASONS = [
  'not_found',
  'already_member',
  'other_union',
  'other_company',
] as const;
export type UnionSkipReason = (typeof UNION_SKIP_REASONS)[number];

export interface UnionBulkResult {
  added: number;
  skipped: { code: string; reason: UnionSkipReason }[];
}

export interface CheckOffRow {
  union: Ref;
  employee: EmployeeRef;
  checkOffConsentOn: string;
  subscription: string;
  /** UNION_SUB in the month's locked regular run; null when not in one. */
  deducted: string | null;
  runId: string | null;
  payGroup: string | null;
  paymentDate: string | null;
  depositDueOn: string | null;
}

export interface CheckOffUnionTotal {
  union: Ref & { registrationNo: string | null };
  members: number;
  expected: string;
  deducted: string;
  /** The earliest deposit due date of the month's runs (s.204). */
  depositDueOn: string | null;
  /** Members without consent, who pay the union themselves. */
  payDirectly: number;
}

export interface CheckOffReport {
  month: string;
  rows: CheckOffRow[];
  unions: CheckOffUnionTotal[];
  /** The month's regular runs not locked yet: their deductions are not final. */
  unlockedRuns: number;
  /** Days after wages are paid to deposit the subscriptions with the union (s.204). */
  depositDays: number;
  rule: RuleRefView;
}
