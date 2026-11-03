import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import {
  createDb,
  createFieldCipher,
  hashPassword,
  platformUsers,
  assurancePrograms,
} from '@gp/db';
import type { AssuranceProgramView, AssuranceEventInput } from '@gp/shared';
import { api, bearer, bootApp, testEnv, platformToken, tenantLogin } from './test-env.js';
import { newTotpSecret, totpAt } from '../src/modules/auth/totp.js';
import { programFixture } from './support/assurance-fixtures.js';
const future = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const send = bearer;
const reason = 'Synthetic assurance API validation, no production or human certification';
const evidence = (p: AssuranceProgramView, extra: Record<string, unknown> = {}) => {
  const c = p.events.filter((e) => e.input.kind === 'control').at(-1)!;
  return {
    kind: 'evidence',
    controlId: c.input.kind === 'control' ? c.input.controlId : 'privileged_access',
    controlVersion: c.id,
    evidenceKind: 'operating',
    sourceReference: 'Synthetic redacted source file',
    documentHash: 'b'.repeat(64),
    executedAt: new Date().toISOString(),
    coverFrom: p.definition.periodFrom,
    coverThrough: p.definition.periodThrough,
    outcome: 'passed',
    notes: 'Synthetic observed check; not real independent acceptance',
    reason,
    ...extra,
  } as Extract<AssuranceEventInput, { kind: 'evidence' }>;
};
describe('restricted assurance register and release review', () => {
  let app: INestApplication,
    db: ReturnType<typeof createDb>,
    producer: string,
    reviewer: string,
    support: string,
    plain: string,
    producerId: string,
    reviewerId: string,
    supportId: string;
  const req = () => api(app);
  beforeAll(async () => {
    app = await bootApp();
    db = createDb(testEnv().ownerUrl);
    plain = await platformToken(app);
    const cipher = createFieldCipher(testEnv().fieldKey);
    const tokens = [];
    for (const role of ['super_admin', 'super_admin', 'support'] as const) {
      const id = randomUUID(),
        secret = newTotpSecret(),
        email = 'm7-' + id + '@example.test';
      await db.db.insert(platformUsers).values({
        id,
        name: 'Synthetic M7 ' + role,
        email,
        role,
        passwordHash: await hashPassword(testEnv().password),
        mfaSecretEnc: cipher.encrypt(secret, { tenantId: 'platform', field: 'users.mfa_secret' }),
        mfaEnabledAt: new Date(),
      });
      const login = (
        await req()
          .post('/platform/auth/login')
          .send({ email, password: testEnv().password })
          .expect(200)
      ).body;
      const session = (
        await req()
          .post('/auth/mfa/verify')
          .send({ mfaToken: login.mfaToken, code: totpAt(secret, new Date()) })
          .expect(200)
      ).body;
      tokens.push({ id, token: session.accessToken });
    }
    producer = tokens[0]!.token;
    producerId = tokens[0]!.id;
    reviewer = tokens[1]!.token;
    reviewerId = tokens[1]!.id;
    support = tokens[2]!.token;
    supportId = tokens[2]!.id;
  });
  afterAll(async () => {
    await db?.pool.end();
    await app?.close();
  });
  const fresh = async () => {
    const d = new Date().toISOString().slice(0, 10);
    return (
      await req()
        .post('/platform/assurance/programs')
        .set(send(producer))
        .send({ ...programFixture(), mode: 'synthetic', periodFrom: d, periodThrough: d, reason })
        .expect(201)
    ).body as AssuranceProgramView;
  };
  const append = async (p: AssuranceProgramView, input: AssuranceEventInput, token = producer) =>
    (
      await req()
        .post('/platform/assurance/programs/' + p.id + '/events')
        .set(send(token))
        .send({ expectedVersion: p.version, input })
        .expect(201)
    ).body as AssuranceProgramView;
  const cfg = async (p: AssuranceProgramView, id = 'privileged_access') =>
    append(p, {
      kind: 'control',
      controlId: id as 'privileged_access',
      ownerId: reviewerId,
      cadenceDays: 7,
      procedure: 'Synthetic repeatable operating procedure',
      classification: 'restricted',
      retentionDays: 365,
      retentionApproved: true,
      nextDueOn: future(7),
      reason,
    });
  it('discloses no restricted program/owner/runtime data before recent MFA', async () => {
    const r = (await req().get('/platform/assurance').set(send(plain)).expect(200)).body;
    expect(r).toMatchObject({
      recentMfa: false,
      programs: [],
      people: [],
      runtime: null,
      selected: null,
    });
    await req()
      .post('/platform/assurance/programs')
      .set(send(plain))
      .send(programFixture())
      .expect(403);
  });
  it('denies support, tenant and anonymous callers', async () => {
    await req().get('/platform/assurance').set(send(support)).expect(403);
    const t = await tenantLogin(app, 'my-group');
    await req().get('/platform/assurance').set(send(t.accessToken)).expect(403);
    await req().get('/platform/assurance').expect(401);
  });
  it('encrypts definitions and enforces platform RLS plus append-only storage', async () => {
    const p = await fresh();
    expect(p.evaluation.status).toBe('blocked');
    expect(
      await db.db.select().from(assurancePrograms).where(eq(assurancePrograms.id, p.id)),
    ).toHaveLength(0);
    await db.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.assurance_actor',${supportId},true)`);
      expect(
        await tx.select().from(assurancePrograms).where(eq(assurancePrograms.id, p.id)),
      ).toHaveLength(0);
    });
    await db.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.assurance_actor',${producerId},true)`);
      const [r] = await tx.select().from(assurancePrograms).where(eq(assurancePrograms.id, p.id));
      expect(r!.definitionEnc).toMatch(/^v[12]:/);
      expect(r!.definitionEnc).not.toContain('Synthetic');
    });
    await expect(
      db.db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.assurance_actor',${producerId},true)`);
        await tx.delete(assurancePrograms).where(eq(assurancePrograms.id, p.id));
      }),
    ).rejects.toThrow();
  });
  it('requires another administrator for source acceptance and retains exact hashes', async () => {
    let p = await cfg(await fresh());
    p = await append(p, evidence(p));
    const e = p.events.at(-1)!;
    await req()
      .post('/platform/assurance/programs/' + p.id + '/events')
      .set(send(producer))
      .send({
        expectedVersion: p.version,
        input: { kind: 'evidence_review', evidenceId: e.id, decision: 'accept', reason },
      })
      .expect(409);
    p = await append(
      p,
      { kind: 'evidence_review', evidenceId: e.id, decision: 'accept', reason },
      reviewer,
    );
    expect(p.evaluation.controls.find((c) => c.id === 'privileged_access')!.state).toBe('current');
    p = await append(
      p,
      { kind: 'evidence_review', evidenceId: e.id, decision: 'reject', reason },
      reviewer,
    );
    expect(p.evaluation.controls.find((c) => c.id === 'privileged_access')!.state).toBe('gap');
    expect(new Set(p.events.map((entry) => entry.eventHash)).size).toBe(p.events.length);
  });
  it('invalidates old evidence when a new control version is recorded and rejects stale writes', async () => {
    let p = await cfg(await fresh());
    const old = p;
    p = await append(p, evidence(p));
    const id = p.events.at(-1)!.id;
    p = await append(
      p,
      { kind: 'evidence_review', evidenceId: id, decision: 'accept', reason },
      reviewer,
    );
    p = await cfg(p);
    expect(p.evaluation.controls.find((c) => c.id === 'privileged_access')!.state).toBe('gap');
    await req()
      .post('/platform/assurance/programs/' + p.id + '/events')
      .set(send(producer))
      .send({ expectedVersion: old.version, input: evidence(old) })
      .expect(409);
  });
  it('rejects future, oversized-period and cross-program evidence references', async () => {
    let p = await cfg(await fresh());
    for (const extra of [
      { executedAt: '2099-01-01T00:00:00Z' },
      { coverFrom: '2020-01-01' },
      { controlVersion: randomUUID() },
    ])
      await req()
        .post('/platform/assurance/programs/' + p.id + '/events')
        .set(send(producer))
        .send({ expectedVersion: p.version, input: evidence(p, extra) })
        .expect(409);
    await req()
      .post('/platform/assurance/programs/' + p.id + '/events')
      .set(send(reviewer))
      .send({
        expectedVersion: p.version,
        input: { kind: 'evidence_review', evidenceId: randomUUID(), decision: 'accept', reason },
      })
      .expect(409);
  });
  it('keeps accepted synthetic examples out of real operating and external gates', async () => {
    let p = await cfg(await fresh());
    p = await append(p, evidence(p, { evidenceKind: 'synthetic' }));
    p = await append(
      p,
      { kind: 'evidence_review', evidenceId: p.events.at(-1)!.id, decision: 'accept', reason },
      reviewer,
    );
    expect(p.evaluation.controls.find((c) => c.id === 'privileged_access')!.state).toBe('gap');
    expect(p.evaluation.commercialReleaseApproved).toBe(false);
  });
  it('blocks a later failed observation rather than falling back to old green evidence', async () => {
    let p = await cfg(await fresh());
    p = await append(p, evidence(p));
    p = await append(
      p,
      { kind: 'evidence_review', evidenceId: p.events.at(-1)!.id, decision: 'accept', reason },
      reviewer,
    );
    p = await append(p, evidence(p, { outcome: 'failed' }));
    expect(
      p.evaluation.controls
        .find((c) => c.id === 'privileged_access')!
        .gaps.some((g) => g.includes('failed')),
    ).toBe(true);
  });
  it('records unowned findings, assigns current owners and requires an accountable second-person risk decision', async () => {
    let p = await fresh();
    p = await append(p, {
      kind: 'finding',
      controlId: 'vulnerability',
      severity: 'high',
      title: 'Synthetic high severity risk',
      sourceReference: 'Synthetic audit source',
      dueOn: p.definition.periodThrough,
      reason,
    });
    const id = p.events.at(-1)!.id;
    expect(p.evaluation.findings[0]!.ownerId).toBeNull();
    p = await append(p, {
      kind: 'finding_assignment',
      findingId: id,
      ownerId: reviewerId,
      dueOn: future(7),
      reason,
    });
    await req()
      .post('/platform/assurance/programs/' + p.id + '/events')
      .set(send(producer))
      .send({
        expectedVersion: p.version,
        input: {
          kind: 'finding_decision',
          findingId: id,
          decision: 'risk_accepted',
          expiresOn: future(1),
          compensatingControls: 'Synthetic independent compensating control',
          reason,
        },
      })
      .expect(409);
    p = await append(
      p,
      {
        kind: 'finding_decision',
        findingId: id,
        decision: 'risk_accepted',
        expiresOn: future(1),
        compensatingControls: 'Synthetic independent compensating control',
        reason,
      },
      reviewer,
    );
    expect(p.evaluation.findings[0]).toMatchObject({ ownerId: reviewerId, state: 'risk_accepted' });
  });

  it('records only a second-owner time-limited exception with accepted compensating evidence', async () => {
    let p = await fresh();
    p = await append(p, {
      kind: 'control',
      controlId: 'privileged_access',
      ownerId: reviewerId,
      cadenceDays: 7,
      procedure: 'Synthetic reviewed operating procedure',
      classification: 'restricted',
      retentionDays: 365,
      retentionApproved: true,
      nextDueOn: future(-1),
      reason,
    });
    const version = p.events.at(-1)!.id;
    p = await append(p, evidence(p));
    const proof = p.events.at(-1)!.id;
    p = await append(
      p,
      { kind: 'evidence_review', evidenceId: proof, decision: 'accept', reason },
      reviewer,
    );
    p = await append(p, {
      kind: 'exception',
      controlId: 'privileged_access',
      controlVersion: version,
      ownerId: reviewerId,
      expiresOn: future(1),
      evidenceId: proof,
      compensatingControls: 'Synthetic independently reviewed compensating procedure',
      reason,
    });
    const exception = p.events.at(-1)!.id;
    await req()
      .post('/platform/assurance/programs/' + p.id + '/events')
      .set(send(producer))
      .send({
        expectedVersion: p.version,
        input: { kind: 'exception_review', exceptionId: exception, decision: 'accept', reason },
      })
      .expect(409);
    p = await append(
      p,
      { kind: 'exception_review', exceptionId: exception, decision: 'accept', reason },
      reviewer,
    );
    expect(p.evaluation.controls.find((c) => c.id === 'privileged_access')!.state).toBe(
      'exception',
    );
  });
  it('does not permit an exception to a hard legal/provider/recovery gate', async () => {
    let p = await cfg(await fresh(), 'backup_restore');
    const c = p.events.at(-1)!;
    await req()
      .post('/platform/assurance/programs/' + p.id + '/events')
      .set(send(producer))
      .send({
        expectedVersion: p.version,
        input: {
          kind: 'exception',
          controlId: 'backup_restore',
          controlVersion: c.id,
          ownerId: reviewerId,
          expiresOn: future(1),
          compensatingControls: 'Synthetic compensating test',
          evidenceId: randomUUID(),
          reason,
        },
      })
      .expect(409);
  });
  it('requires matching independently reviewed external source for report metadata', async () => {
    const p = await fresh();
    await req()
      .post('/platform/assurance/programs/' + p.id + '/events')
      .set(send(producer))
      .send({
        expectedVersion: p.version,
        input: {
          kind: 'report',
          firm: 'Synthetic CPA fixture, not actual issuance',
          type: 'type2',
          periodFrom: p.definition.periodFrom,
          periodThrough: p.definition.periodThrough,
          opinion: 'unmodified',
          distribution: 'restricted',
          sourceReference: 'Synthetic report reference',
          documentHash: 'b'.repeat(64),
          evidenceId: randomUUID(),
          reason,
        },
      })
      .expect(409);
  });
  it('holds release recommendation behind current gates and an independent exact-head review', async () => {
    const p = await fresh();
    for (const token of [producer, reviewer])
      await req()
        .post('/platform/assurance/programs/' + p.id + '/events')
        .set(send(token))
        .send({
          expectedVersion: p.version,
          input: {
            kind: 'release_review',
            decision: 'recommend',
            reviewedHeadHash: p.headHash,
            reason,
          },
        })
        .expect(409);
    const r = await append(
      p,
      { kind: 'release_review', decision: 'reject', reviewedHeadHash: p.headHash, reason },
      reviewer,
    );
    expect(r.events.at(-1)!.input.kind).toBe('release_review');
  });
  it('exports bounded restricted history and detects integrity/hash mismatches', async () => {
    let p = await cfg(await fresh());
    const r = (
      await req()
        .get('/platform/assurance/programs/' + p.id + '/export')
        .set(send(producer))
        .expect(200)
    ).body;
    expect(r.signature).toBeNull();
    expect(r.payload).toMatchObject({
      distribution: 'restricted_internal',
      sourceDirty: false,
    });
    expect(r.sha256).toHaveLength(64);
    expect(r.payload.eventHeadHash).toBe(p.headHash);
    await req()
      .get('/platform/assurance/programs/' + p.id + '/export')
      .set(send(support))
      .expect(403);
    await req()
      .get('/platform/assurance/programs/' + randomUUID())
      .set(send(producer))
      .expect(404);
  });
  it('retains actual unqualified country and merchant gates regardless of program declarations', async () => {
    const date = new Date().toISOString().slice(0, 10);
    const p = (
      await req()
        .post('/platform/assurance/programs')
        .set(send(producer))
        .send({
          ...programFixture(),
          countries: ['AE', 'SA'],
          merchantCheckout: true,
          periodFrom: date,
          periodThrough: date,
          reason,
        })
        .expect(201)
    ).body as AssuranceProgramView;
    expect(p.evaluation.blockers.some((b) => b.includes('AE country consumers'))).toBe(true);
    expect(p.evaluation.blockers.some((b) => b.includes('SA country consumers'))).toBe(true);
    expect(p.evaluation.blockers.some((b) => b.includes('merchant checkout'))).toBe(true);
  });
  it('serializes competing exact-version updates without branching the evidence chain', async () => {
    const p = await fresh(),
      input = {
        kind: 'finding',
        controlId: 'vulnerability',
        severity: 'low',
        title: 'Synthetic concurrent finding',
        sourceReference: 'Synthetic simultaneous request',
        dueOn: future(1),
        reason,
      };
    const results = await Promise.all(
      [producer, reviewer].map((token) =>
        req()
          .post('/platform/assurance/programs/' + p.id + '/events')
          .set(send(token))
          .send({ expectedVersion: p.version, input }),
      ),
    );
    expect(results.map((r) => r.status).toSorted()).toEqual([201, 409]);
    const current = (
      await req()
        .get('/platform/assurance/programs/' + p.id)
        .set(send(producer))
        .expect(200)
    ).body;
    expect(current.version).toBe(1);
    expect(current.events[0].previousHash).toBe(p.headHash);
  });
  it('rejects extra fields rather than accepting activation/report overrides', async () => {
    await req()
      .post('/platform/assurance/programs')
      .set(send(producer))
      .send({ ...programFixture(), commercialReleaseApproved: true })
      .expect(400);
  });
});
