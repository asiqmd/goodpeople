'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';

/**
 * Companies' colours, in a fixed order that is never cycled: the reference data-viz palette's
 * categorical hues, checked for colour-blind readers. A ninth company joins "Other".
 */
const SERIES = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
  '#6250d6',
  '#e34948',
];

export interface TrendSeries {
  id: string;
  label: string;
  values: number[];
}

const W = 640;
const H = 220;
const PAD = { top: 12, right: 64, bottom: 28, left: 40 };

/** A round top for the axis, at or above the largest value, whose half is round too. */
function niceMax(value: number) {
  const step = 10 ** Math.floor(Math.log10(Math.max(value, 1)));
  return [1, 1.2, 1.6, 2, 3, 4, 5, 6, 8, 10].map((m) => m * step).find((v) => v >= value)!;
}

/** Up to eight lines: past that, the smaller companies are added up as one. */
function fold(series: TrendSeries[], other: string): TrendSeries[] {
  if (series.length <= SERIES.length) return series;
  const rest = series.slice(SERIES.length - 1);
  return [
    ...series.slice(0, SERIES.length - 1),
    {
      id: 'other',
      label: other,
      values: rest[0]!.values.map((_, i) => rest.reduce((n, s) => n + s.values[i]!, 0)),
    },
  ];
}

/**
 * Headcount at each month's end, a line per company, with the figures in a table beside it.
 * Values are written in text colour; a line's colour only says which company it is.
 */
export function HeadcountTrend({ months, series }: { months: string[]; series: TrendSeries[] }) {
  const t = useTranslations('group.dashboard');
  const format = useFormatter();
  const [active, setActive] = useState<number | null>(null);
  const lines = fold(series, t('other'));
  const max = niceMax(Math.max(...lines.flatMap((s) => s.values), 1));
  const x = (i: number) => PAD.left + (i * (W - PAD.left - PAD.right)) / (months.length - 1);
  const y = (v: number) => PAD.top + (1 - v / max) * (H - PAD.top - PAD.bottom);
  const n = (v: number) => format.number(v);
  const short = (m: string) =>
    format.dateTime(new Date(`${m}-01T00:00:00Z`), { month: 'short', timeZone: 'UTC' });
  const long = (m: string) =>
    format.dateTime(new Date(`${m}-01T00:00:00Z`), {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  // Direct labels at the lines' ends, pushed apart so they never overlap; a legend above too.
  const ends = lines
    .map((s, i) => ({ s, colour: SERIES[i]!, at: y(s.values.at(-1)!) }))
    .toSorted((a, b) => a.at - b.at);
  for (let i = 1; i < ends.length; i++) {
    ends[i]!.at = Math.max(ends[i]!.at, ends[i - 1]!.at + 13);
  }
  const last = months.length - 1;

  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-700">
        {lines.map((s, i) => (
          <li key={s.id} className="flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-4 rounded" style={{ background: SERIES[i] }} />
            {s.label}
          </li>
        ))}
      </ul>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label={t('trendLabel', { from: long(months[0]!), to: long(months[last]!) })}
          onMouseLeave={() => setActive(null)}
        >
          {[0, max / 2, max].map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="#e2e8f0" />
              <text
                x={PAD.left - 6}
                y={y(v) + 4}
                textAnchor="end"
                className="fill-slate-500 text-[11px]"
              >
                {n(v)}
              </text>
            </g>
          ))}
          {months.map((m, i) => (
            <text
              key={m}
              x={x(i)}
              y={H - 8}
              textAnchor="middle"
              className="fill-slate-500 text-[11px]"
            >
              {short(m)}
            </text>
          ))}
          {active !== null && (
            <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={H - PAD.bottom} stroke="#94a3b8" />
          )}
          {lines.map((s, i) => (
            <g key={s.id}>
              <polyline
                fill="none"
                stroke={SERIES[i]}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={s.values.map((v, j) => `${x(j)},${y(v)}`).join(' ')}
              />
              <circle
                cx={x(active ?? last)}
                cy={y(s.values[active ?? last]!)}
                r={4}
                fill={SERIES[i]}
                stroke="#ffffff"
                strokeWidth={2}
              />
            </g>
          ))}
          {lines.length <= 4 &&
            ends.map(({ s, at }) => (
              <text
                key={s.id}
                x={x(last) + 8}
                y={at + 4}
                className="fill-slate-700 text-[11px] font-medium"
              >
                {s.label}
              </text>
            ))}
          {months.map((m, i) => (
            <rect
              key={m}
              x={x(i) - (W - PAD.left - PAD.right) / (2 * last)}
              y={PAD.top}
              width={(W - PAD.left - PAD.right) / last}
              height={H - PAD.top - PAD.bottom}
              fill="transparent"
              onMouseEnter={() => setActive(i)}
            />
          ))}
        </svg>
        {active !== null && (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-36 -translate-x-1/2 rounded-lg bg-white px-3 py-2 text-xs shadow-md ring-1 ring-slate-200"
            style={{ left: `${(x(active) / W) * 100}%` }}
          >
            <p className="mb-1 font-medium text-slate-900">{long(months[active]!)}</p>
            {lines.map((s, i) => (
              <p key={s.id} className="flex items-center justify-between gap-3 text-slate-700">
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="size-2 rounded-full"
                    style={{ background: SERIES[i] }}
                  />
                  {s.label}
                </span>
                <span className="tabular-nums">{n(s.values[active]!)}</span>
              </p>
            ))}
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <caption className="sr-only">{t('trendTable')}</caption>
          <thead className="text-slate-500">
            <tr>
              <th scope="col" className="py-1 pe-3 text-start font-medium">
                {t('company')}
              </th>
              {months.map((m) => (
                <th key={m} scope="col" className="px-1.5 py-1 text-end font-medium">
                  {short(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {series.map((s) => (
              <tr key={s.id}>
                <th scope="row" className="py-1 pe-3 text-start font-medium">
                  {s.label}
                </th>
                {s.values.map((v, i) => (
                  <td key={months[i]} className="px-1.5 py-1 text-end tabular-nums">
                    {n(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
