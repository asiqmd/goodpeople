import { randomUUID } from 'node:crypto';
import {
  validateAssuranceReadiness,
  assuranceDigest,
  ASSURANCE_REQUIRED_CORE,
} from '../../../infra/enterprise/assurance-policy.mjs';
import { ASSURANCE_CATALOG, type AssuranceEvent } from '@gp/shared';
import { evaluateAssurance } from '../src/modules/assurance/assurance-evaluator.js';
import {
  programFixture,
  fullEvidence,
  producer,
  reviewer,
  now,
} from './support/assurance-fixtures.js';
const manifest = { version: '5.7.0', source: { treeSha256: 'a'.repeat(64), dirty: false } };
function envelope() {
  const definition = programFixture(),
    programId = randomUUID(),
    events = fullEvidence(definition);
  let previousHash = assuranceDigest(definition);
  for (const e of events) {
    e.previousHash = previousHash;
    e.eventHash = assuranceDigest({
      id: e.id,
      programId,
      sequence: e.sequence,
      actorId: e.actorId,
      createdAt: e.createdAt,
      previousHash,
      payloadHash: assuranceDigest(e.input),
    });
    previousHash = e.eventHash;
  }
  const review: AssuranceEvent = {
    id: randomUUID(),
    sequence: events.length + 1,
    actorId: reviewer,
    createdAt: now.toISOString(),
    previousHash,
    eventHash: '',
    input: {
      kind: 'release_review',
      decision: 'recommend',
      reviewedHeadHash: previousHash,
      reason: 'Synthetic separate reviewer reference, not an actual release',
    },
  };
  review.eventHash = assuranceDigest({
    id: review.id,
    programId,
    sequence: review.sequence,
    actorId: review.actorId,
    createdAt: review.createdAt,
    previousHash,
    payloadHash: assuranceDigest(review.input),
  });
  events.push(review);
  const payload = {
    schema: 1,
    kind: 'good-people-assurance-readiness',
    distribution: 'restricted_internal',
    definition,
    definitionHash: assuranceDigest(definition),
    programId,
    programCreatedBy: producer,
    programMode: 'readiness',
    sourceDirty: false,
    releaseVersion: '5.7.0',
    sourceDigest: 'a'.repeat(64),
    evaluation: evaluateAssurance(definition, events, now),
    runtime: {
      backup: {
        lastBackupAt: now.toISOString(),
        lastVerifyAt: now.toISOString(),
        staleBackup: false,
        staleVerify: false,
      },
      worker: { registered: 2, healthy: 2 },
      countryConsumers: { BD: true, AE: false, SA: false },
      merchantCheckoutQualified: false,
    },
    events,
    eventCount: events.length,
    eventHeadHash: review.eventHash,
    exportedAt: now.toISOString(),
  };
  return { payload, sha256: assuranceDigest(payload), signature: null };
}
describe('M7 enterprise release qualification contract', () => {
  it('binds readiness and an independent exact-head recommendation to the actual clean release source', () => {
    expect(validateAssuranceReadiness(envelope(), manifest, now).status).toBe(
      'engineering_review_recommended',
    );
  });
  it('keeps CLI and application core control inventories aligned', () => {
    const shared = ASSURANCE_CATALOG.filter(
      (x) =>
        !x.id.startsWith('country_') && !['arabic_review', 'merchant_acceptance'].includes(x.id),
    ).map((x) => x.id);
    expect(ASSURANCE_REQUIRED_CORE).toEqual(shared);
  });
  it.each([
    'hash',
    'source',
    'synthetic',
    'blocked',
    'controls',
    'runtime',
    'chain',
    'head',
    'reviewer',
    'stale',
  ] as const)('rejects %s qualification bypass', (kind) => {
    const x = envelope();
    if (kind === 'hash') x.sha256 = '0'.repeat(64);
    else {
      if (kind === 'source') x.payload.sourceDigest = 'b'.repeat(64);
      if (kind === 'synthetic') x.payload.programMode = 'synthetic';
      if (kind === 'blocked') x.payload.evaluation.status = 'blocked';
      if (kind === 'controls') x.payload.evaluation.controls = [];
      if (kind === 'runtime') x.payload.runtime.backup.staleBackup = true;
      if (kind === 'chain') x.payload.events[0]!.input.reason = 'Tampered original source reason';
      if (kind === 'head') x.payload.eventHeadHash = '0'.repeat(64);
      if (kind === 'reviewer') x.payload.programCreatedBy = reviewer;
      if (kind === 'stale') x.payload.exportedAt = '2026-10-01T00:00:00Z';
      x.sha256 = assuranceDigest(x.payload);
    }
    expect(() => validateAssuranceReadiness(x, manifest, now)).toThrow('M7 assurance');
  });
  it.each([
    'aged_runtime',
    'aged_backup',
    'aged_verification',
    'missing_timestamp',
    'future_timestamp',
  ] as const)('rejects %s even when supplied status flags are green', (kind) => {
    const x = envelope();
    if (kind === 'aged_runtime') {
      x.payload.exportedAt = new Date(now.getTime() - 121000).toISOString();
      x.payload.evaluation.evaluatedAt = x.payload.exportedAt;
    }
    if (kind === 'aged_backup')
      x.payload.runtime.backup.lastBackupAt = new Date(now.getTime() - 27 * 3600000).toISOString();
    if (kind === 'aged_verification')
      x.payload.runtime.backup.lastVerifyAt = new Date(now.getTime() - 8 * 86400000).toISOString();
    if (kind === 'missing_timestamp') x.payload.runtime.backup.lastBackupAt = '';
    if (kind === 'future_timestamp')
      x.payload.runtime.backup.lastVerifyAt = new Date(now.getTime() + 60000).toISOString();
    x.sha256 = assuranceDigest(x.payload);
    expect(() => validateAssuranceReadiness(x, manifest, now)).toThrow('M7 assurance');
  });
  it('rejects future or stale evaluations and scope changes', () => {
    for (const at of [new Date('2026-11-03T11:00:00Z'), new Date('2026-11-12T00:00:00Z')])
      expect(() => validateAssuranceReadiness(envelope(), manifest, at)).toThrow();
    const x = envelope();
    x.payload.definition.countries = ['AE'];
    x.payload.definitionHash = assuranceDigest(x.payload.definition);
    x.sha256 = assuranceDigest(x.payload);
    expect(() => validateAssuranceReadiness(x, manifest, now)).toThrow();
  });
});
