import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { documents, employees, jobAssignments, separations } from '@gp/db';
import { bdProbationEnd, bdProbationLatestEnd, bdRetirementDate } from '@gp/country-packs';
import {
  addDays,
  todayIn,
  type ApiError,
  type LifecycleOverview,
  type ProbationExtensionInput,
  type ProbationItem,
} from '@gp/shared';
import { and, eq, inArray, lte } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { TenantDb } from '../../db/db.module.js';
import { mustChangeEmployee } from '../access-scopes/employee-scope.js';
import { entityScope } from '../access-scopes/entity-scope.js';
import { employeeRef } from '../attendance/attendance-views.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { DocumentsService } from '../documents/documents.service.js';
import { inForceOn } from '../employees/employee.queries.js';
import { SeparationsService } from './separations.service.js';

/** Staff do clerical work in the Act's sense; workers' probation is the shorter one. */
const categoryOf = (workerCategory: string) => (workerCategory === 'staff' ? 'clerical' : 'other');

/**
 * What needs HR's attention in people's employment: probation ending, separations, people
 * reaching retirement age and documents expiring.
 */
@Injectable()
export class LifecycleService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly leaving: SeparationsService,
    private readonly vault: DocumentsService,
    private readonly audit: TenantAuditService,
  ) {}

  /** For the companies the user looks after. */
  overview(user: AuthUser): Promise<LifecycleOverview> {
    return this.tenantDb.run(async (tx) => {
      const today = todayIn();
      // Every query below reads from or joins employees, so one condition limits them all.
      const scope = await entityScope(tx, user, employees.id);
      const people = await tx
        .select({ e: employees, job: jobAssignments })
        .from(employees)
        .leftJoin(
          jobAssignments,
          and(eq(jobAssignments.employeeId, employees.id), inForceOn(today)),
        )
        .where(and(eq(employees.status, 'active'), scope));
      const probations: ProbationItem[] = [];
      for (const { e, job } of people) {
        if (e.confirmedOn || job?.employmentType !== 'probationer') continue;
        const category = categoryOf(job.workerCategory);
        const endsOn = e.probationEndsOn ?? bdProbationEnd(e.joinedOn, category);
        if (endsOn > addDays(today, 30)) continue;
        probations.push({
          employee: employeeRef(e),
          employmentType: job.employmentType,
          joinedOn: e.joinedOn,
          probationEndsOn: endsOn,
          latestEnd: bdProbationLatestEnd(e.joinedOn, category, true),
          deemedPermanent: endsOn < today,
        });
      }
      const retirements = people
        .map(({ e }) => ({
          employee: employeeRef(e),
          dateOfBirth: e.dateOfBirth,
          retiresOn: bdRetirementDate(e.dateOfBirth),
        }))
        .filter((r) => r.retiresOn <= addDays(today, 180))
        .toSorted((a, b) => a.retiresOn.localeCompare(b.retiresOn));
      const open = await this.leaving.load(
        tx,
        and(inArray(separations.status, ['pending', 'approved']), scope),
      );
      return {
        probations: probations.toSorted((a, b) =>
          a.probationEndsOn.localeCompare(b.probationEndsOn),
        ),
        separations: open.toSorted((a, b) => a.lastWorkingDay.localeCompare(b.lastWorkingDay)),
        retirements,
        expiringDocuments: (
          await this.vault.load(tx, and(lte(documents.expiresOn, addDays(today, 60)), scope))
        ).toSorted((a, b) => (a.expiresOn ?? '').localeCompare(b.expiresOn ?? '')),
      };
    });
  }

  /**
   * Extends probation, as far as the Act allows: the statutory period plus three months for a
   * skilled worker whose work could not be judged in time (s.4).
   */
  extendProbation(actor: AuthUser, employeeId: string, input: ProbationExtensionInput) {
    return this.tenantDb.run(async (tx) => {
      await mustChangeEmployee(tx, actor, employeeId);
      const today = todayIn();
      const [row] = await tx
        .select({ e: employees, job: jobAssignments })
        .from(employees)
        .leftJoin(
          jobAssignments,
          and(eq(jobAssignments.employeeId, employees.id), inForceOn(today)),
        )
        .where(eq(employees.id, employeeId));
      if (!row) throw new NotFoundException('Employee not found');
      const { e, job } = row;
      if (e.confirmedOn || job?.employmentType !== 'probationer') {
        throw new BadRequestException('Only a probationer’s probation can be extended');
      }
      const category = categoryOf(job.workerCategory);
      const current = e.probationEndsOn ?? bdProbationEnd(e.joinedOn, category);
      if (input.until <= current) {
        throw new BadRequestException(`Probation already runs until ${current}`);
      }
      const latest = bdProbationLatestEnd(e.joinedOn, category, true);
      if (input.until > latest) {
        const body: ApiError = {
          statusCode: 400,
          error: 'Bad Request',
          message: `Probation can run until ${latest} at most (Bangladesh Labour Act 2006, s.4)`,
          code: 'statutory_limit',
        };
        throw new BadRequestException(body);
      }
      await tx
        .update(employees)
        .set({ probationEndsOn: input.until, updatedAt: new Date() })
        .where(eq(employees.id, employeeId));
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'employee.probation.extend',
        entityType: 'employee',
        entityId: employeeId,
        before: { probationEndsOn: current },
        after: input,
      });
      return { probationEndsOn: input.until, latestEnd: latest };
    });
  }
}
