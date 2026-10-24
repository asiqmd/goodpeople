import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import { Inter, Noto_Sans_Bengali } from 'next/font/google';
import './globals.css';

const latin = Inter({ subsets: ['latin'], variable: '--font-latin' });
const bangla = Noto_Sans_Bengali({ subsets: ['bengali'], variable: '--font-bangla' });

export const metadata: Metadata = {
  title: 'Good People',
  description: 'HR and payroll for Bangladesh and beyond',
};

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${latin.variable} ${bangla.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
