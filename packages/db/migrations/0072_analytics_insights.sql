CREATE TABLE "insight_jobs" (
	"id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"auth_revision" integer NOT NULL,
	"scope_revision" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"ciphertext" text,
	"result_revision" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "insight_jobs_request_uq" UNIQUE("tenant_id","owner_id","id"),
	CONSTRAINT "insight_jobs_status_ck" CHECK ("insight_jobs"."status" in ('queued','ready','cancelled','failed')),
	CONSTRAINT "insight_jobs_ciphertext_ck" CHECK (("insight_jobs"."status" = 'ready' and "insight_jobs"."ciphertext" is not null and "insight_jobs"."result_revision" is not null) or ("insight_jobs"."status" <> 'ready' and "insight_jobs"."ciphertext" is null and "insight_jobs"."result_revision" is null))
);
--> statement-breakpoint
CREATE TABLE "saved_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"definition" jsonb NOT NULL,
	"version" text NOT NULL,
	CONSTRAINT "saved_insights_tenant_owner_id_uq" UNIQUE("tenant_id","owner_id","id"),
	CONSTRAINT "saved_insights_definition_uq" UNIQUE("tenant_id","owner_id","version","definition")
);
--> statement-breakpoint
ALTER TABLE "insight_jobs" ADD CONSTRAINT "insight_jobs_family_id_auth_sessions_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."auth_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_jobs" ADD CONSTRAINT "insight_jobs_report_fk" FOREIGN KEY ("tenant_id","owner_id","report_id") REFERENCES "public"."saved_insights"("tenant_id","owner_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_insights" ADD CONSTRAINT "saved_insights_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_insights" ADD CONSTRAINT "saved_insights_owner_fk" FOREIGN KEY ("tenant_id","owner_id") REFERENCES "public"."tenant_users"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "insight_jobs_queue_idx" ON "insight_jobs" USING btree ("tenant_id","status","created_at");--> statement-breakpoint
CREATE INDEX "insight_jobs_expiry_idx" ON "insight_jobs" USING btree ("tenant_id","expires_at");
--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['saved_insights','insight_jobs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid)', t
    );
  END LOOP;
END $$;
