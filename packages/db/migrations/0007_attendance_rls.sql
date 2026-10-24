-- Tenant isolation for the Phase 1 M3 tables (same policy as 0001_rls.sql).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'shifts', 'shift_assignments', 'roster_entries', 'edge_agents', 'attendance_devices',
    'regularization_requests', 'attendance_punches', 'attendance_days', 'attendance_settings'
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
