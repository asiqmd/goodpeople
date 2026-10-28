import { Inject, Injectable } from '@nestjs/common';
import {
  applicationEvents,
  applications,
  candidates,
  interviewPanel,
  interviews,
  jobOpenings,
  tenantUsers,
  type FieldCipher,
  type Tx,
} from '@gp/db';
import {
  APPLICATION_STAGES,
  ENDED_OPENING_STATUSES,
  type ApplicationDetail,
  type ApplicationEventView,
  type PipelineCard,
  type PipelineView,
  type RecruitmentMe,
  type StageMoveInput,
} from '@gp/shared';
import { and, asc, count, eq, gte, inArray, isNull, ne, notInArray, or } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { conflict } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { FIELD_CIPHER, TenantDb } from '../../db/db.module.js';
import type { FileStore } from '../../storage/file-store.js';
import { FILE_STORE } from '../../storage/storage.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import type { EmailMessage } from '../notifications/senders.js';
import { readCv } from '../recruitment/intake.js';
import {
  applicationFor,
  hiringManagerOf,
  interviewsApplication,
  managesOpening,
  movesFrom,
  notFound,
  openingView,
  postTitle,
  viewerOf,
  type ApplicationAccess,
  type CandidateRow,
} from './access.js';
import { ERASED_NAME } from './erasure.js';
import { addEvent, moveStage } from './events.js';
import { interviewViewsFor, InterviewsService } from './interviews.service.js';
import { rejectionMail } from './recruitment-mail.js';
import { RecruitmentMailer } from './recruitment-mailer.service.js';

const cvOf = (c: CandidateRow) =>
  c.cvStorageKey && c.cvFileName && c.cvContentType && c.cvSizeBytes !== null
    ? { fileName: c.cvFileName, contentType: c.cvContentType, sizeBytes: c.cvSizeBytes }
    : null;

/** The mean of every rating given, to one decimal. */
function averageOf(ratings: Record<string, number>[]): number | null {
  const all = ratings.flatMap((r) => Object.values(r));
  if (all.length === 0) return null;
  return Math.round((all.reduce((sum, r) => sum + r, 0) / all.length) * 10) / 10;
}

/**
 * The pipeline: an opening's applications by stage, each application's history, and moving it
 * on. Every move and note is recorded with who made it.
 */
@Injectable()
export class PipelineService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
    private readonly scheduling: InterviewsService,
    private readonly mailer: RecruitmentMailer,
    @Inject(FILE_STORE) private readonly store: FileStore,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
  ) {}

  /**
   * For the navigation: may manage, hires for an opening, and how many interviews need the
   * login: still to come, or over without their scorecard.
   */
  me(user: AuthUser): Promise<RecruitmentMe> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      if (!viewer.employeeId) return { manage: viewer.manage, hiringManager: false, interviews: 0 };
      const [hiring] = await tx
        .select({ id: jobOpenings.id })
        .from(jobOpenings)
        .where(
          and(
            eq(jobOpenings.hiringManagerEmployeeId, viewer.employeeId),
            notInArray(jobOpenings.status, [...ENDED_OPENING_STATUSES, 'rejected']),
          ),
        )
        .limit(1);
      const [upcoming] = await tx
        .select({ n: count() })
        .from(interviewPanel)
        .innerJoin(interviews, eq(interviews.id, interviewPanel.interviewId))
        .where(
          and(
            eq(interviewPanel.employeeId, viewer.employeeId),
            ne(interviews.status, 'cancelled'),
            or(gte(interviews.endsAt, new Date()), isNull(interviewPanel.submittedAt)),
          ),
        );
      return { manage: viewer.manage, hiringManager: !!hiring, interviews: upcoming?.n ?? 0 };
    });
  }

  pipeline(user: AuthUser, openingId: string): Promise<PipelineView> {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const [opening] = await tx.select().from(jobOpenings).where(eq(jobOpenings.id, openingId));
      if (!opening) throw notFound('opening');
      const manage = managesOpening(viewer, opening);
      if (!manage && !hiringManagerOf(viewer, opening)) throw notFound('opening');

      const rows = await tx
        .select({
          application: applications,
          candidate: {
            id: candidates.id,
            fullName: candidates.fullName,
            erasedAt: candidates.erasedAt,
          },
        })
        .from(applications)
        .innerJoin(candidates, eq(candidates.id, applications.candidateId))
        .where(eq(applications.openingId, openingId));
      const ids = rows.map((r) => r.application.id);
      const panels = ids.length
        ? await tx
            .select({
              applicationId: interviews.applicationId,
              interviewId: interviews.id,
              ratings: interviewPanel.ratings,
              submittedAt: interviewPanel.submittedAt,
            })
            .from(interviews)
            .leftJoin(interviewPanel, eq(interviewPanel.interviewId, interviews.id))
            .where(and(inArray(interviews.applicationId, ids), ne(interviews.status, 'cancelled')))
        : [];

      const cards: PipelineCard[] = rows.map(({ application: a, candidate: c }) => {
        const mine = panels.filter((p) => p.applicationId === a.id);
        return {
          id: a.id,
          candidate: {
            id: c.id,
            fullName: c.erasedAt ? ERASED_NAME : c.fullName,
            erased: !!c.erasedAt,
          },
          stage: a.stage,
          source: a.source,
          appliedAt: a.appliedAt.toISOString(),
          stageChangedAt: a.stageChangedAt.toISOString(),
          rejectionReason: a.rejectionReason,
          interviews: new Set(mine.map((p) => p.interviewId)).size,
          averageRating: averageOf(
            mine.flatMap((p) => (p.submittedAt && p.ratings ? [p.ratings] : [])),
          ),
          moves: movesFrom(a.stage, manage),
        };
      });
      return {
        opening: await openingView(tx, opening),
        columns: APPLICATION_STAGES.map((stage) => ({
          stage,
          applications: cards
            .filter((c) => c.stage === stage)
            .toSorted((x, y) => y.stageChangedAt.localeCompare(x.stageChangedAt)),
        })),
        manage,
      };
    });
  }

  application(user: AuthUser, id: string): Promise<ApplicationDetail> {
    return this.tenantDb.run(async (tx) =>
      this.detail(tx, await applicationFor(tx, await viewerOf(tx, user), id)),
    );
  }

  /**
   * Moves an application on, or out as rejected or withdrawn with a reason. Closing it cancels
   * the interviews still to come; a rejected candidate may be told, in their language.
   */
  async move(user: AuthUser, id: string, input: StageMoveInput): Promise<ApplicationDetail> {
    const { detail, mails } = await this.tenantDb.run(async (tx) => {
      const access = await applicationFor(tx, await viewerOf(tx, user), id, { lock: true });
      const { application, candidate, opening } = access;
      if (!movesFrom(application.stage, access.manage).includes(input.stage)) {
        throw conflict(
          'stage_move_not_allowed',
          `An application cannot move from ${application.stage} to ${input.stage}`,
        );
      }
      const closing = input.stage === 'rejected' || input.stage === 'withdrawn';
      await moveStage(tx, application, input.stage, {
        reason: closing ? input.reason : null,
        actorUserId: user.id,
      });
      await this.audit.record(tx, {
        actorUserId: user.id,
        action: 'application.stage',
        entityType: 'application',
        entityId: id,
        before: { stage: application.stage },
        after: { stage: input.stage, reason: closing ? input.reason : null },
      });
      const outbox: EmailMessage[] = closing
        ? await this.scheduling.cancelUpcoming(tx, id, {
            actorUserId: user.id,
            tellCandidate: true,
          })
        : [];
      if (
        input.stage === 'rejected' &&
        input.emailCandidate &&
        candidate.email &&
        !candidate.erasedAt
      ) {
        outbox.push(
          rejectionMail({
            to: candidate.email,
            language: candidate.language,
            name: candidate.fullName,
            title: postTitle(opening, candidate.language),
            workspace: await this.mailer.workspaceName(currentTenantId()),
          }),
        );
        await addEvent(tx, id, 'email', 'rejection', user.id);
      }
      return {
        detail: await this.detail(tx, { ...access, application: await this.row(tx, id) }),
        mails: outbox,
      };
    });
    await this.mailer.send(mails);
    return detail;
  }

  note(user: AuthUser, id: string, note: string): Promise<ApplicationDetail> {
    return this.tenantDb.run(async (tx) => {
      const access = await applicationFor(tx, await viewerOf(tx, user), id);
      await addEvent(tx, id, 'note', note.trim(), user.id);
      return this.detail(tx, access);
    });
  }

  /** The CV, for those who manage the application, hire for it, or interview the candidate. */
  cv(user: AuthUser, id: string) {
    return this.tenantDb.run(async (tx) => {
      const viewer = await viewerOf(tx, user);
      const [row] = await tx
        .select({ opening: jobOpenings, candidate: candidates })
        .from(applications)
        .innerJoin(jobOpenings, eq(jobOpenings.id, applications.openingId))
        .innerJoin(candidates, eq(candidates.id, applications.candidateId))
        .where(eq(applications.id, id));
      if (!row) throw notFound();
      const allowed =
        managesOpening(viewer, row.opening) ||
        hiringManagerOf(viewer, row.opening) ||
        (await interviewsApplication(tx, viewer, id));
      if (!allowed || !cvOf(row.candidate)) throw notFound('CV');
      const c = row.candidate;
      return {
        fileName: c.cvFileName!,
        contentType: c.cvContentType!,
        bytes: await readCv(
          { store: this.store, cipher: this.cipher },
          currentTenantId(),
          c.cvStorageKey!,
        ),
      };
    });
  }

  private async row(tx: Tx, id: string) {
    const [row] = await tx.select().from(applications).where(eq(applications.id, id));
    return row!;
  }

  private async detail(tx: Tx, access: ApplicationAccess): Promise<ApplicationDetail> {
    const { application: a, candidate: c, opening } = access;
    const events = await tx
      .select({ e: applicationEvents, actor: { id: tenantUsers.id, name: tenantUsers.name } })
      .from(applicationEvents)
      .leftJoin(tenantUsers, eq(tenantUsers.id, applicationEvents.actorUserId))
      .where(eq(applicationEvents.applicationId, a.id))
      .orderBy(asc(applicationEvents.createdAt));
    const erased = !!c.erasedAt;
    return {
      id: a.id,
      stage: a.stage,
      stageChangedAt: a.stageChangedAt.toISOString(),
      rejectionReason: a.rejectionReason,
      source: a.source,
      coverNote: a.coverNote,
      appliedAt: a.appliedAt.toISOString(),
      employeeId: a.employeeId,
      candidate: {
        id: c.id,
        fullName: erased ? ERASED_NAME : c.fullName,
        email: c.email,
        phone: c.phone,
        language: c.language,
        talentPool: c.talentPool,
        cv: cvOf(c),
        erased,
      },
      opening: await openingView(tx, opening),
      events: events.map(({ e, actor }): ApplicationEventView => ({
        id: e.id,
        kind: e.kind,
        fromStage: e.fromStage,
        toStage: e.toStage,
        note: e.note,
        actor: actor?.id ? { id: actor.id, name: actor.name } : null,
        createdAt: e.createdAt.toISOString(),
      })),
      interviews: await interviewViewsFor(tx, a.id),
      moves: movesFrom(a.stage, access.manage),
      manage: access.manage,
    };
  }
}
