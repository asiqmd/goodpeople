import type { DistributionRow } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';

/**
 * How proposed and final ratings spread against the guide: for each rating a labelled bar per
 * series with its count and percent, and the same figures in a table. Never colour alone.
 */
export async function DistributionChart({
  proposed,
  final,
}: {
  proposed: DistributionRow[];
  final: DistributionRow[];
}) {
  const t = await getTranslations('reviews.calibration');
  const tr = await getTranslations('reviews.ratings');
  const format = await getFormatter();
  const pct = (n: number) => format.number(n / 100, { style: 'percent', maximumFractionDigits: 1 });
  const series = (row: DistributionRow, finalRow: DistributionRow) => [
    {
      key: 'proposed',
      label: t('proposed'),
      value: row.percent,
      count: row.count,
      bar: 'bg-sky-600',
    },
    {
      key: 'final',
      label: t('final'),
      value: finalRow.percent,
      count: finalRow.count,
      bar: 'bg-brand-600',
    },
    { key: 'guide', label: t('guide'), value: row.guidePercent, count: null, bar: 'bg-slate-300' },
  ];
  return (
    <div className="space-y-5">
      <ul className="space-y-4" aria-hidden>
        {proposed.map((row, i) => (
          <li key={row.rating} className="space-y-1">
            <p className="text-sm font-medium text-slate-800">
              {format.number(row.rating)} · {tr(String(row.rating) as '1')}
            </p>
            {series(row, final[i]!).map((s) => (
              <div
                key={s.key}
                className="grid grid-cols-[5.5rem_1fr_7rem] items-center gap-2 text-xs"
              >
                <span className="text-slate-600">{s.label}</span>
                <span className="h-3 overflow-hidden rounded bg-slate-100">
                  <span className={`block h-full ${s.bar}`} style={{ width: `${s.value}%` }} />
                </span>
                <span className="text-slate-700 tabular-nums">
                  {s.count === null ? pct(s.value) : `${format.number(s.count)} (${pct(s.value)})`}
                </span>
              </div>
            ))}
          </li>
        ))}
      </ul>
      <table className="w-full text-start text-sm">
        <caption className="sr-only">{t('distribution')}</caption>
        <thead className="text-xs text-slate-500">
          <tr>
            <th scope="col" className="py-1 font-medium">
              {t('rating')}
            </th>
            <th scope="col" className="py-1 text-end font-medium">
              {t('proposed')}
            </th>
            <th scope="col" className="py-1 text-end font-medium">
              {t('final')}
            </th>
            <th scope="col" className="py-1 text-end font-medium">
              {t('guide')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 tabular-nums">
          {proposed.map((row, i) => (
            <tr key={row.rating}>
              <th scope="row" className="py-1.5 font-normal">
                {format.number(row.rating)} · {tr(String(row.rating) as '1')}
              </th>
              <td className="py-1.5 text-end">
                {format.number(row.count)} ({pct(row.percent)})
              </td>
              <td className="py-1.5 text-end">
                {format.number(final[i]!.count)} ({pct(final[i]!.percent)})
              </td>
              <td className="py-1.5 text-end">{pct(row.guidePercent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-slate-500">{t('guideNote')}</p>
    </div>
  );
}
