import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import { Inter, Noto_Sans_Bengali, Noto_Sans_Arabic } from 'next/font/google';
import './globals.css';

const latin = Inter({ subsets: ['latin'], variable: '--font-latin' });
const bangla = Noto_Sans_Bengali({ subsets: ['bengali'], variable: '--font-bangla' });

const arabic = Noto_Sans_Arabic({ subsets: ['arabic'], variable: '--font-arabic' });
export const metadata: Metadata = {
  title: 'Good People',
  description: 'HR and payroll for Bangladesh and beyond',
};

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      className={`${latin.variable} ${bangla.variable} ${arabic.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans">
        <NextIntlClientProvider>
          {locale === 'ar' && (
            <div role="status" className="bg-amber-50 px-4 py-2 text-center text-sm">
              معاينة عربية — قد يظهر المحتوى غير المراجع بالإنجليزية. المستندات القانونية والحسابات
              للبلدان الجديدة قيد المراجعة.
            </div>
          )}
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
