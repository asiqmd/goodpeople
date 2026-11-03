CREATE TABLE "anomaly_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"rule" text NOT NULL,
	"month" text NOT NULL,
	"scope_key" text NOT NULL,
	"version" text NOT NULL,
	"source_version" text NOT NULL,
	"source_revision" text NOT NULL,
	"measured_at" timestamp with time zone NOT NULL,
	"evidence_enc" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"assignee_id" uuid,
	"superseded_at" timestamp with time zone,
	"reason_enc" text,
	"resolution_revision" text,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "anomaly_findings_revision_uq" UNIQUE("tenant_id","rule","scope_key","month","version","source_revision"),
	CONSTRAINT "anomaly_findings_rule_ck" CHECK ("anomaly_findings"."rule" in ('assignment_coverage','attendance_processing','attendance_movement','payroll_movement')),
	CONSTRAINT "anomaly_findings_owner_ck" CHECK (("anomaly_findings"."status" = 'open' and "anomaly_findings"."assignee_id" is null) or ("anomaly_findings"."status" in ('assigned','acknowledged','dismissed','resolved') and "anomaly_findings"."assignee_id" is not null)),
	CONSTRAINT "anomaly_findings_reason_ck" CHECK (("anomaly_findings"."status" = 'dismissed') = ("anomaly_findings"."reason_enc" is not null)),
	CONSTRAINT "anomaly_findings_resolution_ck" CHECK (("anomaly_findings"."status" = 'resolved' and "anomaly_findings"."resolution_revision" is not null and "anomaly_findings"."resolved_at" is not null) or ("anomaly_findings"."status" <> 'resolved' and "anomaly_findings"."resolution_revision" is null and "anomaly_findings"."resolved_at" is null))
);
--> statement-breakpoint
ALTER TABLE "anomaly_findings" ADD CONSTRAINT "anomaly_findings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anomaly_findings" ADD CONSTRAINT "anomaly_findings_assignee_fk" FOREIGN KEY ("tenant_id","assignee_id") REFERENCES "public"."tenant_users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "anomaly_findings_current_uq" ON "anomaly_findings" USING btree ("tenant_id","rule","scope_key","month") WHERE "anomaly_findings"."superseded_at" is null;--> statement-breakpoint
CREATE INDEX "anomaly_findings_inbox_idx" ON "anomaly_findings" USING btree ("tenant_id","rule","scope_key","month","measured_at","id");--> statement-breakpoint
ALTER TABLE "anomaly_findings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "anomaly_findings" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "anomaly_findings"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
