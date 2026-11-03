import { Inject, Injectable } from '@nestjs/common';
import {
  assetIssues,
  CIPHER_FIELDS,
  companyAssets,
  employees,
  hrRequestMessages,
  hrRequests,
  jobAssignments,
  legalEntities,
  tenantUsers,
  type FieldCipher,
  type Tx,
} from '@gp/db';
import {
  todayIn,
  type AssetInput,
  type AssetIssueInput,
  type AssetIssueView,
  type AssetReturnInput,
  type AssetView,
  type EmployeeServicesMe,
  type HrRequestInput,
  type HrRequestUpdateInput,
  type HrRequestView,
} from '@gp/shared';
import { and, asc, desc, eq, inArray, isNull, type SQL } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, conflict, forbidden } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { FIELD_CIPHER, TenantDb } from '../../db/db.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { employeeRef } from '../attendance/attendance-views.js';
import { inForceOn } from '../employees/employee.queries.js';
import { NotificationsService, type Recipient } from '../notifications/notifications.service.js';
import {
  inServiceCompany,
  managedCompany,
  requireServiceEmployee,
  serviceActor,
  serviceViews,
  serviceHandlers,
  serviceMissing,
  type ServiceActor,
} from './access.js';
type RequestRow = typeof hrRequests.$inferSelect;
type Asset = typeof companyAssets.$inferSelect;
@Injectable()
export class EmployeeServicesService {
  constructor(
    private readonly db: TenantDb,
    private readonly audit: TenantAuditService,
    private readonly notices: NotificationsService,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
  ) {}
  private actor(tx: Tx, user: AuthUser) {
    return serviceActor(tx, user, 'employee_services.manage');
  }
  private seal(value: unknown) {
    return this.cipher.encrypt(JSON.stringify(value), {
      tenantId: currentTenantId(),
      field: CIPHER_FIELDS.hrRequestText,
    });
  }
  private open<T>(value: string): T {
    return JSON.parse(
      this.cipher.decrypt(value, {
        tenantId: currentTenantId(),
        field: CIPHER_FIELDS.hrRequestText,
      }),
    ) as T;
  }
  private log(tx: Tx, user: AuthUser, action: string, id: string, after?: unknown) {
    return this.audit.record(tx, {
      actorUserId: user.id,
      action: `employee_services.${action}`,
      entityType: 'employee_service',
      entityId: id,
      after,
    });
  }
  notify(
    tx: Tx,
    recipients: Recipient[],
    key: string,
    title: { en: string; bn: string },
    link = '/workspace/employee-services',
  ) {
    return this.notices.notify(tx, {
      event: 'services.notice',
      recipients,
      values: {
        'service.title': title,
        'service.detail': {
          en: 'Open Employee services in Good People to see the details.',
          bn: 'বিস্তারিত দেখতে Good People-এর কর্মীসেবা পাতায় যান।',
        },
      },
      link,
      dedupeKey: key,
    });
  }
  async me(user: AuthUser): Promise<EmployeeServicesMe> {
    const [requests, issues, v] = await Promise.all([
      this.requests(user),
      this.myIssues(user),
      this.db.run((tx) => this.actor(tx, user)),
    ]);
    return {
      employee: v.employee ? employeeRef(v.employee) : null,
      manage: v.manage,
      requests,
      issues,
    };
  }
  async createRequest(user: AuthUser, input: HrRequestInput) {
    const id = await this.db.run(async (tx) => {
      const v = await this.actor(tx, user),
        { employee, job } = requireServiceEmployee(v);
      const [row] = await tx
        .insert(hrRequests)
        .values({
          tenantId: currentTenantId(),
          legalEntityId: job.legalEntityId,
          employeeId: employee.id,
          category: input.category,
          priority: input.priority,
          contentEnc: this.seal({ subject: input.subject, body: input.body }),
        })
        .returning();
      await this.log(tx, user, 'request.create', row!.id);
      const handlers = await serviceHandlers(tx, job.legalEntityId);
      await this.notify(
        tx,
        handlers.map((p) => ({ userId: p.id })),
        `hr:request:${row!.id}`,
        { en: 'A new employee HR request is waiting', bn: 'কর্মীর নতুন এইচআর অনুরোধ এসেছে' },
        `/workspace/employee-services/requests/${row!.id}`,
      );
      return row!.id;
    });
    return this.request(user, id);
  }
  private async requestRow(tx: Tx, v: ServiceActor, id: string, lock = false) {
    const query = tx.select().from(hrRequests).where(eq(hrRequests.id, id));
    const [row] = lock ? await query.for('update') : await query;
    if (
      !row ||
      !(v.employee?.id === row.employeeId || (v.manage && inServiceCompany(v, row.legalEntityId)))
    )
      throw serviceMissing();
    return row;
  }
  private async requestView(tx: Tx, v: ServiceActor, r: RequestRow): Promise<HrRequestView> {
    const manage = v.manage && inServiceCompany(v, r.legalEntityId);
    const [person] = await tx.select().from(employees).where(eq(employees.id, r.employeeId));
    const [company] = await tx
      .select({ id: legalEntities.id, name: legalEntities.name })
      .from(legalEntities)
      .where(eq(legalEntities.id, r.legalEntityId));
    const [assignee] = r.assigneeId
      ? await tx
          .select({ id: tenantUsers.id, name: tenantUsers.name })
          .from(tenantUsers)
          .where(eq(tenantUsers.id, r.assigneeId))
      : [];
    const content = this.open<{ subject: string; body: string }>(r.contentEnc);
    const messages = await tx
      .select()
      .from(hrRequestMessages)
      .where(
        and(
          eq(hrRequestMessages.requestId, r.id),
          !manage ? eq(hrRequestMessages.internal, false) : undefined,
        ),
      )
      .orderBy(asc(hrRequestMessages.createdAt), asc(hrRequestMessages.id));
    return {
      id: r.id,
      employee: employeeRef(person!),
      company: company!,
      subject: content.subject,
      category: r.category,
      priority: r.priority,
      status: r.status,
      assignee: assignee ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      manage,
      messages: [
        {
          id: r.id,
          authorName: person!.fullName,
          body: content.body,
          internal: false,
          createdAt: r.createdAt.toISOString(),
        },
        ...messages.map((m) => ({
          id: m.id,
          authorName: m.authorName,
          body: this.open<string>(m.bodyEnc),
          internal: m.internal,
          createdAt: m.createdAt.toISOString(),
        })),
      ],
    };
  }
  requests(user: AuthUser, all = false) {
    return this.db.run(async (tx) => {
      const v = await this.actor(tx, user);
      if (all && !v.manage)
        throw forbidden('role_not_allowed', 'Only HR can read the service queue');
      if (!all && !v.employee) return [];
      const rows = await tx
        .select()
        .from(hrRequests)
        .where(
          all
            ? v.companies
              ? inArray(hrRequests.legalEntityId, v.companies)
              : undefined
            : eq(hrRequests.employeeId, v.employee!.id),
        )
        .orderBy(desc(hrRequests.updatedAt));
      return serviceViews(rows, (r) => this.requestView(tx, v, r));
    });
  }
  request(user: AuthUser, id: string) {
    return this.db.run(async (tx) => {
      const v = await this.actor(tx, user);
      return this.requestView(tx, v, await this.requestRow(tx, v, id));
    });
  }
  handlers(user: AuthUser, id: string) {
    return this.db.run(async (tx) => {
      const v = await this.actor(tx, user),
        r = await this.requestRow(tx, v, id);
      await managedCompany(tx, v, r.legalEntityId);
      return serviceHandlers(tx, r.legalEntityId);
    });
  }
  private async message(tx: Tx, user: AuthUser, id: string, body: string, internal: boolean) {
    const [author] = await tx.select().from(tenantUsers).where(eq(tenantUsers.id, user.id));
    const [message] = await tx
      .insert(hrRequestMessages)
      .values({
        tenantId: currentTenantId(),
        requestId: id,
        authorId: user.id,
        authorName: author!.name,
        bodyEnc: this.seal(body),
        internal,
      })
      .returning();
    return message!.id;
  }
  async reply(user: AuthUser, id: string, input: { body: string; internal: boolean }) {
    await this.db.run(async (tx) => {
      const v = await this.actor(tx, user),
        r = await this.requestRow(tx, v, id, true);
      const hr = v.manage && inServiceCompany(v, r.legalEntityId);
      if (input.internal && !hr) throw forbidden('role_not_allowed', 'Internal notes are for HR');
      if (r.status === 'closed')
        throw conflict('hr_request_closed', 'Reopen the request before replying');
      const messageId = await this.message(tx, user, id, input.body, input.internal);
      if (!input.internal) {
        await tx.update(hrRequests).set({ updatedAt: new Date() }).where(eq(hrRequests.id, id));
        const recipients =
          v.employee?.id === r.employeeId
            ? (await serviceHandlers(tx, r.legalEntityId)).map((p) => ({ userId: p.id }))
            : [{ employeeId: r.employeeId }];
        await this.notify(
          tx,
          recipients,
          `hr:reply:${messageId}`,
          { en: 'An HR request has a new reply', bn: 'এইচআর অনুরোধে নতুন উত্তর এসেছে' },
          `/workspace/employee-services/requests/${id}`,
        );
      }
      await this.log(tx, user, input.internal ? 'request.note' : 'request.reply', id);
    });
    return this.request(user, id);
  }
  async updateRequest(user: AuthUser, id: string, input: HrRequestUpdateInput) {
    await this.db.run(async (tx) => {
      const v = await this.actor(tx, user),
        r = await this.requestRow(tx, v, id, true);
      const hr = v.manage && inServiceCompany(v, r.legalEntityId),
        own = v.employee?.id === r.employeeId;
      if (input.assigneeId !== undefined) {
        if (!hr) throw forbidden('role_not_allowed', 'Only HR assigns requests');
        if (
          input.assigneeId &&
          !(await serviceHandlers(tx, r.legalEntityId)).some((p) => p.id === input.assigneeId)
        )
          throw badRequest('hr_handler', 'Choose an active HR handler of this company');
      }
      if (input.status && input.status !== r.status) {
        const hrMove =
          hr &&
          (input.status === 'in_progress' || input.status === 'resolved') &&
          (r.status === 'open' || r.status === 'in_progress');
        const ownMove =
          own &&
          ((input.status === 'closed' && r.status === 'resolved') ||
            (input.status === 'open' && (r.status === 'resolved' || r.status === 'closed')));
        if (!hrMove && !ownMove)
          throw conflict('hr_request_transition', 'This status change is not available');
      }
      if (r.status === 'closed' && input.status !== 'open')
        throw conflict('hr_request_closed', 'Reopen the request before changing it');
      const messageId = await this.message(tx, user, id, input.reason, false);
      await tx
        .update(hrRequests)
        .set({
          ...(input.status ? { status: input.status } : {}),
          ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
          updatedAt: new Date(),
        })
        .where(eq(hrRequests.id, id));
      await this.log(tx, user, 'request.update', id, {
        status: input.status,
        assigneeId: input.assigneeId,
      });
      const recipients: Recipient[] = own
        ? (await serviceHandlers(tx, r.legalEntityId)).map((p) => ({ userId: p.id }))
        : [{ employeeId: r.employeeId }];
      if (input.assigneeId) recipients.push({ userId: input.assigneeId });
      await this.notify(
        tx,
        recipients,
        `hr:update:${messageId}`,
        { en: 'An HR request was updated', bn: 'এইচআর অনুরোধ হালনাগাদ হয়েছে' },
        `/workspace/employee-services/requests/${id}`,
      );
    });
    return this.request(user, id);
  }
  createAsset(user: AuthUser, input: AssetInput) {
    return this.db.run(async (tx) => {
      const v = await this.actor(tx, user);
      await managedCompany(tx, v, input.legalEntityId);
      const [row] = await tx
        .insert(companyAssets)
        .values({ ...input, tenantId: currentTenantId() })
        .returning();
      await this.log(tx, user, 'asset.create', row!.id);
      return this.assetView(tx, v, row!);
    });
  }
  private async assetRow(tx: Tx, v: ServiceActor, id: string, lock = false) {
    const query = tx.select().from(companyAssets).where(eq(companyAssets.id, id));
    const [row] = lock ? await query.for('update') : await query;
    if (!row) throw serviceMissing();
    await managedCompany(tx, v, row.legalEntityId);
    return row;
  }
  private async issueViews(
    tx: Tx,
    v: ServiceActor,
    where: SQL | undefined,
  ): Promise<AssetIssueView[]> {
    const rows = await tx
      .select({
        issue: assetIssues,
        asset: companyAssets,
        person: employees,
        company: { id: legalEntities.id, name: legalEntities.name },
      })
      .from(assetIssues)
      .innerJoin(companyAssets, eq(companyAssets.id, assetIssues.assetId))
      .innerJoin(employees, eq(employees.id, assetIssues.employeeId))
      .innerJoin(legalEntities, eq(legalEntities.id, companyAssets.legalEntityId))
      .where(where)
      .orderBy(desc(assetIssues.issuedOn), desc(assetIssues.createdAt));
    return rows.map(({ issue: r, asset, person, company }) => ({
      id: r.id,
      asset: {
        id: asset.id,
        tag: asset.tag,
        name: asset.name,
        nameBn: asset.nameBn,
        kind: asset.kind,
        serialNumber: asset.serialNumber,
      },
      employee: employeeRef(person),
      company,
      issuedOn: r.issuedOn,
      dueOn: r.dueOn,
      issueCondition: r.issueCondition,
      returnedOn: r.returnedOn,
      returnCondition: r.returnCondition,
      acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null,
      overdue: !r.returnedOn && !!r.dueOn && r.dueOn < todayIn(),
      canAcknowledge:
        r.employeeId === v.employee?.id && !!v.job && !r.acknowledgedAt && !r.returnedOn,
    }));
  }
  private async assetView(tx: Tx, v: ServiceActor, a: Asset): Promise<AssetView> {
    const [company] = await tx
      .select({ id: legalEntities.id, name: legalEntities.name })
      .from(legalEntities)
      .where(eq(legalEntities.id, a.legalEntityId));
    return {
      id: a.id,
      legalEntityId: a.legalEntityId,
      company: company!,
      tag: a.tag,
      name: a.name,
      nameBn: a.nameBn,
      kind: a.kind,
      serialNumber: a.serialNumber,
      retiredAt: a.retiredAt?.toISOString() ?? null,
      issues: await this.issueViews(tx, v, eq(assetIssues.assetId, a.id)),
    };
  }
  assets(user: AuthUser, companyId?: string) {
    return this.db.run(async (tx) => {
      const v = await this.actor(tx, user);
      if (!v.manage) throw forbidden('role_not_allowed', 'Only HR can read company inventory');
      if (companyId && !inServiceCompany(v, companyId)) throw serviceMissing();
      const companies = companyId ? [companyId] : v.companies;
      const rows = await tx
        .select()
        .from(companyAssets)
        .where(companies ? inArray(companyAssets.legalEntityId, companies) : undefined)
        .orderBy(asc(companyAssets.tag));
      return serviceViews(rows, (a) => this.assetView(tx, v, a));
    });
  }
  asset(user: AuthUser, id: string) {
    return this.db.run(async (tx) => {
      const v = await this.actor(tx, user);
      return this.assetView(tx, v, await this.assetRow(tx, v, id));
    });
  }
  myIssues(user: AuthUser) {
    return this.db.run(async (tx) => {
      const v = await this.actor(tx, user);
      return v.employee ? this.issueViews(tx, v, eq(assetIssues.employeeId, v.employee.id)) : [];
    });
  }
  async issueAsset(user: AuthUser, id: string, input: AssetIssueInput) {
    await this.db.run(async (tx) => {
      const v = await this.actor(tx, user),
        a = await this.assetRow(tx, v, id, true);
      if (a.retiredAt) throw conflict('asset_retired', 'This asset is retired');
      if (input.issuedOn > todayIn())
        throw badRequest('asset_dates', 'An issue cannot be future dated');
      const history = await tx.select().from(assetIssues).where(eq(assetIssues.assetId, id));
      if (history.some((r) => !r.returnedOn))
        throw conflict('asset_issued', 'This asset is already issued');
      if (history.some((r) => r.returnedOn! > input.issuedOn))
        throw badRequest('asset_dates', 'Issue must follow the previous return');
      const [person] = await tx
        .select()
        .from(employees)
        .where(eq(employees.employeeCode, input.employeeCode));
      const [job] = person
        ? await tx
            .select()
            .from(jobAssignments)
            .where(and(eq(jobAssignments.employeeId, person.id), inForceOn(input.issuedOn)))
        : [];
      if (
        !person ||
        person.joinedOn > input.issuedOn ||
        (person.separatedOn && person.separatedOn < input.issuedOn) ||
        job?.legalEntityId !== a.legalEntityId
      )
        throw badRequest(
          'asset_employee_scope',
          'The employee must work for this company on the issue date',
        );
      const [row] = await tx
        .insert(assetIssues)
        .values({
          tenantId: currentTenantId(),
          assetId: id,
          employeeId: person.id,
          issuedOn: input.issuedOn,
          dueOn: input.dueOn,
          issueCondition: input.condition,
        })
        .returning();
      await this.log(tx, user, 'asset.issue', row!.id, { assetId: id, employeeId: person.id });
      await this.notify(
        tx,
        [{ employeeId: person.id }],
        `asset:issue:${row!.id}`,
        {
          en: 'An asset has been issued to you',
          bn: 'আপনাকে একটি সম্পদ দেওয়া হয়েছে',
        },
        '/workspace/employee-services/assets',
      );
    });
    return this.asset(user, id);
  }
  async returnAsset(user: AuthUser, id: string, input: AssetReturnInput) {
    const assetId = await this.db.run(async (tx) => {
      const v = await this.actor(tx, user),
        [r] = await tx.select().from(assetIssues).where(eq(assetIssues.id, id));
      if (!r) throw serviceMissing();
      await this.assetRow(tx, v, r.assetId, true);
      const [current] = await tx.select().from(assetIssues).where(eq(assetIssues.id, id));
      if (current!.returnedOn) throw conflict('asset_returned', 'This issue is already returned');
      if (input.returnedOn < current!.issuedOn || input.returnedOn > todayIn())
        throw badRequest('asset_dates', 'Return must be between issue and today');
      await tx
        .update(assetIssues)
        .set({ returnedOn: input.returnedOn, returnCondition: input.condition })
        .where(eq(assetIssues.id, id));
      await this.log(tx, user, 'asset.return', id);
      await this.notify(
        tx,
        [{ employeeId: r.employeeId }],
        `asset:return:${id}`,
        {
          en: 'Your issued asset was recorded as returned',
          bn: 'আপনার নেওয়া সম্পদ ফেরত হিসেবে নথিভুক্ত হয়েছে',
        },
        '/workspace/employee-services/assets',
      );
      return r.assetId;
    });
    return this.asset(user, assetId);
  }
  async acknowledgeIssue(user: AuthUser, id: string) {
    await this.db.run(async (tx) => {
      const v = await this.actor(tx, user),
        { employee } = requireServiceEmployee(v);
      const [r] = await tx
        .select()
        .from(assetIssues)
        .where(and(eq(assetIssues.id, id), eq(assetIssues.employeeId, employee.id)));
      if (!r) throw serviceMissing();
      await tx.select().from(companyAssets).where(eq(companyAssets.id, r.assetId)).for('update');
      const [current] = await tx.select().from(assetIssues).where(eq(assetIssues.id, id));
      if (current!.acknowledgedAt) return;
      if (current!.returnedOn)
        throw conflict('asset_returned', 'A returned issue cannot be acknowledged');
      await tx
        .update(assetIssues)
        .set({ acknowledgedAt: new Date() })
        .where(eq(assetIssues.id, id));
      await this.log(tx, user, 'asset.acknowledge', id);
    });
    return this.myIssues(user);
  }
  async retireAsset(user: AuthUser, id: string, reason: string) {
    await this.db.run(async (tx) => {
      const v = await this.actor(tx, user),
        a = await this.assetRow(tx, v, id, true);
      if (a.retiredAt) throw conflict('asset_retired', 'Already retired');
      if (
        (
          await tx
            .select()
            .from(assetIssues)
            .where(and(eq(assetIssues.assetId, id), isNull(assetIssues.returnedOn)))
        ).length
      )
        throw conflict('asset_issued', 'Record the outstanding return first');
      await tx
        .update(companyAssets)
        .set({ retiredAt: new Date(), retireReason: reason })
        .where(eq(companyAssets.id, id));
      await this.log(tx, user, 'asset.retire', id, { reason });
    });
    return this.asset(user, id);
  }
}
