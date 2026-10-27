import { getLocale } from 'next-intl/server';

/** Times on a 24-hour clock in Bangla, where CLDR's Bangla data prints a Latin AM/PM. */
export async function clockOptions(): Promise<Pick<Intl.DateTimeFormatOptions, 'hourCycle'>> {
  return (await getLocale()) === 'bn' ? { hourCycle: 'h23' } : {};
}
