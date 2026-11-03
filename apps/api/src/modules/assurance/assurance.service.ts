import { assuranceCapabilities } from './assurance-capabilities.js';
import {
  Inject,
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { and, eq, desc, sql } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import {
  assurancePrograms,
  assuranceEvents,
  platformUsers,
  platformAuditLog,
  authSessions,
  backupRuns,
  jobLeases,
  type Database,
  type Tx,
  type FieldCipher,
  type CipherField,
} from '@gp/db';
import {
  ASSURANCE_CATALOG,
  BACKUP_STALE_HOURS,
  VERIFY_STALE_DAYS,
  type AssuranceProgramInput,
  type AssuranceEventInput,
  type AssuranceEvent,
  type AssuranceProgramView,
  type AssuranceOverview,
} from '@gp/shared';
import { DB, FIELD_CIPHER } from '../../db/db.module.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import type { AuthUser } from '../../common/auth-user.js';
import { MfaService } from '../auth/mfa.service.js';
import { RateLimiter } from '../../common/rate-limit.js';
import { SCHEDULED_TASKS } from '../../jobs/scheduled-worker.js';
import { evaluateAssurance, requiredAssuranceControls } from './assurance-evaluator.js';
const SCOPE = '00000000-0000-0000-0000-000000000007',
  DAY = 86400000;
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .toSorted(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
export const assuranceHash = (value: unknown) =>
  createHash('sha256').update(canonical(value)).digest('hex');
const conflict = (s: string): never => {
  throw new ConflictException({ code: 'assurance_boundary', message: s });
};
@Injectable()
export class AssuranceService {
  constructor(
    @Inject(DB) private db: Database,
    @Inject(FIELD_CIPHER) private cipher: FieldCipher,
    @Inject(APP_CONFIG) private config: AppConfig,
    private mfa: MfaService,
    private limiter: RateLimiter,
  ) {}
  private admin(a: AuthUser, recent = true) {
    if (
      this.config.DEPLOYMENT_MODE !== 'managed' ||
      a.kind !== 'platform' ||
      a.role !== 'super_admin'
    )
      throw new ForbiddenException('Assurance requires control-plane Super Admin access');
    if (recent && (!a.mfaAt || Date.now() - a.mfaAt.getTime() > 300000))
      throw new ForbiddenException({
        code: 'recent_mfa_required',
        message: 'Confirm MFA to access restricted assurance evidence',
      });
  }
  async stepUp(a: AuthUser, code: string) {
    this.admin(a, false);
    if (!a.sessionId) throw new ForbiddenException('Current session required');
    await this.limiter.hit('assurance-step-up:' + a.id, 5, 900000);
    if (!(await this.mfa.check({ kind: 'platform', id: a.id }, code)))
      throw new ForbiddenException('Invalid authenticator code');
    await this.db
      .update(authSessions)
      .set({ mfaAt: new Date() })
      .where(and(eq(authSessions.id, a.sessionId), eq(authSessions.subjectId, a.id)));
    return { confirmed: true };
  }
  private run<T>(a: AuthUser, fn: (tx: Tx) => Promise<T>) {
    this.admin(a);
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.assurance_actor',${a.id},true)`);
      const [user] = await tx
        .select({ role: platformUsers.role })
        .from(platformUsers)
        .where(eq(platformUsers.id, a.id));
      if (user?.role !== 'super_admin')
        throw new ForbiddenException('Current Super Admin authority required');
      return fn(tx);
    });
  }
  private seal(id: string, value: unknown, field: CipherField) {
    return this.cipher.encrypt(canonical({ id, value }), { tenantId: SCOPE, field });
  }
  private open<T>(id: string, body: string, field: CipherField): T {
    const p = JSON.parse(this.cipher.decrypt(body, { tenantId: SCOPE, field }));
    if (p.id !== id) conflict('Evidence row binding is invalid');
    return p.value;
  }
  private async audit(tx: Tx, a: AuthUser, action: string, id: string) {
    await tx.insert(platformAuditLog).values({
      actorId: a.id,
      action: 'assurance.' + action,
      after: { recordId: id, restricted: true, commercialReleaseApproved: false },
    });
  }
  async create(a: AuthUser, input: AssuranceProgramInput) {
    return this.run(a, async (tx) => {
      const id = randomUUID();
      await tx.insert(assurancePrograms).values({
        id,
        definitionEnc: this.seal(id, input, 'assurance.program'),
        definitionHash: assuranceHash(input),
        createdBy: a.id,
      });
      await this.audit(tx, a, 'program.create', id);
      return this.view(tx, id);
    });
  }
  private async view(tx: Tx, id: string): Promise<AssuranceProgramView> {
    const [p] = await tx.select().from(assurancePrograms).where(eq(assurancePrograms.id, id));
    if (!p) throw new NotFoundException('Assurance program not found');
    const definition = this.open<AssuranceProgramInput>(id, p.definitionEnc, 'assurance.program');
    if (assuranceHash(definition) !== p.definitionHash) conflict('Program integrity check failed');
    const rows = await tx
      .select()
      .from(assuranceEvents)
      .where(eq(assuranceEvents.programId, id))
      .orderBy(assuranceEvents.sequence)
      .limit(5001);
    if (rows.length > 5000) conflict('Program event limit requires an archival successor');
    let previousHash = p.definitionHash;
    const events: AssuranceEvent[] = [];
    for (const r of rows) {
      const input = this.open<AssuranceEventInput>(r.id, r.payloadEnc, 'assurance.event');
      const calculated = assuranceHash({
        id: r.id,
        programId: id,
        sequence: r.sequence,
        actorId: r.actorId,
        createdAt: r.createdAt.toISOString(),
        previousHash,
        payloadHash: assuranceHash(input),
      });
      if (
        r.sequence !== events.length + 1 ||
        r.previousHash !== previousHash ||
        r.payloadHash !== assuranceHash(input) ||
        r.eventHash !== calculated ||
        r.kind !== input.kind
      )
        conflict('Evidence chain integrity check failed');
      events.push({
        id: r.id,
        sequence: r.sequence,
        actorId: r.actorId,
        createdAt: r.createdAt.toISOString(),
        previousHash: r.previousHash,
        eventHash: r.eventHash,
        input,
      });
      previousHash = r.eventHash;
    }
    const evaluation = evaluateAssurance(definition, events),
      runtime = await this.runtime(tx);
    if (runtime.backup.staleBackup) evaluation.blockers.push('Runtime: backup is missing or stale');
    if (runtime.backup.staleVerify)
      evaluation.blockers.push('Runtime: recorded restore verification is missing or stale');
    if (runtime.worker.healthy < runtime.worker.registered)
      evaluation.blockers.push('Runtime: required system worker jobs are missing, stale or failed');
    for (const country of definition.countries)
      if (!runtime.countryConsumers[country])
        evaluation.blockers.push(
          'Runtime: ' + country + ' country consumers remain unqualified or disabled',
        );
    if (definition.merchantCheckout && !runtime.merchantCheckoutQualified)
      evaluation.blockers.push('Runtime: merchant checkout remains unqualified or disabled');
    if (evaluation.blockers.length) evaluation.status = 'blocked';
    return {
      id,
      createdBy: p.createdBy,
      createdAt: p.createdAt.toISOString(),
      definition,
      events,
      evaluation,
      headHash: previousHash,
      version: events.length,
    };
  }
  get(a: AuthUser, id: string) {
    return this.run(a, (tx) => this.view(tx, id));
  }
  private async owner(tx: Tx, id: string) {
    const [p] = await tx
      .select({ id: platformUsers.id })
      .from(platformUsers)
      .where(eq(platformUsers.id, id));
    if (!p) conflict('Select an existing named platform owner');
  }
  private async validate(tx: Tx, a: AuthUser, p: AssuranceProgramView, input: AssuranceEventInput) {
    const today = new Date().toISOString().slice(0, 10),
      event = (id: string) => {
        const e = p.events.find((entry) => entry.id === id);
        if (!e) conflict('The referenced record is not in this program');
        return e!;
      };
    const accepted = (id: string) => {
      const e = event(id),
        r = p.events
          .filter((x) => x.input.kind === 'evidence_review' && x.input.evidenceId === id)
          .at(-1);
      if (
        e.input.kind !== 'evidence' ||
        e.input.outcome !== 'passed' ||
        r?.input.kind !== 'evidence_review' ||
        r.input.decision !== 'accept'
      )
        conflict('Accepted passing evidence is required');
      return e;
    };
    if (
      'controlId' in input &&
      !requiredAssuranceControls(p.definition).some((c) => c.id === input.controlId)
    )
      conflict('Control is outside this program scope');
    if (input.kind === 'control') {
      await this.owner(tx, input.ownerId);
      const c = ASSURANCE_CATALOG.find((entry) => entry.id === input.controlId)!;
      if (input.cadenceDays > c.cadenceDays)
        conflict('Cadence exceeds the required control maximum');
    }
    if (input.kind === 'evidence' || input.kind === 'exception') {
      const c = p.events
        .filter((e) => e.input.kind === 'control' && e.input.controlId === input.controlId)
        .at(-1);
      if (c?.input.kind !== 'control' || c.id !== input.controlVersion)
        return conflict('Use the current owner/procedure version');
      if (input.kind === 'evidence') {
        if (
          input.coverThrough < input.coverFrom ||
          Date.parse(input.executedAt) > Date.now() + 1000 ||
          input.executedAt.slice(0, 10) < input.coverThrough ||
          input.coverThrough > today ||
          (Date.parse(input.coverThrough) - Date.parse(input.coverFrom)) / DAY + 1 >
            c.input.cadenceDays
        )
          conflict('Evidence dates must be observed, ordered and within the control cadence');
      } else {
        if (!ASSURANCE_CATALOG.find((entry) => entry.id === input.controlId)!.waivable)
          conflict('This release gate cannot be waived');
        await this.owner(tx, input.ownerId);
        if (input.expiresOn < today || Date.parse(input.expiresOn) - Date.parse(today) > 30 * DAY)
          conflict('Exceptions expire within 30 days');
        const proof = accepted(input.evidenceId);
        if (
          proof.input.kind !== 'evidence' ||
          proof.input.controlId !== input.controlId ||
          proof.input.controlVersion !== c.id ||
          proof.input.evidenceKind === 'synthetic'
        )
          conflict('Current compensating operating evidence is required');
      }
    }
    if (input.kind === 'evidence_review') {
      const e = event(input.evidenceId);
      if (e.input.kind !== 'evidence') conflict('Select an evidence record');
      if (e.actorId === a.id) conflict('A second administrator must review evidence');
    }
    if (input.kind === 'finding') {
      if (input.ownerId) await this.owner(tx, input.ownerId);
    }
    if (input.kind === 'finding_assignment') {
      const e = event(input.findingId);
      if (e.input.kind !== 'finding') return conflict('Select a finding');
      await this.owner(tx, input.ownerId);
    }
    if (input.kind === 'finding_decision') {
      const e = event(input.findingId);
      if (e.input.kind !== 'finding') return conflict('Select a finding');
      if (input.decision !== 'reopen' && e.actorId === a.id)
        conflict('A second administrator must decide remediation or risk');
      if (input.decision === 'remediated') {
        if (!input.evidenceId) conflict('Accepted remediation evidence is required');
        const proof = accepted(input.evidenceId!);
        if (
          proof.input.kind !== 'evidence' ||
          proof.input.controlId !== e.input.controlId ||
          proof.input.evidenceKind === 'synthetic'
        )
          conflict('Use matching operating remediation evidence');
      }
      const assigned = p.events
        .filter((x) => x.input.kind === 'finding_assignment' && x.input.findingId === e.id)
        .at(-1)?.input;
      const accountable =
        assigned?.kind === 'finding_assignment' ? assigned.ownerId : e.input.ownerId;
      if (
        input.decision === 'risk_accepted' &&
        (accountable !== a.id ||
          !input.expiresOn ||
          input.expiresOn < today ||
          Date.parse(input.expiresOn) - Date.parse(today) > 90 * DAY ||
          !input.compensatingControls)
      )
        conflict(
          'The named accountable owner must document compensating controls and a risk expiry within 90 days',
        );
    }
    if (input.kind === 'exception_review') {
      const e = event(input.exceptionId);
      if (e.input.kind !== 'exception' || e.actorId === a.id || e.input.ownerId !== a.id)
        conflict('The second, named accountable owner must review the exception');
    }
    if (input.kind === 'release_review') {
      if (input.reviewedHeadHash !== p.headHash || a.id === p.createdBy)
        return conflict('A second administrator must review the exact current evidence head');
      if (input.decision === 'recommend' && p.evaluation.status !== 'evidence_ready_for_review')
        return conflict('All current evidence and runtime gates must pass before recommendation');
    }
    if (input.kind === 'report') {
      const e = accepted(input.evidenceId);
      if (
        input.periodThrough < input.periodFrom ||
        input.periodThrough > today ||
        (input.type === 'type1' && input.periodFrom !== input.periodThrough) ||
        e.input.kind !== 'evidence' ||
        e.input.evidenceKind !== 'external' ||
        e.input.controlId !== 'change_release' ||
        e.input.documentHash !== input.documentHash
      )
        conflict(
          'Report metadata needs a matching, independently reviewed external source; no report claim is activated',
        );
    }
  }
  append(a: AuthUser, id: string, expectedVersion: number, input: AssuranceEventInput) {
    return this.run(a, async (tx) => {
      await tx.execute(sql`select id from assurance_programs where id=${id}::uuid for update`);
      const p = await this.view(tx, id);
      if (p.version !== expectedVersion)
        conflict('Program changed; reload before recording this decision');
      if (p.version >= 5000) conflict('Program event limit reached');
      await this.validate(tx, a, p, input);
      const createdAt = new Date(),
        eventId = randomUUID(),
        sequence = p.version + 1,
        payloadHash = assuranceHash(input),
        eventHash = assuranceHash({
          id: eventId,
          programId: id,
          sequence,
          actorId: a.id,
          createdAt: createdAt.toISOString(),
          previousHash: p.headHash,
          payloadHash,
        });
      await tx.insert(assuranceEvents).values({
        id: eventId,
        programId: id,
        sequence,
        kind: input.kind,
        payloadEnc: this.seal(eventId, input, 'assurance.event'),
        payloadHash,
        previousHash: p.headHash,
        eventHash,
        actorId: a.id,
        createdAt,
      });
      await this.audit(tx, a, input.kind, eventId);
      return this.view(tx, id);
    });
  }
  private async runtime(tx: Tx): Promise<NonNullable<AssuranceOverview['runtime']>> {
    const last = async (kind: 'backup' | 'verify') =>
      (
        await tx
          .select()
          .from(backupRuns)
          .where(and(eq(backupRuns.kind, kind), eq(backupRuns.ok, true)))
          .orderBy(desc(backupRuns.finishedAt))
          .limit(1)
      )[0]?.finishedAt ?? null;
    const b = await last('backup'),
      v = await last('verify'),
      jobs = await tx.select().from(jobLeases),
      expected = SCHEDULED_TASKS.filter((t) => t.system);
    const healthy = expected.filter((t) => {
      const j = jobs.find((entry) => entry.key === t.name);
      return (
        j?.ok &&
        j.heartbeatAt &&
        Date.now() - j.heartbeatAt.getTime() <= Math.max(120000, t.interval * 2)
      );
    }).length;
    return {
      backup: {
        lastBackupAt: b?.toISOString() ?? null,
        lastVerifyAt: v?.toISOString() ?? null,
        staleBackup: !b || Date.now() - b.getTime() > BACKUP_STALE_HOURS * 3600000,
        staleVerify: !v || Date.now() - v.getTime() > VERIFY_STALE_DAYS * DAY,
      },
      worker: { registered: expected.length, healthy },
      release: this.config.RELEASE_VERSION,
      ...assuranceCapabilities(),
    };
  }
  async overview(a: AuthUser, id?: string): Promise<AssuranceOverview> {
    this.admin(a, false);
    const recent = !!a.mfaAt && Date.now() - a.mfaAt.getTime() <= 300000;
    if (!recent)
      return {
        programs: [],
        people: [],
        catalog: ASSURANCE_CATALOG,
        recentMfa: false,
        runtime: null,
        selected: null,
      };
    return this.run(a, async (tx) => {
      const rows = await tx
          .select()
          .from(assurancePrograms)
          .orderBy(desc(assurancePrograms.createdAt))
          .limit(50),
        people = await tx
          .select({ id: platformUsers.id, name: platformUsers.name, role: platformUsers.role })
          .from(platformUsers);
      const runtime = await this.runtime(tx);
      return {
        programs: rows.map((r) => {
          const p = this.open<AssuranceProgramInput>(r.id, r.definitionEnc, 'assurance.program');
          return {
            id: r.id,
            name: p.name,
            releaseVersion: p.releaseVersion,
            mode: p.mode,
            createdAt: r.createdAt.toISOString(),
          };
        }),
        people,
        catalog: ASSURANCE_CATALOG,
        recentMfa: true,
        runtime,
        selected: id ? await this.view(tx, id) : null,
      };
    });
  }
  async export(a: AuthUser, id: string) {
    return this.run(a, async (tx) => {
      const p = await this.view(tx, id);
      const payload = {
        schema: 1,
        kind: 'good-people-assurance-readiness',
        distribution: 'restricted_internal',
        programId: p.id,
        programCreatedBy: p.createdBy,
        definition: p.definition,
        programMode: p.definition.mode,
        releaseVersion: p.definition.releaseVersion,
        sourceDigest: p.definition.sourceDigest,
        sourceDirty: p.definition.sourceDirty,
        deployment: p.definition.deployment,
        countries: p.definition.countries,
        systemBoundary: p.definition.systemBoundary,
        criteriaVersion: p.definition.criteriaVersion,
        descriptionCriteriaVersion: p.definition.descriptionCriteriaVersion,
        periodFrom: p.definition.periodFrom,
        periodThrough: p.definition.periodThrough,
        definitionHash: assuranceHash(p.definition),
        eventHeadHash: p.headHash,
        eventCount: p.version,
        evaluation: p.evaluation,
        runtime: await this.runtime(tx),
        events: p.events,
        exportedAt: new Date().toISOString(),
      };
      await this.audit(tx, a, 'export', id);
      return {
        payload,
        sha256: assuranceHash(payload),
        signature: null,
        notice:
          'Restricted readiness evidence. This is not a SOC 2 report, release approval or statutory activation.',
      };
    });
  }
}
