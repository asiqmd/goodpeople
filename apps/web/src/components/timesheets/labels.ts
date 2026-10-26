import type { TimesheetProjectRef, TimesheetStatus } from '@gp/shared';
import type { useFormatter } from 'next-intl';
import type { Tone } from '../ui';

// Names and hours as the timesheet pages show them, on the server and in the browser.

type NumberFormat = Pick<ReturnType<typeof useFormatter>, 'number'>;

export const STATUS_TONE: Record<TimesheetStatus, Tone> = {
  draft: 'slate',
  submitted: 'amber',
  approved: 'green',
  rejected: 'red',
};

/** Hours in the reader's digits, without trailing zeros. */
export const hours = (format: NumberFormat, value: string | number) =>
  format.number(Number(value), { maximumFractionDigits: 2 });

/** A project's name in the reader's language, after its code. */
export const projectLabel = (p: TimesheetProjectRef, locale: string) =>
  `${p.code} · ${locale === 'bn' && p.nameBn ? p.nameBn : p.name}`;

/** The cell a form field stands for: a date and a project, `none` for uncharged work. */
export const cellName = (date: string, projectId: string | null) =>
  `h.${date}.${projectId ?? 'none'}`;
