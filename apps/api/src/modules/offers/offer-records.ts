import { createHash } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import {
  applicationEvents,
  applications,
  candidates,
  designations,
  grades,
  jobOpenings,
  legalEntities,
  locations,
  offers,
  orgUnits,
  tenantUsers,
  userEntityScopes,
  type Tx,
} from '@gp/db';
import type { OfferStatus, OfferView } from '@gp/shared';
import { and, desc, eq, inArray, type SQL } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { entityScopeOf } from '../access-scopes/entity-scope.js';
import { loadSteps } from '../approvals/approval-views.js';
import {
  usersWith,
  type Localized,
  type NotificationsService,
  type Recipient,
} from '../notifications/notifications.service.js';

// Reading offers with what they are about (the candidate, the opening, the job), the company
// limits on them, and what every change of an offer leaves behind (an event, a notification).

export type OfferRow = typeof offers.$inferSelect;

export const NOT_FOUND = 'Offer not found';

/** The candidate's link carries a random token; only its SHA-256 is kept. */
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export const offerRef = (id: string) => `OFFER-${id.slice(0, 8).toUpperCase()}`;

/**
 * A login limited to some companies sees only the offers of those companies' openings (Phase
 * 3 M4); undefined when it sees every company.
 */
export async function openingScope(tx: Tx, user: AuthUser): Promise<SQL | undefined> {
  if (user.kind !== 'tenant') return undefined;
  const entities = await entityScopeOf(tx, user.id);
  return entities ? inArray(jobOpenings.legalEntityId, entities) : undefined;
}

/** The offer with its application, candidate and opening, or "not found" outside the scope. */
export async function offerContext(tx: Tx, where: SQL, options: { lock?: boolean } = {}) {
  const query = tx
    .select({
      offer: offers,
      application: applications,
      candidate: candidates,
      opening: jobOpenings,
    })
    .from(offers)
    .innerJoin(applications, eq(applications.id, offers.applicationId))
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .innerJoin(jobOpenings, eq(jobOpenings.id, applications.openingId))
    .where(where);
  const [row] = options.lock ? await query.for('update', { of: offers }) : await query;
  if (!row) throw new NotFoundException(NOT_FOUND);
  return row;
}
export type OfferContext = Awaited<ReturnType<typeof offerContext>>;

export const isAboveBudget = (monthlyGross: string, budgetMax: string | null) =>
  budgetMax !== null && Number(monthlyGross) > Number(budgetMax);

const name = (ref: { id: string | null; name: string | null; nameBn?: string | null } | null) =>
  ref?.id ? { id: ref.id, name: ref.name!, nameBn: ref.nameBn ?? null } : null;

/** Offers as HR sees them, newest first, with their approval steps. */
export async function offerViews(tx: Tx, where: SQL | undefined): Promise<OfferView[]> {
  const rows = await tx
    .select({
      offer: offers,
      application: { id: applications.id, employeeId: applications.employeeId },
      candidate: {
        id: candidates.id,
        fullName: candidates.fullName,
        email: candidates.email,
        phone: candidates.phone,
        language: candidates.language,
      },
      opening: {
        id: jobOpenings.id,
        title: jobOpenings.title,
        status: jobOpenings.status,
        headcount: jobOpenings.headcount,
        budgetMin: jobOpenings.budgetMin,
        budgetMax: jobOpenings.budgetMax,
      },
      entity: { id: legalEntities.id, name: legalEntities.name },
      unit: { id: orgUnits.id, name: orgUnits.name, nameBn: orgUnits.nameBn },
      location: { id: locations.id, name: locations.name },
      designation: { id: designations.id, name: designations.name, nameBn: designations.nameBn },
      grade: { id: grades.id, name: grades.name },
      createdBy: tenantUsers.name,
    })
    .from(offers)
    .innerJoin(applications, eq(applications.id, offers.applicationId))
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .innerJoin(jobOpenings, eq(jobOpenings.id, applications.openingId))
    .innerJoin(legalEntities, eq(legalEntities.id, offers.legalEntityId))
    .leftJoin(orgUnits, eq(orgUnits.id, offers.orgUnitId))
    .leftJoin(locations, eq(locations.id, offers.locationId))
    .leftJoin(designations, eq(designations.id, offers.designationId))
    .leftJoin(grades, eq(grades.id, offers.gradeId))
    .leftJoin(tenantUsers, eq(tenantUsers.id, offers.createdByUserId))
    .where(where)
    .orderBy(desc(offers.createdAt));
  const steps = await loadSteps(
    tx,
    'offer',
    rows.map((r) => r.offer.id),
  );
  return rows.map(({ offer: o, application, candidate, opening, entity, ...r }) => ({
    id: o.id,
    applicationId: application.id,
    status: o.status,
    candidate,
    opening,
    legalEntity: { ...entity, nameBn: null },
    orgUnit: name(r.unit),
    location: name(r.location),
    designation: name(r.designation),
    grade: name(r.grade),
    employmentType: o.employmentType,
    joiningOn: o.joiningOn,
    monthlyGross: o.monthlyGross,
    probationMonths: o.probationMonths,
    expiresOn: o.expiresOn,
    language: o.language,
    terms: o.terms,
    aboveBudget: isAboveBudget(o.monthlyGross, opening.budgetMax),
    sentAt: o.sentAt?.toISOString() ?? null,
    decidedAt: o.decidedAt?.toISOString() ?? null,
    acceptedName: o.acceptedName,
    acceptedIp: o.acceptedIp,
    declineReason: o.declineReason,
    letterSha256: o.letterSha256,
    employeeId: application.employeeId,
    createdBy: r.createdBy,
    createdAt: o.createdAt.toISOString(),
    steps: steps.get(o.id) ?? [],
  }));
}

/**
 * Records what happened to an offer on its application's timeline. The note is the offer's
 * new status, which the pipeline translates.
 */
export function offerEvent(
  tx: Tx,
  offer: { tenantId: string; applicationId: string },
  status: OfferStatus,
  actorUserId: string | null,
) {
  return tx.insert(applicationEvents).values({
    tenantId: offer.tenantId,
    applicationId: offer.applicationId,
    kind: 'offer',
    note: status,
    actorUserId,
  });
}

/** Logins with recruitment.manage who look after the company, and the hiring manager. */
export async function offerRecipients(
  tx: Tx,
  opening: { legalEntityId: string; hiringManagerEmployeeId: string | null },
): Promise<Recipient[]> {
  const managers = await usersWith(tx, 'recruitment.manage');
  const ids = managers.flatMap((m) => m.userId ?? []);
  const scopes = ids.length
    ? await tx
        .select({ userId: userEntityScopes.userId, entityId: userEntityScopes.legalEntityId })
        .from(userEntityScopes)
        .where(inArray(userEntityScopes.userId, ids))
    : [];
  const limited = new Map<string, string[]>();
  for (const s of scopes) limited.set(s.userId, [...(limited.get(s.userId) ?? []), s.entityId]);
  const recipients: Recipient[] = managers.filter((m) => {
    const companies = limited.get(m.userId!);
    return !companies || companies.includes(opening.legalEntityId);
  });
  if (opening.hiringManagerEmployeeId) {
    recipients.push({ employeeId: opening.hiringManagerEmployeeId });
  }
  return recipients;
}

const OUTCOMES: Record<'accepted' | 'declined', Record<'en' | 'bn', string>> = {
  accepted: { en: 'accepted', bn: 'গ্রহণ করেছেন' },
  declined: { en: 'declined', bn: 'ফিরিয়ে দিয়েছেন' },
};

/** Tells HR and the hiring manager how the candidate answered. */
export async function noticeOutcome(
  tx: Tx,
  notifications: NotificationsService,
  ctx: OfferContext,
  outcome: 'accepted' | 'declined',
  note: Localized,
) {
  await notifications.notify(tx, {
    event: 'recruitment.offer',
    recipients: await offerRecipients(tx, ctx.opening),
    values: {
      'candidate.name': ctx.candidate.fullName,
      'opening.title': ctx.opening.title,
      'offer.outcome': OUTCOMES[outcome],
      'offer.note': note,
    },
    link: `/workspace/recruitment/applications/${ctx.application.id}`,
    dedupeKey: `recruitment.offer:${ctx.offer.id}:${outcome}`,
    data: { offerId: ctx.offer.id, applicationId: ctx.application.id, outcome },
  });
}

/** The job's title on the letter: the designation, else the post's title, else the opening's. */
export async function positionOf(tx: Tx, ctx: OfferContext): Promise<Record<'en' | 'bn', string>> {
  const [designation] = ctx.offer.designationId
    ? await tx
        .select({ name: designations.name, nameBn: designations.nameBn })
        .from(designations)
        .where(eq(designations.id, ctx.offer.designationId))
    : [];
  const en = designation?.name ?? ctx.opening.postTitleEn ?? ctx.opening.title;
  return { en, bn: designation?.nameBn ?? ctx.opening.postTitleBn ?? en };
}

/** Whether the opening behind an offer is one the user may see. */
export async function visibleWhere(tx: Tx, user: AuthUser, where: SQL): Promise<SQL> {
  return and(where, await openingScope(tx, user))!;
}
