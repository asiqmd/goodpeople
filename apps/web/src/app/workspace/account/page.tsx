import { getTranslations } from 'next-intl/server';
import { startSso } from '@/app/actions/identity';
import { Card, buttonClass } from '@/components/ui';
import { authedFetch } from '@/lib/api';
import type { AccountView } from '@gp/shared';
import { AccountPanels } from '@/components/account/account-view';
import { HelpLink } from '@/components/help/help-link';
import { load } from '@/lib/api';

export default async function AccountPage() {
  const account = await load<AccountView>('tenant', '/account');
  const sso = await authedFetch<{ available: boolean; linked: boolean }>('tenant', '/account/sso');
  const t = await getTranslations('identity');
  return (
    <>
      <p className="-mb-3 text-end">
        <HelpLink slug="sign-in-and-two-step" />
      </p>
      <AccountPanels account={account} kind="tenant" />
      {sso.ok && sso.data.available && (
        <Card title={t('sso')}>
          <p className="mb-3 text-sm text-slate-600">{t(sso.data.linked ? 'linked' : 'ssoHint')}</p>
          <form action={startSso}>
            <input type="hidden" name="mode" value="link" />
            <button className={buttonClass.secondary}>{t('linkOwnIdentity')}</button>
          </form>
        </Card>
      )}
    </>
  );
}
