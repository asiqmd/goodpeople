import { documents, runAsTenant, type Database } from '@gp/db';
import type { DocumentCategory, TaxYearView } from '@gp/shared';
import { eq } from 'drizzle-orm';
import { forbidden } from '../../common/errors.js';

// Identity numbers (NID, birth registration, passport, TIN) never reach a support session in
// clear. The employee page masks them by permission; these are the other places they appear,
// as declared in the payroll and documents controllers. Keep the list in step with them.

/** Files that print identity numbers in clear. */
const IDENTITY_FILES = new Set([
  // The salary certificate carries the employee's TIN.
  'GET /tenant/employees/:id/tax/certificate',
  // The withholding register and quarter statement list everyone's TIN.
  'GET /tenant/payroll/tax/register',
  'GET /tenant/payroll/tax/quarter',
]);

/** A document's file, refused when it is a scan of an identity document. */
const DOCUMENT_FILE = 'GET /tenant/documents/:id/file';
const IDENTITY_DOCUMENTS: readonly DocumentCategory[] = ['nid', 'birth_certificate', 'passport'];

/** An employee's tax year: shown with the TIN masked, as the employee page masks the rest. */
export const TAX_YEAR = 'GET /tenant/employees/:id/tax';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const hidden = () =>
  forbidden(
    'support_identity_hidden',
    'Good People support cannot see identity numbers or identity documents',
  );

/** Refuses a support login the routes that would show identity numbers or documents. */
export async function checkIdentityRoute(
  db: Database,
  tenantId: string,
  route: string,
  params: Record<string, string>,
): Promise<void> {
  if (IDENTITY_FILES.has(route)) throw hidden();
  // Not a uuid: the route's own validation answers.
  if (route !== DOCUMENT_FILE || !UUID.test(params.id ?? '')) return;
  const [document] = await runAsTenant(db, tenantId, (tx) =>
    tx.select({ category: documents.category }).from(documents).where(eq(documents.id, params.id!)),
  );
  if (document && IDENTITY_DOCUMENTS.includes(document.category)) throw hidden();
}

/** The tax year with the TIN reduced to its last four digits. */
export const maskTaxYear = (year: TaxYearView): TaxYearView =>
  year.employee.tin === null
    ? year
    : { ...year, employee: { ...year.employee, tin: `••••${year.employee.tin.slice(-4)}` } };
