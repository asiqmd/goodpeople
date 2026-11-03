import {
  ASSURANCE_CATALOG,
  type AssuranceProgramInput,
  type AssuranceEvent,
  type AssuranceEvaluation,
  type AssuranceEventInput,
} from '@gp/shared';
const DAY = 86400000,
  at = (d: string) => Date.parse(d + 'T00:00:00Z'),
  day = (d: Date) => d.toISOString().slice(0, 10);
export function requiredAssuranceControls(p: AssuranceProgramInput) {
  return ASSURANCE_CATALOG.filter((c) => {
    if (c.id.startsWith('country_'))
      return p.countries.includes(c.id.slice(8).toUpperCase() as 'BD' | 'AE' | 'SA');
    if (c.id === 'arabic_review')
      return p.arabic || p.countries.some((x) => x === 'AE' || x === 'SA');
    if (c.id === 'merchant_acceptance') return p.merchantCheckout;
    return true;
  });
}
export function evaluateAssurance(
  p: AssuranceProgramInput,
  events: AssuranceEvent[],
  now = new Date(),
): AssuranceEvaluation {
  const today = day(now),
    blockers: string[] = [],
    latest = <K extends AssuranceEventInput['kind']>(kind: K, id: string, key: string) =>
      events
        .filter(
          (e) =>
            e.input.kind === kind && (e.input as unknown as Record<string, unknown>)[key] === id,
        )
        .at(-1);
  const accepted = (e: AssuranceEvent) =>
    latest('evidence_review', e.id, 'evidenceId')?.actorId !== e.actorId &&
    latest('evidence_review', e.id, 'evidenceId')?.input.kind === 'evidence_review' &&
    (
      latest('evidence_review', e.id, 'evidenceId')!.input as Extract<
        AssuranceEventInput,
        { kind: 'evidence_review' }
      >
    ).decision === 'accept';
  if (p.mode === 'synthetic') blockers.push('Synthetic programs cannot qualify a release');
  if (!p.targetsConfirmed)
    blockers.push(
      'Recovery and incident targets require accountable customer/operations confirmation',
    );
  if (p.sourceDirty) blockers.push('Reviewed clean source is required');
  if (
    !p.criteriaConfirmed ||
    /pending|proposed|to be|draft|2027/i.test(
      p.criteriaVersion + ' ' + p.descriptionCriteriaVersion,
    )
  )
    blockers.push(
      'Applicable published criteria and system-description version require confirmation with the examiner',
    );
  if (p.periodThrough > today) blockers.push('The observation period has not ended');
  const controls = requiredAssuranceControls(p).map((c) => {
    const gaps: string[] = [],
      config = latest('control', c.id, 'controlId'),
      cfg = config?.input.kind === 'control' ? config.input : null;
    if (!cfg) gaps.push('Named owner and control procedure are missing');
    else {
      if (!cfg.retentionApproved) gaps.push('Retention and classification approval is missing');
      if (cfg.nextDueOn < today) gaps.push('Scheduled control execution is overdue');
    }
    const evidence = events.filter(
      (e) =>
        e.input.kind === 'evidence' &&
        e.input.controlId === c.id &&
        e.input.controlVersion === config?.id &&
        e.input.evidenceKind !== 'synthetic' &&
        e.input.outcome === 'passed' &&
        accepted(e) &&
        (!c.external || e.input.evidenceKind === 'external'),
    );
    const last = evidence.at(-1),
      input = last?.input.kind === 'evidence' ? last.input : null;
    if (!input)
      gaps.push(
        c.external
          ? 'Accepted independent external evidence is missing'
          : 'Accepted operating evidence is missing',
      );
    if (input && cfg) {
      if (now.getTime() - Date.parse(input.executedAt) > cfg.cadenceDays * DAY)
        gaps.push('Evidence is stale');
      const intervals = evidence
        .map((e) => e.input as Extract<AssuranceEventInput, { kind: 'evidence' }>)
        .map((e) => [at(e.coverFrom), at(e.coverThrough)] as const)
        .toSorted((a, b) => a[0] - b[0]);
      let cursor = at(p.periodFrom);
      for (const [from, to] of intervals) {
        if (from > cursor) break;
        cursor = Math.max(cursor, to + DAY);
      }
      if (cursor <= at(p.periodThrough)) gaps.push('Observation-period coverage has a gap');
      const failure = events
        .filter(
          (e) =>
            e.input.kind === 'evidence' &&
            e.input.controlId === c.id &&
            e.input.controlVersion === config!.id &&
            e.input.outcome === 'failed',
        )
        .at(-1);
      if (
        failure &&
        failure.input.kind === 'evidence' &&
        (failure.sequence > last!.sequence || failure.input.executedAt > input.executedAt)
      )
        gaps.push('A later failed observation has not been remediated');
      if (c.id === 'backup_restore') {
        const d = input.drill;
        if (
          !d ||
          d.environment === 'native_same_host' ||
          d.sourceHostReference === d.targetHostReference ||
          d.serviceRtoSeconds > p.targetRtoSeconds ||
          d.rpoSeconds > p.targetRpoSeconds
        )
          gaps.push('Distinct-host service recovery and agreed RTO/RPO targets are unqualified');
      }
      if (
        c.id === 'incident_response' &&
        (!input.drill ||
          input.drill.environment === 'native_same_host' ||
          input.drill.responseSeconds === undefined ||
          input.drill.responseSeconds > p.targetIncidentSeconds)
      )
        gaps.push('An independently reviewed incident drill against agreed targets is missing');
    }
    const exception = events
      .filter(
        (e) =>
          e.input.kind === 'exception' &&
          e.input.controlId === c.id &&
          e.input.controlVersion === config?.id &&
          e.input.expiresOn >= today &&
          c.waivable,
      )
      .findLast((e) => {
        const review = latest('exception_review', e.id, 'exceptionId');
        if (review?.input.kind !== 'exception_review' || review.input.decision !== 'accept')
          return false;
        const id = e.input.kind === 'exception' ? e.input.evidenceId : '';
        return evidence.some((x) => x.id === id);
      });
    // An exception covers an owned, approved procedural/period gap, never a missing owner or stale/failed proof.
    const canExcept =
      !!exception &&
      !!cfg &&
      cfg.retentionApproved &&
      !!input &&
      gaps.every(
        (g) =>
          g === 'Observation-period coverage has a gap' ||
          g === 'Scheduled control execution is overdue',
      );
    const state = !cfg
      ? ('missing' as const)
      : gaps.length
        ? canExcept
          ? ('exception' as const)
          : ('gap' as const)
        : ('current' as const);
    if (state === 'missing' || state === 'gap') blockers.push(c.id + ': ' + gaps.join('; '));
    return {
      id: c.id,
      title: c.title,
      ownerId: cfg?.ownerId ?? null,
      state,
      gaps,
      evidenceIds: evidence.map((e) => e.id),
      exceptionId: canExcept ? exception!.id : null,
    };
  });
  const findings = events
    .filter((e) => e.input.kind === 'finding')
    .map((e) => {
      const original = e.input as Extract<AssuranceEventInput, { kind: 'finding' }>;
      const assigned = latest('finding_assignment', e.id, 'findingId')?.input;
      const f = {
          ...original,
          ...(assigned?.kind === 'finding_assignment'
            ? { ownerId: assigned.ownerId, dueOn: assigned.dueOn }
            : {}),
        },
        d = latest('finding_decision', e.id, 'findingId')?.input;
      let state = 'open';
      if (d?.kind === 'finding_decision') {
        if (d.decision === 'remediated') {
          const proof = events.find((x) => x.id === d.evidenceId);
          if (
            proof?.input.kind === 'evidence' &&
            proof.input.controlId === f.controlId &&
            proof.input.evidenceKind !== 'synthetic' &&
            proof.input.outcome === 'passed' &&
            accepted(proof)
          )
            state = 'remediated';
        } else if (d.decision === 'risk_accepted' && d.expiresOn && d.expiresOn >= today)
          state = 'risk_accepted';
      }
      if (
        state === 'open' &&
        (['critical', 'high'].includes(f.severity) || !f.ownerId || f.dueOn < today)
      )
        blockers.push(
          'Finding ' +
            e.id +
            ': ' +
            f.severity +
            ' / ' +
            (!f.ownerId ? 'owner missing' : f.dueOn < today ? 'overdue' : 'unresolved'),
        );
      return {
        id: e.id,
        severity: f.severity,
        title: f.title,
        ownerId: f.ownerId ?? null,
        dueOn: f.dueOn,
        state,
      };
    });
  const raw = events.filter((e) => e.input.kind === 'report').at(-1),
    report = raw?.input.kind === 'report' ? raw.input : null;
  if (p.reportClaim !== 'none') {
    const proof = report && events.find((e) => e.id === report.evidenceId);
    if (
      !report ||
      report.type !== p.reportClaim ||
      report.periodFrom > p.periodFrom ||
      report.periodThrough < p.periodThrough ||
      report.opinion !== 'unmodified' ||
      proof?.input.kind !== 'evidence' ||
      proof.input.evidenceKind !== 'external' ||
      proof.input.documentHash !== report.documentHash ||
      !accepted(proof)
    )
      blockers.push(
        'CPA report claim requires matching independently reviewed report metadata, scope and period; no public claim is enabled',
      );
  }
  return {
    status: blockers.length ? 'blocked' : 'evidence_ready_for_review',
    evaluatedAt: now.toISOString(),
    blockers,
    controls,
    findings,
    report:
      report && raw
        ? {
            id: raw.id,
            firm: report.firm,
            type: report.type,
            opinion: report.opinion,
            distribution: report.distribution,
          }
        : null,
    commercialReleaseApproved: false,
    statutoryActivationAvailable: false,
    soc2ClaimAvailable: false,
  };
}
