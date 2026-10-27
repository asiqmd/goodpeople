import type { AccountView } from '@gp/shared';
import { AccountPanels } from '@/components/account/account-view';
import { HelpLink } from '@/components/help/help-link';
import { load } from '@/lib/api';

export default async function AccountPage() {
  const account = await load<AccountView>('tenant', '/account');
  return (
    <>
      <p className="-mb-3 text-right">
        <HelpLink slug="sign-in-and-two-step" />
      </p>
      <AccountPanels account={account} kind="tenant" />
    </>
  );
}
