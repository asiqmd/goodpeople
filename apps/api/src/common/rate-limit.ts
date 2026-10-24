import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { ApiError } from '@gp/shared';

interface Window {
  count: number;
  resetsAt: number;
}

/**
 * Counts attempts per key in fixed windows, in this process's memory. Enough for one API
 * instance; several instances behind a load balancer need a shared store (Redis), which comes
 * with the job queue in Phase 2. Sign-in codes are also limited per number in the database.
 */
@Injectable()
export class RateLimiter {
  private readonly windows = new Map<string, Window>();
  private sweptAt = Date.now();

  /** Counts one attempt and throws 429 once `limit` is passed within the window. */
  hit(key: string, limit: number, windowMs: number): void {
    const now = Date.now();
    this.sweep(now);
    const window = this.windows.get(key);
    if (!window || window.resetsAt <= now) {
      this.windows.set(key, { count: 1, resetsAt: now + windowMs });
      return;
    }
    window.count += 1;
    if (window.count > limit) throw tooManyAttempts(Math.ceil((window.resetsAt - now) / 1000));
  }

  /** Forgets a key, e.g. after a successful sign-in. */
  reset(key: string): void {
    this.windows.delete(key);
  }

  private sweep(now: number) {
    if (now - this.sweptAt < 60_000) return;
    this.sweptAt = now;
    for (const [key, window] of this.windows) if (window.resetsAt <= now) this.windows.delete(key);
  }
}

export function tooManyAttempts(retryAfterSeconds: number): HttpException {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  const body: ApiError & { retryAfterSeconds: number } = {
    statusCode: 429,
    error: 'Too Many Requests',
    message: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    code: 'too_many_attempts',
    retryAfterSeconds,
  };
  return new HttpException(body, HttpStatus.TOO_MANY_REQUESTS);
}
