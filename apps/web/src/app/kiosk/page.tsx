import type { KioskDeviceView } from '@gp/shared';
import { cookies } from 'next/headers';
import { KioskApp } from '@/components/kiosk/kiosk-app';
import { KioskSetup } from '@/components/kiosk/kiosk-setup';
import { KIOSK_COOKIES, kioskFetch } from './kiosk-api';

/** A shared tablet: set up once by staff with a token, then used by workers with their card. */
export default async function KioskPage() {
  if (!(await cookies()).has(KIOSK_COOKIES.device)) return <KioskSetup />;
  const device = await kioskFetch<KioskDeviceView>('/device');
  if (!device.ok) return <KioskSetup problem={device.error.code ?? 'kiosk_unknown'} />;
  return <KioskApp device={device.data} />;
}
