import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createDb, createFieldCipher, runAsTenant, type Database, type Tx } from '@gp/db';
import { currentTenantId } from '../common/request-context.js';
import { APP_CONFIG, type AppConfig } from '../config.js';

/** The app-role connection (no BYPASSRLS). Platform tables only; tenant tables go through TenantDb. */
export const DB = Symbol('DB');
/** Encrypts identity and account numbers; see @gp/db FieldCipher. */
export const FIELD_CIPHER = Symbol('FIELD_CIPHER');
const DB_HANDLE = Symbol('DB_HANDLE');

type DbHandle = ReturnType<typeof createDb>;

/** Tenant-table access, scoped by row-level security to the current request's tenant. */
@Injectable()
export class TenantDb {
  constructor(@Inject(DB) private readonly db: Database) {}

  run<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return runAsTenant(this.db, currentTenantId(), fn);
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
      useFactory: (config: AppConfig) => createDb(config.DATABASE_URL),
    },
    { provide: DB, inject: [DB_HANDLE], useFactory: (handle: DbHandle) => handle.db },
    {
      provide: FIELD_CIPHER,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => createFieldCipher(config.FIELD_ENCRYPTION_KEY),
    },
    PoolCloser,
    TenantDb,
  ],
  exports: [DB, FIELD_CIPHER, TenantDb],
})
export class DbModule {}
