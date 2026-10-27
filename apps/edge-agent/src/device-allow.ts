import { BlockList, isIP } from 'node:net';

/**
 * Which devices may push punches: by source address (GP_DEVICE_ALLOW) and by serial number
 * (GP_DEVICE_SERIALS). A null part lets every device through on that count.
 */
export interface DeviceAllowList {
  addresses: BlockList | null;
  serials: Set<string> | null;
}

const family = (ip: string) => (isIP(ip) === 6 ? 'ipv6' : 'ipv4');

/** Adds an address (192.168.1.20) or a range (192.168.1.0/24); false when it is neither. */
function add(list: BlockList, entry: string): boolean {
  const [ip = '', prefix, extra] = entry.split('/');
  if (!isIP(ip) || extra !== undefined) return false;
  if (prefix === undefined) {
    list.addAddress(ip, family(ip));
    return true;
  }
  const bits = Number(prefix);
  if (!/^\d+$/.test(prefix) || bits > (isIP(ip) === 6 ? 128 : 32)) return false;
  list.addSubnet(ip, bits, family(ip));
  return true;
}

/** Whether an entry of GP_DEVICE_ALLOW is an IP address or a CIDR range. */
export const isAddressOrRange = (entry: string) => add(new BlockList(), entry);

export function deviceAllowList(
  addresses: readonly string[],
  serials: readonly string[],
): DeviceAllowList {
  let list: BlockList | null = null;
  if (addresses.length > 0) {
    list = new BlockList();
    for (const entry of addresses) add(list, entry);
  }
  return {
    addresses: list,
    serials: serials.length > 0 ? new Set(serials.map((s) => s.toLowerCase())) : null,
  };
}

export const addressAllowed = (allow: DeviceAllowList, ip: string | undefined) =>
  !allow.addresses || (ip !== undefined && isIP(ip) > 0 && allow.addresses.check(ip, family(ip)));

export const serialAllowed = (allow: DeviceAllowList, serial: string | undefined) =>
  !allow.serials || (serial !== undefined && allow.serials.has(serial.toLowerCase()));

/** Every device may push: what an agent does when neither list is set. */
export const allowEveryDevice: DeviceAllowList = { addresses: null, serials: null };
