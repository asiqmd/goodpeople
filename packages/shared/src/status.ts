import { z } from 'zod';

// The status page (Phase 3 M5): each part of the service with its state, from our own checks
// every minute and from the incidents and maintenance we post, in English and Bangla.

/** The parts of the service a customer would recognise, in the order the page shows them. */
export const STATUS_COMPONENTS = [
  'web',
  'api',
  'attendance',
  'documents',
  'notifications',
  'payments',
] as const;
export type StatusComponent = (typeof STATUS_COMPONENTS)[number];

/** Worst last; a component shows the worst of its checks and its open incidents. */
export const COMPONENT_STATES = [
  'operational',
  'maintenance',
  'degraded',
  'partial_outage',
  'major_outage',
] as const;
export type ComponentState = (typeof COMPONENT_STATES)[number];

export const worstState = (states: readonly ComponentState[]): ComponentState =>
  states.reduce<ComponentState>(
    (worst, s) => (COMPONENT_STATES.indexOf(s) > COMPONENT_STATES.indexOf(worst) ? s : worst),
    'operational',
  );

export const INCIDENT_KINDS = ['incident', 'maintenance'] as const;
export type IncidentKind = (typeof INCIDENT_KINDS)[number];

export const INCIDENT_IMPACTS = ['degraded', 'partial_outage', 'major_outage'] as const;
export type IncidentImpact = (typeof INCIDENT_IMPACTS)[number];

export const INCIDENT_STATUSES = ['investigating', 'identified', 'monitoring', 'resolved'] as const;
export const MAINTENANCE_STATUSES = ['scheduled', 'in_progress', 'completed'] as const;
export type IncidentStatus =
  (typeof INCIDENT_STATUSES)[number] | (typeof MAINTENANCE_STATUSES)[number];

/** Statuses after which an incident or maintenance is over. */
export const isFinished = (status: IncidentStatus) =>
  status === 'resolved' || status === 'completed';

/** How many days of history the page shows. */
export const STATUS_HISTORY_DAYS = 90;

const text = (max: number) => z.string().trim().min(1).max(max);

export const createIncidentSchema = z
  .object({
    kind: z.enum(INCIDENT_KINDS),
    titleEn: text(160),
    titleBn: text(160),
    /** Incidents only; maintenance shows as maintenance. */
    impact: z.enum(INCIDENT_IMPACTS).optional(),
    components: z.array(z.enum(STATUS_COMPONENTS)).min(1, 'Pick what is affected'),
    status: z.enum([...INCIDENT_STATUSES, ...MAINTENANCE_STATUSES]),
    /** Maintenance: the window. Incidents start now unless given. */
    startsAt: z.iso.datetime({ offset: true }).optional(),
    endsAt: z.iso.datetime({ offset: true }).optional(),
    bodyEn: text(4000),
    bodyBn: text(4000),
  })
  .refine((v) => v.kind === 'maintenance' || v.impact, {
    path: ['impact'],
    message: 'Say how bad it is',
  })
  .refine((v) => v.kind === 'incident' || (v.startsAt && v.endsAt), {
    path: ['endsAt'],
    message: 'Maintenance needs a start and an end',
  })
  .refine(
    (v) =>
      v.kind === 'incident'
        ? (INCIDENT_STATUSES as readonly string[]).includes(v.status)
        : (MAINTENANCE_STATUSES as readonly string[]).includes(v.status),
    { path: ['status'], message: 'Not a status for this kind' },
  );
export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;

export const incidentUpdateSchema = z.object({
  status: z.enum([...INCIDENT_STATUSES, ...MAINTENANCE_STATUSES]),
  bodyEn: text(4000),
  bodyBn: text(4000),
  /** An incident may get better or worse as it goes. */
  impact: z.enum(INCIDENT_IMPACTS).optional(),
});
export type IncidentUpdateInput = z.infer<typeof incidentUpdateSchema>;

export interface IncidentUpdateView {
  id: string;
  status: IncidentStatus;
  bodyEn: string;
  bodyBn: string;
  createdAt: string;
}

export interface IncidentView {
  id: string;
  kind: IncidentKind;
  titleEn: string;
  titleBn: string;
  /** `maintenance` for maintenance. */
  impact: Exclude<ComponentState, 'operational'>;
  status: IncidentStatus;
  components: StatusComponent[];
  startsAt: string;
  endsAt: string | null;
  resolvedAt: string | null;
  updates: IncidentUpdateView[];
}

export interface ComponentStatus {
  key: StatusComponent;
  state: ComponentState;
  /** Per day, oldest first: the share of our checks that passed (null: none ran) and incidents. */
  days: { date: string; uptime: number | null; worst: ComponentState }[];
  /** Over the days shown, or null when no check has run. */
  uptime: number | null;
}

/** What the public status page and the in-app banner read. */
export interface PublicStatus {
  generatedAt: string;
  overall: ComponentState;
  components: ComponentStatus[];
  /** Open incidents, and maintenance in progress or starting within a week. */
  active: IncidentView[];
  /** Finished in the last seven days. */
  recent: IncidentView[];
}

// ── Backups ──────────────────────────────────────────────────────────────────

export const BACKUP_RUN_KINDS = ['backup', 'verify'] as const;
export type BackupRunKind = (typeof BACKUP_RUN_KINDS)[number];

/** A backup older than this is stale: the cron job has stopped or is failing. */
export const BACKUP_STALE_HOURS = 26;
/** The restore drill is due monthly. */
export const VERIFY_STALE_DAYS = 35;

export interface BackupRunView {
  id: string;
  kind: BackupRunKind;
  ok: boolean;
  label: string | null;
  host: string | null;
  startedAt: string;
  finishedAt: string;
  sizeBytes: number | null;
  detail: Record<string, unknown>;
}

/** What `/ready` answers: whether the API can serve, part by part. No hosts, paths or errors. */
export interface ReadinessView {
  status: 'ready' | 'not_ready';
  checks: Record<'database' | 'documents' | 'chromium', 'ok' | 'failed'>;
}

/** A component's latest automated check, with why it failed, for staff only. */
export interface LatestCheckView {
  component: StatusComponent;
  checkedAt: string;
  ok: boolean;
  latencyMs: number | null;
  detail: string | null;
}

/** The console's operations page. */
export interface OperationsView {
  /** Off: nothing sweeps, so notifications and attendance are not checked. */
  backgroundJobs: boolean;
  backups: {
    /** The newest successful backup and restore drill. */
    lastBackupAt: string | null;
    lastDrillAt: string | null;
    staleBackup: boolean;
    staleDrill: boolean;
    /** The latest runs of either kind, newest first. */
    runs: BackupRunView[];
  };
  checks: LatestCheckView[];
  readiness: ReadinessView;
}
