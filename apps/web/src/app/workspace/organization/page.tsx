import {
  can,
  LOCATION_KINDS,
  ORG_UNIT_KINDS,
  WORKER_CATEGORIES,
  type OrgSnapshot,
} from '@gp/shared';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { createOrgItem, setOrgItemActive, type OrgKind } from '@/app/actions/hr';
import { ActionForm } from '@/components/hr/action-form';
import { Badge, buttonClass, Card, Field, inputClass } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';
import { treeOrder } from '@/lib/org';

type Row = { id: string; isActive: boolean; cells: ReactNode[] };

const text = (name: string, label: string, required = true) => (
  <Field label={label}>
    <input name={name} required={required} className={inputClass} />
  </Field>
);

async function Section({
  id,
  title,
  kind,
  columns,
  rows,
  form,
}: {
  id: string;
  title: string;
  kind: OrgKind;
  columns: string[];
  rows: Row[];
  form: ReactNode;
}) {
  const t = await getTranslations('hr.org');
  return (
    <Card title={title}>
      <div id={id} className="-mx-5 mb-6 overflow-x-auto">
        {rows.length === 0 ? (
          <p className="px-5 text-sm text-slate-500">{t('empty')}</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="text-start text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {columns.map((c) => (
                  <th key={c} className="px-5 py-2 font-medium">
                    {c}
                  </th>
                ))}
                <th className="px-5 py-2 font-medium">{t('status')}</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.id} className={row.isActive ? '' : 'text-slate-400'}>
                  {row.cells.map((cell, i) => (
                    <td key={i} className="px-5 py-2">
                      {cell}
                    </td>
                  ))}
                  <td className="px-5 py-2">
                    <Badge tone={row.isActive ? 'green' : 'slate'}>
                      {row.isActive ? t('active') : t('inactive')}
                    </Badge>
                  </td>
                  <td className="px-5 py-2 text-end">
                    <form action={setOrgItemActive.bind(null, kind, row.id, !row.isActive)}>
                      <button className={buttonClass.ghost}>
                        {row.isActive ? t('deactivate') : t('activate')}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {form}
    </Card>
  );
}

export default async function OrganizationPage() {
  const user = await currentTenantUser();
  if (!can(user, 'org.manage')) redirect('/workspace');
  const org = await load<OrgSnapshot>('tenant', '/tenant/org');
  const t = await getTranslations('hr');
  const o = (key: string) => t(`org.${key}`);
  const entityName = (id: string) => org.legalEntities.find((e) => e.id === id)?.name ?? '';
  const entitySelect = (
    <Field label={o('legalEntity')}>
      <select name="legalEntityId" required className={inputClass}>
        {org.legalEntities
          .filter((e) => e.isActive)
          .map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
      </select>
    </Field>
  );

  return (
    <>
      <h1 className="text-2xl font-semibold">{o('title')}</h1>

      <Section
        id="legal-entities"
        title={o('legalEntities')}
        kind="legal-entities"
        columns={[o('name'), o('code'), o('tin'), o('bin')]}
        rows={org.legalEntities.map((e) => ({
          id: e.id,
          isActive: e.isActive,
          cells: [e.name, e.code ?? '—', e.tin ?? '—', e.bin ?? '—'],
        }))}
        form={
          <ActionForm action={createOrgItem.bind(null, 'legal-entities')} submitLabel={o('add')}>
            {text('name', o('name'))}
            {text('code', o('code'), false)}
            {text('legalName', o('legalName'), false)}
            {text('registrationNo', o('registrationNo'), false)}
            {text('tin', o('tin'), false)}
            {text('bin', o('bin'), false)}
          </ActionForm>
        }
      />

      <Section
        id="locations"
        title={o('locations')}
        kind="locations"
        columns={[o('name'), o('code'), o('kind'), o('legalEntity'), o('geofence')]}
        rows={org.locations.map((l) => ({
          id: l.id,
          isActive: l.isActive,
          cells: [
            l.name,
            l.code,
            t(`locationKinds.${l.kind}`),
            entityName(l.legalEntityId),
            l.geofenceRadiusM ?? '—',
          ],
        }))}
        form={
          <ActionForm action={createOrgItem.bind(null, 'locations')} submitLabel={o('add')}>
            {entitySelect}
            {text('code', o('code'))}
            {text('name', o('name'))}
            <Field label={o('kind')}>
              <select name="kind" className={inputClass}>
                {LOCATION_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`locationKinds.${k}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={o('latitude')}>
              <input name="latitude" type="number" step="any" className={inputClass} />
            </Field>
            <Field label={o('longitude')}>
              <input name="longitude" type="number" step="any" className={inputClass} />
            </Field>
            <Field label={o('geofence')}>
              <input
                name="geofenceRadiusM"
                type="number"
                min={20}
                max={5000}
                className={inputClass}
              />
            </Field>
          </ActionForm>
        }
      />

      <Section
        id="org-units"
        title={o('orgUnits')}
        kind="org-units"
        columns={[o('name'), o('code'), o('kind'), o('legalEntity')]}
        rows={treeOrder(org.orgUnits).map(({ unit, depth }) => ({
          id: unit.id,
          isActive: unit.isActive,
          cells: [
            <span key="name" style={{ paddingInlineStart: `${depth * 1.25}rem` }}>
              {depth > 0 && <span className="text-slate-400">└ </span>}
              {unit.name}
              {unit.nameBn && (
                <span lang="bn" className="ms-2 text-xs text-slate-500">
                  {unit.nameBn}
                </span>
              )}
            </span>,
            unit.code,
            t(`orgUnitKinds.${unit.kind}`),
            entityName(unit.legalEntityId),
          ],
        }))}
        form={
          <ActionForm action={createOrgItem.bind(null, 'org-units')} submitLabel={o('add')}>
            {entitySelect}
            <Field label={o('parent')}>
              <select name="parentId" className={inputClass}>
                <option value="">{o('noParent')}</option>
                {treeOrder(org.orgUnits).map(({ unit, depth }) => (
                  <option key={unit.id} value={unit.id}>
                    {`${'  '.repeat(depth)}${unit.name} (${entityName(unit.legalEntityId)})`}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={o('kind')}>
              <select name="kind" className={inputClass}>
                {ORG_UNIT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`orgUnitKinds.${k}`)}
                  </option>
                ))}
              </select>
            </Field>
            {text('code', o('code'))}
            {text('name', o('name'))}
            {text('nameBn', o('nameBn'), false)}
          </ActionForm>
        }
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Section
          id="designations"
          title={o('designations')}
          kind="designations"
          columns={[o('name'), o('code'), o('workerCategory')]}
          rows={org.designations.map((d) => ({
            id: d.id,
            isActive: d.isActive,
            cells: [d.name, d.code, t(`workerCategories.${d.workerCategory}`)],
          }))}
          form={
            <ActionForm action={createOrgItem.bind(null, 'designations')} submitLabel={o('add')}>
              {text('code', o('code'))}
              {text('name', o('name'))}
              {text('nameBn', o('nameBn'), false)}
              <Field label={o('workerCategory')}>
                <select name="workerCategory" className={inputClass}>
                  {WORKER_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`workerCategories.${c}`)}
                    </option>
                  ))}
                </select>
              </Field>
            </ActionForm>
          }
        />
        <Section
          id="grades"
          title={o('grades')}
          kind="grades"
          columns={[o('code'), o('name'), o('rank')]}
          rows={org.grades.map((g) => ({
            id: g.id,
            isActive: g.isActive,
            cells: [g.code, g.name, g.rank],
          }))}
          form={
            <ActionForm action={createOrgItem.bind(null, 'grades')} submitLabel={o('add')}>
              {text('code', o('code'))}
              {text('name', o('name'))}
              <Field label={o('rank')}>
                <input
                  name="rank"
                  type="number"
                  min={0}
                  max={1000}
                  required
                  className={inputClass}
                />
              </Field>
            </ActionForm>
          }
        />
      </div>

      <Section
        id="cost-centres"
        title={o('costCentres')}
        kind="cost-centres"
        columns={[o('code'), o('name')]}
        rows={org.costCentres.map((c) => ({
          id: c.id,
          isActive: c.isActive,
          cells: [c.code, c.name],
        }))}
        form={
          <ActionForm action={createOrgItem.bind(null, 'cost-centres')} submitLabel={o('add')}>
            {text('code', o('code'))}
            {text('name', o('name'))}
          </ActionForm>
        }
      />
    </>
  );
}
