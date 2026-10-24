import { can, type AccountView, type WorkspaceUserView } from '@gp/shared';
import { getFormatter, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { CreateUserForm, UserActions } from '@/components/account/account-forms';
import { Badge, Card } from '@/components/ui';
import { currentTenantUser, load } from '@/lib/api';

export default async function UsersPage() {
  const user = await currentTenantUser();
  if (!can(user?.role, 'users.manage')) notFound();
  const t = await getTranslations('users');
  const th = await getTranslations('hr');
  const format = await getFormatter();
  const [users, me] = await Promise.all([
    load<WorkspaceUserView[]>('tenant', '/tenant/users'),
    load<AccountView>('tenant', '/account'),
  ]);
  const admins = users.filter((u) => !u.disabled && ['tenant_admin', 'hr_admin'].includes(u.role));
  const unsecured = admins.filter((u) => !u.mfaEnabled).length;

  return (
    <>
      <Card title={t('title')}>
        <p className="mb-4 text-sm text-slate-600">{t('intro')}</p>
        {unsecured > 0 && (
          <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-600/20">
            {t('adminsWithoutMfa', { count: unsecured })}
          </p>
        )}
        <div className="-mx-5 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-2 font-medium">{t('name')}</th>
                <th className="px-5 py-2 font-medium">{t('signsInWith')}</th>
                <th className="px-5 py-2 font-medium">{t('role')}</th>
                <th className="px-5 py-2 font-medium">{t('employee')}</th>
                <th className="px-5 py-2 font-medium">{t('lastSignIn')}</th>
                <th className="px-5 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top">
              {users.map((u) => (
                <tr key={u.id} className={u.disabled ? 'text-slate-400' : undefined}>
                  <td className="min-w-40 px-5 py-3">
                    <span className="font-medium">{u.name}</span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {u.disabled && <Badge tone="slate">{t('disabled')}</Badge>}
                      {u.mfaEnabled && <Badge tone="green">{t('mfa')}</Badge>}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {u.email && <span className="block">{u.email}</span>}
                    {u.phone && <span className="block text-slate-500">{u.phone}</span>}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3">{th(`roles.${u.role}`)}</td>
                  <td className="px-5 py-3">
                    {u.employee ? `${u.employee.employeeCode} · ${u.employee.fullName}` : '—'}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-slate-500">
                    {u.lastSignInAt
                      ? format.dateTime(new Date(u.lastSignInAt), {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })
                      : t('never')}
                  </td>
                  <td className="px-5 py-3">
                    <UserActions user={u} self={u.id === me.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title={t('add')}>
        <CreateUserForm />
      </Card>
      <Card title={t('rolesTitle')}>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          {(
            [
              'tenant_admin',
              'hr_admin',
              'hr_officer',
              'attendance_officer',
              'auditor',
              'employee',
            ] as const
          ).map((r) => (
            <div key={r}>
              <dt className="font-medium">{th(`roles.${r}`)}</dt>
              <dd className="text-slate-600">{t(`roleDescriptions.${r}`)}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </>
  );
}
