import type { AccountView } from '@gp/shared';
import { AccountPanels } from '@/components/account/account-view';
import { load } from '@/lib/api';

export default async function AccountPage() {
  const account = await load<AccountView>('tenant', '/account');
  return <AccountPanels account={account} kind="tenant" />;
}
