import { describeRequest } from './support-audit.middleware.js';
import { isActiveGrant, sessionEndsAt, SUPPORT_SESSION_HOURS } from './support-sessions.js';

const at = (iso: string) => new Date(iso);

describe('support access', () => {
  it('counts a grant active from its start until its end, unless revoked', () => {
    const grant = {
      startsAt: at('2026-10-27T04:00:00Z'),
      endsAt: at('2026-10-29T04:00:00Z'),
      revokedAt: null,
    };
    expect(isActiveGrant(grant, at('2026-10-27T03:59:59Z'))).toBe(false);
    expect(isActiveGrant(grant, at('2026-10-27T04:00:00Z'))).toBe(true);
    expect(isActiveGrant(grant, at('2026-10-29T03:59:59Z'))).toBe(true);
    expect(isActiveGrant(grant, at('2026-10-29T04:00:00Z'))).toBe(false);
    expect(
      isActiveGrant(
        { ...grant, revokedAt: at('2026-10-28T00:00:00Z') },
        at('2026-10-27T05:00:00Z'),
      ),
    ).toBe(false);
  });

  it('ends a session with its grant or after the session limit, whichever is first', () => {
    const started = at('2026-10-27T04:00:00Z');
    expect(SUPPORT_SESSION_HOURS).toBe(8);
    expect(sessionEndsAt(at('2026-11-01T00:00:00Z'), started)).toEqual(at('2026-10-27T12:00:00Z'));
    expect(sessionEndsAt(at('2026-10-27T06:30:00Z'), started)).toEqual(at('2026-10-27T06:30:00Z'));
  });

  it('records the route as declared with its path ids, never the URL or its query', () => {
    const id = '0b9f3c1e-8d2a-4f5b-9c7e-1a2b3c4d5e6f';
    expect(
      describeRequest({ method: 'GET', route: { path: '/tenant/employees/:id' }, params: { id } }),
    ).toEqual({ method: 'GET', route: 'GET /tenant/employees/:id', params: { id } });
    expect(describeRequest({ method: 'GET', route: undefined, params: {} })).toEqual({
      method: 'GET',
      route: 'GET',
      params: {},
    });
  });
});
