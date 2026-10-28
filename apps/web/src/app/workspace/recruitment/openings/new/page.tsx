import { can } from '@gp/shared';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { openingChoices } from '@/components/recruitment/opening-choices';
import { OpeningForm } from '@/components/recruitment/opening-forms';
import { Card } from '@/components/ui';
import { currentTenantUser } from '@/lib/api';

/** Drafting an opening: HR for any team, a line manager for their own. */
export default async function NewOpeningPage() {
  const t = await getTranslations('openings');
  const manage = can((await currentTenantUser())?.role, 'recruitment.manage');
  const choices = await openingChoices(manage);
  return (
    <>
      <div className="space-y-1">
        <Link href="/workspace/recruitment" className="text-sm text-slate-500 hover:underline">
          ← {t('title')}
        </Link>
        <h1 className="text-2xl font-semibold">{t('new.title')}</h1>
        <p className="text-sm text-slate-600">{manage ? t('new.intro') : t('new.introManager')}</p>
      </div>
      <Card>
        <OpeningForm {...choices} />
      </Card>
    </>
  );
}
