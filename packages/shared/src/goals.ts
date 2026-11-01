import { z } from 'zod';
import type { EmployeeRef } from './attendance-types.js';
import {
  GOAL_KINDS,
  GOAL_STATUSES,
  KPI_DIRECTIONS,
  KPI_SOURCES,
  type CycleStatus,
  type GoalKind,
  type GoalStatus,
  type KpiDirection,
  type KpiSource,
} from './performance.js';

// Phase 4 M2 performance: goals (input schemas and views). A goal is a person's or a unit's;
// a person's is drafted by them or their manager and agreed by the manager, and within a review
// cycle the weights of a person's agreed goals add up to 100%.

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const isoDate = z.iso.date();
/** A measure or target: numeric(14, 2), zero or more. */
const measure = z.coerce.number().min(0).max(999_999_999_999);

/** A person's agreed goals for a cycle carry weights that add up to this, in percent. */
export const GOAL_WEIGHT_TOTAL = 100;
/** The most key results an objective has. */
export const MAX_KEY_RESULTS = 10;

/** Statuses a goal is still worked on in; completed and dropped goals no longer change. */
export const OPEN_GOAL_STATUSES = ['draft', 'agreed'] as const satisfies readonly GoalStatus[];

/** Sources that read a KPI's value from the records; it is never typed. */
export const isRecordSource = (source: KpiSource) => source !== 'manual';

// ── Inputs ───────────────────────────────────────────────────────────────────

export const goalKeyResultSchema = z.object({
  text: z.string().trim().min(2).max(300),
  /** Left out on an edit: the same key result keeps whether it was done. */
  done: z.boolean().optional(),
});

const goalFields = {
  title: z.string().trim().min(3).max(200),
  description: optionalText(2000),
  kind: z.enum(GOAL_KINDS),
  keyResults: z.array(goalKeyResultSchema).max(MAX_KEY_RESULTS).optional(),
  /** A KPI's measure, e.g. "%", "pieces", "days". */
  measureUnit: z.string().trim().min(1).max(40).nullable().optional(),
  target: measure.nullable().optional(),
  direction: z.enum(KPI_DIRECTIONS).nullable().optional(),
  source: z.enum(KPI_SOURCES).optional(),
  /** Percent of the person's goals for the cycle. */
  weight: z.coerce.number().min(0).max(100).nullable().optional(),
  startsOn: isoDate.nullable().optional(),
  dueOn: isoDate.nullable().optional(),
  /** A review cycle that is being set up or under way. */
  cycleId: z.uuid().nullable().optional(),
  /** The unit's goal, or the manager's own goal, this one serves. */
  parentGoalId: z.uuid().nullable().optional(),
};

/** A new goal: a person's (`employeeId`, the login's own when left out) or a unit's. */
export const goalSchema = z.object({
  employeeId: z.uuid().optional(),
  orgUnitId: z.uuid().optional(),
  ...goalFields,
});
export type GoalInput = z.infer<typeof goalSchema>;

/** Only what is given changes; null clears an optional field. */
export const goalUpdateSchema = z.object(goalFields).partial();
export type GoalUpdateInput = z.infer<typeof goalUpdateSchema>;

/** Where a goal's fields must agree with each other, for the API to refuse field by field. */
export interface GoalProblem {
  code: string;
  path: string;
  message: string;
}

/** What a goal's fields, as they will be stored, must hold together. */
export function goalProblem(goal: {
  employeeId?: string | null;
  orgUnitId?: string | null;
  kind: GoalKind;
  measureUnit?: string | null;
  target?: number | string | null;
  direction?: KpiDirection | null;
  source?: KpiSource;
  startsOn?: string | null;
  dueOn?: string | null;
}): GoalProblem | null {
  if (goal.employeeId && goal.orgUnitId) {
    return {
      code: 'goal_owner_one',
      path: 'orgUnitId',
      message: 'A goal is a person’s or a unit’s, not both',
    };
  }
  if (goal.kind === 'kpi') {
    const manual = !isRecordSource(goal.source ?? 'manual');
    if (goal.target === null || goal.target === undefined) {
      return { code: 'goal_target_required', path: 'target', message: 'Give the KPI a target' };
    }
    if (manual && !goal.measureUnit) {
      return {
        code: 'goal_unit_required',
        path: 'measureUnit',
        message: 'Say what the KPI is measured in',
      };
    }
    if (manual && !goal.direction) {
      return {
        code: 'goal_direction_required',
        path: 'direction',
        message: 'Say whether higher or lower is better',
      };
    }
    if (!manual && !goal.startsOn) {
      return {
        code: 'goal_start_required',
        path: 'startsOn',
        message: 'A KPI read from the records needs a start date',
      };
    }
  }
  if (goal.startsOn && goal.dueOn && goal.dueOn < goal.startsOn) {
    return {
      code: 'goal_dates_order',
      path: 'dueOn',
      message: 'The due date cannot be before the start date',
    };
  }
  return null;
}

/**
 * A check-in: a note, with the progress (an objective without key results), the key results
 * done (by their place in the list), or the value (a KPI typed by hand).
 */
export const goalCheckinSchema = z.object({
  progress: z.coerce.number().int().min(0).max(100).nullable().optional(),
  value: measure.nullable().optional(),
  done: z
    .array(
      z.coerce
        .number()
        .int()
        .min(0)
        .max(MAX_KEY_RESULTS - 1),
    )
    .optional(),
  note: optionalText(2000),
});
export type GoalCheckinInput = z.infer<typeof goalCheckinSchema>;

export const goalDropSchema = z.object({ note: z.string().trim().min(3).max(2000) });
export type GoalDropInput = z.infer<typeof goalDropSchema>;

export const goalCompleteSchema = z.object({ note: optionalText(2000) });
export type GoalCompleteInput = z.infer<typeof goalCompleteSchema>;

/** The login's own drafts for a cycle (null: outside any cycle), sent to their manager. */
export const goalSubmitSchema = z.object({ cycleId: z.uuid().nullable() });
export type GoalSubmitInput = z.infer<typeof goalSubmitSchema>;

/** Every draft of one person for a cycle (null: outside any cycle), agreed at once. */
export const goalAgreeAllSchema = z.object({ employeeId: z.uuid(), cycleId: z.uuid().nullable() });
export type GoalAgreeAllInput = z.infer<typeof goalAgreeAllSchema>;

/** A cycle's id, or `none` for goals outside any cycle. */
const cycleFilter = z.union([z.uuid(), z.literal('none')]).optional();

export const teamGoalsQuerySchema = z.object({
  cycleId: cycleFilter,
  status: z.enum(GOAL_STATUSES).optional(),
});
export type TeamGoalsQuery = z.infer<typeof teamGoalsQuerySchema>;

/** Everyone's goals, for `performance.manage`. */
export const goalListQuerySchema = z.object({
  cycleId: cycleFilter,
  status: z.enum(GOAL_STATUSES).optional(),
  /** People whose job is in this unit or below it. */
  orgUnitId: z.uuid().optional(),
  employeeId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type GoalListQuery = z.infer<typeof goalListQuerySchema>;

/** Whose new goal the form is for: a person (the login when neither is given) or a unit. */
export const goalChoicesQuerySchema = z.object({
  employeeId: z.uuid().optional(),
  orgUnitId: z.uuid().optional(),
});
export type GoalChoicesQuery = z.infer<typeof goalChoicesQuerySchema>;

/** People the login may draft goals for, by name or code. */
export const goalPeopleQuerySchema = z.object({ search: z.string().trim().max(100).optional() });
export type GoalPeopleQuery = z.infer<typeof goalPeopleQuerySchema>;

// ── Progress ─────────────────────────────────────────────────────────────────

const clampPercent = (n: number) => Math.min(100, Math.max(0, Math.round(n)));
const decimal = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === '' ? null : Number(v);

export interface ProgressInput {
  kind: GoalKind;
  keyResults: readonly { done: boolean }[];
  target: number | string | null;
  direction: KpiDirection | null;
  currentValue: number | string | null;
  /** As last set by hand, for what cannot be worked out. */
  progress: number;
}

/**
 * A goal's progress, 0–100: an objective's share of key results done; a KPI's value against
 * its target, in its direction (for "lower is better", at or below the target is 100, and above
 * it the target's share of the value); otherwise as last set.
 */
export function goalProgress(goal: ProgressInput): number {
  if (goal.kind === 'objective' && goal.keyResults.length > 0) {
    const done = goal.keyResults.filter((k) => k.done).length;
    return clampPercent((done / goal.keyResults.length) * 100);
  }
  const target = decimal(goal.target);
  const value = decimal(goal.currentValue);
  if (goal.kind === 'kpi' && target !== null && value !== null && goal.direction) {
    if (goal.direction === 'higher') {
      if (target <= 0) return 100;
      return clampPercent((value / target) * 100);
    }
    if (value <= target) return 100;
    return clampPercent((target / value) * 100);
  }
  return clampPercent(goal.progress);
}

/** A goal's weight as it counts towards a cycle's total. */
const weightOf = (g: { weight: number | string | null }) => decimal(g.weight) ?? 0;

/**
 * The weights of one person's goals for one cycle: agreed (and completed, which were agreed),
 * and drafts still to agree; dropped goals count for nothing.
 */
export function goalWeights(
  goals: readonly { status: GoalStatus; weight: number | string | null }[],
) {
  const sum = (statuses: readonly GoalStatus[]) =>
    Math.round(
      goals.filter((g) => statuses.includes(g.status)).reduce((n, g) => n + weightOf(g), 0) * 100,
    ) / 100;
  const agreed = sum(['agreed', 'completed']);
  const draft = sum(['draft']);
  return { agreed, draft, total: Math.round((agreed + draft) * 100) / 100 };
}

/** Whether weights, in percent to two decimals, add up to exactly 100. */
export const weightsComplete = (total: number) =>
  Math.round(total * 100) === GOAL_WEIGHT_TOTAL * 100;

// ── Views ────────────────────────────────────────────────────────────────────

export interface GoalUnitRef {
  id: string;
  code: string;
  name: string;
  nameBn: string | null;
  legalEntityId: string;
}

export interface GoalCycleRef {
  id: string;
  name: string;
  status: CycleStatus;
  periodStart: string;
  periodEnd: string;
  goalsDueOn: string | null;
}

/** How a KPI from the records got its value, over its period so far. */
export type KpiReading =
  | {
      source: 'attendance_rate';
      from: string;
      to: string;
      /** Days present (a half day counts a half) of the scheduled working days. */
      presentDays: number;
      workingDays: number;
      /** Whose attendance: one for a person's goal, the unit's people for a unit's. */
      people: number;
    }
  | {
      source: 'production_target';
      from: string;
      to: string;
      /** Pieces made against the day targets of the operations worked. */
      pieces: number;
      target: number;
      people: number;
    };

export interface GoalView {
  id: string;
  /** A person's goal; null for a unit's. */
  employee: EmployeeRef | null;
  /** A unit's goal; null for a person's. */
  orgUnit: GoalUnitRef | null;
  cycle: GoalCycleRef | null;
  parent: { id: string; title: string } | null;
  title: string;
  description: string | null;
  kind: GoalKind;
  keyResults: { text: string; done: boolean }[];
  measureUnit: string | null;
  /** Decimals as text, like the other numeric columns. */
  target: string | null;
  direction: KpiDirection | null;
  source: KpiSource;
  currentValue: string | null;
  progress: number;
  weight: string | null;
  startsOn: string | null;
  dueOn: string | null;
  status: GoalStatus;
  agreedAt: string | null;
  agreedBy: string | null;
  /** For a KPI from the records that is still open: how its value was read. */
  reading: KpiReading | null;
  createdAt: string;
  updatedAt: string;
}

/** What the signed-in login may do with a goal. */
export interface GoalActions {
  edit: boolean;
  agree: boolean;
  checkin: boolean;
  complete: boolean;
  drop: boolean;
  /** Send the person's drafts to their manager (the person only). */
  submit: boolean;
}

export interface GoalCheckinView {
  id: string;
  progress: number | null;
  value: string | null;
  note: string | null;
  author: string | null;
  createdAt: string;
}

export interface GoalDetail extends GoalView {
  parentGoal: GoalView | null;
  children: GoalView[];
  checkins: GoalCheckinView[];
  /** Why a dropped goal was dropped. */
  dropNote: string | null;
  can: GoalActions;
  /** Goals this one may serve, for the edit form. */
  alignTo: GoalView[];
  /** Cycles a goal may be put in, for the edit form. */
  cycles: GoalCycleRef[];
}

export interface MyGoals {
  /** Null for a login without an employee record. */
  employee: EmployeeRef | null;
  manager: EmployeeRef | null;
  goals: GoalView[];
  /** Unit goals of the login's unit and those above it, and the manager's own goals. */
  alignTo: GoalView[];
  /** Cycles being set up or under way that include the login's company. */
  cycles: GoalCycleRef[];
  /** Whether anyone reports to the login, so the team tab is worth showing. */
  managesPeople: boolean;
  /** Whether the login has `performance.manage`. */
  manage: boolean;
}

export interface TeamGoalsPerson {
  employee: EmployeeRef;
  /** Their manager, for people below the login's direct reports. */
  manager: EmployeeRef | null;
  goals: GoalView[];
}

export interface TeamGoals {
  people: TeamGoalsPerson[];
  cycles: GoalCycleRef[];
  /** Draft goals of the team waiting for agreement. */
  toAgree: number;
}

export interface UnitGoalsItem {
  unit: GoalUnitRef;
  goals: GoalView[];
  /** May write this unit's goals: `performance.manage`, or someone with reports in the unit. */
  canWrite: boolean;
}

export interface UnitGoals {
  units: UnitGoalsItem[];
  cycles: GoalCycleRef[];
}

/** What a new goal's form offers for one person or unit. */
export interface GoalChoices {
  employee: EmployeeRef | null;
  orgUnit: GoalUnitRef | null;
  cycles: GoalCycleRef[];
  alignTo: GoalView[];
}

export interface GoalSubmitResult {
  goals: number;
  /** How many people were told: the manager, or HR where there is no manager. */
  notified: number;
}
