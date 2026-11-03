import { createHash } from 'node:crypto';
const canonical = (value) =>
  Array.isArray(value)
    ? '[' + value.map(canonical).join(',') + ']'
    : value && typeof value === 'object'
      ? '{' +
        Object.entries(value)
          .filter(([, v]) => v !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
          .join(',') +
        '}'
      : JSON.stringify(value);
export const assuranceDigest = (value) =>
  createHash('sha256').update(canonical(value)).digest('hex');
const fail = (message) => {
  throw new Error('M7 assurance: ' + message);
};
export const ASSURANCE_REQUIRED_CORE = [
  'identity_lifecycle',
  'privileged_access',
  'mfa_recovery',
  'tenant_isolation',
  'webhook_delivery',
  'worker_failover',
  'change_release',
  'vulnerability',
  'independent_pentest',
  'backup_restore',
  'incident_response',
  'privacy_vendors',
  'people_governance',
  'host_qualification',
];
export function validateAssuranceReadiness(envelope, manifest, at = new Date()) {
  const p = envelope?.payload,
    d = p?.definition,
    e = p?.evaluation;
  if (
    envelope?.sha256 !== assuranceDigest(p) ||
    p?.schema !== 1 ||
    p.kind !== 'good-people-assurance-readiness' ||
    p.distribution !== 'restricted_internal'
  )
    fail('restricted envelope hash/contract is invalid');
  if (
    p.programMode !== 'readiness' ||
    d?.mode !== 'readiness' ||
    p.sourceDirty !== false ||
    d.sourceDirty !== false ||
    p.releaseVersion !== manifest.version ||
    d.releaseVersion !== manifest.version ||
    p.sourceDigest !== manifest.source?.treeSha256 ||
    d.sourceDigest !== p.sourceDigest ||
    manifest.source?.dirty !== false
  )
    fail('exact reviewed clean release source and non-synthetic scope are required');
  if (
    !['self_hosted', 'dedicated'].includes(d.deployment) ||
    !d.criteriaConfirmed ||
    !d.targetsConfirmed ||
    !Array.isArray(d.countries) ||
    d.countries.length === 0 ||
    d.countries.some((c) => !['BD', 'AE', 'SA'].includes(c)) ||
    p.definitionHash !== assuranceDigest(d)
  )
    fail('scope, criteria and definition binding are invalid');
  if (
    e?.status !== 'evidence_ready_for_review' ||
    !Array.isArray(e.blockers) ||
    e.blockers.length ||
    e.commercialReleaseApproved !== false ||
    e.statutoryActivationAvailable !== false ||
    e.soc2ClaimAvailable !== false
  )
    fail('current readiness gates have not passed');
  const observed = Date.parse(e.evaluatedAt),
    exported = Date.parse(p.exportedAt),
    now = at.getTime();
  if (
    !Number.isFinite(observed) ||
    !Number.isFinite(exported) ||
    observed > now + 1000 ||
    exported > now + 1000 ||
    now - observed > 7 * 86400000 ||
    now - exported > 7 * 86400000 ||
    d.periodThrough > at.toISOString().slice(0, 10)
  )
    fail('evaluation must be current and the observation period complete');
  const ids = [
    ...ASSURANCE_REQUIRED_CORE,
    ...d.countries.map((c) => 'country_' + c.toLowerCase()),
    ...(d.arabic || d.countries.some((c) => c === 'AE' || c === 'SA') ? ['arabic_review'] : []),
    ...(d.merchantCheckout ? ['merchant_acceptance'] : []),
  ];
  if (
    !Array.isArray(e.controls) ||
    new Set(e.controls.map((c) => c.id)).size !== e.controls.length ||
    e.controls.length !== ids.length ||
    ids.some(
      (id) =>
        !e.controls.some(
          (c) =>
            c.id === id &&
            c.ownerId &&
            ['current', 'exception'].includes(c.state) &&
            c.evidenceIds?.length &&
            (c.state !== 'exception' ||
              (['privileged_access', 'people_governance'].includes(c.id) && c.exceptionId)),
        ),
    )
  )
    fail('complete owned controls, matching evidence and permitted exceptions are required');
  const backupAt = Date.parse(p.runtime?.backup?.lastBackupAt),
    verifyAt = Date.parse(p.runtime?.backup?.lastVerifyAt);
  if (
    now - exported > 120000 ||
    observed > exported + 1000 ||
    !Number.isFinite(backupAt) ||
    !Number.isFinite(verifyAt) ||
    backupAt > now + 1000 ||
    verifyAt > now + 1000 ||
    now - backupAt > 26 * 3600000 ||
    now - verifyAt > 7 * 86400000
  )
    fail(
      'fresh runtime export and independently current backup/verification timestamps are required',
    );
  if (
    p.runtime?.backup?.staleBackup !== false ||
    p.runtime?.backup?.staleVerify !== false ||
    !p.runtime?.worker?.registered ||
    p.runtime.worker.healthy !== p.runtime.worker.registered
  )
    fail('current backup, verification and worker observations are required');
  if (
    d.countries.some((c) => p.runtime.countryConsumers?.[c] !== true) ||
    (d.merchantCheckout && p.runtime.merchantCheckoutQualified !== true)
  )
    fail('actual country consumers and merchant capabilities must be qualified');
  if (!Array.isArray(p.events) || p.events.length !== p.eventCount || p.events.length > 5000)
    fail('full bounded event history is required');
  let previous = p.definitionHash;
  for (const [i, x] of p.events.entries()) {
    const payloadHash = assuranceDigest(x.input),
      hash = assuranceDigest({
        id: x.id,
        programId: p.programId,
        sequence: x.sequence,
        actorId: x.actorId,
        createdAt: x.createdAt,
        previousHash: previous,
        payloadHash,
      });
    if (x.sequence !== i + 1 || x.previousHash !== previous || x.eventHash !== hash)
      fail('event integrity chain is invalid');
    previous = hash;
  }
  if (previous !== p.eventHeadHash) fail('event head does not match');
  const review = p.events.at(-1);
  if (
    review?.input?.kind !== 'release_review' ||
    review.input.decision !== 'recommend' ||
    review.input.reviewedHeadHash !== review.previousHash ||
    review.actorId === p.programCreatedBy
  )
    fail('a second administrator must recommend the exact latest evidence head');
  return {
    programId: p.programId,
    eventHeadHash: p.eventHeadHash,
    sha256: envelope.sha256,
    evaluatedAt: e.evaluatedAt,
    reviewerId: review.actorId,
    status: 'engineering_review_recommended',
    commercialReleaseApproved: false,
  };
}
