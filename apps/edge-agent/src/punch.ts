export const VENDORS = ['zkteco', 'hikvision'] as const;
export type Vendor = (typeof VENDORS)[number];

export const DIRECTIONS = ['in', 'out', 'unknown'] as const;
export type Direction = (typeof DIRECTIONS)[number];

/** One punch as the cloud API receives it. */
export interface Punch {
  deviceSerial: string;
  vendor: Vendor;
  deviceUserId: string;
  /** ISO 8601 with offset, e.g. 2026-10-24T08:59:12+06:00. */
  punchedAt: string;
  direction: Direction;
}
