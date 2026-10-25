import {
  can,
  type PayComponentView,
  type PayGroupView,
  type PayrollSettingsView,
  type SalaryStructureView,
  type WageBoardView,
} from '@gp/shared';
import { getFormatter, getLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { day } from '@/components/leave/leave-views';
import {
  ComponentEditForm,
  ComponentForm,
  MakeDefaultButton,
  MakerCheckerSwitch,
  PayGroupForm,
  StructureEditor,
} from '@/components/payroll/payroll-forms';
import { AccountsForm, TaxFundSettingsForm } from '@/components/payroll/benefit-forms';
import { isSetupTab, PayrollTabs, taka } from '@/components/payroll/payroll-views';
import { Badge, Card } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

export default async function PayrollSetupPage({ searchParams }: PageProps<'/workspace/payroll'>) {
  const role = (await currentTenantUser())?.role;
  if (!can(role, 'payroll.view')) redirect('/workspace');
  const canEdit = can(role, 'payroll.manage');
  const t = await getTranslations('payroll');
  const format = await getFormatter();
  const locale = await getLocale();
  const params = await searchParams;
  const tab = isSetupTab(params.tab) ? params.tab : 'structures';
  const name = (x: { name: string; nameBn: string | null }) =>
    locale === 'bn' && x.nameBn ? x.nameBn : x.name;

  const nav = <PayrollTabs current={tab} />;

  if (tab === 'components') {
    const components = await load<PayComponentView[]>('tenant', '/tenant/payroll/components');
    return (
      <>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        {nav}
        <Card title={t('components.title')}>
          <p className="mb-4 text-sm text-slate-600">{t('components.intro')}</p>
          <ul className="-mx-5 divide-y divide-slate-100">
            {components.map((c) => (
              <li key={c.id} className="px-5 py-3">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono text-xs text-slate-500">{c.code}</span>
                    <span className={c.isActive ? 'font-medium' : 'text-slate-400 line-through'}>
                      {name(c)}
                    </span>
                    <Badge
                      tone={
                        c.kind === 'deduction' ? 'red' : c.kind === 'earning' ? 'green' : 'slate'
                      }
                    >
                      {t(`components.kinds.${c.kind}`)}
                    </Badge>
                    <Badge tone="slate">{t(`components.calculations.${c.calculation}`)}</Badge>
                    {c.inGross && <Badge tone="blue">{t('components.inGross')}</Badge>}
                    {c.inOvertimeBase && (
                      <Badge tone="violet">{t('components.inOvertimeBase')}</Badge>
                    )}
                  </summary>
                  {canEdit && <ComponentEditForm component={c} />}
                </details>
              </li>
            ))}
          </ul>
        </Card>
        {canEdit && (
          <Card title={t('components.add')}>
            <ComponentForm />
          </Card>
        )}
      </>
    );
  }

  if (tab === 'groups') {
    const groups = await load<PayGroupView[]>('tenant', '/tenant/payroll/pay-groups');
    return (
      <>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        {nav}
        <Card title={t('groups.title')}>
          <p className="mb-4 text-sm text-slate-600">{t('groups.intro')}</p>
          <ul className="-mx-5 divide-y divide-slate-100 text-sm">
            {groups.map((g) => (
              <li
                key={g.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
              >
                <span className="flex items-center gap-2">
                  <span className="font-mono text-xs text-slate-500">{g.code}</span>
                  <span className="font-medium">{g.name}</span>
                  <Badge tone="slate">{t(`groups.frequencies.${g.frequency}`)}</Badge>
                  {g.isDefault && <Badge tone="green">{t('groups.default')}</Badge>}
                </span>
                <span className="flex items-center gap-3 text-slate-500">
                  {t('groups.members', { count: g.members })}
                  {canEdit && !g.isDefault && <MakeDefaultButton id={g.id} />}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        {canEdit && (
          <Card title={t('groups.add')}>
            <PayGroupForm />
          </Card>
        )}
      </>
    );
  }

  if (tab === 'wages') {
    const boards = await load<WageBoardView[]>('tenant', '/tenant/payroll/wage-boards');
    return (
      <>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        {nav}
        {boards.map((b) => (
          <Card
            key={b.id}
            title={b.name}
            action={
              <Badge tone={b.status === 'verified' ? 'green' : 'amber'}>
                {t(`wages.status.${b.status}`)}
              </Badge>
            }
          >
            <p className="mb-1 text-sm text-slate-600">
              {b.sector} · {t('wages.from', { date: day(format, b.effectiveFrom) })}
            </p>
            <p className="mb-4 text-xs text-slate-500">
              {b.reference}
              {b.note && <span className="block">{b.note}</span>}
            </p>
            <div className="-mx-5 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-2 font-medium">{t('wages.grade')}</th>
                    <th className="px-5 py-2 text-right font-medium">{t('pay.gross')}</th>
                    {Object.keys(b.grades[0]?.components ?? {}).map((code) => (
                      <th key={code} className="px-5 py-2 text-right font-medium">
                        {code}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {b.grades.map((g) => (
                    <tr key={g.grade}>
                      <td className="px-5 py-2">{g.name}</td>
                      <td className="px-5 py-2 text-right font-medium tabular-nums">
                        {taka(format, g.gross)}
                      </td>
                      {Object.values(g.components).map((v, i) => (
                        <td key={i} className="px-5 py-2 text-right tabular-nums text-slate-600">
                          {taka(format, v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </>
    );
  }

  if (tab === 'settings') {
    const settings = await load<PayrollSettingsView>('tenant', '/tenant/payroll/settings');
    return (
      <>
        <h1 className="text-2xl font-semibold">{t('title')}</h1>
        {nav}
        <Card
          title={t('settings.makerChecker')}
          action={
            <Badge tone={settings.makerChecker ? 'green' : 'amber'}>
              {settings.makerChecker ? t('on') : t('off')}
            </Badge>
          }
        >
          {can(role, 'payroll.manage') && can(role, 'payroll.approve') ? (
            <MakerCheckerSwitch on={settings.makerChecker} approvers={settings.approvers} />
          ) : (
            <p className="text-sm text-slate-600">{t('settings.makerCheckerHint')}</p>
          )}
        </Card>
        <Card title={t('settings.taxFundTitle')}>
          {canEdit ? (
            <TaxFundSettingsForm settings={settings} />
          ) : (
            <p className="text-sm text-slate-600">
              {settings.pfEnabled
                ? t('pf.rates', {
                    employee: Number(settings.pfEmployeeRate),
                    employer: Number(settings.pfEmployerRate),
                  })
                : t('pf.off')}
            </p>
          )}
        </Card>
        {canEdit && (
          <Card title={t('settings.accountsTitle')}>
            <AccountsForm settings={settings} />
          </Card>
        )}
      </>
    );
  }

  const [structures, components, boards] = await Promise.all([
    load<SalaryStructureView[]>('tenant', '/tenant/payroll/structures'),
    load<PayComponentView[]>('tenant', '/tenant/payroll/components'),
    load<WageBoardView[]>('tenant', '/tenant/payroll/wage-boards'),
  ]);
  return (
    <>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>
      {nav}
      {structures.map((s) => (
        <Card
          key={s.id}
          title={name(s)}
          action={
            <span className="flex gap-2">
              {!s.isActive && <Badge tone="slate">{t('inactive')}</Badge>}
              <Badge tone="blue">{t('structures.people', { count: s.inUse })}</Badge>
            </span>
          }
        >
          <StructureEditor
            structure={s}
            components={components}
            wageBoards={boards}
            canEdit={canEdit}
          />
        </Card>
      ))}
      {canEdit && (
        <Card title={t('structures.add')}>
          <StructureEditor components={components} wageBoards={boards} canEdit />
        </Card>
      )}
    </>
  );
}
