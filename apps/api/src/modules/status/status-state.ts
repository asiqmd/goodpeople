import {
  addDays,
  isFinished,
  STATUS_HISTORY_DAYS,
  todayIn,
  worstState,
  type ComponentState,
  type ComponentStatus,
  type IncidentImpact,
  type IncidentKind,
  type IncidentStatus,
  type StatusComponent,
} from '@gp/shared';

// How the status page turns incidents, maintenance and checks into states. Pure, so the rules
// are tested without a database.

/** What the calculations need from an incident or a maintenance window. */
export interface IncidentWindow {
  kind: IncidentKind;
  impact: IncidentImpact | null;
  status: IncidentStatus;
  components: StatusComponent[];
  startsAt: Date;
  endsAt: Date | null;
  resolvedAt: Date | null;
}

/** A component's checks on one Dhaka day. */
export interface DayCount {
  day: string;
  checks: number;
  failures: number;
}

/** Dhaka keeps +06:00 all year, so a day runs from midnight to midnight at that offset. */
export const dhakaMidnight = (day: string) => new Date(`${day}T00:00:00+06:00`);

/**
 * When it ended: resolved or completed, or a maintenance window that closed while still
 * marked scheduled. Maintenance marked in progress runs until someone completes it.
 */
export function endedAt(i: IncidentWindow, now: Date): Date | null {
  if (i.resolvedAt) return i.resolvedAt;
  if (isFinished(i.status)) return i.startsAt;
  if (i.kind === 'maintenance' && i.status !== 'in_progress' && i.endsAt && i.endsAt <= now) {
    return i.endsAt;
  }
  return null;
}

/** An open incident, or maintenance whose window has opened (or that was started early). */
export function inProgress(i: IncidentWindow, now: Date): boolean {
  if (endedAt(i, now)) return false;
  return i.kind === 'incident' || i.status === 'in_progress' || i.startsAt <= now;
}

/** Maintenance still to come that starts within `withinMs`. */
export function upcoming(i: IncidentWindow, now: Date, withinMs: number): boolean {
  return (
    i.kind === 'maintenance' &&
    !endedAt(i, now) &&
    !inProgress(i, now) &&
    i.startsAt.getTime() - now.getTime() <= withinMs
  );
}

/** The state an incident or maintenance gives the components it affects. */
export const stateOf = (i: Pick<IncidentWindow, 'kind' | 'impact'>) =>
  i.kind === 'maintenance' ? ('maintenance' as const) : (i.impact ?? 'degraded');

/** Recent checks, newest first: a failure degrades; three failures in a row are an outage. */
export function checksState(oks: readonly boolean[]): ComponentState {
  if (oks.length === 0 || oks[0]) return 'operational';
  return oks.length >= 3 && oks.slice(0, 3).every((ok) => !ok) ? 'partial_outage' : 'degraded';
}

/** The worst of a component's open incidents, maintenance under way and recent checks. */
export function componentState(
  component: StatusComponent,
  incidents: readonly IncidentWindow[],
  recentChecks: readonly boolean[],
  now: Date,
): ComponentState {
  return worstState([
    checksState(recentChecks),
    ...incidents.filter((i) => i.components.includes(component) && inProgress(i, now)).map(stateOf),
  ]);
}

/** Whether it was under way at some time in [from, to), counting only up to now. */
function overlaps(i: IncidentWindow, from: Date, to: Date, now: Date): boolean {
  const start = inProgress(i, now) && i.startsAt > now ? now : i.startsAt;
  if (start > now) return false;
  const end = endedAt(i, now) ?? now;
  return start < to && end > from;
}

/** The share of checks that passed, or null when none ran. */
export function uptimeOf(counts: readonly Pick<DayCount, 'checks' | 'failures'>[]): number | null {
  const checks = counts.reduce((n, c) => n + c.checks, 0);
  if (checks === 0) return null;
  return 1 - counts.reduce((n, c) => n + c.failures, 0) / checks;
}

/** One entry per Dhaka day, oldest first, ending today. */
export function historyOf(
  component: StatusComponent,
  counts: readonly DayCount[],
  incidents: readonly IncidentWindow[],
  now: Date,
  days = STATUS_HISTORY_DAYS,
): ComponentStatus['days'] {
  const today = todayIn('Asia/Dhaka', now);
  const byDay = new Map(counts.map((c) => [c.day, c]));
  const mine = incidents.filter((i) => i.components.includes(component));
  return Array.from({ length: days }, (_, n) => {
    const date = addDays(today, n - days + 1);
    const from = dhakaMidnight(date);
    const to = dhakaMidnight(addDays(date, 1));
    const count = byDay.get(date);
    return {
      date,
      uptime: count ? uptimeOf([count]) : null,
      worst: worstState(mine.filter((i) => overlaps(i, from, to, now)).map(stateOf)),
    };
  });
}

/** The last time a background job reported a sweep. */
export interface Heartbeat {
  at: Date;
  ok: boolean;
}

/**
 * A job's health from its heartbeat: it must have swept within `windowMs`, successfully.
 * Null (not checked) just after start-up, before the first sweep was due.
 */
export function heartbeatCheck(
  beat: Heartbeat | undefined,
  startedAt: Date,
  windowMs: number,
  now: Date,
): { ok: boolean; detail: string | null } | null {
  if (!beat) {
    return now.getTime() - startedAt.getTime() < windowMs
      ? null
      : { ok: false, detail: 'no_sweep_since_start' };
  }
  if (now.getTime() - beat.at.getTime() > windowMs) {
    return { ok: false, detail: `no_sweep_since ${beat.at.toISOString()}` };
  }
  return beat.ok ? { ok: true, detail: null } : { ok: false, detail: 'last_sweep_failed' };
}
