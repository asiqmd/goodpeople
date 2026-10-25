import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import {
  CIPHER_FIELDS,
  employees,
  maternityCases,
  maternityPayments,
  type FieldCipher,
} from '@gp/db';
import { addMonths, todayIn } from '@gp/shared';
import { and, eq, isNotNull, isNull, lte } from 'drizzle-orm';
import { runInTenantContext } from '../../common/request-context.js';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { FIELD_CIPHER, TenantDb } from '../../db/db.module.js';
import { WorkCalendarService } from '../calendar/work-calendar.service.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import {
  localDate,
  NotificationsService,
  usersWith,
} from '../notifications/notifications.service.js';
import { amountText } from '../payroll/payslip.js';
import { sealed, workingDaysAfter } from '../payroll/run-context.js';
import { deliveryOf, maternityRules, proofDeadlineOf } from './benefit.js';

/** HR is reminded about proof of birth this long after the expected delivery. */
const PROOF_REMINDER_MONTHS = 2;

const bnNumber = (n: number) => new Intl.NumberFormat('bn-BD').format(n);

/**
 * Once an hour, tells the people who handle leave about maternity benefit falling due within
 * the Act's working days (s.47) and about proof of birth still missing two months after the
 * expected delivery. Each reminder carries a key, so it is sent once however often this runs.
 */
@Injectable()
export class MaternityJobs implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MaternityJobs.name);
  private timers: NodeJS.Timeout[] = [];
  private running: Promise<void> | undefined;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    private readonly entitlements: EntitlementsService,
    private readonly tenantDb: TenantDb,
    private readonly calendars: WorkCalendarService,
    private readonly notifications: NotificationsService,
  ) {}

  onApplicationBootstrap() {
    if (!this.config.BACKGROUND_JOBS) return;
    const remind = () => {
      this.running ??= this.everyTenant().finally(() => (this.running = undefined));
    };
    this.timers = [setInterval(remind, 60 * 60_000), setTimeout(remind, 30_000)];
    for (const timer of this.timers) timer.unref();
  }

  async onApplicationShutdown() {
    for (const timer of this.timers) clearInterval(timer);
    await this.running?.catch(() => undefined);
  }

  private async everyTenant() {
    for (const tenant of await this.entitlements.all()) {
      if (tenant.access.accessState === 'suspended') continue;
      if (!tenant.access.features.includes('leave')) continue;
      try {
        await runInTenantContext(tenant.id, () => this.remindTenant());
      } catch (error) {
        this.logger.error(`Maternity reminders failed for ${tenant.slug}`, error as Error);
      }
    }
  }

  /** Every maternity reminder for the current workspace. Returns how many people were told. */
  async remindTenant(now = new Date()): Promise<number> {
    const today = todayIn('Asia/Dhaka', now);
    return (await this.paymentsDue(today)) + (await this.proofMissing(today));
  }

  /** Parts not yet paid whose due date is within the Act's working days, or past. */
  private paymentsDue(today: string): Promise<number> {
    return this.tenantDb.run(async (tx) => {
      const horizon = await workingDaysAfter(
        tx,
        this.calendars,
        today,
        maternityRules(today).paymentWorkingDays.value,
      );
      const rows = await tx
        .select({ payment: maternityPayments, case: maternityCases, employee: employees })
        .from(maternityPayments)
        .innerJoin(maternityCases, eq(maternityCases.id, maternityPayments.caseId))
        .innerJoin(employees, eq(employees.id, maternityCases.employeeId))
        .where(
          and(
            eq(maternityCases.status, 'open'),
            eq(maternityCases.eligible, true),
            isNull(maternityPayments.paidOn),
            isNotNull(maternityPayments.dueOn),
            lte(maternityPayments.dueOn, horizon),
          ),
        );
      if (rows.length === 0) return 0;
      const hr = await usersWith(tx, 'leave.manage');
      const { open } = sealed(this.cipher);
      let told = 0;
      for (const { payment, case: c, employee } of rows) {
        const amount = open<string>(CIPHER_FIELDS.maternityPayments, payment.amountEnc);
        told += await this.notifications.notify(tx, {
          event: 'maternity.payment_due',
          recipients: hr,
          values: {
            'person.name': { en: employee.fullName, bn: employee.fullNameBn ?? employee.fullName },
            'maternity.part': { en: String(payment.part), bn: bnNumber(payment.part) },
            'maternity.amount': {
              en: `Tk ${amountText('en', amount)}`,
              bn: `৳${amountText('bn', amount)}`,
            },
            'maternity.due': localDate(payment.dueOn!),
          },
          link: `/workspace/leave/maternity/${c.id}`,
          dedupeKey: `maternity.payment_due:${payment.id}:${payment.dueOn}`,
          data: { caseId: c.id, employeeId: employee.id },
        });
      }
      return told;
    });
  }

  /**
   * Parts waiting for proof of birth are lost if it does not come within months of the
   * delivery (s.47); HR is told while there is still time to ask for it.
   */
  private proofMissing(today: string): Promise<number> {
    return this.tenantDb.run(async (tx) => {
      const rows = await tx
        .select({ case: maternityCases, employee: employees })
        .from(maternityCases)
        .innerJoin(employees, eq(employees.id, maternityCases.employeeId))
        .where(
          and(
            eq(maternityCases.status, 'open'),
            eq(maternityCases.eligible, true),
            isNull(maternityCases.proofOn),
            lte(maternityCases.expectedDeliveryOn, addMonths(today, -PROOF_REMINDER_MONTHS)),
          ),
        );
      if (rows.length === 0) return 0;
      const hr = await usersWith(tx, 'leave.manage');
      let told = 0;
      for (const { case: c, employee } of rows) {
        const deadline = localDate(proofDeadlineOf(c, maternityRules(deliveryOf(c))));
        const expected = localDate(c.expectedDeliveryOn);
        const bnName = employee.fullNameBn ?? employee.fullName;
        // No event of its own yet: a compliance alert carries the headline and detail.
        told += await this.notifications.notify(tx, {
          event: 'compliance.alert',
          recipients: hr,
          values: {
            'alert.headline': {
              en: `Proof of birth missing for ${employee.fullName}`,
              bn: `${bnName}-এর সন্তান জন্মের প্রমাণ জমা হয়নি`,
            },
            'alert.detail': {
              en: `Her delivery was expected on ${expected.en}. The maternity benefit paid on proof of birth is lost unless it is produced by ${deadline.en} (Labour Act s.47).`,
              bn: `তাঁর প্রসবের সম্ভাব্য তারিখ ছিল ${expected.bn}। ${deadline.bn}-এর মধ্যে সন্তান জন্মের প্রমাণ জমা না হলে প্রমাণের ভিত্তিতে প্রদেয় প্রসূতি কল্যাণ সুবিধা আর দেওয়া যাবে না (শ্রম আইন ধারা ৪৭)।`,
            },
          },
          link: `/workspace/leave/maternity/${c.id}`,
          dedupeKey: `maternity.proof_missing:${c.id}`,
          data: { caseId: c.id, employeeId: employee.id },
        });
      }
      return told;
    });
  }
}
