import { randomBytes } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { employees, hashPassword, scimUsers, tenantUsers, userEntityScopes, type Tx } from '@gp/db';
import type {
  TenantRole,
  UserCreateInput,
  UserUpdateInput,
  WorkspaceUserCreated,
  WorkspaceUserListItem,
  WorkspaceUserView,
} from '@gp/shared';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, forbidden } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { TenantDb } from '../../db/db.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { AuthService } from '../auth/auth.service.js';
import { MfaService } from '../auth/mfa.service.js';

type UserRow = typeof tenantUsers.$inferSelect;

const temporaryPassword = () => randomBytes(12).toString('base64url');
/** Good People support's read-only logins: never listed, edited or reset here. */
const SUPPORT: TenantRole = 'support';

/**
 * Workspace logins, for admins. Some rules keep a workspace from locking itself out: nobody
 * changes their own role or disables themselves, and the last active admin stays an admin.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
    private readonly auth: AuthService,
    private readonly mfa: MfaService,
  ) {}

  list(): Promise<WorkspaceUserListItem[]> {
    return this.tenantDb.run(async (tx) => {
      const rows = await tx
        .select({
          user: tenantUsers,
          employee: {
            id: employees.id,
            employeeCode: employees.employeeCode,
            fullName: employees.fullName,
            fullNameBn: employees.fullNameBn,
          },
        })
        .from(tenantUsers)
        .leftJoin(employees, eq(employees.userId, tenantUsers.id))
        .where(ne(tenantUsers.role, SUPPORT))
        .orderBy(asc(tenantUsers.name));
      const scopes = await tx.select().from(userEntityScopes);
      return rows.map((r) => ({
        ...this.toView(r.user, r.employee),
        legalEntityIds: scopes.filter((s) => s.userId === r.user.id).map((s) => s.legalEntityId),
      }));
    });
  }

  async create(actor: AuthUser, input: UserCreateInput): Promise<WorkspaceUserCreated> {
    const password = input.email ? (input.password ?? temporaryPassword()) : undefined;
    const passwordHash = password ? await hashPassword(password) : null;
    const view = await this.tenantDb.run(async (tx) => {
      const [user] = await tx
        .insert(tenantUsers)
        .values({
          tenantId: currentTenantId(),
          name: input.name,
          email: input.email?.toLowerCase() ?? null,
          phone: input.phone ?? null,
          role: input.role,
          passwordHash,
        })
        .returning();
      if (input.employeeId) await this.link(tx, input.employeeId, user!.id);
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'user.create',
        entityType: 'tenant_user',
        entityId: user!.id,
        after: {
          name: input.name,
          email: input.email ?? null,
          phone: input.phone ?? null,
          role: input.role,
          employeeId: input.employeeId ?? null,
        },
      });
      return this.viewOf(tx, user!.id);
    });
    return { ...view, ...(password && !input.password ? { temporaryPassword: password } : {}) };
  }

  async update(actor: AuthUser, id: string, input: UserUpdateInput): Promise<WorkspaceUserView> {
    const disabling = input.disabled === true;
    const view = await this.tenantDb.run(async (tx) => {
      const before = await this.row(tx, id);
      if (before.emergencyLocal && (disabling || (input.role && input.role !== 'tenant_admin')))
        throw forbidden(
          'protected_emergency',
          'Remove emergency access in Identity settings before changing this administrator',
        );
      const managed = await tx
        .select({ id: scimUsers.id })
        .from(scimUsers)
        .where(eq(scimUsers.userId, id))
        .limit(1);
      if (
        managed.length &&
        ['name', 'email', 'phone'].some((key) => input[key as keyof typeof input] !== undefined)
      )
        throw forbidden(
          'managed_attributes',
          'The identity provider owns this login’s name and contact details',
        );
      if (managed.length && input.role && input.role !== 'employee')
        throw forbidden(
          'managed_login',
          'Provisioned identities use explicit custom grants, not privileged templates',
        );
      if (id === actor.id && input.role && input.role !== before.role) {
        throw forbidden('own_role', 'You cannot change your own role');
      }
      if (id === actor.id && disabling) {
        throw forbidden('own_login', 'You cannot disable your own login');
      }
      const email = input.email === undefined ? before.email : (input.email?.toLowerCase() ?? null);
      const phone = input.phone === undefined ? before.phone : input.phone;
      const role = input.role ?? before.role;
      if (!email && !phone) {
        throw badRequest('contact_required', 'Keep an email address or a mobile number');
      }
      if (!email && role !== 'employee') {
        throw badRequest(
          'email_required',
          'Staff roles sign in with an email address and password',
        );
      }
      const losesAdmin =
        before.role === 'tenant_admin' &&
        !before.disabledAt &&
        (role !== 'tenant_admin' || disabling);
      if (losesAdmin) await this.keepAnAdmin(tx, id);

      const disabledAt =
        input.disabled === undefined
          ? before.disabledAt
          : disabling
            ? (before.disabledAt ?? new Date())
            : null;
      await tx
        .update(tenantUsers)
        .set({
          name: input.name ?? before.name,
          email,
          phone,
          role,
          disabledAt,
          ...(role === 'tenant_admin' ? { scopeMode: 'all' as const } : {}),
        })
        .where(eq(tenantUsers.id, id));
      // A workspace admin sees every company, so a limit set for an earlier role goes.
      if (role === 'tenant_admin') {
        await tx.delete(userEntityScopes).where(eq(userEntityScopes.userId, id));
      }
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'user.update',
        entityType: 'tenant_user',
        entityId: id,
        before: {
          name: before.name,
          email: before.email,
          phone: before.phone,
          role: before.role,
          disabled: !!before.disabledAt,
        },
        after: {
          name: input.name,
          email: input.email,
          phone: input.phone,
          role: input.role,
          disabled: input.disabled,
        },
      });
      return this.viewOf(tx, id);
    });
    // A disabled login is signed out now; a new role applies from the next token refresh.
    if (disabling) await this.auth.revokeAll('tenant', id);
    return view;
  }

  /** A new temporary password to share with the person; their sessions end. */
  async resetPassword(actor: AuthUser, id: string): Promise<{ temporaryPassword: string }> {
    const password = temporaryPassword();
    const passwordHash = await hashPassword(password);
    await this.tenantDb.run(async (tx) => {
      const user = await this.row(tx, id);
      if (!user.email) {
        throw badRequest('no_password', 'This login signs in by SMS code and has no password');
      }
      await tx.update(tenantUsers).set({ passwordHash }).where(eq(tenantUsers.id, id));
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'user.reset_password',
        entityType: 'tenant_user',
        entityId: id,
      });
    });
    await this.auth.revokeAll('tenant', id);
    return { temporaryPassword: password };
  }

  /** For a lost phone: two-step sign-in is turned off and the person sets it up again. */
  async resetMfa(actor: AuthUser, id: string): Promise<WorkspaceUserView> {
    if (id === actor.id) {
      throw forbidden('own_mfa', 'Turn your own two-step sign-in off from your account');
    }
    const user = await this.tenantDb.run((tx) => this.row(tx, id));
    if (user.emergencyLocal)
      throw forbidden('protected_emergency', 'Remove emergency access before resetting MFA');
    await this.mfa.disable({ kind: 'tenant', id, tenantId: user.tenantId });
    await this.auth.revokeAll('tenant', id);
    return this.tenantDb.run(async (tx) => {
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'user.reset_mfa',
        entityType: 'tenant_user',
        entityId: id,
      });
      return this.viewOf(tx, id);
    });
  }

  /** Links a login to an employee who has none. */
  private async link(tx: Tx, employeeId: string, userId: string) {
    const [employee] = await tx
      .select({ id: employees.id, userId: employees.userId })
      .from(employees)
      .where(eq(employees.id, employeeId));
    if (!employee) throw new NotFoundException('Employee not found');
    if (employee.userId) {
      throw badRequest('employee_has_login', 'This employee already has a login');
    }
    await tx.update(employees).set({ userId }).where(eq(employees.id, employeeId));
  }

  private async keepAnAdmin(tx: Tx, leaving: string) {
    const others = await tx
      .select({ id: tenantUsers.id })
      .from(tenantUsers)
      .where(
        and(
          eq(tenantUsers.role, 'tenant_admin' satisfies TenantRole),
          isNull(tenantUsers.disabledAt),
          ne(tenantUsers.id, leaving),
        ),
      )
      .limit(1);
    if (others.length === 0) {
      throw forbidden('last_admin', 'The workspace needs at least one active workspace admin');
    }
  }

  private async row(tx: Tx, id: string): Promise<UserRow> {
    const [user] = await tx
      .select()
      .from(tenantUsers)
      .where(and(eq(tenantUsers.id, id), ne(tenantUsers.role, SUPPORT)));
    if (!user) throw new NotFoundException('Login not found');
    return user;
  }

  private async viewOf(tx: Tx, id: string): Promise<WorkspaceUserView> {
    const [row] = await tx
      .select({
        user: tenantUsers,
        employee: {
          id: employees.id,
          employeeCode: employees.employeeCode,
          fullName: employees.fullName,
          fullNameBn: employees.fullNameBn,
        },
      })
      .from(tenantUsers)
      .leftJoin(employees, eq(employees.userId, tenantUsers.id))
      .where(eq(tenantUsers.id, id));
    return this.toView(row!.user, row!.employee);
  }

  private toView(user: UserRow, employee: WorkspaceUserView['employee']): WorkspaceUserView {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      employee,
      mfaEnabled: !!user.mfaEnabledAt,
      disabled: !!user.disabledAt,
      lastSignInAt: user.lastSignInAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
