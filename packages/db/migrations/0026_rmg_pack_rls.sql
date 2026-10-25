-- Tenant isolation for the Phase 3 M3 tables (same policy as 0001_rls.sql).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'production_operations', 'production_entries', 'compliance_settings', 'compliance_alerts',
    'maternity_cases', 'maternity_payments', 'committees', 'committee_members',
    'committee_meetings', 'trade_unions', 'union_memberships', 'grievances',
    'grievance_messages', 'kiosks', 'kiosk_pin_codes'
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
$$;
