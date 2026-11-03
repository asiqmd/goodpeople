import {
  Inject,
  Injectable,
  ConflictException,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
} from '@nestjs/common';
import {
  runAsTenant,
  companyLegalProfiles,
  payrollRuns,
  payGroups,
  jobAssignments,
  type Database,
} from '@gp/db';
import { eq, desc } from 'drizzle-orm';
import { localParts } from '@gp/shared';
import { DB } from '../../db/db.module.js';
import type { AuthedRequest } from '../../common/auth-user.js';
import { from, switchMap } from 'rxjs';
const statutory =
  /^\/tenant\/(payroll|pay-|payslips|salary-structures|recruitment|offers|leave|attendance|compliance|maternity|production|projects|compensation|letters|letter-templates|id-cards|separations|tax|pf|loans|wppf|timesheets|rmg|group\/(dashboard|policies))/;
const nested =
  /^\/tenant\/(employees\/[^/]+|me)\/(letters|service-book|pay|tax|pf|loans|leave|attendance|settlements)/;
const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9-]{36}$/i.test(value);
@Injectable()
export class InternationalBoundary implements NestInterceptor {
  constructor(@Inject(DB) private db: Database) {}
  intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>(),
      path = req.path;
    if (req.user?.kind !== 'tenant' || (!statutory.test(path) && !nested.test(path)))
      return next.handle();
    return from(
      runAsTenant(this.db, req.user.tenantId, async (tx) => {
        if (req.query.lang === 'ar' || req.query.language === 'ar' || req.body?.language === 'ar')
          throw new ConflictException({
            code: 'arabic_legal_review_required',
            message: 'Arabic statutory documents require language and legal review',
          });
        const profiles = await tx.select().from(companyLegalProfiles),
          runId = /\/runs\/([a-f0-9-]{36})(?:\/|$)/i.exec(path)?.[1];
        const [run] = runId
          ? await tx.select().from(payrollRuns).where(eq(payrollRuns.id, runId))
          : [];
        if (req.method === 'GET' && run?.status === 'locked' && run.currency === 'BDT') return; // Immutable historical BD result, without recalculation.
        const groupId = run?.payGroupId ?? req.body?.payGroupId ?? req.query.payGroupId;
        const [group] = uuid(groupId)
          ? await tx.select().from(payGroups).where(eq(payGroups.id, groupId))
          : [];
        const employeeId =
          /\/employees\/([a-f0-9-]{36})(?:\/|$)/i.exec(path)?.[1] ??
          req.body?.employeeId ??
          req.query.employeeId;
        const jobs = uuid(employeeId)
          ? await tx
              .select()
              .from(jobAssignments)
              .where(eq(jobAssignments.employeeId, employeeId))
              .orderBy(desc(jobAssignments.effectiveFrom))
          : [];
        const supplied =
          run?.periodStart ??
          req.body?.periodStart ??
          req.body?.effectiveFrom ??
          req.body?.onDate ??
          req.body?.date ??
          req.body?.fromOn ??
          req.body?.startDate ??
          req.body?.lastWorkingDay ??
          req.query.date ??
          req.query.from ??
          (String(
            req.body?.year ?? req.body?.taxYear ?? req.body?.forYear ?? req.query.year ?? '',
          ).match(/^\d{4}$/)
            ? String(req.body?.year ?? req.body?.taxYear ?? req.body?.forYear ?? req.query.year) +
              '-01-01'
            : undefined) ??
          (typeof req.body?.month === 'string' ? req.body.month + '-01' : undefined);
        const at = (zone: string) =>
          typeof supplied === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(supplied)
            ? supplied
            : localParts(new Date(), zone).date;
        const employeeCompany = jobs.find((j) => {
          const p = profiles.find((candidate) => candidate.legalEntityId === j.legalEntityId);
          return (
            p &&
            j.effectiveFrom <= at(p.businessTimeZone) &&
            (!j.effectiveTo || j.effectiveTo >= at(p.businessTimeZone))
          );
        })?.legalEntityId;
        const company =
          group?.legalEntityId ??
          employeeCompany ??
          req.body?.legalEntityId ??
          req.query.legalEntityId;
        const relevant = profiles.filter(
          (p) =>
            (!company || p.legalEntityId === company) &&
            p.effectiveFrom <= at(p.businessTimeZone) &&
            (!p.effectiveTo || p.effectiveTo >= at(p.businessTimeZone)),
        );
        if (relevant.some((p) => p.countryCode !== 'BD' || p.calendar !== 'gregorian'))
          throw new ConflictException({
            code: 'explicit_statutory_context_required',
            message:
              'Choose a supported company and pay group. Unreviewed countries and calendars cannot use the BD adapter; locked historical BD results remain available.',
          });
      }),
    ).pipe(switchMap(() => next.handle()));
  }
}
