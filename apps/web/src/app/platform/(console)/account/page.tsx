import type { AccountView } from '@gp/shared';
import { AccountPanels } from '@/components/account/account-view';
import { load } from '@/lib/api';

export default async function PlatformAccountPage() {
  const account = await load<AccountView>('platform', '/account');
  return <AccountPanels account={account} kind="platform" />;
}
