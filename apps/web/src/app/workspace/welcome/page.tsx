import { can, type SetupChecklist, type SetupStepKey, type TenantAccessView } from '@gp/shared';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Badge, Card } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

/** The first steps after sign-up, each read from the go-live checklist. */
const STEPS: { key: string; from: SetupStepKey; href: string; payroll?: boolean }[] = [
  { key: 'company', from: 'company', href: '/workspace/organization' },
  { key: 'org', from: 'org', href: '/workspace/organization' },
  { key: 'employees', from: 'employees', href: '/workspace/employees/import' },
  { key: 'team', from: 'hr_team', href: '/workspace/users' },
  { key: 'pay', from: 'pay_records', href: '/workspace/payroll?tab=structures', payroll: true },
];

export default async function WelcomePage() {
  const user = await currentTenantUser();
  if (!can(user?.role, 'org.manage')) redirect('/workspace');
  const t = await getTranslations('welcome');
  const ti = await getTranslations('industries');
  const [access, checklist] = await Promise.all([
    load<TenantAccessView>('tenant', '/tenant/access'),
    load<SetupChecklist>('tenant', '/tenant/setup-checklist'),
  ]);
  const status = (key: SetupStepKey) => checklist.steps.find((s) => s.key === key)?.status;
  const steps = STEPS.filter((s) => !s.payroll || access.access.features.includes('payroll')).map(
    (s, i) => ({ ...s, n: i + 1, done: status(s.from) === 'done' }),
  );
  const next = steps.find((s) => !s.done);

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('title', { name: access.tenant.name })}</h1>
      <p className="text-sm text-slate-600">
        {t('intro', { industry: ti(access.tenant.industryTemplate) })}
      </p>
      <Card title={t('stepsTitle')}>
        <ol className="-mx-5 divide-y divide-slate-100">
          {steps.map((s) => (
            <li key={s.key} className="flex items-start justify-between gap-4 px-5 py-3">
              <div className="flex min-w-0 gap-3">
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    s.done ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {s.done ? '✓' : s.n}
                </span>
                <div>
                  <p className="text-sm font-medium">{t(`steps.${s.key}.title`)}</p>
                  <p className="text-sm text-slate-600">{t(`steps.${s.key}.body`)}</p>
                </div>
              </div>
              {s.done ? (
                <Badge tone="green">{t('done')}</Badge>
              ) : (
                <Link
                  href={s.href}
                  className={`shrink-0 text-sm font-medium hover:underline ${
                    s === next ? 'text-brand-700' : 'text-slate-600'
                  }`}
                >
                  {s === next ? t('startHere') : t('open')}
                </Link>
              )}
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-slate-600">
          {t('checklist')}{' '}
          <Link href="/workspace/setup" className="font-medium text-brand-700 hover:underline">
            {t('checklistLink')}
          </Link>
        </p>
      </Card>
    </>
  );
}
