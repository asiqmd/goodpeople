import { describe, expect, it } from 'vitest';
import { admsOptions, directionForStatus, parseAttlog } from './zkteco.js';

describe('ATTLOG parsing', () => {
  it('reads tab-separated records as Dhaka wall time', () => {
    const body = '1001\t2026-10-24 08:59:12\t0\t1\t0\t0\t0\n1002\t2026-10-24 18:02:00\t1\t15\t0\n';
    expect(parseAttlog(body, 'CQZ7224460246', 'Asia/Dhaka')).toEqual({
      punches: [
        {
          deviceSerial: 'CQZ7224460246',
          vendor: 'zkteco',
          deviceUserId: '1001',
          punchedAt: '2026-10-24T08:59:12+06:00',
          direction: 'in',
        },
        {
          deviceSerial: 'CQZ7224460246',
          vendor: 'zkteco',
          deviceUserId: '1002',
          punchedAt: '2026-10-24T18:02:00+06:00',
          direction: 'out',
        },
      ],
      skipped: [],
    });
  });

  it('tolerates CRLF, blank lines, spaces and missing trailing fields', () => {
    const body = [
      '1001\t2026-10-24 08:00:00\t0\t1\r',
      '',
      '   ',
      '1002 2026-10-24 08:01:00 1',
      '1003\t2026-10-24\t08:02:00\t4',
      '1004\t2026-10-24 08:03:00',
      '1005\t2026-10-24 08:04:00\t\t1',
      '',
    ].join('\n');
    const { punches, skipped } = parseAttlog(body, 'SN1', 'Asia/Dhaka');
    expect(skipped).toEqual([]);
    expect(punches.map((p) => [p.deviceUserId, p.punchedAt, p.direction])).toEqual([
      ['1001', '2026-10-24T08:00:00+06:00', 'in'],
      ['1002', '2026-10-24T08:01:00+06:00', 'out'],
      ['1003', '2026-10-24T08:02:00+06:00', 'in'],
      ['1004', '2026-10-24T08:03:00+06:00', 'unknown'],
      // An empty status field is not confused with the verify field after it.
      ['1005', '2026-10-24T08:04:00+06:00', 'unknown'],
    ]);
  });

  it('skips malformed lines and keeps the rest', () => {
    const body = [
      'garbage',
      '1001\t2026-02-30 08:00:00\t0',
      '1002\t2026-10-24 24:10:00\t0',
      '\t2026-10-24 08:00:00\t0',
      '1003\t24/10/2026 08:00:00\t0',
      '1004\t2026-10-24 08:05:00\t1',
    ].join('\r\n');
    const { punches, skipped } = parseAttlog(body, 'SN1', 'Asia/Dhaka');
    expect(punches).toHaveLength(1);
    expect(punches[0]).toMatchObject({ deviceUserId: '1004', direction: 'out' });
    expect(skipped.map((s) => [s.line, s.reason])).toEqual([
      [1, 'not a PIN, date and time'],
      [2, 'impossible date or time'],
      [3, 'impossible date or time'],
      [4, 'not a PIN, date and time'],
      [5, 'not a PIN, date and time'],
    ]);
  });

  it('converts with the offset in force on the day in a DST zone', () => {
    const body = '7\t2026-10-24 09:00:00\t0\n7\t2026-10-26 09:00:00\t0\n';
    expect(parseAttlog(body, 'SN1', 'Europe/London').punches.map((p) => p.punchedAt)).toEqual([
      '2026-10-24T09:00:00+01:00',
      '2026-10-26T09:00:00+00:00',
    ]);
  });

  it('maps status codes to directions', () => {
    expect([0, 1, 2, 3, 4, 5, 255, null].map(directionForStatus)).toEqual([
      'in',
      'out',
      'unknown',
      'unknown',
      'in',
      'out',
      'unknown',
      'unknown',
    ]);
  });
});

describe('ADMS options', () => {
  it('lists the options with the zone offset in hours', () => {
    expect(admsOptions('CQZ7224460246', 'Asia/Dhaka').split('\n')).toEqual([
      'GET OPTION FROM: CQZ7224460246',
      'ATTLOGStamp=None',
      'OPERLOGStamp=9999',
      'ATTPHOTOStamp=None',
      'ErrorDelay=30',
      'Delay=10',
      'TransTimes=00:00;14:05',
      'TransInterval=1',
      'TransFlag=TransData AttLog OpLog',
      'TimeZone=6',
      'Realtime=1',
      'Encrypt=None',
    ]);
  });

  it('uses the offset in force now for a DST zone', () => {
    expect(admsOptions('SN1', 'Europe/London', Date.parse('2026-07-01T00:00:00Z'))).toContain(
      'TimeZone=1',
    );
    expect(admsOptions('SN1', 'Europe/London', Date.parse('2026-12-01T00:00:00Z'))).toContain(
      'TimeZone=0',
    );
  });
});
