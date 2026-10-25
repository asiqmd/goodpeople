import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BD_RULES, BD_WAGE_BOARDS, ruleOn } from '@gp/country-packs';
import {
  employeePay,
  payComponents,
  payGroups,
  payrollSettings,
  salaryStructures,
  tenantUsers,
  type Tx,
} from '@gp/db';
import {
  money,
  ROLE_PERMISSIONS,
  TENANT_ROLES,
  todayIn,
  type ApiError,
  type LineProblem,
  type PayComponentInput,
  type PayComponentUpdateInput,
  type PayComponentView,
  type PayGroupInput,
  type PayGroupUpdateInput,
  type PayGroupView,
  type PayrollSettingsInput,
  type PayrollSettingsView,
  type SalaryStructureInput,
  type SalaryStructureUpdateInput,
  type SalaryStructureView,
  type StructurePreview,
  type StructurePreviewInput,
  type WageBoardView,
} from '@gp/shared';
import { and, asc, count, countDistinct, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { badRequest, conflict } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { TenantDb } from '../../db/db.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';
import { balanceProblem, workOutPay, type StructureInfo } from './pay-calc.js';

type ComponentRow = typeof payComponents.$inferSelect;
type StructureRow = typeof salaryStructures.$inferSelect;

/** Amounts a gross-based structure must add up at before it is saved. */
const BALANCE_SAMPLES = ['12500', '33333', '150001'];

const toComponentView = (c: ComponentRow): PayComponentView => ({
  id: c.id,
  code: c.code,
  name: c.name,
  nameBn: c.nameBn,
  kind: c.kind,
  calculation: c.calculation,
  taxTreatment: c.taxTreatment,
  inGross: c.inGross,
  inOvertimeBase: c.inOvertimeBase,
  prorate: c.prorate,
  sortOrder: c.sortOrder,
  isActive: c.isActive,
  isSystem: c.isSystem,
  runFormula: c.runFormula,
});

/** A 400 listing each structure line's problem against its field, for the editor. */
function lineProblems(
  problems: LineProblem[],
  lines: { component: string }[],
): BadRequestException {
  const body: ApiError = {
    statusCode: 400,
    error: 'Bad Request',
    message: problems.map((p) => (p.code ? `${p.code}: ${p.message}` : p.message)).join('; '),
    code: 'structure_invalid',
    issues: problems.map((p) => {
      const index = lines.findIndex((l) => l.component === p.code);
      return { path: index >= 0 ? `lines.${index}.formula` : 'lines', message: p.message };
    }),
  };
  return new BadRequestException(body);
}

/** Components every structure and employee pay record is built from. */
export async function componentsOf(tx: Tx): Promise<ComponentRow[]> {
  return tx.select().from(payComponents).orderBy(asc(payComponents.sortOrder));
}

type SettingsRow = Omit<typeof payrollSettings.$inferSelect, 'tenantId' | 'updatedAt'>;

/** What a workspace without a settings row gets: the table's defaults. */
const DEFAULT_SETTINGS: SettingsRow = {
  makerChecker: true,
  autoTax: true,
  taxArea: 'dhaka_chattogram_city',
  pfEnabled: false,
  pfEmployeeRate: '7.00',
  pfEmployerRate: '7.00',
  pfRecognised: true,
  pfVesting: [
    { afterYears: 0, percent: 0 },
    { afterYears: 3, percent: 100 },
  ],
};

/**
 * Permanent workers today against the law's threshold for a provident fund (the 2025
 * amendment), so the settings page can say when a fund is required.
 */
async function pfRequired(tx: Tx) {
  const today = todayIn();
  const threshold = ruleOn(BD_RULES, 'pf.required_min_permanent_workers', today).value;
  const { rows } = await tx.execute<{ n: number }>(sql`
    select count(*)::int as n from employees e
    where e.status = 'active' and (
      select j.employment_type from job_assignments j
      where j.employee_id = e.id and j.effective_from <= ${today}
      order by j.effective_from desc limit 1
    ) = 'permanent'`);
  const permanentWorkers = Number(rows[0]?.n ?? 0);
  return {
    required: threshold !== null && permanentWorkers >= threshold,
    permanentWorkers,
    threshold,
  };
}

/** The workspace's payroll settings (defaults when it has none yet). */
export async function payrollSettingsOf(tx: Tx): Promise<SettingsRow> {
  const [row] = await tx.select().from(payrollSettings);
  return row ?? DEFAULT_SETTINGS;
}

/**
 * Setting payroll up: components, structures, pay groups, settings, and the country pack's
 * minimum wage tables. A structure that anyone's pay uses keeps its lines, so past pay can
 * always be worked out again; a change means a new structure.
 */
@Injectable()
export class PayrollSetupService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
  ) {}

  // ── Components ─────────────────────────────────────────────────────────────

  components(): Promise<PayComponentView[]> {
    return this.tenantDb.run(async (tx) =>
      (
        await tx
          .select()
          .from(payComponents)
          .orderBy(asc(payComponents.sortOrder), asc(payComponents.code))
      ).map(toComponentView),
    );
  }

  createComponent(actor: AuthUser, input: PayComponentInput): Promise<PayComponentView> {
    return this.tenantDb.run(async (tx) => {
      const [row] = await tx
        .insert(payComponents)
        .values({ ...input, tenantId: currentTenantId() })
        .returning();
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.component.create',
        entityType: 'pay_component',
        entityId: row!.id,
        after: input,
      });
      return toComponentView(row!);
    });
  }

  updateComponent(
    actor: AuthUser,
    id: string,
    input: PayComponentUpdateInput,
  ): Promise<PayComponentView> {
    return this.tenantDb.run(async (tx) => {
      const [before] = await tx.select().from(payComponents).where(eq(payComponents.id, id));
      if (!before) throw new NotFoundException('Component not found');
      if (input.calculation && input.calculation !== before.calculation) {
        const used = (await tx.select().from(salaryStructures)).some((s) =>
          s.lines.some((l) => l.component === before.code),
        );
        if (used) {
          throw conflict(
            'component_in_use',
            `${before.code} is used by a structure, so how it is calculated cannot change`,
          );
        }
      }
      const [row] = await tx
        .update(payComponents)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(payComponents.id, id))
        .returning();
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.component.update',
        entityType: 'pay_component',
        entityId: id,
        before: toComponentView(before),
        after: input,
      });
      return toComponentView(row!);
    });
  }

  // ── Structures ─────────────────────────────────────────────────────────────

  structures(): Promise<SalaryStructureView[]> {
    return this.tenantDb.run(async (tx) => {
      const rows = await tx.select().from(salaryStructures).orderBy(asc(salaryStructures.name));
      const use = await tx
        .select({
          structureId: employeePay.structureId,
          people: countDistinct(employeePay.employeeId),
        })
        .from(employeePay)
        .where(inArray(employeePay.status, ['approved', 'pending']))
        .groupBy(employeePay.structureId);
      return rows.map((s) =>
        this.toStructureView(s, use.find((u) => u.structureId === s.id)?.people ?? 0),
      );
    });
  }

  preview(input: StructurePreviewInput): Promise<StructurePreview> {
    return this.tenantDb.run(async (tx) => {
      const result = workOutPay(
        { basis: input.basis, lines: input.lines, wageBoard: null },
        await componentsOf(tx),
        input.amount,
      );
      return {
        values: Object.fromEntries(result.lines.map((l) => [l.code, l.amount])),
        gross: result.problems.length ? null : result.gross,
        problems: result.problems,
      };
    });
  }

  createStructure(actor: AuthUser, input: SalaryStructureInput): Promise<SalaryStructureView> {
    return this.tenantDb.run(async (tx) => {
      await this.checkStructure(tx, input);
      const [row] = await tx
        .insert(salaryStructures)
        .values({ ...input, wageBoard: input.wageBoard ?? null, tenantId: currentTenantId() })
        .returning();
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.structure.create',
        entityType: 'salary_structure',
        entityId: row!.id,
        after: input,
      });
      return this.toStructureView(row!, 0);
    });
  }

  updateStructure(
    actor: AuthUser,
    id: string,
    input: SalaryStructureUpdateInput,
  ): Promise<SalaryStructureView> {
    return this.tenantDb.run(async (tx) => {
      const [before] = await tx.select().from(salaryStructures).where(eq(salaryStructures.id, id));
      if (!before) throw new NotFoundException('Structure not found');
      const [use] = await tx
        .select({ people: countDistinct(employeePay.employeeId) })
        .from(employeePay)
        .where(
          and(
            eq(employeePay.structureId, id),
            inArray(employeePay.status, ['approved', 'pending']),
          ),
        );
      const changesMath =
        (input.lines && JSON.stringify(input.lines) !== JSON.stringify(before.lines)) ||
        (input.basis && input.basis !== before.basis);
      if (changesMath && (use?.people ?? 0) > 0) {
        throw conflict(
          'structure_in_use',
          'People are paid on this structure, so its lines cannot change. Copy it into a new structure instead.',
        );
      }
      const next = {
        basis: input.basis ?? before.basis,
        lines: input.lines ?? before.lines,
        wageBoard: input.wageBoard === undefined ? before.wageBoard : input.wageBoard,
      };
      await this.checkStructure(tx, next);
      const [row] = await tx
        .update(salaryStructures)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(salaryStructures.id, id))
        .returning();
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.structure.update',
        entityType: 'salary_structure',
        entityId: id,
        before: {
          name: before.name,
          basis: before.basis,
          lines: before.lines,
          wageBoard: before.wageBoard,
        },
        after: input,
      });
      return this.toStructureView(row!, use?.people ?? 0);
    });
  }

  /** Readable lines over known structure components, adding up to the gross. */
  private async checkStructure(
    tx: Tx,
    structure: {
      basis: StructureInfo['basis'];
      lines: StructureInfo['lines'];
      wageBoard?: string | null;
    },
  ) {
    if (structure.wageBoard && !BD_WAGE_BOARDS.some((b) => b.id === structure.wageBoard)) {
      throw badRequest(
        'unknown_wage_board',
        `There is no minimum wage table ${structure.wageBoard}`,
      );
    }
    if (structure.basis === 'basic' && structure.lines.some((l) => l.component === 'BASIC')) {
      throw badRequest(
        'basic_is_input',
        'A basic-based structure takes BASIC as entered; remove its line',
      );
    }
    const components = (await componentsOf(tx)).filter((c) => c.isActive);
    const info = {
      basis: structure.basis,
      lines: structure.lines,
      wageBoard: structure.wageBoard ?? null,
    };
    // A sample amount may make a line negative; that matters only for a real salary.
    const result = workOutPay(info, components, BALANCE_SAMPLES[0]!, {}, { allowNegative: true });
    if (result.problems.length) throw lineProblems(result.problems, structure.lines);
    for (const sample of BALANCE_SAMPLES) {
      const problem = balanceProblem(info, components, sample);
      if (problem) throw badRequest('structure_not_balanced', problem);
    }
  }

  private toStructureView(s: StructureRow, inUse: number): SalaryStructureView {
    return {
      id: s.id,
      code: s.code,
      name: s.name,
      nameBn: s.nameBn,
      basis: s.basis,
      lines: s.lines,
      wageBoard: s.wageBoard,
      isActive: s.isActive,
      isSystem: s.isSystem,
      inUse,
    };
  }

  // ── Pay groups ─────────────────────────────────────────────────────────────

  payGroups(): Promise<PayGroupView[]> {
    return this.tenantDb.run(async (tx) => {
      const rows = await tx.select().from(payGroups).orderBy(asc(payGroups.name));
      const members = await tx
        .select({
          payGroupId: employeePay.payGroupId,
          people: countDistinct(employeePay.employeeId),
        })
        .from(employeePay)
        .where(eq(employeePay.status, 'approved'))
        .groupBy(employeePay.payGroupId);
      return rows.map((g) => ({
        id: g.id,
        code: g.code,
        name: g.name,
        frequency: g.frequency,
        isDefault: g.isDefault,
        isActive: g.isActive,
        members: members.find((m) => m.payGroupId === g.id)?.people ?? 0,
      }));
    });
  }

  async createPayGroup(actor: AuthUser, input: PayGroupInput): Promise<PayGroupView> {
    const id = await this.tenantDb.run(async (tx) => {
      if (input.isDefault) await tx.update(payGroups).set({ isDefault: false });
      const [row] = await tx
        .insert(payGroups)
        .values({ ...input, tenantId: currentTenantId() })
        .returning();
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.pay_group.create',
        entityType: 'pay_group',
        entityId: row!.id,
        after: input,
      });
      return row!.id;
    });
    return (await this.payGroups()).find((g) => g.id === id)!;
  }

  async updatePayGroup(
    actor: AuthUser,
    id: string,
    input: PayGroupUpdateInput,
  ): Promise<PayGroupView> {
    await this.tenantDb.run(async (tx) => {
      const [before] = await tx.select().from(payGroups).where(eq(payGroups.id, id));
      if (!before) throw new NotFoundException('Pay group not found');
      if (input.isDefault)
        await tx.update(payGroups).set({ isDefault: false }).where(ne(payGroups.id, id));
      if (input.isDefault === false && before.isDefault) {
        throw badRequest('default_required', 'Make another group the default instead');
      }
      await tx.update(payGroups).set(input).where(eq(payGroups.id, id));
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.pay_group.update',
        entityType: 'pay_group',
        entityId: id,
        before: { name: before.name, frequency: before.frequency, isDefault: before.isDefault },
        after: input,
      });
    });
    return (await this.payGroups()).find((g) => g.id === id)!;
  }

  // ── Settings and wage tables ───────────────────────────────────────────────

  settings(): Promise<PayrollSettingsView> {
    return this.tenantDb.run(async (tx) => {
      const settings = await payrollSettingsOf(tx);
      const roles = TENANT_ROLES.filter((r) => ROLE_PERMISSIONS[r].includes('payroll.approve'));
      const [approvers] = await tx
        .select({ n: count() })
        .from(tenantUsers)
        .where(and(inArray(tenantUsers.role, roles), isNull(tenantUsers.disabledAt)));
      return {
        makerChecker: settings.makerChecker,
        approvers: approvers?.n ?? 0,
        autoTax: settings.autoTax,
        taxArea: settings.taxArea,
        pfEnabled: settings.pfEnabled,
        pfEmployeeRate: settings.pfEmployeeRate,
        pfEmployerRate: settings.pfEmployerRate,
        pfRecognised: settings.pfRecognised,
        pfVesting: settings.pfVesting,
        pfRequired: await pfRequired(tx),
      };
    });
  }

  async updateSettings(actor: AuthUser, input: PayrollSettingsInput): Promise<PayrollSettingsView> {
    await this.tenantDb.run(async (tx) => {
      const before = await payrollSettingsOf(tx);
      await tx
        .insert(payrollSettings)
        .values({ tenantId: currentTenantId(), ...before, ...input })
        .onConflictDoUpdate({
          target: payrollSettings.tenantId,
          set: { ...input, updatedAt: new Date() },
        });
      await this.audit.record(tx, {
        actorUserId: actor.id,
        action: 'payroll.settings',
        entityType: 'payroll_settings',
        entityId: null,
        before: Object.fromEntries(
          Object.keys(input).map((k) => [k, before[k as keyof SettingsRow]]),
        ),
        after: input,
      });
    });
    return this.settings();
  }

  wageBoards(): WageBoardView[] {
    return BD_WAGE_BOARDS.map((b) => ({
      id: b.id,
      name: b.name,
      sector: b.sector,
      effectiveFrom: b.effectiveFrom,
      reference: b.reference,
      status: b.status,
      note: b.note ?? null,
      grades: b.grades.map((g) => ({
        grade: g.grade,
        name: g.name,
        gross: money(g.gross),
        basic: money(g.basic),
        components: Object.fromEntries(Object.entries(g.components).map(([k, v]) => [k, money(v)])),
      })),
    }));
  }
}
