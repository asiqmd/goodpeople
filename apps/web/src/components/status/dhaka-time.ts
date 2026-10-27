/** A moment in Dhaka time with the zone shown, as the status page and console print it. */
export const DHAKA_TIME = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Dhaka',
  timeZoneName: 'short',
} as const satisfies Intl.DateTimeFormatOptions;

export const DHAKA_DAY = {
  dateStyle: 'medium',
  timeZone: 'Asia/Dhaka',
} as const satisfies Intl.DateTimeFormatOptions;

/** A Dhaka calendar day (YYYY-MM-DD) as the instant it starts. */
export const dhakaDay = (date: string) => new Date(`${date}T00:00:00+06:00`);
