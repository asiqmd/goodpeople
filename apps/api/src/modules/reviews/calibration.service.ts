import { Injectable } from '@nestjs/common';
import { designations, reviews, tenantUsers } from '@gp/db';
import type {
  CalibrationQuery,
  CalibrationRow,
  CalibrationView,
  EmployeeRef,
  Ref,
} from '@gp/shared';
import { and, eq, inArray, ne } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { TenantDb } from '../../db/db.module.js';
import { entityScope } from '../access-scopes/entity-scope.js';
import { cycleFor, viewerOf } from './access.js';
import { distribution } from './scoring.js';
import { asRating, cycleSummary, employeeRefs, iso, jobsOf, settingsOf } from './views.js';

const byName = <T extends { name: string }>(rows: T[]) =>
  rows.toSorted((a, b) => a.name.localeCompare(b.name));

/** Each one once, by id. */
const unique = <T extends { id: string }>(list: (T | null)[]) => [
  ...new Map(list.flatMap((x) => (x ? [[x.id, x] as const] : []))).values(),
];

/**
 * A cycle's ratings side by side, for HR and the managers of a unit to compare: each person's
 * proposed rating, goal score and recommendations, and how proposed and final ratings spread
 * against the workspace's guide, which is shown and never enforced.
 */
@Injectable()
export class CalibrationService {
  constructor(private readonly tenantDb: TenantDb) {}

  view(user: AuthUser, cycleId: string, query: CalibrationQuery): Promise<CalibrationView> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const { cycle } = await cycleFor(tx, viewer, cycleId);
      // The login's own review is theirs only, as everywhere: someone else settles it.
      const rows = await tx
        .select()
        .from(reviews)
        .where(
          and(
            eq(reviews.cycleId, cycleId),
            await entityScope(tx, user, reviews.employeeId),
            viewer.employeeId ? ne(reviews.employeeId, viewer.employeeId) : undefined,
          ),
        );
      const jobs = await jobsOf(
        tx,
        rows.map((r) => r.employeeId),
      );
      const refs = await employeeRefs(
        tx,
        rows.flatMap((r) => [r.employeeId, r.managerEmployeeId]),
      );
      const { ratingGuide } = await settingsOf(tx);
      const calibrators = rows.flatMap((r) => r.calibratedByUserId ?? []);
      const names = new Map(
        calibrators.length
          ? (
              await tx
                .select({ id: tenantUsers.id, name: tenantUsers.name })
                .from(tenantUsers)
                .where(inArray(tenantUsers.id, [...new Set(calibrators)]))
            ).map((u) => [u.id, u.name])
          : [],
      );

      const promotions = rows.flatMap((r) => r.recommendations?.promotionDesignationId ?? []);
      const designationNames = new Map(
        promotions.length
          ? (
              await tx
                .select({ id: designations.id, name: designations.name })
                .from(designations)
                .where(inArray(designations.id, [...new Set(promotions)]))
            ).map((d) => [d.id, d])
          : [],
      );

      const people = rows.map((r): CalibrationRow => {
        const job = jobs.get(r.employeeId);
        const rec = r.recommendations;
        return {
          reviewId: r.id,
          employee: refs.get(r.employeeId)!,
          legalEntity: job?.legalEntity ?? null,
          orgUnit: job?.orgUnit ?? null,
          designation: job?.designation ?? null,
          manager: r.managerEmployeeId ? (refs.get(r.managerEmployeeId) ?? null) : null,
          status: r.status,
          goalScore: r.goalScore,
          proposedRating: asRating(r.proposedRating),
          finalRating: asRating(r.finalRating),
          recommendations: rec
            ? {
                increment: rec.increment,
                promotion: rec.promotionDesignationId
                  ? (designationNames.get(rec.promotionDesignationId) ?? null)
                  : null,
                plan: rec.plan,
              }
            : null,
          calibrationNote: r.calibrationNote,
          calibratedBy: r.calibratedByUserId ? (names.get(r.calibratedByUserId) ?? null) : null,
          calibratedAt: iso(r.calibratedAt),
        };
      });

      const filters = {
        legalEntities: byName(unique<Ref>(people.map((p) => p.legalEntity))),
        orgUnits: byName(unique<Ref>(people.map((p) => p.orgUnit))),
        managers: unique<EmployeeRef>(people.map((p) => p.manager)).toSorted((a, b) =>
          a.fullName.localeCompare(b.fullName),
        ),
      };
      const shown = people
        .filter(
          (p) =>
            (!query.legalEntityId || p.legalEntity?.id === query.legalEntityId) &&
            (!query.orgUnitId || p.orgUnit?.id === query.orgUnitId) &&
            (!query.managerEmployeeId || p.manager?.id === query.managerEmployeeId),
        )
        .toSorted(
          (a, b) =>
            (a.legalEntity?.name ?? '').localeCompare(b.legalEntity?.name ?? '') ||
            (a.orgUnit?.name ?? '').localeCompare(b.orgUnit?.name ?? '') ||
            (a.manager?.fullName ?? '').localeCompare(b.manager?.fullName ?? '') ||
            a.employee.fullName.localeCompare(b.employee.fullName),
        );

      return {
        cycle: cycleSummary(cycle),
        canChange: cycle.status === 'calibration',
        guide: ratingGuide,
        filters,
        people: shown,
        distribution: {
          proposed: distribution(
            shown.map((p) => p.proposedRating),
            ratingGuide,
          ),
          final: distribution(
            shown.map((p) => p.finalRating),
            ratingGuide,
          ),
        },
        missing: {
          managerReviews: shown.filter((p) => p.status === 'self' || p.status === 'manager').length,
          finalRatings: shown.filter((p) => p.finalRating === null).length,
        },
      };
    });
  }
}
