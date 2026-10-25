import { Inject, Injectable } from '@nestjs/common';
import {
  attendanceDevices,
  attendanceSettings,
  designations,
  employeePay,
  employeePaymentAccounts,
  employees,
  holidayCalendars,
  holidays,
  leaveTypes,
  legalEntities,
  locations,
  notificationSettings,
  orgUnits,
  shifts,
  tenantUsers,
  type Tx,
} from '@gp/db';
import {
  addDays,
  MFA_REQUIRED_ROLES,
  todayIn,
  type SetupChecklist,
  type SetupStep,
  type TenantWithAccess,
} from '@gp/shared';
import {
  and,
  count,
  countDistinct,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  sql,
  type SQL,
} from 'drizzle-orm';
import { TenantDb } from '../../db/db.module.js';
import { parallelRunsOf } from '../payroll/reconciliation.service.js';
import { EMAIL_SENDER, SMS_SENDER, type Sender } from '../notifications/senders.js';

const ratio = (done: number, total: number): SetupStep['status'] =>
  total === 0 ? 'todo' : done === total ? 'done' : 'warning';

const n = async (query: Promise<{ n: number }[]>) => (await query)[0]?.n ?? 0;

/**
 * The go-live checklist for one workspace: each step is read from the data, so it is always
 * current. Steps that need people (legal sign-off, a parallel run) are in docs/ops/go-live.md.
 */
@Injectable()
export class SetupService {
  constructor(
    private readonly tenantDb: TenantDb,
    @Inject(EMAIL_SENDER) private readonly email: Sender<unknown>,
    @Inject(SMS_SENDER) private readonly sms: Sender<unknown>,
  ) {}

  checklist(tenant: TenantWithAccess): Promise<SetupChecklist> {
    return this.tenantDb.run(async (tx) => {
      const today = todayIn();
      const year = today.slice(0, 4);
      const active = eq(employees.status, 'active');
      const steps: SetupStep[] = [];

      // Company: every legal entity has its TIN and registration number.
      const entities = await n(tx.select({ n: count() }).from(legalEntities));
      const registered = await n(
        tx
          .select({ n: count() })
          .from(legalEntities)
          .where(and(isNotNull(legalEntities.tin), isNotNull(legalEntities.registrationNo))),
      );
      steps.push({
        key: 'company',
        status: ratio(registered, entities),
        done: registered,
        total: entities,
        link: '/workspace/organization',
      });

      // Locations, with geofences where people punch from the app inside one.
      const [settings] = await tx.select().from(attendanceSettings);
      const sites = await n(tx.select({ n: count() }).from(locations));
      const fenced = await n(
        tx
          .select({ n: count() })
          .from(locations)
          .where(and(isNotNull(locations.latitude), isNotNull(locations.geofenceRadiusM))),
      );
      const geofenced = (settings?.selfPunch ?? 'geofenced') === 'geofenced';
      steps.push(
        geofenced
          ? {
              key: 'locations',
              status: ratio(fenced, sites),
              done: fenced,
              total: sites,
              link: '/workspace/organization',
            }
          : { key: 'locations', status: sites ? 'done' : 'todo', link: '/workspace/organization' },
      );

      const units = await n(tx.select({ n: count() }).from(orgUnits));
      const titles = await n(tx.select({ n: count() }).from(designations));
      steps.push({
        key: 'org',
        status: units && titles ? 'done' : 'todo',
        link: '/workspace/organization',
      });

      const staff = await n(tx.select({ n: count() }).from(employees).where(active));
      steps.push({
        key: 'employees',
        status: staff ? 'done' : 'todo',
        done: staff,
        total: staff,
        link: '/workspace/employees',
      });

      // Not everyone needs a login (some workers only use the devices), so this is a warning.
      const withLogin = await n(
        tx
          .select({ n: count() })
          .from(employees)
          .where(and(active, isNotNull(employees.userId))),
      );
      steps.push({
        key: 'logins',
        status: staff === 0 ? 'todo' : withLogin === staff ? 'done' : 'warning',
        done: withLogin,
        total: staff,
        link: '/workspace/users',
      });

      const hrTeam = await n(
        tx
          .select({ n: count() })
          .from(tenantUsers)
          .where(
            and(
              inArray(tenantUsers.role, ['hr_admin', 'hr_officer']),
              isNull(tenantUsers.disabledAt),
            ),
          ),
      );
      steps.push({
        key: 'hr_team',
        status: hrTeam ? 'done' : 'warning',
        done: hrTeam,
        link: '/workspace/users',
      });

      const adminRoles = [...MFA_REQUIRED_ROLES];
      const admins = await n(
        tx
          .select({ n: count() })
          .from(tenantUsers)
          .where(and(inArray(tenantUsers.role, adminRoles), isNull(tenantUsers.disabledAt))),
      );
      const secured = await n(
        tx
          .select({ n: count() })
          .from(tenantUsers)
          .where(
            and(
              inArray(tenantUsers.role, adminRoles),
              isNull(tenantUsers.disabledAt),
              isNotNull(tenantUsers.mfaEnabledAt),
            ),
          ),
      );
      steps.push({
        key: 'admin_mfa',
        status: ratio(secured, admins),
        done: secured,
        total: admins,
        link: '/workspace/users',
      });

      const shiftCount = await n(tx.select({ n: count() }).from(shifts));
      steps.push({
        key: 'shifts',
        status: shiftCount ? 'done' : 'todo',
        link: '/workspace/attendance/settings',
      });

      // Devices report in through the Edge Agent; quiet for a day means something is wrong.
      const devices = await n(tx.select({ n: count() }).from(attendanceDevices));
      const online = await n(
        tx
          .select({ n: count() })
          .from(attendanceDevices)
          .where(gte(attendanceDevices.lastSeenAt, sql`now() - interval '1 day'`)),
      );
      steps.push(
        devices
          ? {
              key: 'devices',
              status: ratio(online, devices),
              done: online,
              total: devices,
              link: '/workspace/attendance/devices',
            }
          : { key: 'devices', status: 'not_needed', link: '/workspace/attendance/devices' },
      );
      const pinned = await n(
        tx
          .select({ n: count() })
          .from(employees)
          .where(and(active, isNotNull(employees.attendancePin))),
      );
      steps.push(
        devices
          ? {
              key: 'attendance_pins',
              status: ratio(pinned, staff),
              done: pinned,
              total: staff,
              link: '/workspace/attendance/devices',
            }
          : { key: 'attendance_pins', status: 'not_needed', link: '/workspace/attendance/devices' },
      );

      // This year's holidays, with lunar dates confirmed as they come close.
      const holidaysThisYear = await n(
        tx
          .select({ n: count() })
          .from(holidays)
          .innerJoin(holidayCalendars, eq(holidayCalendars.id, holidays.calendarId))
          .where(
            and(
              eq(holidayCalendars.isDefault, true),
              gte(holidays.date, `${year}-01-01`),
              lte(holidays.date, `${year}-12-31`),
            ),
          ),
      );
      const tentativeSoon = await n(
        tx
          .select({ n: count() })
          .from(holidays)
          .where(
            and(
              eq(holidays.isTentative, true),
              gte(holidays.date, today),
              lte(holidays.date, addDays(today, 30)),
            ),
          ),
      );
      steps.push({
        key: 'holidays',
        status: !holidaysThisYear ? 'todo' : tentativeSoon ? 'warning' : 'done',
        done: holidaysThisYear,
        total: tentativeSoon,
        link: '/workspace/leave/settings',
      });

      const types = await n(
        tx.select({ n: count() }).from(leaveTypes).where(eq(leaveTypes.isActive, true)),
      );
      steps.push({
        key: 'leave_types',
        status: types ? 'done' : 'todo',
        done: types,
        link: '/workspace/leave/settings',
      });

      // Delivery is a server setting: `log` means messages are only written to the API log.
      const [channels] = await tx.select().from(notificationSettings);
      steps.push({
        key: 'email',
        status:
          (channels?.emailEnabled ?? true) && this.email.driver !== 'log' ? 'done' : 'warning',
        link: '/workspace/notifications',
      });
      const smsOn = channels?.smsEnabled ?? false;
      steps.push({
        key: 'sms',
        status: !smsOn ? 'not_needed' : this.sms.driver !== 'log' ? 'done' : 'warning',
        link: '/workspace/notifications',
      });

      if (tenant.access.features.includes('payroll')) {
        steps.push(...(await this.payrollSteps(tx, staff, active)));
      }

      const counting = steps.filter((s) => s.status !== 'not_needed');
      return {
        steps,
        done: counting.filter((s) => s.status === 'done').length,
        total: counting.length,
      };
    });
  }

  /** Payroll is ready when everyone has approved pay, a way to be paid, and three months match. */
  private async payrollSteps(tx: Tx, staff: number, active: SQL): Promise<SetupStep[]> {
    const steps: SetupStep[] = [];
    const today = todayIn();
    const paid = await n(
      tx
        .select({ n: countDistinct(employeePay.employeeId) })
        .from(employeePay)
        .innerJoin(employees, eq(employees.id, employeePay.employeeId))
        .where(
          and(active, eq(employeePay.status, 'approved'), lte(employeePay.effectiveFrom, today)),
        ),
    );
    steps.push({
      key: 'pay_records',
      status: ratio(paid, staff),
      done: paid,
      total: staff,
      link: '/workspace/employees',
    });
    // Without an account a person is paid in cash, which is allowed, so this is a warning.
    const accounts = await n(
      tx
        .select({ n: countDistinct(employeePaymentAccounts.employeeId) })
        .from(employeePaymentAccounts)
        .innerJoin(employees, eq(employees.id, employeePaymentAccounts.employeeId))
        .where(active),
    );
    steps.push({
      key: 'payment_accounts',
      status: ratio(accounts, staff),
      done: accounts,
      total: staff,
      link: '/workspace/employees',
    });
    const parallel = await parallelRunsOf(tx);
    steps.push({
      key: 'parallel_runs',
      status:
        parallel.consecutive >= parallel.required
          ? 'done'
          : parallel.consecutive > 0
            ? 'warning'
            : 'todo',
      done: Math.min(parallel.consecutive, parallel.required),
      total: parallel.required,
      link: '/workspace/payroll/parallel',
    });
    return steps;
  }
}
