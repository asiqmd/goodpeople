import type { ProjectStatus, ProjectView } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import { day } from '../leave/leave-views';
import { Badge, type Tone } from '../ui';

type Formatter = Awaited<ReturnType<typeof getFormatter>>;

const STATUS_TONE: Record<ProjectStatus, Tone> = { active: 'green', closed: 'slate' };

export async function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const t = await getTranslations('projects.statuses');
  return <Badge tone={STATUS_TONE[status]}>{t(status)}</Badge>;
}

/** "1 Jan 2026 – 31 Dec 2027", or "From 1 Jan 2026" without an end. */
export async function projectPeriod(format: Formatter, project: ProjectView) {
  const t = await getTranslations('projects');
  return project.endsOn
    ? t('period', { from: day(format, project.startsOn), to: day(format, project.endsOn) })
    : t('periodOpen', { from: day(format, project.startsOn) });
}

/** A project's name in the reader's language. */
export const projectName = (p: { name: string; nameBn?: string | null }, locale: string) =>
  locale === 'bn' && p.nameBn ? p.nameBn : p.name;

/** How much of a limit is used: a bar, amber past it. */
export function Meter({ used, label }: { used: number; label: string }) {
  const over = used > 100;
  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-slate-100"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(used)}
    >
      <div
        className={`h-full ${over ? 'bg-amber-500' : 'bg-brand-600'}`}
        style={{ width: `${Math.min(100, Math.max(0, used))}%` }}
      />
    </div>
  );
}
