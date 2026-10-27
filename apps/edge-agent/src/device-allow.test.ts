import { describe, expect, it } from 'vitest';
import {
  addressAllowed,
  allowEveryDevice,
  deviceAllowList,
  isAddressOrRange,
  serialAllowed,
} from './device-allow.js';

describe('device allow lists', () => {
  it('matches addresses and ranges, IPv4 and IPv6', () => {
    const allow = deviceAllowList(['192.168.1.0/24', '10.0.0.7', 'fd00::/8'], []);
    expect(addressAllowed(allow, '192.168.1.200')).toBe(true);
    expect(addressAllowed(allow, '10.0.0.7')).toBe(true);
    expect(addressAllowed(allow, 'fd12::1')).toBe(true);
    expect(addressAllowed(allow, '192.168.2.1')).toBe(false);
    expect(addressAllowed(allow, '10.0.0.8')).toBe(false);
    expect(addressAllowed(allow, undefined)).toBe(false);
    expect(addressAllowed(allow, 'not-an-ip')).toBe(false);
    expect(serialAllowed(allow, 'anything')).toBe(true);
  });

  it('matches serial numbers without regard to case', () => {
    const allow = deviceAllowList([], ['CQZ7224460246', '44:19:B6:AA:BB:CC']);
    expect(serialAllowed(allow, 'cqz7224460246')).toBe(true);
    expect(serialAllowed(allow, '44:19:b6:aa:bb:cc')).toBe(true);
    expect(serialAllowed(allow, 'OTHER')).toBe(false);
    expect(serialAllowed(allow, undefined)).toBe(false);
    expect(addressAllowed(allow, '203.0.113.9')).toBe(true);
  });

  it('lets every device through when nothing is set', () => {
    expect(addressAllowed(allowEveryDevice, undefined)).toBe(true);
    expect(serialAllowed(allowEveryDevice, undefined)).toBe(true);
  });

  it('tells addresses and ranges from anything else', () => {
    for (const ok of ['10.0.0.1', '10.0.0.0/8', '0.0.0.0/0', '::1', 'fd00::/8']) {
      expect(isAddressOrRange(ok)).toBe(true);
    }
    for (const bad of ['10.0.0.0/33', 'fd00::/129', 'host', '10.0.0.1/8/1', '10.0.0.0/x', '']) {
      expect(isAddressOrRange(bad)).toBe(false);
    }
  });
});
