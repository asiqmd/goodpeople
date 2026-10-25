import {
  addDays,
  can,
  todayIn,
  type OrgSnapshot,
  type ProductionDayView,
  type ProductionOperationView,
} from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { day } from '@/components/leave/leave-views';
import { EntryGrid } from '@/components/production/entry-grid';
import { localName, rate } from '@/components/production/labels';
import { ProductionTabs } from '@/components/production/production-tabs';
import { Banner, buttonClass, Card, inputClass } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';
import { treeOrder } from '@/lib/org';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function ProductionEntryPage({
  searchParams,
}: PageProps<'/workspace/production'>) {
  if (!can((await currentTenantUser())?.role, 'production.manage')) redirect('/workspace');
  const t = await getTranslations('production');
  const format = await getFormatter();
  const locale = await getLocale();
  const sp = await searchParams;
  const today = todayIn();
  const date =
    typeof sp.date === 'string' && DATE.test(sp.date) && sp.date <= today ? sp.date : today;
  const [org, operations] = await Promise.all([
    load<OrgSnapshot>('tenant', '/tenant/org'),
    load<ProductionOperationView[]>('tenant', '/tenant/production/operations'),
  ]);
  const units = treeOrder(org.orgUnits.filter((u) => u.isActive));
  const unit =
    (typeof sp.unit === 'string' && units.find(({ unit: u }) => u.id === sp.unit)?.unit.id) ||
    (units.find(({ unit: u }) => u.kind === 'line') ?? units[0])?.unit.id ||
    '';
  const active = operations.filter((o) => o.isActive);
  const opId =
    typeof sp.op === 'string' && operations.some((o) => o.id === sp.op) ? sp.op : active[0]?.id;
  const view =
    unit && opId
      ? await load<ProductionDayView>(
          'tenant',
          `/tenant/production/day?date=${date}&orgUnitId=${unit}`,
        )
      : null;
  const operation = view?.operations.find((o) => o.id === opId);
  const link = (changes: Record<string, string>) =>
    `/workspace/production?${new URLSearchParams({ unit, date, ...(opId ? { op: opId } : {}), ...changes })}`;

  return (
    <>
      <ProductionTabs active="entry" />
      {active.length === 0 ? (
        <Banner tone="amber">
          {t('entry.noOperations')}{' '}
          <Link href="/workspace/production/operations" className="font-medium underline">
            {t('tabs.operations')}
          </Link>
        </Banner>
      ) : (
        <form className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="font-medium text-slate-800">{t('entry.unit')}</span>
            <select name="unit" defaultValue={unit} className={`${inputClass} mt-1`}>
              {units.map(({ unit: u, depth }) => (
                <option key={u.id} value={u.id}>
                  {' '.repeat(depth * 3)}
                  {localName(u, locale)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="font-medium text-slate-800">{t('entry.date')}</span>
            <input
              type="date"
              name="date"
              defaultValue={date}
              max={today}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="text-sm">
            <span className="font-medium text-slate-800">{t('entry.operation')}</span>
            <select name="op" defaultValue={opId} className={`${inputClass} mt-1`}>
              {operations
                .filter((o) => o.isActive || o.id === opId)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.code} · {localName(o, locale)}
                    {o.style ? ` (${o.style})` : ''}
                  </option>
                ))}
            </select>
          </label>
          <button className={buttonClass.secondary}>{t('entry.show')}</button>
          <span className="flex gap-3 text-sm">
            <Link
              href={link({ date: addDays(date, -1) })}
              className="text-slate-600 hover:text-slate-900"
            >
              ← {day(format, addDays(date, -1))}
            </Link>
            {date < today && (
              <Link
                href={link({ date: addDays(date, 1) })}
                className="text-slate-600 hover:text-slate-900"
              >
                {day(format, addDays(date, 1))} →
              </Link>
            )}
          </span>
        </form>
      )}
      {view && operation && (
        <Card
          title={`${localName(view.orgUnit, locale)} · ${day(format, view.date)}`}
          action={
            <span className="text-sm text-slate-600">
              {operation.code} · {localName(operation, locale)}
              {operation.pieceRate !== null &&
                ` · ${t('entry.perPiece', { rate: rate(format, operation.pieceRate) })}`}
              {operation.dailyTarget !== null &&
                operation.incentiveRate !== null &&
                ` · ${t('entry.targetIncentive', {
                  target: operation.dailyTarget,
                  rate: rate(format, operation.incentiveRate),
                })}`}
            </span>
          }
        >
          <EntryGrid
            key={`${view.orgUnit.id}|${view.date}|${operation.id}`}
            view={view}
            operation={operation}
          />
        </Card>
      )}
      {view && view.workers.some((w) => w.locked) && (
        <p className="text-xs text-slate-500">{t('entry.lockedNote')}</p>
      )}
    </>
  );
}
