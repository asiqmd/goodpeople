import {
  Injectable,
  StreamableFile,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { policyCan, policyField, type AccessField, type FieldActions } from '@gp/shared';
import { map } from 'rxjs';
import type { AuthedRequest, AuthUser } from './auth-user.js';
import { forbidden } from './errors.js';

const keys: Record<AccessField, Set<string>> = {
  identity: new Set([
    'identity',
    'identifiers',
    'originalName',
    'translatedName',
    'citizenship',
    'insuranceClass',
    'contractClass',
    'suppliedHijriDate',
    'calendarProvenance',
    'nid',
    'nidEnc',
    'nidLast4',
    'birthRegistration',
    'birthRegistrationLast4',
    'passport',
    'passportLast4',
    'tin',
    'dateOfBirth',
    'isAdolescent',
    'adolescent',
    'fatherName',
    'motherName',
    'spouseName',
    'nominees',
  ]),
  bank: new Set([
    'paymentAccounts',
    'accountNumber',
    'accountNumberEnc',
    'accountNumberLast4',
    'bankName',
    'branchName',
    'routingNo',
    'accountNo',
    'accountLast4',
    'walletNumber',
    'paymentAccount',
    'bankAccount',
    'bankAccounts',
    'iban',
    'routingNumber',
  ]),
  contacts: new Set([
    'email',
    'phone',
    'mobilePhone',
    'workEmail',
    'personalEmail',
    'presentAddress',
    'permanentAddress',
    'address',
    'emergencyContact',
    'emergencyPhone',
  ]),
  pay: new Set([
    'pay',
    'gross',
    'net',
    'netPay',
    'basic',
    'amount',
    'amounts',
    'salary',
    'proposedGross',
    'currentGross',
    'monthlyGross',
    'budget',
    'grossBudget',
    'totals',
    'increment',
    'payHistory',
  ]),
};
export function fieldAllowed(
  user: AuthUser | undefined,
  field: AccessField,
  action: keyof FieldActions,
): boolean {
  return (
    user?.selfService ||
    user?.kind !== 'tenant' ||
    !user.policy?.custom ||
    (policyField(user.policy, field, action) &&
      (action !== 'export' || policyField(user.policy, field, 'read')))
  );
}
function groupOf(key: string): AccessField | undefined {
  return (Object.keys(keys) as AccessField[]).find((g) => keys[g].has(key));
}
export function projectFields(value: unknown, user: AuthUser): unknown {
  if (value === null || typeof value !== 'object' || value instanceof Date) return value;
  if (Buffer.isBuffer(value) || value instanceof StreamableFile) {
    if (
      (['identity', 'bank', 'contacts', 'pay'] as const).every((f) =>
        fieldAllowed(user, f, 'export'),
      )
    )
      return value;
    throw forbidden('field_export_denied', 'This export includes restricted fields');
  }
  if (Array.isArray(value)) return value.map((v) => projectFields(v, user));
  return Object.fromEntries(
    Object.entries(value).map(([key, v]) => {
      const group = groupOf(key);
      return [
        key,
        group && !fieldAllowed(user, group, 'read')
          ? Array.isArray(v)
            ? []
            : null
          : projectFields(v, user),
      ];
    }),
  );
}
export function checkFieldRequest(req: AuthedRequest): void {
  const user = req.user;
  if (user?.kind !== 'tenant' || !req.path.startsWith('/tenant/')) return;
  if (user.selfService) return;
  const financial =
    /\/(pay|pay-history|payroll|payslips|tax|provident-fund|gratuity|loans)(?:\/|$)/.test(req.path);
  if (
    financial &&
    !req.path.startsWith('/tenant/uae/') &&
    !req.path.startsWith('/tenant/saudi/') &&
    ((user.restrictedCompanies && !user.policy?.custom) ||
      (user.policy?.custom &&
        (user.policy.companies ?? []).some((c) =>
          (user.scopePermissions ?? []).some((p) => !policyCan(user.policy!, p, c)),
        )))
  )
    throw forbidden(
      'company_bound_workflow_required',
      'Historic payroll and workspace-wide financial reports require all-company access',
    );
  if (!user.policy?.custom) return;
  const fields = ['identity', 'bank', 'contacts', 'pay'] as const;
  if (
    /\/(letters|documents|offers|imports|audit|reports|grievances)(?:\/|$)/.test(req.path) &&
    fields.some((f) => !fieldAllowed(user, f, 'read'))
  )
    throw forbidden('field_read_denied', 'This content can include restricted fields');
  const exportPath =
    /(export|download|\/file(?:\/|$)|\.pdf|\.xlsx|\/pdf(?:\/|$)|register|payslip|journal|bank-advice|cash-sheet)/i.test(
      req.path,
    );
  if (exportPath && fields.some((f) => !fieldAllowed(user, f, 'export')))
    throw forbidden('field_export_denied', 'This export includes restricted fields');
  if (
    /(payroll|payslips|compensation|pay-groups|salary-structures|pay-components|\/pay(?:\/|$))/.test(
      req.path,
    ) &&
    !fieldAllowed(user, 'pay', 'read')
  )
    throw forbidden('field_read_denied', 'Pay access is restricted');
  if (
    Object.keys(req.query).some((k) => {
      const group = groupOf(k);
      return group && !fieldAllowed(user, group, 'read');
    }) ||
    (/(search|sort|order|filter)/i.test(Object.keys(req.query).join(' ')) &&
      fields.some((f) => !fieldAllowed(user, f, 'read')))
  )
    throw forbidden('field_filter_denied', 'Filtering restricted fields is not available');
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    for (const [key, v] of Object.entries(value)) {
      const group = groupOf(key);
      if (group && !fieldAllowed(user, group, 'write'))
        throw forbidden('field_write_denied', 'This change includes restricted fields');
      visit(v);
    }
  };
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    for (const [matches, field] of [
      [financial, 'pay'],
      [req.path.includes('/payment-accounts'), 'bank'],
      [req.path.includes('/nominees'), 'identity'],
    ] as const)
      if (matches && !fieldAllowed(user, field, 'write'))
        throw forbidden('field_write_denied', 'This workflow changes restricted fields');
    visit(req.body);
  }
  // Tenant-wide configuration cannot be changed with a grant for one company/person.
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
    /(settings|types|components|structures|templates|calendars|holidays|devices|rosters|committees|trade-unions|donors|cycles|courses)/.test(
      req.path,
    )
  ) {
    const needed = user.scopePermissions ?? [];
    if (
      needed.some(
        (p) =>
          !user.policy!.grants.some(
            (g) => g.scope === 'all' && g.relationship === 'all' && g.permissions.includes(p),
          ),
      )
    )
      throw forbidden(
        'global_permission_required',
        'Workspace settings require a grant for all companies',
      );
  }
}
@Injectable()
export class FieldProjectionInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const user = req.user;
    return next
      .handle()
      .pipe(
        map((value) =>
          user?.kind === 'tenant' &&
          user.policy?.custom &&
          !user.selfService &&
          req.path.startsWith('/tenant/')
            ? projectFields(value, user)
            : value,
        ),
      );
  }
}
