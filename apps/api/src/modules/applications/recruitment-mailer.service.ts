import { Inject, Injectable, Logger } from '@nestjs/common';
import { tenants, type Database } from '@gp/db';
import { eq } from 'drizzle-orm';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { DB } from '../../db/db.module.js';
import { EMAIL_SENDER, type EmailMessage, type Sender } from '../notifications/senders.js';
import { addressOf } from './ics.js';

/**
 * Sends candidates' and interviewers' emails once the change they describe is saved. A failed
 * send is logged and never undoes the change.
 */
@Injectable()
export class RecruitmentMailer {
  private readonly logger = new Logger(RecruitmentMailer.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(EMAIL_SENDER) private readonly email: Sender<EmailMessage>,
  ) {}

  /** The workspace's name, which signs candidates' emails and organises invitations. */
  async workspaceName(tenantId: string): Promise<string> {
    const [row] = await this.db
      .select({ name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, tenantId));
    return row?.name ?? 'Good People';
  }

  /** The address invitations come from. */
  organizerEmail(): string {
    return addressOf(this.config.EMAIL_FROM);
  }

  /** A link into the web app. */
  link(path: string): string {
    return `${this.config.WEB_ORIGIN}${path}`;
  }

  async send(messages: EmailMessage[]): Promise<void> {
    for (const message of messages) {
      await this.email.send(message).catch((error: Error) => {
        this.logger.error(`A recruitment email failed: ${error.message}`);
      });
    }
  }
}
