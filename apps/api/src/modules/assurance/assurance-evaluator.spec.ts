import { ASSURANCE_CATALOG } from '@gp/shared';
import {
  programFixture,
  fullEvidence,
  event,
  now,
  day,
  producer,
  reviewer,
} from '../../../test/support/assurance-fixtures.js';
import { evaluateAssurance, requiredAssuranceControls } from './assurance-evaluator.js';
describe('assurance scoped readiness evaluation', () => {
  it('requires the complete scope and never turns readiness into certification or activation', () => {
    const r = evaluateAssurance(programFixture(), fullEvidence(), now);
    expect(r.status).toBe('evidence_ready_for_review');
    expect(r).toMatchObject({
      commercialReleaseApproved: false,
      statutoryActivationAvailable: false,
      soc2ClaimAvailable: false,
    });
  });
  it.each(['synthetic', 'dirty', 'criteria', 'future', 'targets'] as const)(
    'blocks %s program claims',
    (kind) => {
      const p = programFixture();
      if (kind === 'synthetic') p.mode = 'synthetic';
      if (kind === 'dirty') p.sourceDirty = true;
      if (kind === 'targets') p.targetsConfirmed = false;
      if (kind === 'criteria') p.criteriaVersion = 'Proposed 2027 criteria';
      if (kind === 'future') p.periodThrough = '2026-11-04';
      expect(evaluateAssurance(p, fullEvidence(p), now).status).toBe('blocked');
    },
  );
  it('includes all declared country, Arabic and merchant gates without inheriting unrelated countries', () => {
    const p = {
      ...programFixture(),
      countries: ['AE', 'SA'] as ('AE' | 'SA')[],
      merchantCheckout: true,
    };
    const ids = requiredAssuranceControls(p).map((c) => c.id);
    expect(ids).toContain('arabic_review');
    expect(ids).toContain('country_ae');
    expect(ids).toContain('country_sa');
    expect(ids).toContain('merchant_acceptance');
    expect(ids).not.toContain('country_bd');
  });
  it('shows unassigned owners rather than inventing named control operation', () => {
    const r = evaluateAssurance(programFixture(), [], now);
    expect(r.controls.every((c) => c.state === 'missing' && c.ownerId === null)).toBe(true);
  });
  it('rejects synthetic or self-reviewed proof even if all rows say passed', () => {
    for (const synthetic of [true, false]) {
      const e = fullEvidence();
      if (synthetic) {
        for (const x of e) if (x.input.kind === 'evidence') x.input.evidenceKind = 'synthetic';
      } else {
        for (const x of e) if (x.input.kind === 'evidence_review') x.actorId = producer;
      }
      expect(evaluateAssurance(programFixture(), e, now).status).toBe('blocked');
    }
  });
  it('requires independent external evidence on provider and legal gates', () => {
    const e = fullEvidence();
    for (const x of e) if (x.input.kind === 'evidence') x.input.evidenceKind = 'operating';
    expect(
      evaluateAssurance(programFixture(), e, now).controls.find(
        (c) => c.id === 'identity_lifecycle',
      )?.state,
    ).toBe('gap');
  });
  it('detects observation gaps and stale evidence rather than relying on the latest green row', () => {
    const p = { ...programFixture(), periodFrom: '2026-10-01' },
      e = fullEvidence();
    expect(evaluateAssurance(p, e, now).status).toBe('blocked');
    for (const x of e) if (x.input.kind === 'evidence') x.input.executedAt = '2025-01-01T00:00:00Z';
    expect(
      evaluateAssurance(programFixture(), e, now).blockers.some((x) => x.includes('stale')),
    ).toBe(true);
  });
  it('invalidates prior evidence after owner/procedure version changes', () => {
    const p = programFixture(),
      e = fullEvidence();
    event(
      {
        kind: 'control',
        controlId: 'vulnerability',
        ownerId: reviewer,
        cadenceDays: 7,
        procedure: 'Revised independently reviewed procedure',
        classification: 'restricted',
        retentionDays: 365,
        retentionApproved: true,
        nextDueOn: '2026-12-01',
        reason: p.reason,
      },
      e,
    );
    expect(evaluateAssurance(p, e, now).controls.find((c) => c.id === 'vulnerability')?.state).toBe(
      'gap',
    );
  });
  it('keeps later failures visible until a later accepted passing observation', () => {
    const p = programFixture(),
      e = fullEvidence(),
      old = e.find((x) => x.input.kind === 'evidence' && x.input.controlId === 'vulnerability')!;
    if (old.input.kind !== 'evidence') throw Error();
    event({ ...old.input, outcome: 'failed' }, e);
    expect(evaluateAssurance(p, e, now).controls.find((c) => c.id === 'vulnerability')?.state).toBe(
      'gap',
    );
    const fixed = event({ ...old.input }, e);
    event(
      { kind: 'evidence_review', evidenceId: fixed.id, decision: 'accept', reason: p.reason },
      e,
      reviewer,
    );
    expect(evaluateAssurance(p, e, now).controls.find((c) => c.id === 'vulnerability')?.state).toBe(
      'current',
    );
  });
  it.each(['same_host', 'same_id', 'rto', 'rpo'] as const)(
    'keeps %s recovery unqualified',
    (kind) => {
      const e = fullEvidence(),
        x = e.find(
          (item) => item.input.kind === 'evidence' && item.input.controlId === 'backup_restore',
        )!;
      if (x.input.kind !== 'evidence') throw Error();
      const d = x.input.drill!;
      if (kind === 'same_host') d.environment = 'native_same_host';
      if (kind === 'same_id') d.targetHostReference = d.sourceHostReference;
      if (kind === 'rto') d.serviceRtoSeconds = 61;
      if (kind === 'rpo') d.rpoSeconds = 11;
      expect(
        evaluateAssurance(programFixture(), e, now).controls.find((c) => c.id === 'backup_restore')
          ?.state,
      ).toBe('gap');
    },
  );
  it('keeps unowned/overdue or critical/high findings blocked and expires risk decisions', () => {
    const p = programFixture(),
      e = fullEvidence(),
      f = event(
        {
          kind: 'finding',
          controlId: 'vulnerability',
          severity: 'high',
          title: 'Synthetic high severity finding',
          ownerId: reviewer,
          dueOn: day,
          sourceReference: 'Synthetic observed scan',
          reason: p.reason,
        },
        e,
      );
    expect(evaluateAssurance(p, e, now).status).toBe('blocked');
    event(
      {
        kind: 'finding_decision',
        findingId: f.id,
        decision: 'risk_accepted',
        expiresOn: '2026-11-04',
        compensatingControls: 'Synthetic accountable compensating controls',
        reason: p.reason,
      },
      e,
      reviewer,
    );
    expect(evaluateAssurance(p, e, now).findings[0]!.state).toBe('risk_accepted');
    expect(evaluateAssurance(p, e, new Date('2026-11-05T00:00:00Z')).findings[0]!.state).toBe(
      'open',
    );
  });
  it('requires a matching report for a declared Type 1/2 claim without publishing it', () => {
    const p = { ...programFixture(), reportClaim: 'type2' as const };
    expect(
      evaluateAssurance(p, fullEvidence(p), now).blockers.some((x) => x.includes('CPA report')),
    ).toBe(true);
  });
  it('does not waive critical external control gates', () => {
    expect(ASSURANCE_CATALOG.filter((c) => c.waivable).map((c) => c.id)).toEqual([
      'privileged_access',
      'people_governance',
    ]);
  });
});
