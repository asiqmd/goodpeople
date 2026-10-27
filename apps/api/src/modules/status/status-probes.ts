import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { Inject, Injectable } from '@nestjs/common';
import type { Database } from '@gp/db';
import { sql } from 'drizzle-orm';
import { APP_CONFIG, type AppConfig } from '../../config.js';
import { DB } from '../../db/db.module.js';
import { chromeExecutable } from '../letters/pdf.service.js';
import { FILE_STORE } from '../../storage/storage.module.js';
import type { FileStore } from '../../storage/file-store.js';

const WEB_TIMEOUT_MS = 5_000;

/**
 * The low-level probes behind the status checks and /ready, one method each, so tests can
 * make any one of them fail. Each resolves when the part works and throws when it does not.
 */
@Injectable()
export class StatusProbes {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DB) private readonly db: Database,
    @Inject(FILE_STORE) private readonly files: FileStore,
  ) {}

  async database(): Promise<void> {
    await this.db.execute(sql`select 1`);
  }

  /** A tiny file goes into the document store and comes back unchanged; it is then removed. */
  async fileStore(): Promise<void> {
    const key = `status/probe/${randomUUID()}`;
    const body = randomBytes(16);
    try {
      await this.files.put(key, body);
      if (!(await this.files.get(key)).equals(body)) throw new Error('probe_changed');
    } finally {
      await this.files.delete(key).catch(() => undefined);
    }
  }

  /** Whether the browser PDFs need is installed; it is not launched. */
  chromium(): boolean {
    const path = chromeExecutable(this.config);
    return path !== undefined && existsSync(path);
  }

  /** The web app answers its sign-in page; a redirect counts as an answer. */
  async web(): Promise<void> {
    const url = this.config.STATUS_WEB_URL ?? `${this.config.WEB_ORIGIN}/login`;
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(WEB_TIMEOUT_MS),
    });
    await res.body?.cancel();
    if (res.status >= 400) throw new Error(`http_${res.status}`);
  }
}

/** Rejects when `probe` takes longer than `ms`, so a hung dependency cannot hang a check. */
export function within(ms: number, probe: () => Promise<void>): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    Promise.resolve()
      .then(probe)
      .then(resolve, reject)
      .finally(() => clearTimeout(timer));
  });
}
