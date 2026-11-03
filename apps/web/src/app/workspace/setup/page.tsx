import { can, type SetupChecklist, type SetupStep } from '@gp/shared';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Card, type Tone } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

const TONE: Record<SetupStep['status'], Tone> = {
  done: 'green',
  warning: 'amber',
  todo: 'red',
  not_needed: 'slate',
};

export default async function SetupPage() {
  const user = await currentTenantUser();
  if (!can(user, 'org.manage')) notFound();
  const t = await getTranslations('setup');
  const checklist = await load<SetupChecklist>('tenant', '/tenant/setup-checklist');
  return (
    <Card
      title={t('title')}
      action={
        <span className="text-sm text-slate-600">
          {t('progress', { done: checklist.done, total: checklist.total })}
        </span>
      }
    >
      <p className="mb-4 text-sm text-slate-600">{t('intro')}</p>
      <div
        className="mb-6 h-2 overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={checklist.total}
        aria-valuenow={checklist.done}
      >
        <div
          className="h-full bg-brand-600"
          style={{ width: `${checklist.total ? (checklist.done / checklist.total) * 100 : 0}%` }}
        />
      </div>
      <ol className="-mx-5 divide-y divide-slate-100">
        {checklist.steps.map((step) => (
          <li key={step.key} className="flex items-start justify-between gap-4 px-5 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{t(`steps.${step.key}.title`)}</p>
              <p className="text-sm text-slate-600">
                {t(`steps.${step.key}.${step.status === 'done' ? 'done' : 'todo'}`, {
                  done: step.done ?? 0,
                  total: step.total ?? 0,
                })}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <Badge tone={TONE[step.status]}>{t(`statuses.${step.status}`)}</Badge>
              {step.status !== 'done' && step.status !== 'not_needed' && (
                <Link
                  href={step.link}
                  className="text-sm font-medium text-brand-700 hover:underline"
                >
                  {t('fix')}
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-4 text-xs text-slate-500">{t('outsideApp')}</p>
    </Card>
  );
}
