import {
  checksState,
  componentState,
  endedAt,
  heartbeatCheck,
  historyOf,
  inProgress,
  upcoming,
  uptimeOf,
  type IncidentWindow,
} from './status-state.js';

const HOUR = 3_600_000;
// 27 October 2026, 14:00 in Dhaka.
const now = new Date('2026-10-27T08:00:00Z');
const at = (hours: number) => new Date(now.getTime() + hours * HOUR);

const incident = (over: Partial<IncidentWindow> = {}): IncidentWindow => ({
  kind: 'incident',
  impact: 'partial_outage',
  status: 'investigating',
  components: ['api'],
  startsAt: at(-1),
  endsAt: null,
  resolvedAt: null,
  ...over,
});

const maintenance = (over: Partial<IncidentWindow> = {}): IncidentWindow => ({
  kind: 'maintenance',
  impact: null,
  status: 'scheduled',
  components: ['documents'],
  startsAt: at(2),
  endsAt: at(4),
  resolvedAt: null,
  ...over,
});

describe('component state', () => {
  it('is the worst of open incidents on the component', () => {
    const open = [incident(), incident({ impact: 'major_outage', components: ['web'] })];
    expect(componentState('api', open, [], now)).toBe('partial_outage');
    expect(componentState('web', open, [], now)).toBe('major_outage');
    expect(componentState('payments', open, [], now)).toBe('operational');
  });

  it('returns to operational once the incident is resolved', () => {
    const resolved = incident({ status: 'resolved', resolvedAt: at(-0.5) });
    expect(componentState('api', [resolved], [], now)).toBe('operational');
    expect(endedAt(resolved, now)).toEqual(at(-0.5));
  });

  it('shows maintenance only inside its window', () => {
    const window = maintenance();
    expect(componentState('documents', [window], [], now)).toBe('operational');
    expect(upcoming(window, now, 7 * 24 * HOUR)).toBe(true);
    expect(upcoming(window, now, HOUR)).toBe(false);
    expect(componentState('documents', [window], [], at(3))).toBe('maintenance');
    expect(componentState('documents', [window], [], at(5))).toBe('operational');
    // A window that closed while still scheduled is over.
    expect(endedAt(window, at(5))).toEqual(at(4));
  });

  it('keeps maintenance marked in progress going, even early or late', () => {
    const early = maintenance({ status: 'in_progress' });
    expect(inProgress(early, now)).toBe(true);
    expect(inProgress(early, at(6))).toBe(true);
    expect(inProgress({ ...early, status: 'completed', resolvedAt: at(5) }, at(6))).toBe(false);
  });

  it('degrades on a failed check and breaks after three in a row', () => {
    expect(checksState([])).toBe('operational');
    expect(checksState([true, false, false])).toBe('operational');
    expect(checksState([false])).toBe('degraded');
    expect(checksState([false, false])).toBe('degraded');
    expect(checksState([false, true, false])).toBe('degraded');
    expect(checksState([false, false, false])).toBe('partial_outage');
    // An incident worse than the checks wins, and the other way round.
    expect(
      componentState('api', [incident({ impact: 'degraded' })], [false, false, false], now),
    ).toBe('partial_outage');
    expect(componentState('api', [incident({ impact: 'major_outage' })], [false], now)).toBe(
      'major_outage',
    );
  });
});

describe('uptime', () => {
  it('is the share of checks that passed, or null with none', () => {
    expect(uptimeOf([])).toBeNull();
    expect(uptimeOf([{ checks: 0, failures: 0 }])).toBeNull();
    expect(uptimeOf([{ checks: 1440, failures: 144 }])).toBeCloseTo(0.9);
    expect(
      uptimeOf([
        { checks: 1000, failures: 10 },
        { checks: 1000, failures: 0 },
      ]),
    ).toBeCloseTo(0.995);
  });

  it('gives one entry per Dhaka day, oldest first, with the worst incident that day', () => {
    // Late evening in Dhaka is already the next day: 20:30 UTC on the 26th is 02:30 on the 27th.
    const lateNight = new Date('2026-10-26T20:30:00Z');
    const days = historyOf('api', [], [], lateNight, 3);
    expect(days.map((d) => d.date)).toEqual(['2026-10-25', '2026-10-26', '2026-10-27']);

    const history = historyOf(
      'api',
      [
        { day: '2026-10-25', checks: 1440, failures: 72 },
        { day: '2026-10-27', checks: 840, failures: 0 },
      ],
      [
        // 23:00 on the 25th to 01:00 on the 26th, Dhaka time: both days.
        incident({
          impact: 'major_outage',
          status: 'resolved',
          startsAt: new Date('2026-10-25T17:00:00Z'),
          resolvedAt: new Date('2026-10-25T19:00:00Z'),
        }),
        incident({ impact: 'degraded', components: ['web'] }),
      ],
      now,
      3,
    );
    expect(history).toEqual([
      { date: '2026-10-25', uptime: 0.95, worst: 'major_outage' },
      { date: '2026-10-26', uptime: null, worst: 'major_outage' },
      { date: '2026-10-27', uptime: 1, worst: 'operational' },
    ]);
  });

  it('marks today with an open incident, and never days a maintenance has not reached', () => {
    const history = historyOf(
      'documents',
      [],
      [
        incident({ components: ['documents'], impact: 'degraded' }),
        maintenance({ startsAt: at(30), endsAt: at(32) }),
      ],
      now,
      2,
    );
    expect(history.map((d) => d.worst)).toEqual(['operational', 'degraded']);
  });
});

describe('job heartbeats', () => {
  const started = at(-1);
  const window = 2 * 60_000;

  it('is not checked just after start-up, and fails when the first sweep never came', () => {
    expect(heartbeatCheck(undefined, now, window, new Date(now.getTime() + 30_000))).toBeNull();
    expect(heartbeatCheck(undefined, started, window, now)).toEqual({
      ok: false,
      detail: 'no_sweep_since_start',
    });
  });

  it('passes a recent good sweep and fails a stale or failed one', () => {
    const recent = new Date(now.getTime() - 30_000);
    expect(heartbeatCheck({ at: recent, ok: true }, started, window, now)).toEqual({
      ok: true,
      detail: null,
    });
    expect(heartbeatCheck({ at: recent, ok: false }, started, window, now)?.detail).toBe(
      'last_sweep_failed',
    );
    const stale = new Date(now.getTime() - 3 * 60_000);
    expect(heartbeatCheck({ at: stale, ok: true }, started, window, now)).toEqual({
      ok: false,
      detail: `no_sweep_since ${stale.toISOString()}`,
    });
  });
});
