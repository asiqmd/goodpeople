import { Injectable } from '@nestjs/common';
import { KIOSK_LOCK_MINUTES, KIOSK_PIN_MAX_FAILURES } from '@gp/shared';

// Short-lived kiosk state kept in this process's memory, like RateLimiter: enough for one API
// instance; several instances behind a load balancer need a shared store (Redis).

const LOCK_MS = KIOSK_LOCK_MINUTES * 60_000;

interface Failures {
  count: number;
  lastAt: number;
  lockedUntil: number | null;
}

/**
 * Wrong PINs per worker. Five in a row lock the worker out of every kiosk of the workspace for
 * 15 minutes; a right PIN, or 15 minutes without a wrong one, starts the count again.
 */
@Injectable()
export class PinLockout {
  private readonly failures = new Map<string, Failures>();
  private sweptAt = Date.now();

  /** Seconds left on the worker's lock, or 0. */
  lockedFor(key: string, now = Date.now()): number {
    const lockedUntil = this.failures.get(key)?.lockedUntil;
    return lockedUntil && lockedUntil > now ? Math.ceil((lockedUntil - now) / 1000) : 0;
  }

  /** Counts a wrong PIN; returns the seconds of the lock it starts, or 0. */
  fail(key: string, now = Date.now()): number {
    this.sweep(now);
    const locked = this.lockedFor(key, now);
    if (locked) return locked;
    const previous = this.failures.get(key);
    const fresh = !previous || previous.lockedUntil !== null || now - previous.lastAt >= LOCK_MS;
    const count = fresh ? 1 : previous.count + 1;
    const lockedUntil = count >= KIOSK_PIN_MAX_FAILURES ? now + LOCK_MS : null;
    this.failures.set(key, { count, lastAt: now, lockedUntil });
    return lockedUntil ? LOCK_MS / 1000 : 0;
  }

  reset(key: string): void {
    this.failures.delete(key);
  }

  private sweep(now: number) {
    if (now - this.sweptAt < 60_000) return;
    this.sweptAt = now;
    for (const [key, f] of this.failures) {
      if (now - f.lastAt >= LOCK_MS && (f.lockedUntil ?? 0) <= now) this.failures.delete(key);
    }
  }
}

/** Sessions a worker ended ("Done", or the screen going idle), until they would expire anyway. */
@Injectable()
export class EndedSessions {
  private readonly ended = new Map<string, number>();

  end(sessionId: string, expiresAt: number): void {
    const now = Date.now();
    for (const [id, at] of this.ended) if (at <= now) this.ended.delete(id);
    this.ended.set(sessionId, expiresAt);
  }

  has(sessionId: string): boolean {
    return this.ended.has(sessionId);
  }
}
