import type { AuthUser } from '../../common/auth-user.js';
import { userCan } from '../../common/roles.js';
import { BD_RULES, ruleOn } from '@gp/country-packs';
import {
  CIPHER_FIELDS,
  committeeMembers,
  committees,
  employees,
  grievances,
  tenantUsers,
  type FieldCipher,
  type Tx,
} from '@gp/db';
import {
  addDays,
  daysInclusive,
  GRIEVANCE_DONE_STATUSES,
  todayIn,
  type GrievanceCategory,
  type GrievanceDeadline,
  type GrievanceStatus,

} from '@gp/shared';
import { and, eq, gte, isNull, lte, or } from 'drizzle-orm';

type GrievanceRow = typeof grievances.$inferSelect;

/** Category names for notifications, which never carry what the worker wrote. */
export const CATEGORY_LABELS: Record<GrievanceCategory, { en: string; bn: string; ar?: string }> = {
  wages: { en: 'wages and pay', bn: 'মজুরি ও বেতন' },
  hours: { en: 'working hours and overtime', bn: 'কর্মঘণ্টা ও ওভারটাইম' },
  leave: { en: 'leave and holidays', bn: 'ছুটি' },
  safety: { en: 'health and safety', bn: 'স্বাস্থ্য ও নিরাপত্তা' },
  harassment: { en: 'harassment or abuse', bn: 'হয়রানি বা নির্যাতন' },
  discrimination: { en: 'unfair treatment', bn: 'বৈষম্য বা অন্যায় আচরণ' },
  facilities: { en: 'facilities', bn: 'কারখানার সুবিধা' },
  other: { en: 'another matter', bn: 'অন্য কোনো' },
};

/** What the worker wrote, with the name and code they gave when they chose to be named. */
export interface GrievanceBody {
  text: string;
  name?: string;
  employeeCode?: string;
}

/** Both the grievance and its messages are sealed with the same field key. */
export const sealText = (cipher: FieldCipher, tenantId: string, text: string) =>
  cipher.encrypt(text, { tenantId, field: CIPHER_FIELDS.grievanceText });

export const openText = (cipher: FieldCipher, tenantId: string, stored: string) =>
  cipher.decrypt(stored, { tenantId, field: CIPHER_FIELDS.grievanceText });

export const openBody = (cipher: FieldCipher, row: GrievanceRow): GrievanceBody =>
  JSON.parse(openText(cipher, row.tenantId, row.bodyEnc)) as GrievanceBody;

/** The employer decides a complaint within 30 days of receiving it (s.33). */
export function deadlineOn(date: string): GrievanceDeadline {
  const rule = ruleOn(BD_RULES, 'grievance.decision_within_days', date);
  return { days: rule.value, reference: rule.reference };
}

const dhakaDay = (at: Date) => todayIn('Asia/Dhaka', at);

/** Age, due day and whether it is overdue: the clock stops when resolved or closed. */
export function clockOf(row: GrievanceRow, deadline: GrievanceDeadline, now = new Date()) {
  const raised = dhakaDay(row.createdAt);
  const done = (GRIEVANCE_DONE_STATUSES as readonly GrievanceStatus[]).includes(row.status);
  const until = done && row.closedAt ? dhakaDay(row.closedAt) : dhakaDay(now);
  const dueOn = addDays(raised, deadline.days);
  return {
    ageDays: daysInclusive(raised, until) - 1,
    dueOn,
    overdue: !done && dhakaDay(now) > dueOn,
  };
}

/**
 * Logins that open harassment cases: current members of a current complaint committee
 * (s.332A) with an active login, whatever their role, since workers sit on the committee.
 * Without any, the workspace admin sees them, with a warning, so no case is left where nobody
 * can read it.
 */
export async function complaintCommitteeLogins(tx: Tx, today = todayIn()): Promise<string[]> {
  const rows = await tx
    .selectDistinct({ userId: tenantUsers.id })
    .from(committeeMembers)
    .innerJoin(committees, eq(committees.id, committeeMembers.committeeId))
    .innerJoin(employees, eq(employees.id, committeeMembers.employeeId))
    .innerJoin(tenantUsers, eq(tenantUsers.id, employees.userId))
    .where(
      and(
        eq(committees.kind, 'complaint'),
        or(isNull(committees.endsOn), gte(committees.endsOn, today)),
        lte(committeeMembers.fromOn, today),
        or(isNull(committeeMembers.toOn), gte(committeeMembers.toOn, today)),
        eq(employees.status, 'active'),
        isNull(tenantUsers.disabledAt),
      ),
    );
  return rows.map((r) => r.userId);
}

/**
 * Who reads harassment cases while there is no complaint committee: the workspace admin
 * (users.manage), who alone forms the committee, never HR, who could otherwise empty it to
 * read them, nor Good People's support login.
 */
const readsWithoutCommittee = (user: AuthUser) =>
  user.role !== 'support' && userCan(user, 'users.manage');

/**
 * What a login may open: every grievance but harassment when it handles grievances, and
 * harassment when it sits on the complaint committee (or is the workspace admin where there
 * is no committee to send them to).
 */
export async function grievanceAccessOf(tx: Tx, user: AuthUser) {
  const members = await complaintCommitteeLogins(tx);
  return {
    all: userCan(user, 'grievances.manage'),
    committeeMissing: members.length === 0,
    canSeeRestricted:
      members.includes(user.id) || (members.length === 0 && readsWithoutCommittee(user)),
  };
}
