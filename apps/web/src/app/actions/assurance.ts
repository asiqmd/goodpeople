'use server';
import { revalidatePath } from 'next/cache';
import { authedFetch } from '@/lib/api';
export type AssuranceActionState = { ok?: boolean; error?: string; createdId?: string } | undefined;
export async function assuranceChange(
  _: AssuranceActionState,
  f: FormData,
): Promise<AssuranceActionState> {
  const str = (k: string) => String(f.get(k) ?? '').trim(),
    num = (k: string) => Number(str(k)),
    yes = (k: string) => f.has(k),
    list = (k: string) => f.getAll(k).map(String),
    optional = (keys: string[]) =>
      Object.fromEntries(keys.filter((k) => str(k)).map((k) => [k, str(k)]));
  const op = str('op'),
    id = str('programId');
  let path = '/platform/assurance',
    body: unknown;
  if (op === 'mfa') {
    path += '/step-up';
    body = { code: str('code') };
  } else if (op === 'program') {
    path += '/programs';
    body = {
      name: str('name'),
      mode: str('mode'),
      releaseVersion: str('releaseVersion'),
      sourceDigest: str('sourceDigest'),
      sourceDirty: yes('sourceDirty'),
      deployment: str('deployment'),
      countries: list('countries'),
      arabic: yes('arabic'),
      merchantCheckout: yes('merchantCheckout'),
      systemBoundary: str('systemBoundary'),
      customerResponsibilities: str('customerResponsibilities'),
      exclusions: str('exclusions'),
      subserviceOrganizations: str('subserviceOrganizations'),
      criteriaVersion: str('criteriaVersion'),
      descriptionCriteriaVersion: str('descriptionCriteriaVersion'),
      criteriaConfirmed: yes('criteriaConfirmed'),
      reportClaim: str('reportClaim'),
      periodFrom: str('periodFrom'),
      periodThrough: str('periodThrough'),
      targetIncidentSeconds: num('targetIncidentSeconds'),
      targetsConfirmed: yes('targetsConfirmed'),
      targetRtoSeconds: num('targetRtoSeconds'),
      targetRpoSeconds: num('targetRpoSeconds'),
      reason: str('reason'),
    };
  } else {
    if (!/^[a-f0-9-]{36}$/i.test(id)) return { error: 'Choose a program' };
    path += '/programs/' + id + '/events';
    let input: Record<string, unknown> = { kind: op, reason: str('reason') };
    if (op === 'control')
      input = {
        ...input,
        controlId: str('controlId'),
        ownerId: str('ownerId'),
        cadenceDays: num('cadenceDays'),
        procedure: str('procedure'),
        classification: str('classification'),
        retentionDays: num('retentionDays'),
        retentionApproved: yes('retentionApproved'),
        nextDueOn: str('nextDueOn'),
      };
    else if (op === 'evidence') {
      const version = str('controlVersion'),
        controlId = version.split(':')[0],
        controlVersion = version.split(':')[1];
      const value = str('executedAt');
      let executedAt: string;
      try {
        executedAt = new Date(value + 'Z').toISOString();
      } catch {
        return { error: 'Enter the observed UTC execution time' };
      }
      input = {
        ...input,
        controlId,
        controlVersion,
        evidenceKind: str('evidenceKind'),
        sourceReference: str('sourceReference'),
        documentHash: str('documentHash'),
        executedAt,
        coverFrom: str('coverFrom'),
        coverThrough: str('coverThrough'),
        outcome: str('outcome'),
        notes: str('notes'),
        ...(yes('includeDrill')
          ? {
              drill: {
                environment: str('environment'),
                sourceHostReference: str('sourceHostReference'),
                targetHostReference: str('targetHostReference'),
                ...(str('responseSeconds') ? { responseSeconds: num('responseSeconds') } : {}),
                serviceRtoSeconds: num('serviceRtoSeconds'),
                rpoSeconds: num('rpoSeconds'),
                scenario: str('scenario'),
              },
            }
          : {}),
      };
    } else if (op === 'evidence_review')
      input = { ...input, evidenceId: str('evidenceId'), decision: str('decision') };
    else if (op === 'finding')
      input = {
        ...input,
        controlId: str('controlId'),
        severity: str('severity'),
        title: str('title'),
        sourceReference: str('sourceReference'),
        dueOn: str('dueOn'),
        ...optional(['ownerId']),
      };
    else if (op === 'finding_assignment')
      input = {
        ...input,
        findingId: str('findingId'),
        ownerId: str('ownerId'),
        dueOn: str('dueOn'),
      };
    else if (op === 'finding_decision')
      input = {
        ...input,
        findingId: str('findingId'),
        decision: str('decision'),
        ...optional(['evidenceId', 'expiresOn', 'compensatingControls']),
      };
    else if (op === 'exception') {
      const value = str('controlVersion').split(':');
      input = {
        ...input,
        controlId: value[0],
        controlVersion: value[1],
        ownerId: str('ownerId'),
        expiresOn: str('expiresOn'),
        compensatingControls: str('compensatingControls'),
        evidenceId: str('evidenceId'),
      };
    } else if (op === 'exception_review')
      input = { ...input, exceptionId: str('exceptionId'), decision: str('decision') };
    else if (op === 'release_review')
      input = { ...input, decision: str('decision'), reviewedHeadHash: str('reviewedHeadHash') };
    else if (op === 'report')
      input = {
        ...input,
        firm: str('firm'),
        type: str('type'),
        periodFrom: str('periodFrom'),
        periodThrough: str('periodThrough'),
        opinion: str('opinion'),
        distribution: str('distribution'),
        sourceReference: str('sourceReference'),
        documentHash: str('documentHash'),
        evidenceId: str('evidenceId'),
      };
    else return { error: 'Unknown assurance action' };
    body = { expectedVersion: num('expectedVersion'), input };
  }
  const r = await authedFetch<{ id?: string }>('platform', path, { method: 'POST', body });
  if (!r.ok) return { error: r.error.message };
  revalidatePath('/platform/assurance');
  return { ok: true, ...(op === 'program' ? { createdId: r.data.id } : {}) };
}
