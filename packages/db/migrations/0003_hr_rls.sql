-- Tenant isolation for the Phase 1 M1 tables (same policy as 0001_rls.sql).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'locations', 'org_units', 'designations', 'grades', 'cost_centres', 'employees',
    'job_assignments', 'employee_nominees', 'employee_payment_accounts', 'tenant_audit_log'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY "tenant_isolation" ON %I
         USING ("tenant_id" = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
         WITH CHECK ("tenant_id" = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t);
  END LOOP;
END
$$;--> statement-breakpoint

-- The workspace audit log is append-only for every role.
CREATE FUNCTION "forbid_tenant_audit_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'tenant_audit_log is append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "tenant_audit_log_append_only"
  BEFORE UPDATE OR DELETE ON "tenant_audit_log"
  FOR EACH ROW EXECUTE FUNCTION "forbid_tenant_audit_change"();
