import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { productionOperations, type Tx } from '@gp/db';
import {
  operationRateProblem,
  type ApiError,
  type ProductionOperationInput,
  type ProductionOperationUpdateInput,
  type ProductionOperationView,
} from '@gp/shared';
import { and, asc, eq, ne } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { conflict } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { TenantDb } from '../../db/db.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { toOperationView } from './production.queries.js';

type OperationRow = typeof productionOperations.$inferSelect;

/**
 * Sewing, cutting and finishing operations with their rates. Changing a rate changes only
 * entries made after it: entries keep the rates they were entered with.
 */
@Injectable()
export class OperationsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
  ) {}

  list(): Promise<ProductionOperationView[]> {
    return this.tenantDb.run(async (tx) =>
      (
        await tx
          .select()
          .from(productionOperations)
          .orderBy(asc(productionOperations.code), asc(productionOperations.style))
      ).map(toOperationView),
    );
  }

  create(actor: AuthUser, input: ProductionOperationInput): Promise<ProductionOperationView> {
    return this.tenantDb.run(async (tx) => {
      await this.codeIsFree(tx, input.code);
      const [row] = await tx
        .insert(productionOperations)
        .values({
          tenantId: currentTenantId(),
          code: input.code,
          name: input.name,
          ...this.fields(input),
        })
        .returning();
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'production.operation.create',
        entityType: 'production_operation',
        entityId: row!.id,
        after: toOperationView(row!),
      });
      return toOperationView(row!);
    });
  }

  update(
    actor: AuthUser,
    id: string,
    input: ProductionOperationUpdateInput,
  ): Promise<ProductionOperationView> {
    return this.tenantDb.run(async (tx) => {
      const before = await this.rowOf(tx, id);
      if (input.code !== undefined && input.code !== before.code) {
        await this.codeIsFree(tx, input.code, id);
      }
      const problem = operationRateProblem({
        pieceRate: input.pieceRate !== undefined ? input.pieceRate : before.pieceRate,
        dailyTarget: input.dailyTarget !== undefined ? input.dailyTarget : before.dailyTarget,
        incentiveRate:
          input.incentiveRate !== undefined ? input.incentiveRate : before.incentiveRate,
      });
      if (problem) {
        const body: ApiError = {
          statusCode: 400,
          error: 'Bad Request',
          message: problem.message,
          code: 'validation_failed',
          issues: [problem],
        };
        throw new BadRequestException(body);
      }
      const [row] = await tx
        .update(productionOperations)
        .set({ ...this.fields(input), updatedAt: new Date() })
        .where(eq(productionOperations.id, id))
        .returning();
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'production.operation.update',
        entityType: 'production_operation',
        entityId: id,
        before: toOperationView(before),
        after: toOperationView(row!),
      });
      return toOperationView(row!);
    });
  }

  /** Taken out of use (or back into it); entries already made stay and are still paid. */
  setActive(actor: AuthUser, id: string, isActive: boolean): Promise<ProductionOperationView> {
    return this.tenantDb.run(async (tx) => {
      const before = await this.rowOf(tx, id);
      const [row] = await tx
        .update(productionOperations)
        .set({ isActive, updatedAt: new Date() })
        .where(eq(productionOperations.id, id))
        .returning();
      if (before.isActive !== isActive) {
        await this.audit.record(tx, {
          actorUserId: actor.id,
          action: isActive ? 'production.operation.activate' : 'production.operation.deactivate',
          entityType: 'production_operation',
          entityId: id,
          before: { isActive: before.isActive },
          after: { isActive },
        });
      }
      return toOperationView(row!);
    });
  }

  private fields(input: ProductionOperationUpdateInput) {
    const out: Partial<Omit<typeof productionOperations.$inferInsert, 'tenantId'>> = {};
    if (input.code !== undefined) out.code = input.code;
    if (input.name !== undefined) out.name = input.name;
    if (input.nameBn !== undefined) out.nameBn = input.nameBn || null;
    if (input.style !== undefined) out.style = input.style || null;
    if (input.pieceRate !== undefined) out.pieceRate = input.pieceRate;
    if (input.dailyTarget !== undefined) out.dailyTarget = input.dailyTarget;
    if (input.incentiveRate !== undefined) out.incentiveRate = input.incentiveRate;
    return out;
  }

  private async codeIsFree(tx: Tx, code: string, exceptId?: string) {
    const [taken] = await tx
      .select({ id: productionOperations.id })
      .from(productionOperations)
      .where(
        and(
          eq(productionOperations.code, code),
          exceptId ? ne(productionOperations.id, exceptId) : undefined,
        ),
      );
    if (taken) throw conflict('operation_code_taken', `Another operation has the code ${code}`);
  }

  private async rowOf(tx: Tx, id: string): Promise<OperationRow> {
    const [row] = await tx
      .select()
      .from(productionOperations)
      .where(eq(productionOperations.id, id));
    if (!row) throw new NotFoundException('Operation not found');
    return row;
  }
}
