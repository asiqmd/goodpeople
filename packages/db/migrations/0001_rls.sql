-- Tenant isolation. Every tenant-scoped table is filtered by the app.tenant_id setting,
-- which runAsTenant() sets per transaction. With no setting, these tables return nothing.
-- FORCE applies the policy to the table owner too, so migrations and seeds cannot leak rows.
ALTER TABLE "tenant_users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_users" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "tenant_users"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "legal_entities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "legal_entities" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "legal_entities"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint

-- The platform audit log is append-only for every role.
CREATE FUNCTION "forbid_audit_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'platform_audit_log is append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "platform_audit_log_append_only"
  BEFORE UPDATE OR DELETE ON "platform_audit_log"
  FOR EACH ROW EXECUTE FUNCTION "forbid_audit_change"();
