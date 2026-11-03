DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['learning_courses','learning_requirements','learning_sessions','learning_enrolments','learning_certificates','fire_drills'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY "tenant_isolation" ON %I USING ("tenant_id" = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',t);
  END LOOP;
END
$$;
