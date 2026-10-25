import { can, type SpeakUpInfo, type TenantAccessView } from '@gp/shared';
import { getTranslations } from 'next-intl/server';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { intlFor } from '@/components/grievances/intl';
import { localDigits } from '@/components/grievances/parts';
import { PrintButton } from '@/components/grievances/staff-forms';
import { apiFetch, currentTenantUser, load } from '@/lib/api';

// Printed alone on one A4 sheet: everything else on the page is hidden from the printer.
const PRINT_CSS = `
@page { size: A4; margin: 0; }
@media print {
  body * { visibility: hidden; }
  #grievance-poster, #grievance-poster * { visibility: visible; }
  #grievance-poster { position: absolute; left: 0; top: 0; margin: 0; box-shadow: none; border: 0; }
}
#grievance-poster { width: 210mm; height: 297mm; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
`;

/** The address on the request: the poster's code must open this same site from a phone. */
async function siteOrigin() {
  const h = await headers();
  const first = (name: string) => h.get(name)?.split(',')[0]?.trim();
  const host = first('x-forwarded-host') ?? first('host') ?? 'localhost:3000';
  const local = /^(localhost|127\.|\[::1\])/.test(host);
  return `${first('x-forwarded-proto') ?? (local ? 'http' : 'https')}://${host}`;
}

/** A poster for the notice board in Bangla and English, with a code to the speak-up page. */
export default async function GrievancePosterPage() {
  if (!can((await currentTenantUser())?.role, 'grievances.manage')) redirect('/workspace');
  const t = await getTranslations('grievances');
  const { tenant } = await load<TenantAccessView>('tenant', '/tenant/access');
  const info = await apiFetch<SpeakUpInfo>(`/speak-up/${tenant.slug}`);
  const url = `${await siteOrigin()}/speak-up/${tenant.slug}`;
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 640, errorCorrectionLevel: 'M' });
  const [bn, en] = await Promise.all([intlFor('bn'), intlFor('en')]);
  const deadline = info.ok ? info.data.deadline : null;

  const column = (lang: typeof bn, big: boolean) => (
    <div lang={lang.locale} className="space-y-4">
      <ol className={`list-decimal space-y-2 pl-6 ${big ? 'text-xl' : 'text-base'}`}>
        <li>{lang.t('poster.step1')}</li>
        <li>{lang.t('poster.step2')}</li>
        <li>{lang.t('poster.step3')}</li>
      </ol>
      <ul className={`space-y-1 ${big ? 'text-lg' : 'text-sm'} text-slate-700`}>
        <li>✓ {lang.t('poster.anonymous')}</li>
        <li>✓ {lang.t('poster.harassment')}</li>
        {deadline && (
          <li>
            ✓{' '}
            {lang.t('poster.deadline', {
              days: deadline.days,
              section: localDigits(deadline.reference.section, lang.locale),
            })}
          </li>
        )}
      </ul>
    </div>
  );

  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/workspace/grievances" className="text-sm text-slate-600 hover:underline">
            ← {t('detail.back')}
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">{t('list.poster')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('poster.screenHint')}</p>
        </div>
        <PrintButton label={t('poster.print')} />
      </div>
      <div className="overflow-x-auto">
        <article
          id="grievance-poster"
          className="mx-auto flex flex-col overflow-hidden bg-white shadow-sm ring-1 ring-slate-200"
        >
          <header className="bg-brand-700 px-[14mm] py-[10mm] text-white">
            <p className="text-lg font-medium opacity-90">{tenant.name}</p>
            <h2 lang="bn" className="text-6xl font-bold leading-tight">
              {bn.t('poster.heading')}
            </h2>
            <p lang="en" className="text-3xl font-semibold">
              {en.t('poster.heading')}
            </p>
          </header>
          <div className="flex flex-1 flex-col gap-[7mm] px-[14mm] py-[9mm]">
            <div>
              <p lang="bn" className="text-2xl font-semibold text-slate-900">
                {bn.t('poster.lead')}
              </p>
              <p lang="en" className="text-lg text-slate-700">
                {en.t('poster.lead')}
              </p>
            </div>
            <div className="flex flex-col items-center gap-2">
              {/* oxlint-disable-next-line nextjs/no-img-element -- a data URL made on the server */}
              <img src={qr} alt={url} width={320} height={320} className="size-[80mm]" />
              <p className="text-sm text-slate-600">
                {bn.t('poster.or')} / {en.t('poster.or')}
              </p>
              <p className="break-all font-mono text-lg font-semibold">{url}</p>
            </div>
            <div className="grid grid-cols-2 gap-[8mm]">
              {column(bn, true)}
              {column(en, false)}
            </div>
          </div>
        </article>
      </div>
    </>
  );
}
