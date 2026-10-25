import { Inject, Injectable } from '@nestjs/common';
import { bdGratuity } from '@gp/country-packs';
import { employees, type FieldCipher, type Tx } from '@gp/db';
import { addDays, Decimal, money, type GratuityLine, type GratuityProvision } from '@gp/shared';
import { and, asc, lte, or, isNull, gte } from 'drizzle-orm';
import { conflict } from '../../common/errors.js';
import { FIELD_CIPHER, TenantDb } from '../../db/db.module.js';
import { employeeRef } from '../attendance/attendance-views.js';
import { csv } from './disbursement.js';
import { workOutPay } from './pay-calc.js';
import { componentsOf, payrollSettingsOf } from './payroll-setup.service.js';
import { approvedPay, jobsOn } from './run-context.js';

const SIZE = 50;

const total = (lines: GratuityLine[]) =>
  lines.reduce((s, l) => s.plus(l.liability), new Decimal(0));

/** The last day of the month before a date's. */
const previousMonthEnd = (date: string) => addDays(`${date.slice(0, 8)}01`, -1);

/**
 * What the company owes in gratuity on a date if everyone left then: for each permanent
 * employee, the Act's days for their completed years at their basic. The month's charge is
 * the change since the previous month end, for the provision in the accounts.
 */
@Injectable()
export class GratuityService {
  constructor(
    private readonly tenantDb: TenantDb,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
  ) {}

  provision(asOf: string, page = 1): Promise<GratuityProvision> {
    return this.tenantDb.run(async (tx) => {
      const settings = await payrollSettingsOf(tx);
      if (!settings.gratuityEnabled) throw conflict('gratuity_off', 'Gratuity is not provided for');
      const previousAsOf = previousMonthEnd(asOf);
      const now = await this.lines(tx, asOf);
      const before = await this.lines(tx, previousAsOf);
      return {
        asOf,
        previousAsOf,
        total: money(total(now)),
        previousTotal: money(total(before)),
        change: money(total(now).minus(total(before))),
        people: now.length,
        lines: now.slice((page - 1) * SIZE, page * SIZE),
        page,
        size: SIZE,
      };
    });
  }

  /** Everyone's gratuity on the date, as CSV. */
  async provisionCsv(asOf: string): Promise<{ text: string; fileName: string }> {
    const rows = await this.tenantDb.run((tx) => this.lines(tx, asOf));
    return {
      text: csv([
        ['Employee code', 'Name', 'Joined', 'Completed years', 'Basic', 'Days', 'Liability'],
        ...rows.map((l) => [
          l.employee.employeeCode,
          l.employee.fullName,
          l.joinedOn,
          String(l.serviceYears),
          l.monthlyWage,
          String(l.days),
          l.liability,
        ]),
      ]),
      fileName: `gratuity-${asOf}.csv`,
    };
  }

  private async lines(tx: Tx, asOf: string): Promise<GratuityLine[]> {
    const people = await tx
      .select()
      .from(employees)
      .where(
        and(
          lte(employees.joinedOn, asOf),
          or(isNull(employees.separatedOn), gte(employees.separatedOn, asOf)),
        ),
      )
      .orderBy(asc(employees.employeeCode));
    const ids = people.map((p) => p.id);
    const jobs = await jobsOn(tx, ids, asOf);
    const pay = await approvedPay(tx, this.cipher, asOf);
    const components = await componentsOf(tx);
    const out: GratuityLine[] = [];
    for (const p of people) {
      if (jobs.get(p.id)?.employmentType !== 'permanent') continue;
      const record = pay.get(p.id)?.at(-1);
      if (!record) continue;
      const { years, days } = bdGratuity(p.joinedOn, asOf);
      if (days === 0) continue;
      const lines = workOutPay(
        record.engine.structure,
        components,
        record.engine.amount,
        record.engine.fixed,
      ).lines;
      const basic = new Decimal(lines.find((l) => l.code === 'BASIC')?.amount ?? 0);
      out.push({
        employee: employeeRef(p),
        joinedOn: p.joinedOn,
        serviceYears: years,
        monthlyWage: money(basic),
        days,
        liability: money(basic.dividedBy(30).times(days).toDecimalPlaces(0, Decimal.ROUND_HALF_UP)),
      });
    }
    return out;
  }
}
