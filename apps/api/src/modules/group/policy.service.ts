import { Injectable, NotFoundException } from '@nestjs/common';
import {
  complianceSettings,
  entityPolicyOverrides,
  jobAssignments,
  leaveTypes,
  type Tx,
} from '@gp/db';
import {
  effectivePolicy,
  groupBy,
  POLICY_FIELDS,
  type IsoDate,
  type PolicyArea,
  type PolicyOverride,
  type PolicyValues,
} from '@gp/shared';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { settingsOf as attendanceSettingsOf } from '../attendance/processor.service.js';
import type { LeaveTypeRow } from '../leave/balances.service.js';
import { payrollSettingsOf } from '../payroll/payroll-setup.service.js';
import { companyOn } from './figures.js';

// Read here rather than through the compliance check's own settingsOf: the check reads its
// policy through this service, and importing it back would make the two depend on each other.
/** The overtime caps a workspace has until HR saves its own, as the compliance check uses. */
const DEFAULT_OVERTIME_CAPS: PolicyValues['overtime_caps'] = {
  overtimeDailyCapMinutes: 120,
  overtimeWeeklyCapMinutes: 720,
  overtimeMonthlyCapMinutes: null,
};

/** An area's values out of a row that holds them (a leave type, a settings row). */
export const policyValuesOf = <A extends PolicyArea>(area: A, row: object): PolicyValues[A] =>
  Object.fromEntries(
    POLICY_FIELDS[area].map((field) => [field, (row as Record<string, unknown>)[field]]),
  ) as PolicyValues[A];

/**
 * Group policy and each company's overrides of it. What the workspace sets (leave types,
 * attendance, payroll and compliance settings) is the group's policy; a company's override
 * changes only the values it names. Leave, attendance, payroll and the compliance check ask
 * here for the values that apply to a person: those of the company they work for.
 */
@Injectable()
export class PolicyService {
  /** The group's values for an area: for `leave_type`, that leave type's own. */
  async groupValues<A extends PolicyArea>(
    tx: Tx,
    area: A,
    subjectId?: string,
  ): Promise<PolicyValues[A]> {
    switch (area) {
      case 'leave_type': {
        const [type] = subjectId
          ? await tx.select().from(leaveTypes).where(eq(leaveTypes.id, subjectId))
          : [];
        if (!type) throw new NotFoundException('Leave type not found');
        return policyValuesOf(area, type);
      }
      case 'attendance':
        return policyValuesOf(area, await attendanceSettingsOf(tx));
      case 'provident_fund':
        return policyValuesOf(area, await payrollSettingsOf(tx));
      default: {
        const [caps] = await tx.select().from(complianceSettings);
        return policyValuesOf(area, caps ?? DEFAULT_OVERTIME_CAPS);
      }
    }
  }

  /** A company's policy: the group's values with what the company overrides. */
  async effective<A extends PolicyArea>(
    tx: Tx,
    legalEntityId: string,
    area: A,
    subjectId?: string,
  ): Promise<PolicyValues[A]> {
    const group = await this.groupValues(tx, area, subjectId);
    return effectivePolicy(group, (await this.overridesOf(tx, area, subjectId)).get(legalEntityId));
  }

  /**
   * Many people's policy at once, from the group's values the caller already holds (a leave
   * type row, the settings it read): each person gets their company's override on `on`, by
   * the job they hold then. Without overrides everyone gets `group` itself.
   */
  async forEmployees<A extends PolicyArea, T extends PolicyValues[A]>(
    tx: Tx,
    area: A,
    group: T,
    employeeIds: string[],
    on: IsoDate,
    subjectId?: string,
  ): Promise<Map<string, T>> {
    const out = new Map(employeeIds.map((id) => [id, group]));
    const overrides = await this.overridesOf(tx, area, subjectId);
    if (overrides.size === 0 || employeeIds.length === 0) return out;
    const jobs = await tx
      .select({
        employeeId: jobAssignments.employeeId,
        legalEntityId: jobAssignments.legalEntityId,
        effectiveFrom: jobAssignments.effectiveFrom,
      })
      .from(jobAssignments)
      .where(inArray(jobAssignments.employeeId, employeeIds))
      .orderBy(asc(jobAssignments.effectiveFrom));
    for (const [employeeId, own] of groupBy(jobs, (j) => j.employeeId)) {
      const override = overrides.get(companyOn(own, on) ?? '') as Partial<T> | undefined;
      out.set(employeeId, effectivePolicy(group, override));
    }
    return out;
  }

  /** One person's policy: `forEmployees` for one. */
  async forEmployee<A extends PolicyArea, T extends PolicyValues[A]>(
    tx: Tx,
    area: A,
    group: T,
    employeeId: string,
    on: IsoDate,
    subjectId?: string,
  ): Promise<T> {
    const byPerson = await this.forEmployees(tx, area, group, [employeeId], on, subjectId);
    return byPerson.get(employeeId)!;
  }

  /** A leave type as it applies to one person on a date: their company's days and limits. */
  leaveTypeFor(tx: Tx, employeeId: string, type: LeaveTypeRow, on: IsoDate) {
    return this.forEmployee(tx, 'leave_type', type, employeeId, on, type.id);
  }

  /** Each company's override of an area (of one leave type for `leave_type`). */
  private async overridesOf<A extends PolicyArea>(
    tx: Tx,
    area: A,
    subjectId?: string,
  ): Promise<Map<string, PolicyOverride<A>>> {
    const o = entityPolicyOverrides;
    const rows = await tx
      .select({ legalEntityId: o.legalEntityId, values: o.values })
      .from(o)
      .where(and(eq(o.area, area), subjectId ? eq(o.subjectId, subjectId) : isNull(o.subjectId)));
    return new Map(rows.map((r) => [r.legalEntityId, r.values as PolicyOverride<A>]));
  }
}
