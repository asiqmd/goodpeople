-- Tenant isolation for the Phase 2 M3 tables (same policy as 0001_rls.sql).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tax_profiles', 'tax_declarations', 'tax_openings', 'tax_deposits',
                           'pf_members', 'pf_entries', 'employee_loans', 'loan_repayments',
                           'pay_batches'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY "tenant_isolation" ON %I
         USING ("tenant_id" = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
         WITH CHECK ("tenant_id" = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t);
  END LOOP;
END
$$;
--> statement-breakpoint
-- Absence and leave without pay reduce taxable salary from M3; existing workspaces still have
-- the M2 default (exempt) on these system components. Row security is forced even for the
-- owner, so each workspace is updated under its own id.
DO $$
DECLARE
  w record;
BEGIN
  FOR w IN SELECT id FROM tenants LOOP
    PERFORM set_config('app.tenant_id', w.id::text, true);
    UPDATE pay_components SET tax_treatment = 'taxable'
     WHERE is_system AND code IN ('ABSENCE', 'UNPAID_LEAVE') AND tax_treatment = 'exempt';
  END LOOP;
  PERFORM set_config('app.tenant_id', '', true);
END
$$;
