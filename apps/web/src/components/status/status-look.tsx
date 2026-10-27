import { worstState, type ComponentState, type ComponentStatus } from '@gp/shared';
import type { Tone } from '../ui';

// How a state looks: the reserved status colours (good, warning, serious, critical) plus blue
// for planned work and grey for no data. Colour never stands alone: every use comes with an
// icon and a word.

export type DayLook = ComponentState | 'no_data';

export const FILL: Record<DayLook, string> = {
  operational: 'bg-[#0ca30c]',
  maintenance: 'bg-[#2a78d6]',
  degraded: 'bg-[#fab219]',
  partial_outage: 'bg-[#ec835a]',
  major_outage: 'bg-[#d03b3b]',
  no_data: 'bg-slate-200',
};

/** Icons: the same hues, with warning and serious a step darker to stand out (3:1) on white. */
const INK: Record<DayLook, string> = {
  operational: 'text-[#0ca30c]',
  maintenance: 'text-[#2a78d6]',
  degraded: 'text-[#b97f00]',
  partial_outage: 'text-[#e06a3c]',
  major_outage: 'text-[#d03b3b]',
  no_data: 'text-slate-400',
};

export const TONE: Record<ComponentState, Tone> = {
  operational: 'green',
  maintenance: 'blue',
  degraded: 'amber',
  partial_outage: 'red',
  major_outage: 'red',
};

/**
 * A day's look: the worst of its incidents and its checks. A part with no checks at all
 * (payments) shows its incidents only, so a quiet day is working rather than "no data".
 */
export function dayLook(day: ComponentStatus['days'][number], hasChecks: boolean): DayLook {
  if (!hasChecks || day.uptime === null) {
    return hasChecks && day.worst === 'operational' ? 'no_data' : day.worst;
  }
  const checks: ComponentState =
    day.uptime >= 0.99 ? 'operational' : day.uptime >= 0.95 ? 'degraded' : 'partial_outage';
  return worstState([day.worst, checks]);
}

const PATHS: Record<DayLook, string[]> = {
  operational: ['M8 12.5l2.5 2.5L16 9.5'],
  maintenance: ['M12 7.5V12l3 2'],
  degraded: ['M12 7.5v5.5', 'M12 16h.01'],
  partial_outage: ['M7.5 12h9'],
  major_outage: ['M9 9l6 6', 'M15 9l-6 6'],
  no_data: ['M9 12h6'],
};

/** A small circled mark whose shape differs per state, for readers who cannot tell colours apart. */
export function StateIcon({ state, className = 'size-5' }: { state: DayLook; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${className} shrink-0 ${INK[state]}`}
    >
      <circle cx="12" cy="12" r="9" strokeDasharray={state === 'no_data' ? '3 3' : undefined} />
      {PATHS[state].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
