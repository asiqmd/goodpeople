import { can, type FireDrillView, type OrgSnapshot } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { DrillForm, ReasonForm } from '@/components/learning/forms';
import { LearningHead } from '@/components/learning/views';
import { day } from '@/components/leave/leave-views';
import { Card } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';
export default async function DrillsPage() {
  if (!can((await currentTenantUser())?.role, 'learning.manage')) redirect('/workspace/learning');
  const t = await getTranslations('learning');
  const f = await getFormatter();
  const [org, drills] = await Promise.all([
    load<OrgSnapshot>('tenant', '/tenant/org'),
    load<FireDrillView[]>('tenant', '/tenant/learning/drills'),
  ]);
  return (
    <>
      <LearningHead title={t('drills')} manage />
      <p className="text-sm text-slate-600">{t('drillHint')}</p>
      <Card title={t('recordDrill')}>
        <DrillForm org={org} />
      </Card>
      {drills.map((d) => (
        <Card key={d.id} title={`${d.company.name} · ${d.location.name} · ${day(f, d.heldOn)}`}>
          <div className="mb-4 space-y-2 text-sm">
            <p>
              {t('participants')}: {f.number(d.participants)} · {t('evacuationSeconds')}:{' '}
              {f.number(d.evacuationSeconds)}
            </p>
            <p>
              {t('nextDueOn')}: {day(f, d.nextDueOn)} · {t('conductor')}: {d.conductor}
            </p>
            <p>
              {t('findings')}: {d.findings}
            </p>
            <p>
              {t('actions')}: {d.actions}
            </p>
            {d.voidedAt && (
              <p className="text-red-700">
                {t('voided')}: {d.voidReason}
              </p>
            )}
          </div>
          {!d.voidedAt && <ReasonForm kind="void" id={d.id} />}
        </Card>
      ))}
    </>
  );
}
