import { approvalSteps, employees, type Tx } from '@gp/db';
import type { ApprovalSubject, RegularizationKind, SeparationType, UserLanguage } from '@gp/shared';
import { and, eq } from 'drizzle-orm';
import {
  localDate,
  usersWith,
  type Localized,
  type NotificationsService,
  type Recipient,
} from '../notifications/notifications.service.js';

/** What a request is, in a line, for the people told about it. */
export interface ApprovalSummary {
  /** Whose request it is; empty for a payroll run. */
  employeeId: string;
  personName: string;
  summary: Record<UserLanguage, string>;
  /** Where the requester sees the outcome. */
  link: string;
  /** Maker-checker: the login that proposed it, never asked to approve it. */
  madeBy?: string | null;
  /** Who hears the decision; by default the employee whose request it is. */
  decisionRecipients?: Recipient[];
}

const bnNumber = (n: number) => new Intl.NumberFormat('bn-BD').format(n);

function dateRange(start: string, end: string): Record<UserLanguage, string> {
  const a = localDate(start);
  const b = localDate(end);
  return start === end ? a : { en: `${a.en} to ${b.en}`, bn: `${a.bn} থেকে ${b.bn}` };
}

export function leaveSummary(request: {
  leaveType: { name: string; nameBn: string | null };
  startDate: string;
  endDate: string;
  days: number;
}): Record<UserLanguage, string> {
  const range = dateRange(request.startDate, request.endDate);
  const days = request.days;
  return {
    en: `${request.leaveType.name}, ${range.en} (${days} day${days === 1 ? '' : 's'})`,
    bn: `${request.leaveType.nameBn ?? request.leaveType.name}, ${range.bn} (${bnNumber(days)} দিন)`,
  };
}

const CORRECTION_KINDS: Record<RegularizationKind, Record<UserLanguage, string>> = {
  missed_punch: { en: 'Missed punch', bn: 'পাঞ্চ বাদ পড়েছে' },
  on_duty: { en: 'On official duty', bn: 'দাপ্তরিক কাজে বাইরে' },
};

export function correctionSummary(kind: RegularizationKind, date: string) {
  const day = localDate(date);
  return {
    en: `Attendance correction (${CORRECTION_KINDS[kind].en.toLowerCase()}) for ${day.en}`,
    bn: `${day.bn} তারিখের হাজিরা সংশোধন (${CORRECTION_KINDS[kind].bn})`,
  };
}

const SEPARATION_TYPES: Record<SeparationType, Record<UserLanguage, string>> = {
  resignation: { en: 'Resignation', bn: 'পদত্যাগ' },
  termination: { en: 'Termination', bn: 'চাকরির অবসান' },
  dismissal: { en: 'Dismissal', bn: 'বরখাস্ত' },
  discharge: { en: 'Discharge', bn: 'অব্যাহতি' },
  retrenchment: { en: 'Retrenchment', bn: 'ছাঁটাই' },
  retirement: { en: 'Retirement', bn: 'অবসর' },
  death: { en: 'Death', bn: 'মৃত্যু' },
  contract_end: { en: 'End of contract', bn: 'চুক্তির মেয়াদ শেষ' },
};

export function separationSummary(type: SeparationType, lastWorkingDay: string) {
  const day = localDate(lastWorkingDay);
  return {
    en: `${SEPARATION_TYPES[type].en}, last working day ${day.en}`,
    bn: `${SEPARATION_TYPES[type].bn}, শেষ কর্মদিবস ${day.bn}`,
  };
}

/** Tells whoever decides the subject's pending step that it waits for them. */
export async function noticeRequested(
  tx: Tx,
  notifications: NotificationsService,
  subject: { type: ApprovalSubject; id: string },
  summary: ApprovalSummary,
): Promise<void> {
  const steps = await tx
    .select()
    .from(approvalSteps)
    .where(and(eq(approvalSteps.subjectId, subject.id), eq(approvalSteps.status, 'pending')));
  // A payroll run is nobody's own request.
  const [requester] = summary.employeeId
    ? await tx
        .select({ userId: employees.userId })
        .from(employees)
        .where(eq(employees.id, summary.employeeId))
    : [];
  for (const step of steps) {
    let recipients: Recipient[];
    if (step.kind === 'manager') {
      recipients = step.approverEmployeeId ? [{ employeeId: step.approverEmployeeId }] : [];
    } else {
      // Nobody decides their own request, or approves a change they proposed.
      recipients = (
        await usersWith(tx, step.kind === 'payroll' ? 'payroll.approve' : 'approvals.hr')
      ).filter((r) => r.userId !== requester?.userId && r.userId !== summary.madeBy);
    }
    await notifications.notify(tx, {
      event: 'approval.requested',
      recipients,
      values: { 'person.name': summary.personName, 'request.summary': summary.summary },
      link: '/workspace/approvals',
      dedupeKey: `approval.requested:${step.id}`,
      data: { subjectType: subject.type, subjectId: subject.id, stepId: step.id },
    });
  }
}

/** Tells the person whose request it is how it was decided. */
export async function noticeDecided(
  tx: Tx,
  notifications: NotificationsService,
  subject: { type: ApprovalSubject; id: string },
  summary: ApprovalSummary,
  decision: { outcome: 'approved' | 'rejected'; by: string; comment: string | null },
): Promise<void> {
  const outcome: Localized =
    decision.outcome === 'approved'
      ? { en: 'approved', bn: 'অনুমোদিত' }
      : { en: 'rejected', bn: 'প্রত্যাখ্যাত' };
  await notifications.notify(tx, {
    event: 'approval.decided',
    recipients: summary.decisionRecipients ?? [{ employeeId: summary.employeeId }],
    values: {
      'request.summary': summary.summary,
      'decision.outcome': outcome,
      'decision.by': decision.by,
      'decision.note': decision.comment
        ? { en: ` Note: ${decision.comment}`, bn: ` মন্তব্য: ${decision.comment}` }
        : '',
    },
    link: summary.link,
    data: { subjectType: subject.type, subjectId: subject.id, outcome: decision.outcome },
  });
}
