import { randomUUID } from 'node:crypto';
import {
  type AssuranceProgramInput,
  type AssuranceEvent,
  type AssuranceEventInput,
} from '@gp/shared';
import { requiredAssuranceControls } from '../../src/modules/assurance/assurance-evaluator.js';
export const now = new Date('2026-11-03T12:00:00Z'),
  day = '2026-11-03',
  producer = randomUUID(),
  reviewer = randomUUID();
export const programFixture = (): AssuranceProgramInput => ({
  name: 'Synthetic scoped assurance reference',
  mode: 'readiness',
  releaseVersion: '5.7.0',
  sourceDigest: 'a'.repeat(64),
  sourceDirty: false,
  deployment: 'self_hosted',
  countries: ['BD'],
  arabic: false,
  merchantCheckout: false,
  systemBoundary: 'Synthetic isolated system, not a real release',
  customerResponsibilities: 'Synthetic customer responsibility reference',
  exclusions: 'Synthetic excluded service reference',
  subserviceOrganizations: 'Synthetic vendor responsibility reference',
  criteriaVersion: '2017 TSC, revised points of focus 2022',
  descriptionCriteriaVersion: '2018 description criteria, revised implementation guidance 2022',
  criteriaConfirmed: true,
  reportClaim: 'none',
  periodFrom: day,
  periodThrough: day,
  targetIncidentSeconds: 60,
  targetsConfirmed: true,
  targetRtoSeconds: 60,
  targetRpoSeconds: 10,
  reason: 'Synthetic unit fixture, not a completed human review',
});
export const event = (input: AssuranceEventInput, events: AssuranceEvent[], actorId = producer) => {
  const e = {
    id: randomUUID(),
    sequence: events.length + 1,
    actorId,
    createdAt: now.toISOString(),
    previousHash: '0'.repeat(64),
    eventHash: '0'.repeat(64),
    input,
  };
  events.push(e);
  return e;
};
export function fullEvidence(p = programFixture()) {
  const events: AssuranceEvent[] = [];
  for (const c of requiredAssuranceControls(p)) {
    const cfg = event(
      {
        kind: 'control',
        controlId: c.id,
        ownerId: reviewer,
        cadenceDays: c.cadenceDays,
        procedure: 'Synthetic operating procedure reference',
        classification: 'restricted',
        retentionDays: 365,
        retentionApproved: true,
        nextDueOn: '2026-12-01',
        reason: p.reason,
      },
      events,
    );
    const proof = event(
      {
        kind: 'evidence',
        controlId: c.id,
        controlVersion: cfg.id,
        evidenceKind: c.external ? 'external' : 'operating',
        sourceReference: 'Synthetic redacted original evidence',
        documentHash: 'b'.repeat(64),
        executedAt: now.toISOString(),
        coverFrom: p.periodFrom,
        coverThrough: p.periodThrough,
        outcome: 'passed',
        notes: 'Synthetic observed result, not external acceptance',
        ...(['backup_restore', 'incident_response'].includes(c.id)
          ? {
              drill: {
                environment: 'production_like' as const,
                sourceHostReference: 'synthetic-source-host',
                targetHostReference: 'synthetic-target-host',
                serviceRtoSeconds: 30,
                responseSeconds: 20,
                rpoSeconds: 0,
                scenario: 'Synthetic drill, not actual production',
              },
            }
          : {}),
        reason: p.reason,
      },
      events,
    );
    event(
      { kind: 'evidence_review', evidenceId: proof.id, decision: 'accept', reason: p.reason },
      events,
      reviewer,
    );
  }
  return events;
}
