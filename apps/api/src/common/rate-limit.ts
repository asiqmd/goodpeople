import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { ApiError } from '@gp/shared';
import { SecurityState } from './security-state.js';

/**
 * Counts attempts per key in fixed windows, in this process's memory. Enough for one API
 * instance; several instances behind a load balancer need a shared store (Redis), which comes
 * with the job queue in Phase 2. Sign-in codes are also limited per number in the database.
 */
@Injectable()
export class RateLimiter {
  constructor(private readonly state: SecurityState) {}

  /** Counts one attempt and throws 429 once `limit` is passed within the window. */
  async hit(key: string, limit: number, windowMs: number): Promise<void> {
    const result = await this.state.count(`limit:${key}`, windowMs);
    if (result.count > limit) throw tooManyAttempts(Math.max(1, Math.ceil(result.ttl / 1000)));
  }

  /** Forgets a key, e.g. after a successful sign-in. */
  reset(key: string): Promise<void> {
    return this.state.remove(`limit:${key}`);
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
