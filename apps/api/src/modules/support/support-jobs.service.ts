import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { supportTickets, type Database } from '@gp/db';
import { TICKET_AUTO_CLOSE_DAYS } from '@gp/shared';
import { and, eq, isNull, lt, lte, or } from 'drizzle-orm';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { DB } from '../../db/db.module.js';

const DAY = 86_400_000;

/**
 * Once an hour, closes tickets that have been resolved for TICKET_AUTO_CLOSE_DAYS without the
 * customer writing again (a reply would have reopened them). Running it twice changes nothing.
 */
@Injectable()
export class SupportJobs implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SupportJobs.name);
  private timers: NodeJS.Timeout[] = [];
  private running: Promise<unknown> | undefined;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DB) private readonly db: Database,
  ) {}

  onApplicationBootstrap() {
    if (!this.config.BACKGROUND_JOBS) return;
    const close = () => {
      this.running ??= this.closeResolved()
        .catch((error: Error) => this.logger.error('Closing resolved tickets failed', error))
        .finally(() => (this.running = undefined));
    };
    this.timers = [setInterval(close, 60 * 60_000), setTimeout(close, 60_000)];
    for (const timer of this.timers) timer.unref();
  }

  async onApplicationShutdown() {
    for (const timer of this.timers) clearInterval(timer);
    await this.running;
  }

  /** Closes what has been resolved long enough. Returns the tickets closed. */
  async closeResolved(now = new Date()): Promise<string[]> {
    const rows = await this.db
      .update(supportTickets)
      .set({ status: 'closed', closedAt: now, updatedAt: now })
      .where(
        and(
          eq(supportTickets.status, 'resolved'),
          lte(supportTickets.resolvedAt, new Date(now.getTime() - TICKET_AUTO_CLOSE_DAYS * DAY)),
          or(
            isNull(supportTickets.lastCustomerMessageAt),
            lt(supportTickets.lastCustomerMessageAt, supportTickets.resolvedAt),
          ),
        ),
      )
      .returning({ id: supportTickets.id });
    if (rows.length > 0) this.logger.log(`Closed ${rows.length} resolved support tickets`);
    return rows.map((r) => r.id);
  }
}
