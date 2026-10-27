'use client';

import { digestOf } from '@/components/error-panel';
import { buttonClass } from '@/components/ui';
import './globals.css';

/**
 * The root layout itself failed, so there is no language or messages to read: the page says
 * it in both languages.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = digestOf(error);
  return (
    <html lang="en">
      <body className="min-h-full bg-slate-50 font-sans antialiased">
        <main
          role="alert"
          className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-3 px-6 py-16"
        >
          <title>Good People</title>
          <h1 className="text-xl font-semibold text-slate-900">Something went wrong</h1>
          <p className="text-lg font-semibold text-slate-900" lang="bn">
            কিছু একটা গোলমাল হয়েছে
          </p>
          <p className="text-sm text-slate-600">
            Try again in a moment. If it keeps happening, contact support.
          </p>
          <p className="text-sm text-slate-600" lang="bn">
            একটু পরে আবার চেষ্টা করুন। বারবার এমন হলে সাপোর্টে যোগাযোগ করুন।
          </p>
          {digest && (
            <p className="text-xs text-slate-500">
              Reference / রেফারেন্স: <span className="font-mono">{digest}</span>
            </p>
          )}
          <div className="pt-2">
            <button type="button" onClick={retry} className={buttonClass.primary}>
              Try again / আবার চেষ্টা করুন
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
