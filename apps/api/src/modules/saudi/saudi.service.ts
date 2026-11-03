import {
  Inject,
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, eq, lte, gte, isNull, or, desc, inArray, sql } from 'drizzle-orm';
import {
  legalEntities,
  employees,
  jobAssignments,
  companyLegalProfiles,
  employmentStatutoryProfiles,
  saudiEmployerCoverage,
  saudiWorkerCoverage,
  saudiPilotRuns,
  saudiPilotComparisons,
  saudiQualificationEvidence,
  saudiWpsBatches,
  saudiWpsEvents,
  tenantAuditLog,
  type Tx,
  type FieldCipher,
  type CipherField,
} from '@gp/db';
import {
  addDays,
  localParts,
  SAUDI_EVIDENCE_KINDS,
  type SaudiEmployerInput,
  type SaudiWorkerInput,
  type SaudiPayrollInput,
  type SaudiSettlementInput,
  type SaudiComparisonInput,
  type SaudiEvidenceInput,
  type SaudiWpsEventInput,
  type SaudiPilotResult,
  type SaudiPilotView,
  type SaudiOverview,
  type SaudiLeaveInput,
} from '@gp/shared';
import {
  saudiManifest,
  saudiHash,
  assertSaudiCohort,
  previewSaudiPayroll,
  previewSaudiSettlement,
  syntheticSaudiWps,
  nextSaudiWpsState,
  SAUDI_WPS_ADAPTER,
  SaudiBoundaryError,
  type SaudiWorkerContext,
  sarMinor,
  previewSaudiLeave,
} from '@gp/country-packs';
import { FIELD_CIPHER, TenantDb } from '../../db/db.module.js';
import { currentTenantId } from '../../common/request-context.js';
import type { AuthUser } from '../../common/auth-user.js';
import { userCan } from '../../common/roles.js';
import { fieldAllowed } from '../../common/field-access.js';
import { entityScope, entityScopeOf } from '../access-scopes/entity-scope.js';

type PilotPayload = {
  input: SaudiPayrollInput | SaudiSettlementInput;
  context: Awaited<ReturnType<SaudiService['context']>>;
  result: SaudiPilotResult;
};
type Comparison = {
  input: SaudiComparisonInput;
  differences: {
    employeeId: string;
    field: string;
    expected: string | null;
    actual: string | null;
  }[];
};
const blocked = (code: string): never => {
  throw new ConflictException({ code, message: code.replaceAll('_', ' ') });
};
@Injectable()
export class SaudiService {
  constructor(
    private readonly tenantDb: TenantDb,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
  ) {}
  private access(actor: AuthUser) {
    if (
      actor.kind !== 'tenant' ||
      !actor.mfaAt ||
      !fieldAllowed(actor, 'pay', 'read') ||
      !fieldAllowed(actor, 'identity', 'read') ||
      !fieldAllowed(actor, 'bank', 'read') ||
      !fieldAllowed(actor, 'contacts', 'read')
    )
      throw new ForbiddenException(
        'SAUDI pilot coverage and review notes require MFA and all HR field read grants',
      );
  }
  private run<T>(actor: AuthUser, fn: (tx: Tx) => Promise<T>) {
    this.access(actor);
    return this.tenantDb.run(fn).catch((error: unknown) => {
      if (error instanceof SaudiBoundaryError) return blocked(error.code);
      if (
        (error as { cause?: { code?: string; constraint?: string } })?.cause?.code === '23505' &&
        (error as { cause: { constraint?: string } }).cause.constraint?.startsWith('saudi_')
      )
        return blocked('saudi_duplicate_evidence_reference');
      throw error;
    });
  }
  private seal(id: string, value: unknown, field: CipherField) {
    return this.cipher.encrypt(JSON.stringify({ id, value }), {
      tenantId: currentTenantId(),
      field,
    });
  }
  private open<T>(id: string, value: string, field: CipherField): T {
    const parsed = JSON.parse(this.cipher.decrypt(value, { tenantId: currentTenantId(), field }));
    if (parsed.id !== id) return blocked('saudi_cipher_row_mismatch');
    return parsed.value as T;
  }
  private async audit(tx: Tx, actor: AuthUser, action: string, id: string) {
    await tx.insert(tenantAuditLog).values({
      tenantId: currentTenantId(),
      actorUserId: actor.id,
      action: 'saudi.' + action,
      entityType: 'saudi_candidate',
      entityId: id,
      after: { mode: 'preview', liveEnabled: false },
    });
  }
  private async company(tx: Tx, actor: AuthUser, id: string) {
    const scope = await entityScopeOf(tx, actor.id);
    if (scope && !scope.includes(id)) throw new NotFoundException('Company not found');
    // Company aggregates and coverage cannot use an own-person or direct-report grant.
    if (
      actor.kind === 'tenant' &&
      actor.policy?.custom &&
      (actor.scopePermissions ?? []).some(
        (p) =>
          !actor.policy!.grants.some(
            (g) =>
              g.permissions.includes(p) &&
              g.relationship === 'all' &&
              (g.scope === 'all' || (g.scope === 'selected' && g.companyIds.includes(id))),
          ),
      )
    )
      throw new ForbiddenException('This company workflow requires company-wide permissions');
    const [company] = await tx
      .select({
        id: legalEntities.id,
        name: legalEntities.name,
        country: legalEntities.countryCode,
      })
      .from(legalEntities)
      .where(eq(legalEntities.id, id));
    if (!company) throw new NotFoundException('Company not found');
    if (company.country !== 'SA') return blocked('saudi_employer_required');
    return company;
  }
  private async employee(tx: Tx, actor: AuthUser, id: string) {
    const scope = await entityScope(tx, actor, employees.id);
    const [row] = await tx
      .select()
      .from(employees)
      .where(and(eq(employees.id, id), scope));
    if (!row) throw new NotFoundException('Employee not found');
    return row;
  }
  private async lock(tx: Tx, company: string) {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${currentTenantId() + company},56))`,
    );
  }
  addEmployer(actor: AuthUser, input: SaudiEmployerInput) {
    return this.run(actor, async (tx) => {
      await this.company(tx, actor, input.legalEntityId);
      await this.lock(tx, input.legalEntityId);
      const [last] = await tx
        .select()
        .from(saudiEmployerCoverage)
        .where(eq(saudiEmployerCoverage.legalEntityId, input.legalEntityId))
        .orderBy(desc(saudiEmployerCoverage.effectiveFrom))
        .limit(1);
      if (last && last.effectiveFrom >= input.effectiveFrom)
        return blocked('saudi_coverage_append_date_required');
      if (last)
        await tx
          .update(saudiEmployerCoverage)
          .set({ effectiveTo: addDays(input.effectiveFrom, -1) })
          .where(eq(saudiEmployerCoverage.id, last.id));
      const [row] = await tx
        .insert(saudiEmployerCoverage)
        .values({
          tenantId: currentTenantId(),
          legalEntityId: input.legalEntityId,
          effectiveFrom: input.effectiveFrom,
          definition: input,
          createdBy: actor.id,
        })
        .returning();
      await this.audit(tx, actor, 'employer_coverage', row!.id);
      return { id: row!.id, status: 'proposal', liveEnabled: false };
    });
  }
  addWorker(actor: AuthUser, input: SaudiWorkerInput) {
    if (!fieldAllowed(actor, 'identity', 'write') || !fieldAllowed(actor, 'pay', 'write'))
      throw new ForbiddenException('Identity and pay write grants required');
    return this.run(actor, async (tx) => {
      await this.company(tx, actor, input.legalEntityId);
      const employee = await this.employee(tx, actor, input.employeeId);
      await this.lock(tx, input.legalEntityId);
      if (
        input.effectiveFrom < employee.joinedOn ||
        (employee.separatedOn && input.effectiveFrom > employee.separatedOn)
      )
        return blocked('saudi_coverage_outside_employment');
      const [job] = await tx
        .select()
        .from(jobAssignments)
        .where(
          and(
            eq(jobAssignments.employeeId, employee.id),
            lte(jobAssignments.effectiveFrom, input.effectiveFrom),
            or(
              isNull(jobAssignments.effectiveTo),
              gte(jobAssignments.effectiveTo, input.effectiveFrom),
            ),
          ),
        )
        .orderBy(desc(jobAssignments.effectiveFrom))
        .limit(1);
      if (!job || job.legalEntityId !== input.legalEntityId)
        return blocked('saudi_employee_employer_mismatch');
      const [last] = await tx
        .select()
        .from(saudiWorkerCoverage)
        .where(eq(saudiWorkerCoverage.employeeId, input.employeeId))
        .orderBy(desc(saudiWorkerCoverage.effectiveFrom))
        .limit(1);
      if (last && last.effectiveFrom >= input.effectiveFrom)
        return blocked('saudi_coverage_append_date_required');
      if (last)
        await tx
          .update(saudiWorkerCoverage)
          .set({ effectiveTo: addDays(input.effectiveFrom, -1) })
          .where(eq(saudiWorkerCoverage.id, last.id));
      const id = randomUUID();
      await tx.insert(saudiWorkerCoverage).values({
        id,
        tenantId: currentTenantId(),
        legalEntityId: input.legalEntityId,
        employeeId: input.employeeId,
        effectiveFrom: input.effectiveFrom,
        definitionEnc: this.seal(id, input, 'saudi.worker_coverage'),
        createdBy: actor.id,
      });
      await this.audit(tx, actor, 'worker_coverage', id);
      return { id, status: 'proposal', liveEnabled: false };
    });
  }
  async context(
    tx: Tx,
    actor: AuthUser,
    company: string,
    from: string,
    to: string,
    workerIds: string[],
  ) {
    await this.company(tx, actor, company);
    const profiles = await tx
      .select()
      .from(companyLegalProfiles)
      .where(
        and(
          eq(companyLegalProfiles.legalEntityId, company),
          lte(companyLegalProfiles.effectiveFrom, to),
          or(isNull(companyLegalProfiles.effectiveTo), gte(companyLegalProfiles.effectiveTo, from)),
        ),
      );
    const profile = profiles[0];
    if (
      profiles.length !== 1 ||
      !profile ||
      profile.effectiveFrom > from ||
      (profile.effectiveTo && profile.effectiveTo < to)
    )
      return blocked('saudi_legal_profile_boundary_requires_split');
    if (
      profile.countryCode !== 'SA' ||
      profile.currency !== 'SAR' ||
      profile.regime !== 'SA_PRIVATE' ||
      profile.calendar !== 'gregorian' ||
      profile.businessTimeZone !== 'Asia/Riyadh'
    )
      return blocked('saudi_legal_profile_unsupported');
    const employers = await tx
      .select()
      .from(saudiEmployerCoverage)
      .where(
        and(
          eq(saudiEmployerCoverage.legalEntityId, company),
          lte(saudiEmployerCoverage.effectiveFrom, to),
          or(
            isNull(saudiEmployerCoverage.effectiveTo),
            gte(saudiEmployerCoverage.effectiveTo, from),
          ),
        ),
      );
    const employer = employers[0];
    if (
      employers.length !== 1 ||
      !employer ||
      employer.effectiveFrom > from ||
      (employer.effectiveTo && employer.effectiveTo < to)
    )
      return blocked('saudi_employer_coverage_boundary_requires_split');
    const workers: SaudiWorkerContext[] = [],
      source: unknown[] = [];
    for (const id of [...workerIds].toSorted()) {
      const [coverage] = await tx
        .select()
        .from(saudiWorkerCoverage)
        .where(eq(saudiWorkerCoverage.id, id));
      if (!coverage || coverage.legalEntityId !== company)
        throw new NotFoundException('Worker coverage not found');
      const employee = await this.employee(tx, actor, coverage.employeeId);
      const start = employee.joinedOn > from ? employee.joinedOn : from,
        end = employee.separatedOn && employee.separatedOn < to ? employee.separatedOn : to;
      if (end < start) return blocked('saudi_worker_outside_period');
      if (coverage.effectiveFrom > start || (coverage.effectiveTo && coverage.effectiveTo < end))
        return blocked('saudi_worker_coverage_boundary_requires_split');
      const jobs = await tx
        .select()
        .from(jobAssignments)
        .where(
          and(
            eq(jobAssignments.employeeId, employee.id),
            lte(jobAssignments.effectiveFrom, end),
            or(isNull(jobAssignments.effectiveTo), gte(jobAssignments.effectiveTo, start)),
          ),
        );
      if (
        jobs.length !== 1 ||
        jobs[0]!.legalEntityId !== company ||
        jobs[0]!.currency !== 'SAR' ||
        jobs[0]!.effectiveFrom > start ||
        (jobs[0]!.effectiveTo && jobs[0]!.effectiveTo! < end)
      )
        return blocked('saudi_job_boundary_requires_review');
      const statutory = await tx
        .select()
        .from(employmentStatutoryProfiles)
        .where(
          and(
            eq(employmentStatutoryProfiles.employeeId, employee.id),
            lte(employmentStatutoryProfiles.effectiveFrom, end),
            or(
              isNull(employmentStatutoryProfiles.effectiveTo),
              gte(employmentStatutoryProfiles.effectiveTo, start),
            ),
          ),
        );
      if (
        statutory.length !== 1 ||
        statutory[0]!.effectiveFrom > start ||
        (statutory[0]!.effectiveTo && statutory[0]!.effectiveTo! < end) ||
        statutory[0]!.citizenship !== employee.nationality ||
        statutory[0]!.contractClass !== 'full_time' ||
        statutory[0]!.suppliedHijriDate
      )
        return blocked('saudi_dated_gregorian_full_time_profile_required');
      const input = this.open<SaudiWorkerInput>(
        id,
        coverage.definitionEnc,
        'saudi.worker_coverage',
      );
      const worker = {
        ...input,
        id,
        citizenship: employee.nationality,
        joinedOn: employee.joinedOn,
        endedOn: employee.separatedOn,
      };
      assertSaudiCohort(worker);
      workers.push(worker);
      source.push({
        coverage,
        employee: {
          id: employee.id,
          citizenship: employee.nationality,
          joinedOn: employee.joinedOn,
          separatedOn: employee.separatedOn,
        },
        jobs,
        statutory,
      });
    }
    return {
      employer: employer.definition,
      workers,
      snapshot: {
        companyProfile: profile,
        employerCoverage: employer,
        workers: source,
        manifestHash: saudiManifest().manifestHash,
      },
    };
  }
  createPilot(
    actor: AuthUser,
    input: SaudiPayrollInput | SaudiSettlementInput,
    kind: 'payroll' | 'settlement',
  ) {
    if (!fieldAllowed(actor, 'pay', 'write'))
      throw new ForbiddenException('Pay write grant required');
    return this.run(actor, async (tx) => {
      const from = 'periodStart' in input ? input.periodStart : input.lastWorkingDay,
        to = 'periodEnd' in input ? input.periodEnd : input.lastWorkingDay;
      await this.lock(tx, input.legalEntityId);
      const context = await this.context(
        tx,
        actor,
        input.legalEntityId,
        from,
        to,
        'lines' in input ? input.lines.map((l) => l.workerCoverageId) : [input.workerCoverageId],
      );
      const result =
        'lines' in input
          ? previewSaudiPayroll(input, context.employer, context.workers)
          : previewSaudiSettlement(input, context.employer, context.workers[0]!);
      const id = randomUUID(),
        manifestHash = saudiManifest().manifestHash,
        contextHash = saudiHash(context.snapshot),
        calculationHash = saudiHash({ input, contextHash, result });
      await tx.insert(saudiPilotRuns).values({
        id,
        tenantId: currentTenantId(),
        legalEntityId: input.legalEntityId,
        kind,
        periodStart: from,
        periodEnd: to,
        manifestHash,
        contextHash,
        calculationHash,
        payloadEnc: this.seal(id, { input, context, result }, 'saudi.pilot_payload'),
        createdBy: actor.id,
      });
      await this.audit(tx, actor, 'pilot.create', id);
      return {
        id,
        kind,
        periodStart: from,
        periodEnd: to,
        manifestHash,
        contextHash,
        calculationHash,
        result,
        contextCurrent: true,
        comparisons: [],
      } satisfies SaudiPilotView;
    });
  }
  private async pilot(tx: Tx, actor: AuthUser, id: string, fresh = false) {
    const [row] = await tx.select().from(saudiPilotRuns).where(eq(saudiPilotRuns.id, id));
    if (!row) throw new NotFoundException('Pilot not found');
    await this.company(tx, actor, row.legalEntityId);
    const payload = this.open<PilotPayload>(id, row.payloadEnc, 'saudi.pilot_payload');
    for (const line of payload.result.lines) await this.employee(tx, actor, line.employeeId);
    if (fresh) {
      const input = payload.input;
      const context = await this.context(
        tx,
        actor,
        row.legalEntityId,
        row.periodStart,
        row.periodEnd,
        'lines' in input ? input.lines.map((l) => l.workerCoverageId) : [input.workerCoverageId],
      );
      if (
        saudiHash(context.snapshot) !== row.contextHash ||
        row.manifestHash !== saudiManifest().manifestHash
      )
        return blocked('saudi_pilot_context_changed_create_replacement');
    }
    return { row, payload };
  }
  private async view(tx: Tx, actor: AuthUser, id: string): Promise<SaudiPilotView> {
    const { row, payload } = await this.pilot(tx, actor, id),
      comparisons = await tx
        .select()
        .from(saudiPilotComparisons)
        .where(eq(saudiPilotComparisons.runId, id))
        .orderBy(saudiPilotComparisons.sequence);
    let contextCurrent = false;
    try {
      const input = payload.input;
      const current = await this.context(
        tx,
        actor,
        row.legalEntityId,
        row.periodStart,
        row.periodEnd,
        'lines' in input ? input.lines.map((l) => l.workerCoverageId) : [input.workerCoverageId],
      );
      contextCurrent =
        saudiHash(current.snapshot) === row.contextHash &&
        row.manifestHash === saudiManifest().manifestHash;
    } catch (error) {
      if (!(error instanceof ConflictException || error instanceof SaudiBoundaryError)) throw error;
    }
    return {
      id,
      contextCurrent,
      kind: row.kind as SaudiPilotView['kind'],
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      manifestHash: row.manifestHash,
      contextHash: row.contextHash,
      calculationHash: row.calculationHash,
      result: payload.result,
      comparisons: comparisons.map((c) => ({
        id: c.id,
        outcome: c.outcome,
        evidenceKind: c.evidenceKind,
        differences: this.open<Comparison>(c.id, c.payloadEnc, 'saudi.comparison').differences,
      })),
    };
  }
  getPilot(actor: AuthUser, id: string) {
    return this.run(actor, (tx) => this.view(tx, actor, id));
  }
  leave(actor: AuthUser, input: SaudiLeaveInput) {
    return this.run(actor, async (tx) => {
      const context = await this.context(
        tx,
        actor,
        input.legalEntityId,
        input.onDate,
        input.onDate,
        [input.workerCoverageId],
      );
      return previewSaudiLeave(input, context.employer, context.workers[0]!);
    });
  }
  compare(actor: AuthUser, id: string, input: SaudiComparisonInput) {
    return this.run(actor, async (tx) => {
      await this.pilot(tx, actor, id);
      await tx.execute(sql`select id from saudi_pilot_runs where id=${id}::uuid for update`);
      const { row, payload } = await this.pilot(tx, actor, id, true);
      if (input.evidenceKind === 'independent' && row.createdBy === actor.id)
        return blocked('saudi_independent_comparison_requires_second_person');
      const differences: Comparison['differences'] = [];
      const fields = [
        'gross',
        'employeeContribution',
        'employerContribution',
        'governmentContribution',
        'deductions',
        'net',
      ] as const;
      for (const actual of payload.result.lines) {
        const expected = input.expected.find((e) => e.employeeId === actual.employeeId);
        for (const field of fields)
          if (!expected || sarMinor(expected[field]) !== sarMinor(actual[field]))
            differences.push({
              employeeId: actual.employeeId,
              field,
              expected: expected?.[field] ?? null,
              actual: actual[field],
            });
      }
      for (const extra of input.expected.filter(
        (e) => !payload.result.lines.some((l) => l.employeeId === e.employeeId),
      ))
        differences.push({
          employeeId: extra.employeeId,
          field: 'employee',
          expected: 'present',
          actual: null,
        });
      const prior = await tx
        .select({ sequence: saudiPilotComparisons.sequence })
        .from(saudiPilotComparisons)
        .where(eq(saudiPilotComparisons.runId, id))
        .orderBy(desc(saudiPilotComparisons.sequence))
        .limit(1);
      const comparisonId = randomUUID(),
        outcome = differences.length ? 'differences' : 'matched';
      await tx.insert(saudiPilotComparisons).values({
        id: comparisonId,
        sequence: (prior[0]?.sequence ?? 0) + 1,
        tenantId: currentTenantId(),
        legalEntityId: row.legalEntityId,
        runId: id,
        evidenceKind: input.evidenceKind,
        outcome,
        payloadEnc: this.seal(comparisonId, { input, differences }, 'saudi.comparison'),
        createdBy: actor.id,
      });
      await this.audit(tx, actor, 'pilot.compare', comparisonId);
      return { id: comparisonId, outcome, differences, releaseApproval: false };
    });
  }
  evidence(actor: AuthUser, input: SaudiEvidenceInput) {
    return this.run(actor, async (tx) => {
      await this.company(tx, actor, input.legalEntityId);
      if (input.manifestHash !== saudiManifest().manifestHash)
        return blocked('saudi_evidence_manifest_mismatch');
      if (input.ruleKeys.some((k) => !saudiManifest().rules.some((r) => r.key === k)))
        return blocked('saudi_evidence_rule_unknown');
      if (
        input.kind === 'law_and_cohorts' &&
        (!input.ruleKeys.length || !input.coveredScenarios.length)
      )
        return blocked('saudi_rule_and_scenario_evidence_required');
      if (input.reviewedOn > localParts(new Date(), 'Asia/Riyadh').date)
        return blocked('saudi_review_date_in_future');
      const id = randomUUID();
      await tx.insert(saudiQualificationEvidence).values({
        id,
        tenantId: currentTenantId(),
        legalEntityId: input.legalEntityId,
        kind: input.kind,
        manifestHash: input.manifestHash,
        payloadEnc: this.seal(id, input, 'saudi.qualification_evidence'),
        createdBy: actor.id,
      });
      await this.audit(tx, actor, 'evidence.record', id);
      return { id, status: 'recorded_attestation', releaseApproval: false };
    });
  }
  createWps(actor: AuthUser, runId: string) {
    return this.run(actor, async (tx) => {
      const { row, payload } = await this.pilot(tx, actor, runId, true);
      const matched = await tx
        .select()
        .from(saudiPilotComparisons)
        .where(eq(saudiPilotComparisons.runId, runId))
        .orderBy(desc(saudiPilotComparisons.sequence))
        .limit(1);
      if (matched[0]?.outcome !== 'matched') return blocked('saudi_wps_comparison_required');
      const batch = syntheticSaudiWps(payload.result, row.periodStart, row.periodEnd, new Date()),
        id = randomUUID();
      await tx.insert(saudiWpsBatches).values({
        id,
        tenantId: currentTenantId(),
        legalEntityId: row.legalEntityId,
        runId,
        adapterVersion: batch.adapterVersion,
        fileHash: batch.fileHash,
        payloadEnc: this.seal(id, batch, 'saudi.wps_payload'),
        createdBy: actor.id,
      });
      await this.audit(tx, actor, 'wps.sandbox.create', id);
      return {
        id,
        runId,
        fileHash: batch.fileHash,
        count: batch.count,
        total: batch.total,
        state: 'draft',
        paymentProven: false,
        liveEnabled: false,
      };
    });
  }
  private async batch(tx: Tx, actor: AuthUser, id: string) {
    const [row] = await tx.select().from(saudiWpsBatches).where(eq(saudiWpsBatches.id, id));
    if (!row) throw new NotFoundException('Batch not found');
    await this.company(tx, actor, row.legalEntityId);
    await this.pilot(tx, actor, row.runId);
    return {
      row,
      payload: this.open<ReturnType<typeof syntheticSaudiWps>>(
        id,
        row.payloadEnc,
        'saudi.wps_payload',
      ),
    };
  }
  wpsFile(actor: AuthUser, id: string) {
    return this.run(actor, async (tx) => {
      const { payload } = await this.batch(tx, actor, id);
      await this.audit(tx, actor, 'wps.sandbox.download', id);
      return { file: payload.file, filename: payload.filename, fileHash: payload.fileHash };
    });
  }
  wpsEvent(actor: AuthUser, batchId: string, input: SaudiWpsEventInput) {
    return this.run(actor, async (tx) => {
      const { row, payload } = await this.batch(tx, actor, batchId);
      await tx.execute(sql`select id from saudi_wps_batches where id=${batchId}::uuid for update`);
      const [prior] = await tx
        .select()
        .from(saudiWpsEvents)
        .where(eq(saudiWpsEvents.eventId, input.eventId));
      if (prior) {
        if (prior.batchId !== batchId || prior.payloadHash !== saudiHash(input))
          return blocked('saudi_wps_event_replay_conflict');
        return { id: prior.id, state: prior.kind, duplicate: true, paymentProven: false };
      }
      const events = await tx
        .select()
        .from(saudiWpsEvents)
        .where(eq(saudiWpsEvents.batchId, batchId))
        .orderBy(desc(saudiWpsEvents.sequence));
      const result = nextSaudiWpsState(events[0]?.kind ?? 'draft', input, payload),
        id = randomUUID();
      await tx.insert(saudiWpsEvents).values({
        id,
        tenantId: currentTenantId(),
        legalEntityId: row.legalEntityId,
        batchId,
        eventId: input.eventId,
        sequence: (events[0]?.sequence ?? 0) + 1,
        kind: input.kind,
        payloadHash: result.payloadHash,
        payloadEnc: this.seal(id, input, 'saudi.wps_payload'),
        createdBy: actor.id,
      });
      await this.audit(tx, actor, 'wps.sandbox.' + input.kind, id);
      return { id, ...result, duplicate: false };
    });
  }
  overview(actor: AuthUser, companyId?: string): Promise<SaudiOverview> {
    return this.run(actor, async (tx) => {
      const scope = await entityScopeOf(tx, actor.id),
        companies = await tx
          .select({ id: legalEntities.id, name: legalEntities.name })
          .from(legalEntities)
          .where(
            and(
              eq(legalEntities.countryCode, 'SA'),
              scope ? inArray(legalEntities.id, scope) : undefined,
            ),
          );
      const selected = companyId ?? companies[0]?.id ?? null;
      const capabilities = {
        employer: userCan(actor, 'org.manage'),
        worker:
          userCan(actor, 'payroll.manage') &&
          userCan(actor, 'employees.identity') &&
          fieldAllowed(actor, 'identity', 'write') &&
          fieldAllowed(actor, 'pay', 'write'),
        prepare: userCan(actor, 'payroll.manage'),
        evidence: userCan(actor, 'org.manage'),
        compare: userCan(actor, 'payroll.approve') && fieldAllowed(actor, 'pay', 'write'),
      };
      if (!selected)
        return {
          companies,
          selectedCompanyId: null,
          manifest: saudiManifest(),
          employers: [],
          workers: [],
          employees: [],
          pilots: [],
          evidence: [],
          wps: [],
          qualification: {
            liveEnabled: false,
            independentConsecutivePeriods: 0,
            independentSettlement: false,
            open: [
              'SAUDI employer coverage',
              ...SAUDI_EVIDENCE_KINDS,
              'Three independently reconciled consecutive periods and a settlement',
              'Pack/source release qualification',
            ],
          },
          capabilities,
        };
      await this.company(tx, actor, selected);
      const employers = await tx
        .select()
        .from(saudiEmployerCoverage)
        .where(eq(saudiEmployerCoverage.legalEntityId, selected))
        .orderBy(desc(saudiEmployerCoverage.effectiveFrom));
      const covered = await tx
        .select()
        .from(saudiWorkerCoverage)
        .where(eq(saudiWorkerCoverage.legalEntityId, selected))
        .orderBy(desc(saudiWorkerCoverage.effectiveFrom));
      const eligible = await tx
        .selectDistinct({ id: employees.id, name: employees.fullName })
        .from(employees)
        .innerJoin(
          jobAssignments,
          and(
            eq(jobAssignments.employeeId, employees.id),
            eq(jobAssignments.legalEntityId, selected),
          ),
        )
        .where(await entityScope(tx, actor, employees.id));
      const workers: SaudiOverview['workers'] = [];
      for (const c of covered) {
        const e = await this.employee(tx, actor, c.employeeId),
          definition = this.open<SaudiWorkerInput>(c.id, c.definitionEnc, 'saudi.worker_coverage');
        let supported = true;
        try {
          assertSaudiCohort({
            ...definition,
            id: c.id,
            citizenship: e.nationality,
            joinedOn: e.joinedOn,
            endedOn: e.separatedOn,
          });
        } catch {
          supported = false;
        }
        workers.push({
          id: c.id,
          employeeId: c.employeeId,
          name: e.fullName,
          effectiveFrom: c.effectiveFrom,
          effectiveTo: c.effectiveTo,
          definition,
          supported,
        });
      }
      const runRows = await tx
        .select()
        .from(saudiPilotRuns)
        .where(eq(saudiPilotRuns.legalEntityId, selected))
        .orderBy(desc(saudiPilotRuns.createdAt))
        .limit(60);
      const pilots: SaudiPilotView[] = [];
      for (const row of runRows) pilots.push(await this.view(tx, actor, row.id));
      const proof = await tx
        .select()
        .from(saudiQualificationEvidence)
        .where(eq(saudiQualificationEvidence.legalEntityId, selected));
      const evidence = proof.map((e) => {
        const p = this.open<SaudiEvidenceInput>(e.id, e.payloadEnc, 'saudi.qualification_evidence');
        return {
          id: e.id,
          kind: e.kind,
          reviewer: p.reviewer,
          reviewedOn: p.reviewedOn,
          reference: p.reference,
          synthetic: p.synthetic,
          currentManifest: e.manifestHash === saudiManifest().manifestHash,
        };
      });
      const batches = await tx
          .select()
          .from(saudiWpsBatches)
          .where(eq(saudiWpsBatches.legalEntityId, selected))
          .orderBy(desc(saudiWpsBatches.createdAt))
          .limit(60),
        wps: SaudiOverview['wps'] = [];
      for (const b of batches) {
        const p = this.open<ReturnType<typeof syntheticSaudiWps>>(
          b.id,
          b.payloadEnc,
          'saudi.wps_payload',
        );
        const events = await tx
          .select({ kind: saudiWpsEvents.kind })
          .from(saudiWpsEvents)
          .where(eq(saudiWpsEvents.batchId, b.id))
          .orderBy(desc(saudiWpsEvents.sequence))
          .limit(1);
        wps.push({
          id: b.id,
          runId: b.runId,
          fileHash: b.fileHash,
          adapterVersion: b.adapterVersion,
          state: events[0]?.kind ?? 'draft',
          count: p.count,
          total: p.total,
          paymentProven: false,
        });
      }
      const independent = pilots.filter(
        (p) =>
          p.manifestHash === saudiManifest().manifestHash &&
          p.contextCurrent &&
          p.comparisons.at(-1)?.evidenceKind === 'independent' &&
          p.comparisons.at(-1)?.outcome === 'matched',
      );
      const months = [
        ...new Set(
          independent.filter((p) => p.kind === 'payroll').map((p) => p.periodStart.slice(0, 7)),
        ),
      ].toSorted();
      let streak = 0,
        longest = 0,
        previous = -2;
      for (const month of months) {
        const n = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7));
        streak = n === previous + 1 ? streak + 1 : 1;
        longest = Math.max(longest, streak);
        previous = n;
      }
      const open = SAUDI_EVIDENCE_KINDS.filter(
        (kind) => !evidence.some((e) => e.kind === kind && !e.synthetic && e.currentManifest),
      ).map((k) => k as string);
      if (longest < 3) open.push('Three independent consecutive payroll comparisons');
      if (!independent.some((p) => p.kind === 'settlement'))
        open.push('Independent final-settlement comparison');
      open.push(
        'Original consolidated source bytes, named local rule/cohort review and covered boundary scenarios',
        'Current agent-approved schema and actual bank acceptance/returns',
        'Release qualification and country-consumer activation (no activation switch in this candidate)',
      );
      return {
        companies,
        selectedCompanyId: selected,
        manifest: saudiManifest(),
        employers: employers.map((e) => ({
          id: e.id,
          effectiveFrom: e.effectiveFrom,
          effectiveTo: e.effectiveTo,
          definition: e.definition,
        })),
        workers,
        employees: eligible,
        pilots,
        evidence,
        wps,
        qualification: {
          liveEnabled: false,
          independentConsecutivePeriods: longest,
          independentSettlement: independent.some((p) => p.kind === 'settlement'),
          open,
        },
        capabilities,
      };
    });
  }
  activate(): never {
    return blocked('saudi_pack_review_and_provider_acceptance_required');
  }
  adapter() {
    return SAUDI_WPS_ADAPTER;
  }
}
