'use server';
import { revalidatePath } from 'next/cache';
import { authedFetch } from '@/lib/api';
import type { SaudiLeavePreview } from '@gp/shared';
export type SaudiActionState =
  | {
      ok?: boolean;
      error?: string;
      leave?: SaudiLeavePreview;
      scenario?: {
        workerCoverageId: string;
        onDate: string;
        usedBefore: string;
        requestedDays: string;
      };
    }
  | undefined;
export async function saudiChange(_: SaudiActionState, form: FormData): Promise<SaudiActionState> {
  const text = (key: string) => String(form.get(key) ?? '');
  const number = (key: string) => Number(text(key));
  const values = (key: string) => form.getAll(key).map(String);
  const at = (key: string, i: number) => values(key)[i] ?? '';
  const legalEntityId = text('legalEntityId'),
    op = text('op');
  let path: string, body: unknown;
  try {
    if (op === 'leave') {
      path = 'leave-preview';
      body = {
        legalEntityId,
        workerCoverageId: text('workerCoverageId'),
        onDate: text('onDate'),
        kind: text('kind'),
        usedBefore: number('usedBefore'),
        requestedDays: number('requestedDays'),
        eligibilityAttested: form.has('eligibilityAttested'),
        probationCompleted: form.has('probationCompleted'),
        ...(text('eventDate') ? { eventDate: text('eventDate') } : {}),
      };
    } else if (op === 'employer') {
      path = 'employers';
      body = {
        legalEntityId,
        effectiveFrom: text('effectiveFrom'),
        regime: text('regime'),
        workModel: text('workModel'),
        endOfService: text('endOfService'),
        workingTime: text('workingTime'),
        weeklyRestDays: form.getAll('weeklyRestDays').map(Number),
        dailyMinutes: number('dailyMinutes'),
        noticeDays: number('noticeDays'),
        probationDays: number('probationDays'),
        ...(text('restDayAuthorityReference')
          ? { restDayAuthorityReference: text('restDayAuthorityReference') }
          : {}),
        proration: 'calendar_days',
        reason: text('reason'),
      };
    } else if (op === 'worker') {
      path = 'workers';
      body = {
        legalEntityId,
        employeeId: text('employeeId'),
        effectiveFrom: text('effectiveFrom'),
        scheme: text('scheme'),
        authority: text('authority'),
        priorParticipation: text('priorParticipation'),
        workLocation: text('workLocation'),
        calendarBasis: text('calendarBasis'),
        ramadanHours: text('ramadanHours'),
        branches: text('branches'),
        occupationalHazardsBps: number('occupationalHazardsBps'),
        singleEmployer: form.has('singleEmployer'),
        insuranceCoverageAttested: form.has('insuranceCoverageAttested'),
        contractTerm: text('contractTerm'),
        noticeDays: number('noticeDays'),
        probationDays: number('probationDays'),
        ...Object.fromEntries(
          ['firstContributionOn', 'contributionSalary', 'contributionBasisOn', 'contractEndOn']
            .filter((k) => text(k))
            .map((k) => [k, text(k)]),
        ),
        evidenceReference: text('evidenceReference'),
        reason: text('reason'),
      };
    } else if (op === 'payroll') {
      path = 'pilots/payroll';
      body = {
        legalEntityId,
        periodStart: text('periodStart'),
        periodEnd: text('periodEnd'),
        reason: text('reason'),
        lines: [
          {
            workerCoverageId: text('workerCoverageId'),
            basic: text('basic'),
            allowances: text('allowances'),
            unpaidDays: number('unpaidDays'),
            sickDaysBefore: number('sickDaysBefore'),
            sickDays: number('sickDays'),
            probationCompleted: form.has('probationCompleted'),
            yearOvertimeMinutesBefore: number('yearOvertimeMinutesBefore'),
            overtime: values('overtimeDate').map((date, i) => ({
              date,
              minutes: Number(at('overtimeMinutes', i)),
              kind: at('overtimeKind', i),
              ramadan: at('overtimeRamadan', i) === 'yes',
              scheduledMinutes: Number(at('scheduledMinutes', i)),
              weeklyWorkedMinutes: Number(at('weeklyWorkedMinutes', i)),
            })),
            deductions: values('deductionKind').map((kind, i) => ({
              kind,
              amount: at('deductionAmount', i),
              writtenConsent: at('writtenConsent', i) === 'yes',
              reference: at('deductionReference', i),
            })),
          },
        ],
      };
    } else if (op === 'settlement') {
      path = 'pilots/settlement';
      body = {
        legalEntityId,
        workerCoverageId: text('workerCoverageId'),
        lastWorkingDay: text('lastWorkingDay'),
        basic: text('basic'),
        allowances: text('allowances'),
        unpaidServiceDays: number('unpaidServiceDays'),
        unusedAnnualDays: number('unusedAnnualDays'),
        noticePayDays: number('noticePayDays'),
        unpaidSalary: text('unpaidSalary'),
        terminationReason: text('terminationReason'),
        ...(text('article87EvidenceReference')
          ? { article87EvidenceReference: text('article87EvidenceReference') }
          : {}),
        entitlementsAttested: form.has('entitlementsAttested'),
        serviceHistory: 'single_employer_no_transfers',
        reason: text('reason'),
      };
    } else if (op === 'compare') {
      path = `pilots/${text('runId')}/comparisons`;
      body = {
        evidenceKind: text('evidenceKind'),
        preparedBy: text('preparedBy'),
        reference: text('reference'),
        documentHash: text('documentHash'),
        expected: values('expectedEmployeeId').map((employeeId) => ({
          employeeId,
          ...Object.fromEntries(
            [
              'gross',
              'employeeContribution',
              'employerContribution',
              'governmentContribution',
              'deductions',
              'net',
            ].map((key) => [key, text(key + ':' + employeeId)]),
          ),
        })),
        reason: text('reason'),
      };
    } else if (op === 'evidence') {
      path = 'evidence';
      body = {
        legalEntityId,
        kind: text('kind'),
        reviewer: text('reviewer'),
        reviewedOn: text('reviewedOn'),
        reference: text('reference'),
        documentHash: text('documentHash'),
        manifestHash: text('manifestHash'),
        ruleKeys: values('ruleKeys'),
        coveredScenarios: text('coveredScenarios')
          .split(/\r?\n/)
          .map((v) => v.trim())
          .filter(Boolean),
        synthetic: form.has('synthetic'),
        reason: text('reason'),
      };
    } else if (op === 'wps') {
      path = `wps/${text('runId')}/sandbox`;
      body = {};
    } else if (op === 'event') {
      path = `wps/${text('batchId')}/events`;
      body = {
        eventId: text('eventId'),
        fileHash: text('fileHash'),
        kind: text('kind'),
        reference: text('reference'),
        acceptedCount: number('acceptedCount'),
        rejectedCount: number('rejectedCount'),
        returnedTotal: text('returnedTotal'),
        reason: text('reason'),
      };
    } else return { error: 'Unknown SAUDI operation' };
    // Dynamic path segments are UUIDs, never caller-supplied URL/path fragments.
    if (
      ['compare', 'wps', 'event'].includes(op) &&
      !/^[a-f0-9-]{36}$/i.test(text(op === 'event' ? 'batchId' : 'runId'))
    )
      return { error: 'Choose a record' };
  } catch {
    return { error: 'Check the comparison, overtime and deduction data format' };
  }
  const result = await authedFetch<SaudiLeavePreview>('tenant', '/tenant/saudi/' + path, {
    method: 'POST',
    body,
  });
  if (!result.ok) return { error: result.error.message };
  revalidatePath('/workspace/saudi');
  return {
    ok: true,
    ...(op === 'leave'
      ? {
          leave: result.data,
          scenario: {
            workerCoverageId: text('workerCoverageId'),
            onDate: text('onDate'),
            usedBefore: text('usedBefore'),
            requestedDays: text('requestedDays'),
          },
        }
      : {}),
  };
}
