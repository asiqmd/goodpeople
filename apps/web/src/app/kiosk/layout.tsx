import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { kioskLocale } from './kiosk-api';

export const metadata: Metadata = { title: 'Good People kiosk' };

/** The kiosk speaks Bangla unless switched, whatever the rest of the site was last set to. */
export default async function KioskLayout({ children }: LayoutProps<'/kiosk'>) {
  const locale = await kioskLocale();
  const messages = (await import(`../../../messages/${locale}.json`)).default;
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Dhaka">
      <div lang={locale} className="min-h-screen bg-slate-100 text-slate-900">
        {children}
      </div>
    </NextIntlClientProvider>
  );
}
