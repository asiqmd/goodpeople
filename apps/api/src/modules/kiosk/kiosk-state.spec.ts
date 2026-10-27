import { KIOSK_PIN_MAX_FAILURES } from '@gp/shared';
import { KIOSK_WRONG_PIN_BUDGET, KioskPause, PinLockout } from './kiosk-state.js';

const MINUTE = 60_000;

describe('kiosk PIN state', () => {
  it('locks a worker at one kiosk only', () => {
    const lockout = new PinLockout();
    for (let i = 1; i < KIOSK_PIN_MAX_FAILURES; i++) expect(lockout.fail('k1:e1', 0)).toBe(0);
    expect(lockout.fail('k1:e1', 0)).toBe(900);
    expect(lockout.lockedFor('k1:e1', 0)).toBe(900);
    expect(lockout.lockedFor('k2:e1', 0)).toBe(0);
  });

  it('pauses a kiosk after its budget of wrong PINs, then starts again', () => {
    const pause = new KioskPause();
    for (let i = 1; i < KIOSK_WRONG_PIN_BUDGET; i++) expect(pause.fail('k1', i)).toBe(0);
    expect(pause.fail('k1', KIOSK_WRONG_PIN_BUDGET)).toBe(300);
    expect(pause.pausedFor('k1', KIOSK_WRONG_PIN_BUDGET + 1)).toBe(300);
    expect(pause.pausedFor('k2', KIOSK_WRONG_PIN_BUDGET + 1)).toBe(0);
    expect(pause.pausedFor('k1', 6 * MINUTE)).toBe(0);
    // The budget counts again from the pause.
    expect(pause.fail('k1', 6 * MINUTE)).toBe(0);
  });

  it('forgets wrong PINs after 15 minutes', () => {
    const pause = new KioskPause();
    for (let i = 1; i < KIOSK_WRONG_PIN_BUDGET; i++) pause.fail('k1', 0);
    expect(pause.fail('k1', 15 * MINUTE)).toBe(0);
    expect(pause.pausedFor('k1', 15 * MINUTE)).toBe(0);
  });
});
