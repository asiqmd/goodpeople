DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['engagement_surveys','survey_participants','recognitions','announcements','announcement_receipts','hr_requests','hr_request_messages','company_assets','asset_issues'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY "tenant_isolation" ON %I USING ("tenant_id" = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK ("tenant_id" = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',t);
  END LOOP;
END
$$;
