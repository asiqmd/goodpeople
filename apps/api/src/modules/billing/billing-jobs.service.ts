import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { invoices, subscriptions, tenants, type Database } from '@gp/db';
import { addDays, todayIn } from '@gp/shared';
import { and, eq, isNotNull, lte } from 'drizzle-orm';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { DB } from '../../db/db.module.js';
import { BillingService, longDate, settingsOf, syncSubscription, taka } from './billing.service.js';

/** Reminders before an invoice is due, and once it is overdue. */
const DUE_SOON_DAYS = 3;

const DAY = 86_400_000;
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
const bnNumber = (n: number) => new Intl.NumberFormat('bn-BD').format(n);

type Stage = 'soon' | 'overdue' | 'read_only';

function dueValues(stage: Stage, dueDate: string, readOnlyOn: string) {
  const due = { en: longDate('en', dueDate), bn: longDate('bn', dueDate) };
  const ro = { en: longDate('en', readOnlyOn), bn: longDate('bn', readOnlyOn) };
  if (stage === 'soon') {
    return {
      'due.headline': { en: `Invoice due on ${due.en}`, bn: `চালান পরিশোধের শেষ দিন ${due.bn}` },
      'due.detail': { en: `It is due on ${due.en}.`, bn: `শেষ দিন ${due.bn}।` },
    };
  }
  if (stage === 'overdue') {
    return {
      'due.headline': { en: 'Invoice overdue', bn: 'চালান পরিশোধের সময় পেরিয়ে গেছে' },
      'due.detail': {
        en: `It was due on ${due.en}. The workspace becomes read-only after ${ro.en} if it is still unpaid.`,
        bn: `শেষ দিন ছিল ${due.bn}। ${ro.bn}-এর পরও অপরিশোধিত থাকলে ওয়ার্কস্পেস শুধু দেখার জন্য হয়ে যাবে।`,
      },
    };
  }
  return {
    'due.headline': { en: 'Workspace is read-only', bn: 'ওয়ার্কস্পেস এখন শুধু দেখার জন্য' },
    'due.detail': {
      en: 'Your workspace is read-only until it is paid: everything can still be seen and exported, and paying restores it at once.',
      bn: 'পরিশোধ না হওয়া পর্যন্ত ওয়ার্কস্পেস শুধু দেখা যাবে: সব তথ্য দেখা ও এক্সপোর্ট করা যাবে, পরিশোধ করলেই সঙ্গে সঙ্গে চালু হবে।',
    },
  };
}

function trialValues(daysLeft: number, endsOn: string) {
  const when = { en: longDate('en', endsOn), bn: longDate('bn', endsOn) };
  if (daysLeft <= 0) {
    return {
      'trial.headline': { en: 'Your trial has ended', bn: 'আপনার ট্রায়াল শেষ হয়েছে' },
      'trial.when': {
        en: `ended on ${when.en}, and the workspace is read-only`,
        bn: `${when.bn}-এ শেষ হয়েছে, ওয়ার্কস্পেস এখন শুধু দেখার জন্য`,
      },
    };
  }
  const days = {
    en: `${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
    bn: `${bnNumber(daysLeft)} দিন`,
  };
  return {
    'trial.headline': {
      en: `Your trial ends in ${days.en}`,
      bn: `ট্রায়াল শেষ হতে ${days.bn} বাকি`,
    },
    'trial.when': { en: `ends on ${when.en}`, bn: `${when.bn}-এ শেষ হবে` },
  };
}

/**
 * Billing's background work, run every few hours and safe to run any number of times: the last
 * month's invoices once a month has ended, the subscriptions brought up to date, and reminders
 * about invoices falling due and trials ending (each sent once, by key).
 */
@Injectable()
export class BillingJobs implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(BillingJobs.name);
  private timers: NodeJS.Timeout[] = [];
  private running: Promise<unknown> | undefined;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DB) private readonly db: Database,
    private readonly billing: BillingService,
  ) {}

  onApplicationBootstrap() {
    // M2: only the separate, leased worker scheduler owns timers.
    void this.config.BACKGROUND_JOBS;
  }

  async onApplicationShutdown() {
    for (const timer of this.timers) clearInterval(timer);
    await this.running;
  }

  async runDaily(now = new Date()) {
    const today = todayIn('Asia/Dhaka', now);
    const settings = await settingsOf(this.db);
    let issued = 0;
    if (settings) {
      const lastMonth = addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7);
      ({ issued } = await this.billing.issueMonth(lastMonth, null, today));
      await this.syncAll(today);
    }
    const reminded =
      (settings ? await this.paymentReminders(today, settings.graceDays) : 0) +
      (await this.trialReminders(now, today));
    if (issued || reminded)
      this.logger.log(`Billing: ${issued} invoice(s), ${reminded} reminder(s)`);
    return { issued, reminded };
  }

  /** Statuses follow the calendar: an invoice passes its due date with nobody touching it. */
  private async syncAll(today: string) {
    const subs = await this.db
      .select({ tenantId: subscriptions.tenantId })
      .from(subscriptions)
      .where(eq(subscriptions.provider, 'goodpeople'));
    for (const s of subs) {
      await this.db.transaction(async (tx) => {
        const settings = (await settingsOf(tx))!;
        await syncSubscription(tx, s.tenantId, settings, today);
      });
    }
  }

  private async paymentReminders(today: string, graceDays: number): Promise<number> {
    const open = await this.billing.invoiceViews(
      and(
        eq(invoices.kind, 'invoice'),
        eq(invoices.status, 'open'),
        isNotNull(invoices.tenantId),
        lte(invoices.dueDate, addDays(today, DUE_SOON_DAYS)),
      ),
    );
    let sent = 0;
    for (const invoice of open) {
      if (!invoice.tenant || !invoice.dueDate || Number(invoice.balance) <= 0) continue;
      const late = daysBetween(invoice.dueDate, today);
      const readOnlyOn = addDays(invoice.dueDate, graceDays);
      const stage: Stage = late <= 0 ? 'soon' : today > readOnlyOn ? 'read_only' : 'overdue';
      sent += await this.billing.notify(
        invoice.tenant.id,
        'billing.payment_due',
        {
          'invoice.number': { en: invoice.number, bn: invoice.number },
          'invoice.balance': { en: taka('en', invoice.balance), bn: taka('bn', invoice.balance) },
          ...dueValues(stage, invoice.dueDate, readOnlyOn),
        },
        `billing.payment_due:${invoice.id}:${stage}`,
      );
    }
    return sent;
  }

  private async trialReminders(now: Date, today: string): Promise<number> {
    const trials = await this.db
      .select({ id: tenants.id, expiresAt: tenants.accessExpiresAt })
      .from(tenants)
      .where(and(eq(tenants.billingMode, 'trial'), isNotNull(tenants.accessExpiresAt)));
    let sent = 0;
    for (const t of trials) {
      const endsOn = todayIn('Asia/Dhaka', t.expiresAt!);
      const daysLeft = t.expiresAt! <= now ? 0 : Math.max(1, daysBetween(today, endsOn));
      // Long-ended trials were told when they ended.
      if (daysLeft === 0 && daysBetween(endsOn, today) > 7) continue;
      // A week before, the day before, and once it has ended.
      const stage = daysLeft === 0 ? 'ended' : daysLeft === 1 ? '1' : daysLeft <= 7 ? '7' : null;
      if (!stage) continue;
      sent += await this.billing.notify(
        t.id,
        'trial.ending',
        trialValues(daysLeft, endsOn),
        `trial.ending:${t.id}:${t.expiresAt!.toISOString()}:${stage}`,
      );
    }
    return sent;
  }
}
