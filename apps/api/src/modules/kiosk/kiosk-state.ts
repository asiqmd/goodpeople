import { Injectable } from '@nestjs/common';
import { KIOSK_LOCK_MINUTES, KIOSK_PIN_MAX_FAILURES } from '@gp/shared';
import { SecurityState } from '../../common/security-state.js';
const LOCK_MS = KIOSK_LOCK_MINUTES * 60_000;
@Injectable()
export class PinLockout {
  constructor(private readonly state: SecurityState) {}
  lockedFor(key: string, now = Date.now()) {
    return this.state.lockedFor(`pin:${key}`, now);
  }
  fail(key: string, now = Date.now()) {
    return this.state.lockFailure(
      `pin:${key}`,
      KIOSK_PIN_MAX_FAILURES,
      LOCK_MS,
      LOCK_MS,
      false,
      now,
    );
  }
  reset(key: string) {
    return this.state.remove(`pin:${key}`);
  }
}
export const KIOSK_WRONG_PIN_BUDGET = 30;
@Injectable()
export class KioskPause {
  constructor(private readonly state: SecurityState) {}
  pausedFor(id: string, now = Date.now()) {
    return this.state.lockedFor(`kiosk-pause:${id}`, now);
  }
  fail(id: string, now = Date.now()) {
    return this.state.lockFailure(
      `kiosk-pause:${id}`,
      KIOSK_WRONG_PIN_BUDGET,
      LOCK_MS,
      5 * 60_000,
      true,
      now,
    );
  }
}
@Injectable()
export class EndedSessions {
  constructor(private readonly state: SecurityState) {}
  async end(id: string, expiresAt: number) {
    if (expiresAt > Date.now())
      await this.state.put(`kiosk-ended:${id}`, true, expiresAt - Date.now());
  }
  async has(id: string) {
    return !!(await this.state.read<boolean>(`kiosk-ended:${id}`));
  }
}
