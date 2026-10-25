import type { PayslipSummary } from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { day } from '@/components/leave/leave-views';
import { runPeriod, taka } from '@/components/payroll/payroll-views';
import { Badge, Card } from '@/components/ui';
import { load } from '@/lib/api';

/** The signed-in employee's published payslips, newest first. */
export default async function PayslipsPage() {
  const payslips = await load<PayslipSummary[]>('tenant', '/tenant/me/payslips');
  const t = await getTranslations('payroll.payslips');
  const format = await getFormatter();
  const locale = await getLocale();
  // The reader's language first.
  const languages = locale === 'bn' ? (['bn', 'en'] as const) : (['en', 'bn'] as const);

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      {payslips.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500">{t('none')}</p>
        </Card>
      ) : (
        <Card>
          <ul className="-mx-5 -my-2 divide-y divide-slate-100">
            {payslips.map((p) => (
              <li
                key={p.itemId}
                className="flex flex-wrap items-center justify-between gap-4 px-5 py-3"
              >
                <div className="space-y-0.5">
                  <p className="flex items-center gap-2 font-medium text-slate-900">
                    {runPeriod(format, p.periodStart, p.periodEnd)}
                    {p.kind === 'adjustment' && <Badge tone="violet">{t('adjustment')}</Badge>}
                  </p>
                  <p className="text-sm text-slate-500">
                    {t('paidOn', { date: day(format, p.paymentDate) })}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-5">
                  <span className="text-right">
                    <span className="block text-xs text-slate-500">{t('net')}</span>
                    <span className="text-lg font-semibold tabular-nums">
                      {taka(format, p.net)}
                    </span>
                  </span>
                  <span className="flex gap-3 text-sm">
                    {languages.map((language) => (
                      <a
                        key={language}
                        href={`/workspace/files/payslips/${p.itemId}?language=${language}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {t(`open.${language}`)}
                      </a>
                    ))}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
