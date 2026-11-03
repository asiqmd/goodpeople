import { ScheduledWorker, SCHEDULED_TASKS } from './scheduled-worker.js';
import type { AppConfig } from '../config.js';
import { FEATURE_KEYS } from '@gp/shared';

function setup(role: 'api' | 'worker' = 'worker', accessState: 'full' | 'suspended' = 'full') {
  type Dependencies = ConstructorParameters<typeof ScheduledWorker>;
  const claims: string[] = [],
    blocked: { release: () => void; done: Promise<unknown> }[] = [];
  let active = 0,
    peak = 0;
  const provider = new Proxy(
    {},
    {
      get: () => () => {
        active++;
        peak = Math.max(peak, active);
        let release!: () => void;
        const done = new Promise<void>((resolve) => (release = resolve)).finally(() => {
          active--;
        });
        blocked.push({ release, done });
        return done;
      },
    },
  );
  const leases = {
    start: async (key: string, _interval: number, fn: () => Promise<unknown>) => {
      claims.push(key);
      return { ran: true, completion: fn() };
    },
  };
  const config = {
    PROCESS_ROLE: role,
    BACKGROUND_JOBS: true,
    WORKER_CONCURRENCY: 2,
    ATTENDANCE_JOB_INTERVAL_MINUTES: 15,
  } as AppConfig;
  const worker = new ScheduledWorker(
    config,
    { get: () => provider } as unknown as Dependencies[1],
    leases as unknown as Dependencies[2],
    {
      businessContext: async () => ({ zone: 'Asia/Dhaka', blocked: false }),
      all: async () => [{ id: 'tenant', access: { accessState, features: FEATURE_KEYS } }],
    } as unknown as Dependencies[3],
  );
  return { worker, claims, blocked, peak: () => peak };
}

describe('durable scheduler process boundary and fairness', () => {
  it('bounds active work and visits later tasks even when early tasks are always due', async () => {
    const state = setup();
    for (let i = 0; i < Math.ceil(SCHEDULED_TASKS.length / 2); i++) {
      await state.worker.sweep();
      await state.worker.sweep();
      expect(state.peak()).toBe(2);
      const current = state.blocked.splice(0);
      for (const item of current) item.release();
      await Promise.all(current.map((item) => item.done));
      await Promise.resolve();
    }
    expect(new Set(state.claims.map((key) => key.split(':')[0]))).toEqual(
      new Set(SCHEDULED_TASKS.map((task) => task.name)),
    );
    await state.worker.stop();
    const count = state.claims.length;
    await state.worker.sweep();
    expect(state.claims).toHaveLength(count);
  });
  it('continues privacy cleanup for suspended tenants while withholding routine tenant work', async () => {
    const state = setup('worker', 'suspended');
    for (let i = 0; i < 3; i++) {
      await state.worker.sweep();
      const current = state.blocked.splice(0);
      for (const item of current) item.release();
      await Promise.all(current.map((item) => item.done));
      await Promise.resolve();
    }
    expect(new Set(state.claims.filter((key) => key.endsWith(':tenant')))).toEqual(
      new Set(['insight-jobs:tenant', 'retention:tenant', 'webhooks:tenant']),
    );
    await state.worker.stop();
  });
  it('never starts background work in an API process, even when the old switch is on', async () => {
    vi.useFakeTimers();
    const state = setup('api');
    try {
      state.worker.onApplicationBootstrap();
      await vi.advanceTimersByTimeAsync(10000);
      expect(state.claims).toHaveLength(0);
    } finally {
      await state.worker.stop();
      vi.useRealTimers();
    }
  });
});
