import { Injectable, NotFoundException } from '@nestjs/common';
import {
  designations,
  employees,
  fireDrills,
  jobAssignments,
  learningCertificates,
  learningCourses,
  learningEnrolments,
  learningRequirements,
  learningSessions,
  legalEntities,
  locations,
  type Tx,
} from '@gp/db';
import {
  todayIn,
  trainingExpiry,
  type FireDrillInput,
  type FireDrillView,
  type LearningAttendanceInput,
  type LearningCourseInput,
  type LearningCoverageQuery,
  type LearningMe,
  type LearningRequirementInput,
  type LearningRequirementView,
  type LearningSessionInput,
  type LearningSessionView,
  type TrainingCertificateView,
  type TrainingAuditSection,
} from '@gp/shared';
import { and, asc, desc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { currentTenantId } from '../../common/request-context.js';
import { badRequest, conflict, forbidden } from '../../common/errors.js';
import { userCan } from '../../common/roles.js';
import { TenantDb } from '../../db/db.module.js';
import { entityScopeOf } from '../access-scopes/entity-scope.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { employeeRef } from '../attendance/attendance-views.js';
import { employeeOfUser, inForceOn } from '../employees/employee.queries.js';
import { PdfService } from '../letters/pdf.service.js';
import { NotificationsService, localDate } from '../notifications/notifications.service.js';
import { trainingCoverage, type CoverageScope } from './coverage.js';
import { trainingCertificateHtml } from './certificate.js';

type Session = typeof learningSessions.$inferSelect;
const missing = () => new NotFoundException('Learning record not found');
interface Viewer {
  user: AuthUser;
  manage: boolean;
  companies: string[] | null;
  employeeId: string | null;
  team: string[];
}
@Injectable()
export class LearningService {
  constructor(
    private readonly db: TenantDb,
    private readonly audit: TenantAuditService,
    private readonly notices: NotificationsService,
    private readonly pdf: PdfService,
  ) {}
  private async viewer(tx: Tx, user: AuthUser): Promise<Viewer> {
    const me = await employeeOfUser(tx, user.id);
    const companies = await entityScopeOf(tx, user.id);
    const team = me
      ? await tx
          .select({ id: jobAssignments.employeeId })
          .from(jobAssignments)
          .where(and(eq(jobAssignments.managerId, me.id), inForceOn(todayIn())))
      : [];
    return {
      user,
      companies,
      employeeId: me?.id ?? null,
      manage: userCan(user, 'learning.manage'),
      team: team.map((p) => p.id).filter((id) => id !== me?.id),
    };
  }
  private inCompany(v: Viewer, id: string) {
    return !v.companies || v.companies.includes(id);
  }
  private manages(v: Viewer, id: string) {
    if (!v.manage || !this.inCompany(v, id)) throw missing();
  }
  private async company(tx: Tx, v: Viewer, id: string, locationId?: string | null) {
    this.manages(v, id);
    const [company] = await tx.select().from(legalEntities).where(eq(legalEntities.id, id));
    if (!company?.isActive) throw missing();
    if (locationId) {
      const [site] = await tx.select().from(locations).where(eq(locations.id, locationId));
      if (!site?.isActive || site.legalEntityId !== id)
        throw badRequest('learning_site', 'Choose a site of this company');
    }
  }
  courses() {
    return this.db.run((tx) =>
      tx.select().from(learningCourses).orderBy(asc(learningCourses.name)),
    );
  }
  async createCourse(user: AuthUser, input: LearningCourseInput) {
    return this.db.run(async (tx) => {
      const [row] = await tx
        .insert(learningCourses)
        .values({ ...input, tenantId: currentTenantId() })
        .returning();
      await this.log(tx, user, 'learning.course.create', 'learning_course', row!.id);
      return row!;
    });
  }
  async archiveCourse(user: AuthUser, id: string, isActive: boolean) {
    return this.db.run(async (tx) => {
      if (await entityScopeOf(tx, user.id))
        throw forbidden(
          'learning_catalog_scope',
          'An unscoped HR administrator manages the shared catalogue',
        );
      const [row] = await tx
        .update(learningCourses)
        .set({ isActive })
        .where(eq(learningCourses.id, id))
        .returning();
      if (!row) throw missing();
      await this.log(tx, user, 'learning.course.archive', 'learning_course', id);
      return row;
    });
  }
  async requirements(user: AuthUser): Promise<LearningRequirementView[]> {
    return this.db.run(async (tx) => {
      const v = await this.viewer(tx, user);
      if (!v.manage) throw forbidden('role_not_allowed', 'Learning management is required');
      return tx
        .select({
          id: learningRequirements.id,
          courseId: learningRequirements.courseId,
          legalEntityId: learningRequirements.legalEntityId,
          designationId: learningRequirements.designationId,
          effectiveFrom: learningRequirements.effectiveFrom,
          effectiveTo: learningRequirements.effectiveTo,
          graceDays: learningRequirements.graceDays,
          course: learningCourses,
          company: { id: legalEntities.id, name: legalEntities.name },
          designation: { id: designations.id, name: designations.name },
        })
        .from(learningRequirements)
        .innerJoin(learningCourses, eq(learningCourses.id, learningRequirements.courseId))
        .innerJoin(legalEntities, eq(legalEntities.id, learningRequirements.legalEntityId))
        .innerJoin(designations, eq(designations.id, learningRequirements.designationId))
        .where(v.companies ? inArray(learningRequirements.legalEntityId, v.companies) : undefined)
        .orderBy(learningRequirements.effectiveFrom);
    });
  }
  async createRequirement(user: AuthUser, input: LearningRequirementInput) {
    return this.db.run(async (tx) => {
      const v = await this.viewer(tx, user);
      await this.company(tx, v, input.legalEntityId);
      // Serialize overlapping policies for this company, including concurrent requests.
      await tx
        .select()
        .from(legalEntities)
        .where(eq(legalEntities.id, input.legalEntityId))
        .for('update');
      const [course] = await tx
        .select()
        .from(learningCourses)
        .where(eq(learningCourses.id, input.courseId));
      const [designation] = await tx
        .select()
        .from(designations)
        .where(eq(designations.id, input.designationId));
      if (!course?.isActive || !designation?.isActive)
        throw badRequest('learning_reference', 'Choose an active course and designation');
      const overlapping = await tx
        .select()
        .from(learningRequirements)
        .where(
          and(
            eq(learningRequirements.legalEntityId, input.legalEntityId),
            eq(learningRequirements.designationId, input.designationId),
            eq(learningRequirements.courseId, input.courseId),
            lte(learningRequirements.effectiveFrom, input.effectiveTo ?? '9999-12-31'),
            or(
              isNull(learningRequirements.effectiveTo),
              gte(learningRequirements.effectiveTo, input.effectiveFrom),
            ),
          ),
        );
      if (overlapping.length)
        throw conflict('learning_policy_overlap', 'A requirement already covers these dates');
      const [row] = await tx
        .insert(learningRequirements)
        .values({ ...input, tenantId: currentTenantId() })
        .returning();
      await this.log(tx, user, 'learning.requirement.create', 'learning_requirement', row!.id);
      return row!;
    });
  }
  retireRequirement(user: AuthUser, id: string, effectiveTo: string, reason: string) {
    return this.db.run(async (tx) => {
      const [row] = await tx
        .select()
        .from(learningRequirements)
        .where(eq(learningRequirements.id, id))
        .for('update');
      if (!row) throw missing();
      this.manages(await this.viewer(tx, user), row.legalEntityId);
      if (effectiveTo < row.effectiveFrom)
        throw badRequest('learning_policy_dates', 'End cannot precede the requirement');
      if (row.effectiveTo)
        throw conflict('learning_policy_fixed', 'This requirement is already ended');
      await tx
        .update(learningRequirements)
        .set({ effectiveTo })
        .where(eq(learningRequirements.id, id));
      await this.log(tx, user, 'learning.requirement.retire', 'learning_requirement', id, reason);
    });
  }
  async coverage(user: AuthUser, query: LearningCoverageQuery, team = false) {
    return this.db.run(async (tx) => {
      const v = await this.viewer(tx, user);
      const on = query.on ?? todayIn();
      if (on > todayIn()) throw badRequest('learning_future', 'Choose today or an earlier date');
      if (query.legalEntityId && !this.inCompany(v, query.legalEntityId)) throw missing();
      const scope: CoverageScope = {
        entityIds: query.legalEntityId ? [query.legalEntityId] : v.companies,
        locationId: query.locationId,
      };
      if (team || !v.manage) scope.employeeIds = team ? v.team : v.employeeId ? [v.employeeId] : [];
      return trainingCoverage(tx, on, scope);
    });
  }
  async createSession(user: AuthUser, input: LearningSessionInput) {
    const id = await this.db.run(async (tx) => {
      const v = await this.viewer(tx, user);
      await this.company(tx, v, input.legalEntityId, input.locationId);
      const [course] = await tx
        .select()
        .from(learningCourses)
        .where(eq(learningCourses.id, input.courseId));
      if (!course?.isActive) throw badRequest('learning_reference', 'Choose an active course');
      const [row] = await tx
        .insert(learningSessions)
        .values({
          ...input,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
          createdBy: user.id,
          tenantId: currentTenantId(),
        })
        .returning();
      await this.log(tx, user, 'learning.session.create', 'learning_session', row!.id);
      return row!.id;
    });
    return this.session(user, id);
  }
  async sessions(user: AuthUser) {
    return this.db.run(async (tx) => {
      const v = await this.viewer(tx, user);
      const rows = await tx
        .select()
        .from(learningSessions)
        .orderBy(desc(learningSessions.startsAt));
      const result: LearningSessionView[] = [];
      for (const row of rows) {
        if (await this.canSeeSession(tx, v, row)) result.push(await this.sessionView(tx, v, row));
      }
      return result;
    });
  }
  session(user: AuthUser, id: string) {
    return this.db.run(async (tx) => {
      const v = await this.viewer(tx, user);
      const row = await this.sessionRow(tx, id);
      if (!(await this.canSeeSession(tx, v, row))) throw missing();
      return this.sessionView(tx, v, row);
    });
  }
  private async sessionRow(tx: Tx, id: string, lock = false) {
    const q = tx.select().from(learningSessions).where(eq(learningSessions.id, id));
    const [s] = lock ? await q.for('update') : await q;
    if (!s) throw missing();
    return s;
  }
  private async job(tx: Tx, id: string, on: string) {
    const [j] = await tx
      .select()
      .from(jobAssignments)
      .where(and(eq(jobAssignments.employeeId, id), inForceOn(on)));
    return j;
  }
  private async canSeeSession(tx: Tx, v: Viewer, s: Session) {
    if (!this.inCompany(v, s.legalEntityId)) return false;
    if (v.manage) return true;
    if (!v.employeeId) return false;
    const [own] = await tx
      .select()
      .from(learningEnrolments)
      .where(
        and(
          eq(learningEnrolments.sessionId, s.id),
          eq(learningEnrolments.employeeId, v.employeeId),
        ),
      );
    return (
      !!own ||
      (s.status === 'planned' &&
        s.startsAt > new Date() &&
        (await this.job(tx, v.employeeId, todayIn()))?.legalEntityId === s.legalEntityId)
    );
  }
  private async sessionView(tx: Tx, v: Viewer, s: Session): Promise<LearningSessionView> {
    const [course] = await tx
      .select()
      .from(learningCourses)
      .where(eq(learningCourses.id, s.courseId));
    const [company] = await tx
      .select({ id: legalEntities.id, name: legalEntities.name })
      .from(legalEntities)
      .where(eq(legalEntities.id, s.legalEntityId));
    const [location] = s.locationId
      ? await tx
          .select({ id: locations.id, name: locations.name })
          .from(locations)
          .where(eq(locations.id, s.locationId))
      : [];
    const enrolments = await tx
      .select({ e: learningEnrolments, person: employees })
      .from(learningEnrolments)
      .innerJoin(employees, eq(employees.id, learningEnrolments.employeeId))
      .where(eq(learningEnrolments.sessionId, s.id))
      .orderBy(employees.employeeCode);
    const certificateIds = enrolments.length
      ? await tx
          .select({ id: learningCertificates.id, enrolmentId: learningCertificates.enrolmentId })
          .from(learningCertificates)
          .where(
            inArray(
              learningCertificates.enrolmentId,
              enrolments.map(({ e }) => e.id),
            ),
          )
      : [];
    const mine = enrolments.find(({ e }) => e.employeeId === v.employeeId)?.e.status ?? null;
    const manage = v.manage && this.inCompany(v, s.legalEntityId);
    const enrolled = enrolments.filter(({ e }) => e.status !== 'cancelled').length;
    const upcoming = s.status === 'planned' && s.startsAt > new Date();
    const ownJob = v.employeeId
      ? await this.job(tx, v.employeeId, todayIn('Asia/Dhaka', s.startsAt))
      : null;
    return {
      ...s,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      course: course!,
      company: company!,
      location: location ?? null,
      enrolled,
      myStatus: mine,
      manage,
      canComplete:
        manage &&
        s.status === 'planned' &&
        s.endsAt <= new Date() &&
        enrolments.some(({ e }) => e.status === 'enrolled'),
      canEnrol:
        upcoming &&
        !!v.employeeId &&
        ownJob?.legalEntityId === s.legalEntityId &&
        course!.isActive &&
        enrolled < s.capacity &&
        (mine === null || mine === 'cancelled'),
      canWithdraw: upcoming && mine === 'enrolled',
      attendance: manage
        ? enrolments.map(({ e, person }) => ({
            employee: employeeRef(person),
            status: e.status,
            certificateId: certificateIds.find((c) => c.enrolmentId === e.id)?.id ?? null,
          }))
        : [],
      note: manage ? s.note : null,
    };
  }
  async enrol(user: AuthUser, id: string, employeeId?: string, employeeCode?: string) {
    await this.db.run(async (tx) => {
      const v = await this.viewer(tx, user);
      const s = await this.sessionRow(tx, id, true);
      if (!this.inCompany(v, s.legalEntityId)) throw missing();
      if (s.status !== 'planned')
        throw conflict('learning_session_fixed', 'This session no longer accepts changes');
      const [byCode] = employeeCode
        ? await tx
            .select({ id: employees.id })
            .from(employees)
            .where(eq(employees.employeeCode, employeeCode))
        : [];
      if (employeeCode && !byCode) throw missing();
      const target = employeeId ?? byCode?.id ?? v.employeeId;
      if (!target) throw badRequest('learning_employee', 'Choose an employee');
      if (target !== v.employeeId) this.manages(v, s.legalEntityId);
      if (!v.manage && s.startsAt <= new Date())
        throw conflict('learning_started', 'Enrolment closes when the session starts');
      const [person] = await tx.select().from(employees).where(eq(employees.id, target));
      const on = todayIn('Asia/Dhaka', s.startsAt);
      const job = await this.job(tx, target, on);
      if (
        !person ||
        person.joinedOn > on ||
        (person.separatedOn && person.separatedOn < on) ||
        job?.legalEntityId !== s.legalEntityId
      ) {
        if (target !== v.employeeId) throw missing();
        throw badRequest(
          'learning_employee_scope',
          'The employee must work for this company on the session date',
        );
      }
      const [course] = await tx
        .select()
        .from(learningCourses)
        .where(eq(learningCourses.id, s.courseId));
      if (!course?.isActive) throw conflict('learning_course_archived', 'This course is archived');
      const all = await tx
        .select()
        .from(learningEnrolments)
        .where(eq(learningEnrolments.sessionId, id));
      const own = all.find((e) => e.employeeId === target);
      if (own && own.status !== 'cancelled')
        throw conflict('learning_already_enrolled', 'Already enrolled');
      if (all.filter((e) => e.status !== 'cancelled').length >= s.capacity)
        throw conflict('learning_capacity', 'This session is full');
      if (own)
        await tx
          .update(learningEnrolments)
          .set({ status: 'enrolled', enrolledBy: user.id })
          .where(eq(learningEnrolments.id, own.id));
      else
        await tx.insert(learningEnrolments).values({
          tenantId: currentTenantId(),
          sessionId: id,
          employeeId: target,
          enrolledBy: user.id,
        });
      await this.log(tx, user, 'learning.enrol', 'learning_session', id);
      await this.notice(tx, target, 'enrolled', s, course.name, course.nameBn);
    });
    return this.session(user, id);
  }
  async withdraw(user: AuthUser, id: string, employeeId?: string) {
    await this.db.run(async (tx) => {
      const v = await this.viewer(tx, user);
      const s = await this.sessionRow(tx, id, true);
      if (!this.inCompany(v, s.legalEntityId)) throw missing();
      if (s.status !== 'planned')
        throw conflict('learning_session_fixed', 'This session no longer accepts changes');
      const target = employeeId ?? v.employeeId;
      if (!target) throw missing();
      if (target !== v.employeeId) this.manages(v, s.legalEntityId);
      if (!v.manage && s.startsAt <= new Date())
        throw conflict('learning_started', 'Withdrawal closes when the session starts');
      const [own] = await tx
        .select()
        .from(learningEnrolments)
        .where(
          and(eq(learningEnrolments.sessionId, id), eq(learningEnrolments.employeeId, target)),
        );
      if (!own || own.status !== 'enrolled') throw missing();
      await tx
        .update(learningEnrolments)
        .set({ status: 'cancelled' })
        .where(eq(learningEnrolments.id, own.id));
      await this.log(tx, user, 'learning.withdraw', 'learning_session', id);
    });
    return this.session(user, id);
  }
  async complete(user: AuthUser, id: string, input: LearningAttendanceInput) {
    await this.db.run(async (tx) => {
      const v = await this.viewer(tx, user);
      const s = await this.sessionRow(tx, id, true);
      this.manages(v, s.legalEntityId);
      if (s.status !== 'planned') throw conflict('learning_session_fixed', 'This session is fixed');
      if (s.endsAt > new Date())
        throw badRequest('learning_future', 'Attendance is recorded only after the session ends');
      const enrolled = await tx
        .select()
        .from(learningEnrolments)
        .where(
          and(eq(learningEnrolments.sessionId, id), eq(learningEnrolments.status, 'enrolled')),
        );
      if (
        !enrolled.length ||
        enrolled.length !== input.attendance.length ||
        enrolled.some((e) => !input.attendance.some((a) => a.employeeId === e.employeeId))
      )
        throw badRequest(
          'learning_attendance',
          'Record attended or absent for every enrolled person',
        );
      const [course] = await tx
        .select()
        .from(learningCourses)
        .where(eq(learningCourses.id, s.courseId));
      const on = todayIn('Asia/Dhaka', s.endsAt);
      for (const e of enrolled) {
        const status = input.attendance.find((a) => a.employeeId === e.employeeId)!.status;
        await tx.update(learningEnrolments).set({ status }).where(eq(learningEnrolments.id, e.id));
        if (status === 'attended') {
          await tx.insert(learningCertificates).values({
            tenantId: currentTenantId(),
            enrolmentId: e.id,
            employeeId: e.employeeId,
            courseId: s.courseId,
            legalEntityId: s.legalEntityId,
            courseName: course!.name,
            courseNameBn: course!.nameBn,
            trainer: s.trainer,
            completedOn: on,
            expiresOn: trainingExpiry(on, course!.validityMonths),
            recordedBy: user.id,
          });
          await this.notice(tx, e.employeeId, 'completed', s, course!.name, course!.nameBn);
        }
      }
      await tx
        .update(learningSessions)
        .set({ status: 'completed', note: input.note })
        .where(eq(learningSessions.id, id));
      await this.log(tx, user, 'learning.session.complete', 'learning_session', id, input.note);
    });
    return this.session(user, id);
  }
  async cancel(user: AuthUser, id: string, reason: string) {
    await this.db.run(async (tx) => {
      const v = await this.viewer(tx, user);
      const s = await this.sessionRow(tx, id, true);
      this.manages(v, s.legalEntityId);
      if (s.status !== 'planned') throw conflict('learning_session_fixed', 'This session is fixed');
      await tx
        .update(learningSessions)
        .set({ status: 'cancelled', note: reason })
        .where(eq(learningSessions.id, id));
      const own = await tx
        .select()
        .from(learningEnrolments)
        .where(
          and(eq(learningEnrolments.sessionId, id), eq(learningEnrolments.status, 'enrolled')),
        );
      await tx
        .update(learningEnrolments)
        .set({ status: 'cancelled' })
        .where(
          and(eq(learningEnrolments.sessionId, id), eq(learningEnrolments.status, 'enrolled')),
        );
      const [course] = await tx
        .select()
        .from(learningCourses)
        .where(eq(learningCourses.id, s.courseId));
      for (const e of own)
        await this.notice(tx, e.employeeId, 'cancelled', s, course!.name, course!.nameBn);
      await this.log(tx, user, 'learning.session.cancel', 'learning_session', id, reason);
    });
    return this.session(user, id);
  }
  private async certificateViews(tx: Tx, ids?: string[]): Promise<TrainingCertificateView[]> {
    if (ids?.length === 0) return [];
    const rows = await tx
      .select({
        c: learningCertificates,
        e: employees,
        company: { id: legalEntities.id, name: legalEntities.name },
      })
      .from(learningCertificates)
      .innerJoin(employees, eq(employees.id, learningCertificates.employeeId))
      .innerJoin(legalEntities, eq(legalEntities.id, learningCertificates.legalEntityId))
      .where(ids ? inArray(learningCertificates.employeeId, ids) : undefined)
      .orderBy(desc(learningCertificates.completedOn));
    return rows.map(({ c, e, company }) => ({
      ...c,
      number: `TR-${c.id.toUpperCase()}`,
      employee: employeeRef(e),
      company,
      revokedAt: c.revokedAt?.toISOString() ?? null,
    }));
  }
  async me(user: AuthUser): Promise<LearningMe> {
    const [sessions, record] = await Promise.all([
      this.sessions(user),
      this.db.run(async (tx) => {
        const v = await this.viewer(tx, user);
        const me = v.employeeId
          ? (await tx.select().from(employees).where(eq(employees.id, v.employeeId)))[0]
          : null;
        return {
          employee: me ? employeeRef(me) : null,
          manage: v.manage,
          manager: v.team.length > 0,
          certificates: await this.certificateViews(tx, v.employeeId ? [v.employeeId] : []),
          requirements: await trainingCoverage(tx, todayIn(), {
            employeeIds: v.employeeId ? [v.employeeId] : [],
          }),
        };
      }),
    ]);
    return { ...record, sessions, asOf: new Date().toISOString() };
  }
  async personRecord(user: AuthUser, id: string) {
    return this.db.run(async (tx) => {
      const v = await this.viewer(tx, user);
      const [person] = await tx.select().from(employees).where(eq(employees.id, id));
      const job = await this.job(tx, id, todayIn());
      if (
        !person ||
        !(
          v.employeeId === id ||
          (v.team.includes(id) && (!job || this.inCompany(v, job.legalEntityId))) ||
          (v.manage && job && this.inCompany(v, job.legalEntityId))
        )
      )
        throw missing();
      const certificates = (await this.certificateViews(tx, [id])).filter(
        (c) => v.employeeId === id || this.inCompany(v, c.company.id),
      );
      return {
        employee: employeeRef(person),
        certificates,
        requirements: await trainingCoverage(tx, todayIn(), {
          employeeIds: [id],
          entityIds: v.companies,
        }),
      };
    });
  }
  async certificate(user: AuthUser, id: string) {
    return this.db.run(async (tx) => {
      const v = await this.viewer(tx, user);
      const [c] = await tx
        .select()
        .from(learningCertificates)
        .where(eq(learningCertificates.id, id));
      if (
        !c ||
        !(
          (v.manage && this.inCompany(v, c.legalEntityId)) ||
          v.employeeId === c.employeeId ||
          (v.team.includes(c.employeeId) && this.inCompany(v, c.legalEntityId))
        )
      )
        throw missing();
      return (await this.certificateViews(tx, [c.employeeId])).find((x) => x.id === id)!;
    });
  }
  async certificateFile(user: AuthUser, id: string, language: 'en' | 'bn') {
    const c = await this.certificate(user, id);
    return {
      bytes: await this.pdf.render(trainingCertificateHtml(c, language)),
      fileName: `training-${id}${language === 'bn' ? '-bn' : ''}.pdf`,
      contentType: 'application/pdf',
    };
  }
  async revoke(user: AuthUser, id: string, reason: string) {
    return this.db.run(async (tx) => {
      const [c] = await tx
        .select()
        .from(learningCertificates)
        .where(eq(learningCertificates.id, id))
        .for('update');
      if (!c) throw missing();
      this.manages(await this.viewer(tx, user), c.legalEntityId);
      if (c.revokedAt) throw conflict('learning_revoked', 'Already revoked');
      await tx
        .update(learningCertificates)
        .set({ revokedAt: new Date(), revokeReason: reason })
        .where(eq(learningCertificates.id, id));
      await this.log(tx, user, 'learning.certificate.revoke', 'learning_certificate', id, reason);
    });
  }
  async drills(user: AuthUser): Promise<FireDrillView[]> {
    return this.db.run(async (tx) => {
      const v = await this.viewer(tx, user);
      if (!v.manage) throw forbidden('role_not_allowed', 'Learning management is required');
      return this.drillViews(tx, v.companies);
    });
  }
  async drillViews(
    tx: Tx,
    companies?: string[] | null,
    from?: string,
    to?: string,
    locationId?: string,
  ): Promise<FireDrillView[]> {
    return (
      await tx
        .select({
          d: fireDrills,
          company: { id: legalEntities.id, name: legalEntities.name },
          location: { id: locations.id, name: locations.name },
        })
        .from(fireDrills)
        .innerJoin(legalEntities, eq(legalEntities.id, fireDrills.legalEntityId))
        .innerJoin(locations, eq(locations.id, fireDrills.locationId))
        .where(
          and(
            companies ? inArray(fireDrills.legalEntityId, companies) : undefined,
            from ? gte(fireDrills.heldOn, from) : undefined,
            to ? lte(fireDrills.heldOn, to) : undefined,
            locationId ? eq(fireDrills.locationId, locationId) : undefined,
          ),
        )
        .orderBy(desc(fireDrills.heldOn))
    ).map(({ d, company, location }) => ({
      ...d,
      company,
      location,
      voidedAt: d.voidedAt?.toISOString() ?? null,
    }));
  }
  async createDrill(user: AuthUser, input: FireDrillInput) {
    return this.db.run(async (tx) => {
      await this.company(tx, await this.viewer(tx, user), input.legalEntityId, input.locationId);
      if (input.heldOn > todayIn())
        throw badRequest('learning_future', 'A drill cannot be recorded before it occurs');
      const [row] = await tx
        .insert(fireDrills)
        .values({ ...input, tenantId: currentTenantId(), recordedBy: user.id })
        .returning();
      await this.log(tx, user, 'learning.drill.create', 'fire_drill', row!.id);
      return row!;
    });
  }
  voidDrill(user: AuthUser, id: string, reason: string) {
    return this.db.run(async (tx) => {
      const [d] = await tx.select().from(fireDrills).where(eq(fireDrills.id, id)).for('update');
      if (!d) throw missing();
      this.manages(await this.viewer(tx, user), d.legalEntityId);
      if (d.voidedAt) throw conflict('learning_voided', 'Already voided');
      await tx
        .update(fireDrills)
        .set({ voidedAt: new Date(), voidReason: reason })
        .where(eq(fireDrills.id, id));
      await this.log(tx, user, 'learning.drill.void', 'fire_drill', id, reason);
    });
  }
  async auditSection(
    tx: Tx,
    from: string,
    to: string,
    scope: CoverageScope,
  ): Promise<TrainingAuditSection> {
    const coverage = await trainingCoverage(tx, to, scope);
    const cs = await tx
      .select({ c: learningCertificates, locationId: learningSessions.locationId })
      .from(learningCertificates)
      .innerJoin(learningEnrolments, eq(learningEnrolments.id, learningCertificates.enrolmentId))
      .innerJoin(learningSessions, eq(learningSessions.id, learningEnrolments.sessionId))
      .where(
        and(
          gte(learningCertificates.completedOn, from),
          lte(learningCertificates.completedOn, to),
          isNull(learningCertificates.revokedAt),
          scope.entityIds
            ? inArray(learningCertificates.legalEntityId, scope.entityIds)
            : undefined,
          scope.locationId ? eq(learningSessions.locationId, scope.locationId) : undefined,
        ),
      );
    return {
      asOf: to,
      required: coverage.length,
      current: coverage.filter((r) => r.state === 'current').length,
      due: coverage.filter((r) => r.state === 'due').length,
      overdue: coverage.filter((r) => r.state === 'overdue').length,
      gaps: coverage.filter((r) => r.state !== 'current'),
      completions: cs.length,
      drills: (await this.drillViews(tx, scope.entityIds, undefined, to, scope.locationId)).filter(
        (d) => !d.voidedAt,
      ),
    };
  }
  private log(
    tx: Tx,
    user: AuthUser,
    action: string,
    entityType: string,
    entityId: string,
    reason?: string,
  ) {
    return this.audit.record(tx, {
      actorUserId: user.id,
      action,
      entityType,
      entityId,
      ...(reason ? { after: { reason } } : {}),
    });
  }
  private notice(
    tx: Tx,
    employeeId: string,
    kind: 'enrolled' | 'completed' | 'cancelled',
    s: Session,
    en: string,
    bn: string,
  ) {
    const title = {
      en: `Training ${kind}: ${en}`,
      bn: `প্রশিক্ষণ ${kind === 'enrolled' ? 'নিবন্ধন' : kind === 'completed' ? 'সম্পন্ন' : 'বাতিল'}: ${bn}`,
    };
    return this.notices.notify(tx, {
      event: 'learning.notice',
      recipients: [{ employeeId }],
      values: {
        'learning.title': title,
        'learning.detail': {
          en: `${en} · ${localDate(todayIn('Asia/Dhaka', s.startsAt)).en} · ${s.venue}`,
          bn: `${bn} · ${localDate(todayIn('Asia/Dhaka', s.startsAt)).bn} · ${s.venue}`,
        },
      },
      link: '/workspace/learning',
      dedupeKey: `learning:${s.id}:${employeeId}:${kind}`,
    });
  }
}
