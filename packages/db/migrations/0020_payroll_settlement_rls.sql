-- Tenant isolation for the Phase 2 M4 table (same policy as 0001_rls.sql). The settlement and
-- participation fund components reach existing workspaces through `provision`.
ALTER TABLE "wppf_years" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "wppf_years" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "wppf_years"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
