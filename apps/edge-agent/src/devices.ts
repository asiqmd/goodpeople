import type { Vendor } from './punch.js';

/** What a device may call itself: ZKTeco serials, Hikvision MAC or IP addresses. */
export const SERIAL = /^[A-Za-z0-9._:-]{1,64}$/;

export interface SeenDevice {
  serialNumber: string;
  vendor: Vendor;
  /** ISO 8601 (UTC). */
  lastSeenAt: string;
  ip?: string;
}

/** Devices that have talked to the agent since it started, reported in each heartbeat. */
export class DeviceRegistry {
  private readonly devices = new Map<string, SeenDevice>();

  constructor(private readonly limit = 1000) {}

  seen(serialNumber: string, vendor: Vendor, ip?: string, at = new Date()): void {
    const key = `${vendor}:${serialNumber}`;
    this.devices.delete(key);
    this.devices.set(key, {
      serialNumber,
      vendor,
      lastSeenAt: at.toISOString(),
      ...(ip ? { ip } : {}),
    });
    // Map keeps insertion order, so the first key is the least recently seen.
    if (this.devices.size > this.limit) this.devices.delete(this.devices.keys().next().value!);
  }

  /** Most recently seen first. */
  list(max = Infinity): SeenDevice[] {
    return [...this.devices.values()].toReversed().slice(0, max);
  }
}
