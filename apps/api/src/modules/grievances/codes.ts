import { randomInt } from 'node:crypto';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import {
  GRIEVANCE_LOCK_MINUTES,
  GRIEVANCE_PIN_ATTEMPTS,
  GRIEVANCE_REFERENCE_ALPHABET,
  GRIEVANCE_REFERENCE_LENGTH,
  type ApiError,
} from '@gp/shared';

/** A new follow-up reference, e.g. `GR-7K3P9Q`. */
export function newGrievanceReference(): string {
  let body = '';
  for (let i = 0; i < GRIEVANCE_REFERENCE_LENGTH; i++) {
    body += GRIEVANCE_REFERENCE_ALPHABET[randomInt(GRIEVANCE_REFERENCE_ALPHABET.length)];
  }
  return `GR-${body}`;
}

interface Failures {
  count: number;
  firstAt: number;
  lockedUntil: number;
}

/**
 * Wrong PINs per reference, in this process's memory like the RateLimiter: after the last
 * attempt the reference locks for a while, so a four-digit PIN cannot be guessed.
 */
@Injectable()
export class PinLockout {
  private readonly failures = new Map<string, Failures>();
  private readonly lockMs = GRIEVANCE_LOCK_MINUTES * 60_000;
  private sweptAt = Date.now();

  /** Seconds until the key opens again; 0 when it is open. */
  lockedFor(key: string, now = Date.now()): number {
    this.sweep(now);
    const entry = this.failures.get(key);
    if (!entry) return 0;
    if (entry.lockedUntil > now) return Math.ceil((entry.lockedUntil - now) / 1000);
    if (this.expired(entry, now)) this.failures.delete(key);
    return 0;
  }

  /** Counts a wrong PIN. Returns the seconds the key is now locked for (0 while it is not). */
  fail(key: string, now = Date.now()): number {
    const entry = this.failures.get(key);
    const current =
      entry && !this.expired(entry, now) ? entry : { count: 0, firstAt: now, lockedUntil: 0 };
    current.count += 1;
    if (current.count >= GRIEVANCE_PIN_ATTEMPTS) current.lockedUntil = now + this.lockMs;
    this.failures.set(key, current);
    return this.lockedFor(key, now);
  }

  clear(key: string): void {
    this.failures.delete(key);
  }

  /** A lock that ran out, or failures older than the window, start afresh. */
  private expired(entry: Failures, now: number) {
    return entry.lockedUntil ? entry.lockedUntil <= now : now - entry.firstAt >= this.lockMs;
  }

  private sweep(now: number) {
    if (now - this.sweptAt < 60_000) return;
    this.sweptAt = now;
    for (const [key, entry] of this.failures)
      if (this.expired(entry, now)) this.failures.delete(key);
  }
}

export function referenceLocked(retryAfterSeconds: number): HttpException {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  const body: ApiError & { retryAfterSeconds: number } = {
    statusCode: 429,
    error: 'Too Many Requests',
    message: `Too many wrong PINs for this reference. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    code: 'grievance_locked',
    retryAfterSeconds,
  };
  return new HttpException(body, HttpStatus.TOO_MANY_REQUESTS);
}
