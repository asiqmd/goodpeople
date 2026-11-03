import { DB } from './tokens.js';
import {
  Global,
  Inject,
  Injectable,
  Module,
  UnauthorizedException,
  type OnApplicationShutdown,
} from '@nestjs/common';
import {
  authSessions,
  tenantUsers,
  createDb,
  createFieldCipher,
  runAsTenant,
  type Database,
  type Tx,
} from '@gp/db';
import { eq, sql } from 'drizzle-orm';
import { currentAuthUser, currentTenantId } from '../common/request-context.js';
import { APP_CONFIG, type AppConfig } from '../config.js';

/** The app-role connection (no BYPASSRLS). Platform tables only; tenant tables go through TenantDb. */
export { DB } from './tokens.js';
/** Encrypts identity and account numbers; see @gp/db FieldCipher. */
export const FIELD_CIPHER = Symbol('FIELD_CIPHER');
const DB_HANDLE = Symbol('DB_HANDLE');

type DbHandle = ReturnType<typeof createDb>;

/** Tenant-table access, scoped by row-level security to the current request's tenant. */
@Injectable()
export class TenantDb {
  constructor(@Inject(DB) private readonly db: Database) {}

  run<T>(fn: (tx: Tx) => Promise<T>, snapshot = false): Promise<T> {
    return runAsTenant(
      this.db,
      currentTenantId(),
      async (tx) => {
        if (snapshot) await tx.execute(sql`select set_config('statement_timeout', '5000', true)`);
        const actor = currentAuthUser();
        if (actor?.kind === 'tenant' && actor.sessionId) {
          // These locks serialize approval writes with user/session revocation. A stale
          // request cannot continue with a policy read before a committed scope change.
          const [user] = await tx
            .select()
            .from(tenantUsers)
            .where(eq(tenantUsers.id, actor.id))
            .for('share');
          const [candidate] = await tx
            .select()
            .from(authSessions)
            .where(eq(authSessions.id, actor.sessionId));
          const [family] = candidate
            ? await tx
                .select()
                .from(authSessions)
                .where(eq(authSessions.id, candidate.familyId))
                .for('share')
            : [];
          const [session] = await tx
            .select()
            .from(authSessions)
            .where(eq(authSessions.id, actor.sessionId))
            .for('share');
          if (
            !user ||
            user.disabledAt ||
            user.provisionDisabled ||
            user.authRevision !== actor.revision ||
            !family ||
            family.familyRevokedAt ||
            !session ||
            session.revokedAt ||
            session.expiresAt.getTime() <= Date.now()
          ) {
            throw new UnauthorizedException('Authority changed; retry with your current session');
          }
        }
        return fn(tx);
      },
      snapshot ? { isolationLevel: 'repeatable read' } : undefined,
    );
  }
}

@Injectable()
class PoolCloser implements OnApplicationShutdown {
  constructor(@Inject(DB_HANDLE) private readonly handle: DbHandle) {}

  async onApplicationShutdown() {
    await this.handle.pool.end();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: DB_HANDLE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        createDb(config.DATABASE_URL, {
          max: config.PROCESS_ROLE === 'worker' ? config.WORKER_CONCURRENCY * 2 + 2 : 10,
          integrationRetentionDays: config.WEBHOOK_RETENTION_DAYS,
          tenantId:
            config.DEPLOYMENT_MODE === 'managed' ? undefined : config.INSTALLATION_TENANT_ID,
        }),
    },
    { provide: DB, inject: [DB_HANDLE], useFactory: (handle: DbHandle) => handle.db },
    {
      provide: FIELD_CIPHER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        createFieldCipher(config.FIELD_ENCRYPTION_KEY, {
          activeKeyId: config.FIELD_ENCRYPTION_ACTIVE_KEY_ID,
          keys: config.FIELD_ENCRYPTION_KEYS_JSON,
        }),
    },
    PoolCloser,
    TenantDb,
  ],
  exports: [DB, FIELD_CIPHER, TenantDb],
})
export class DbModule {}
