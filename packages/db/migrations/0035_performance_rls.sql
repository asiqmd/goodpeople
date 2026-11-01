-- Tenant isolation for the Phase 4 M2 tables (same policy as 0001_rls.sql).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'performance_settings', 'review_cycles', 'goals', 'goal_checkins', 'reviews', 'peer_feedback',
    'improvement_plans', 'plan_checkins', 'probation_reviews'
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
