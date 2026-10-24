import type { AccountView } from '@gp/shared';
import { getTranslations } from 'next-intl/server';
import type { SessionKind } from '@/lib/session';
import { Badge, Card } from '../ui';
import { MfaDisableForm, MfaSetupForm, PasswordForm } from './account-forms';

/** The signed-in person's own login: who they are, their password and two-step sign-in. */
export async function AccountPanels({
  account,
  kind,
}: {
  account: AccountView;
  kind: SessionKind;
}) {
  const t = await getTranslations('account');
  const th = await getTranslations('hr');
  const tp = await getTranslations('platformRoles');
  const role =
    account.kind === 'tenant'
      ? th(`roles.${account.role as 'employee'}`)
      : tp(account.role as 'super_admin');
  return (
    <>
      <Card title={t('title')}>
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-slate-500">{t('name')}</dt>
            <dd className="font-medium">{account.name}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t('email')}</dt>
            <dd className="font-medium">{account.email ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t('phone')}</dt>
            <dd className="font-medium">{account.phone ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">{t('role')}</dt>
            <dd className="font-medium">{role}</dd>
          </div>
        </dl>
      </Card>

      {account.hasPassword ? (
        <>
          <Card
            title={t('mfa')}
            action={
              <Badge tone={account.mfaEnabled ? 'green' : 'amber'}>
                {account.mfaEnabled ? t('on') : t('off')}
              </Badge>
            }
          >
            {account.mfaEnabled ? (
              <div className="space-y-4 text-sm text-slate-700">
                <p>{t('recoveryLeft', { count: account.recoveryCodesLeft })}</p>
                {account.mfaRequired ? (
                  <p className="text-slate-500">{t('mfaRequired')}</p>
                ) : (
                  <MfaDisableForm kind={kind} />
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {account.mfaRequired && (
                  <p className="text-sm text-amber-700">{t('mfaRequiredSetup')}</p>
                )}
                <MfaSetupForm kind={kind} />
              </div>
            )}
          </Card>
          <Card title={t('password')}>
            <PasswordForm kind={kind} />
          </Card>
        </>
      ) : (
        <Card title={t('signIn')}>
          <p className="text-sm text-slate-600">{t('phoneOnly')}</p>
        </Card>
      )}
    </>
  );
}
