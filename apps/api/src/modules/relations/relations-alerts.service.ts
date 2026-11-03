import { Injectable } from '@nestjs/common';
import { complianceAlerts } from '@gp/db';
import {
  addDays,
  todayIn,
  type CommitteeKind,
  type ComplianceAlertKind,
  type RelationsCheckResult,
  type UserLanguage,
} from '@gp/shared';
import { and, inArray, ne, sql } from 'drizzle-orm';
import { currentTenantId } from '../../common/request-context.js';
import { TenantDb } from '../../db/db.module.js';
import {
  localDate,
  NotificationsService,
  usersWith,
  type Localized,
} from '../notifications/notifications.service.js';
import { daysBetween, minutesDueOn } from './committee-rules.js';
import { loadSnapshot, type RelationsSnapshot } from './relations-snapshot.js';

/** The alerts this area raises; the compliance area raises the working-time ones. */
export const COMMITTEE_ALERTS = [
  'committee_missing',
  'committee_meeting_overdue',
  'committee_minutes_late',
  'committee_term_ended',
] as const satisfies readonly ComplianceAlertKind[];

interface AlertDraft {
  kind: (typeof COMMITTEE_ALERTS)[number];
  /** A committee's id, or an establishment's (company or site) for a missing committee. */
  subjectId: string;
  periodStart: string;
  value: number;
  limit: number;
  detail: Record<string, unknown>;
  headline: Localized;
  text: Localized;
  link: string;
  /** Part of the notification's key: another committee going missing is news again. */
  keySuffix?: string;
}

const KIND_NAMES: Record<CommitteeKind, { en: string; bn: string; ar?: string }> = {
  participation: { en: 'participation committee', bn: 'অংশগ্রহণকারী কমিটি' },
  safety: { en: 'safety committee', bn: 'সেইফটি কমিটি' },
  complaint: { en: 'complaint committee', bn: 'অভিযোগ কমিটি' },
  other: { en: 'committee', bn: 'কমিটি' },
};
const bnNumber = (n: number) => new Intl.NumberFormat('bn-BD').format(n);
const keyOf = (a: { kind: string; subjectId: string; periodStart: string }) =>
  `${a.kind}:${a.subjectId}:${a.periodStart}`;

/** What should be open today: committees missing, behind on meetings or minutes, or ended. */
function draftsOf(snapshot: RelationsSnapshot): AlertDraft[] {
  const { today } = snapshot;
  const drafts: AlertDraft[] = [];
  for (const e of snapshot.establishments) {
    const missing = e.requirements.filter((r) => r.required && !r.committee);
    if (missing.length === 0) continue;
    const place = e.location ? `${e.location.name}, ${e.legalEntity.name}` : e.legalEntity.name;
    const names = (language: UserLanguage) =>
      missing.map((r) => KIND_NAMES[r.kind][language]).join(', ');
    const sections = missing.map((r) => `s.${r.rule!.reference.section}`).join(', ');
    drafts.push({
      kind: 'committee_missing',
      subjectId: e.id,
      periodStart: today,
      value: missing.length,
      limit: 0,
      detail: {
        establishment: place,
        legalEntityId: e.legalEntity.id,
        locationId: e.location?.id ?? null,
        missing: missing.map((r) => ({
          kind: r.kind,
          workforce: r.workforce,
          minWorkers: r.minWorkers,
          reference: r.rule!.reference,
        })),
      },
      headline: {
        en: `Committees missing at ${place}`,
        bn: `${place}-এ প্রয়োজনীয় কমিটি নেই`,
      },
      text: {
        en: `The Labour Act requires a ${names('en')} here (${sections}).`,
        bn: `শ্রম আইন অনুযায়ী এখানে ${names('bn')} থাকা বাধ্যতামূলক (${sections})।`,
      },
      link: '/workspace/compliance/committees',
      keySuffix: missing.map((r) => r.kind).join('+'),
    });
  }

  for (const c of snapshot.committees) {
    // A committee replaced by a newer one of its kind is history.
    if (!c.latest || !c.rule) continue;
    const rule = c.rule.value;
    const section = `s.${c.rule.reference.section}`;
    const kind = KIND_NAMES[c.row.kind];
    const name = c.row.name;
    const common = {
      subjectId: c.row.id,
      link: `/workspace/compliance/committees/${c.row.id}`,
    };
    const about = {
      committee: name,
      committeeKind: c.row.kind,
      legalEntityId: c.legalEntity.id,
      locationId: c.location?.id ?? null,
      reference: c.rule.reference,
    };
    const { endsOn, nextMeetingDue: due, lastMeetingOn } = c.summary;
    if (endsOn && endsOn < today) {
      drafts.push({
        ...common,
        kind: 'committee_term_ended',
        periodStart: addDays(endsOn, 1),
        value: daysBetween(endsOn, today),
        limit: 0,
        detail: { ...about, endedOn: endsOn },
        headline: { en: `${name}: term ended`, bn: `${name}: মেয়াদ শেষ` },
        text: {
          en: `The ${kind.en}'s term ended on ${localDate(endsOn).en}; form it again (${section}).`,
          bn: `${kind.bn}-এর মেয়াদ ${localDate(endsOn).bn} তারিখে শেষ হয়েছে; নতুন করে গঠন করুন (${section})।`,
        },
      });
    } else if (due && due < today && rule.meetEveryMonths) {
      const since = lastMeetingOn ?? c.row.formedOn;
      drafts.push({
        ...common,
        kind: 'committee_meeting_overdue',
        periodStart: due,
        value: daysBetween(since, today),
        limit: daysBetween(since, due),
        detail: { ...about, lastMeetingOn, dueOn: due, everyMonths: rule.meetEveryMonths },
        headline: { en: `${name}: meeting overdue`, bn: `${name}: সভা হয়নি` },
        text: {
          en: `A ${kind.en} meets at least every ${rule.meetEveryMonths} months (${section}); a meeting was due by ${localDate(due).en}.`,
          bn: `${kind.bn}-কে অন্তত প্রতি ${bnNumber(rule.meetEveryMonths)} মাসে সভা করতে হয় (${section}); ${localDate(due).bn} তারিখের মধ্যে সভা হওয়ার কথা ছিল।`,
        },
      });
    }
    for (const m of c.meetings) {
      const minutesDue = minutesDueOn(rule, m.heldOn);
      if (!minutesDue || m.minutesSentOn || today <= minutesDue) continue;
      const days = rule.minutesWithinDays!;
      drafts.push({
        ...common,
        kind: 'committee_minutes_late',
        periodStart: m.heldOn,
        value: daysBetween(m.heldOn, today),
        limit: days,
        detail: { ...about, meetingId: m.id, heldOn: m.heldOn, dueOn: minutesDue },
        headline: { en: `${name}: minutes not sent`, bn: `${name}: কার্যবিবরণী পাঠানো হয়নি` },
        text: {
          en: `Minutes of the meeting on ${localDate(m.heldOn).en} go to the Director of Labour within ${days} days (${section}); they were due by ${localDate(minutesDue).en}.`,
          bn: `${localDate(m.heldOn).bn} তারিখের সভার কার্যবিবরণী ${bnNumber(days)} দিনের মধ্যে শ্রম পরিচালকের কাছে পাঠাতে হয় (${section}); শেষ তারিখ ছিল ${localDate(minutesDue).bn}।`,
        },
      });
    }
  }
  return drafts;
}

/**
 * Writes the committee alerts into the shared compliance alerts: one per subject and period,
 * brought up to date while the cause lasts and resolved once it is gone, and tells everyone
 * who handles compliance once per alert. Safe to run any number of times a day.
 */
@Injectable()
export class RelationsAlertsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly notifications: NotificationsService,
  ) {}

  check(today = todayIn()): Promise<RelationsCheckResult> {
    return this.tenantDb.run(async (tx) => {
      const drafts = draftsOf(await loadSnapshot(tx, today));
      const open = await tx
        .select()
        .from(complianceAlerts)
        .where(
          and(
            inArray(complianceAlerts.kind, [...COMMITTEE_ALERTS]),
            ne(complianceAlerts.status, 'resolved'),
          ),
        );
      // A missing committee keeps the day it was first found missing.
      for (const d of drafts.filter((x) => x.kind === 'committee_missing')) {
        d.periodStart =
          open.find((a) => a.kind === d.kind && a.subjectId === d.subjectId)?.periodStart ?? today;
      }
      const recipients = await usersWith(tx, 'compliance.manage');
      let notified = 0;
      for (const d of drafts) {
        const found = { periodEnd: today, value: d.value, limit: d.limit, detail: d.detail };
        await tx
          .insert(complianceAlerts)
          .values({
            tenantId: currentTenantId(),
            kind: d.kind,
            subjectId: d.subjectId,
            employeeId: null,
            periodStart: d.periodStart,
            ...found,
          })
          .onConflictDoUpdate({
            target: [
              complianceAlerts.tenantId,
              complianceAlerts.kind,
              complianceAlerts.subjectId,
              complianceAlerts.periodStart,
            ],
            set: {
              ...found,
              // A cause that came back opens its alert again, unless HR had acknowledged it.
              status: sql`case when ${complianceAlerts.status} <> 'resolved' then ${complianceAlerts.status}
                when ${complianceAlerts.acknowledgedAt} is not null then 'acknowledged' else 'open' end`,
              updatedAt: new Date(),
            },
          });
        notified += await this.notifications.notify(tx, {
          event: 'compliance.alert',
          recipients,
          values: { 'alert.headline': d.headline, 'alert.detail': d.text },
          link: d.link,
          dedupeKey: `compliance.alert:${keyOf(d)}${d.keySuffix ? `:${d.keySuffix}` : ''}`,
          data: { kind: d.kind, subjectId: d.subjectId },
        });
      }
      const wanted = new Set(drafts.map(keyOf));
      const gone = open.filter((a) => !wanted.has(keyOf(a)));
      if (gone.length) {
        await tx
          .update(complianceAlerts)
          .set({ status: 'resolved', updatedAt: new Date() })
          .where(
            inArray(
              complianceAlerts.id,
              gone.map((a) => a.id),
            ),
          );
      }
      return { open: drafts.length, resolved: gone.length, notified };
    });
  }
}
