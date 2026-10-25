CREATE TABLE "payment_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"summary" jsonb NOT NULL,
	"result_enc" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_checks_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "payroll_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"headers" jsonb NOT NULL,
	"row_count" integer NOT NULL,
	"sheet_enc" text NOT NULL,
	"mapping" jsonb,
	"status" text DEFAULT 'draft' NOT NULL,
	"summary" jsonb,
	"result_enc" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"compared_by" uuid,
	"compared_at" timestamp with time zone,
	CONSTRAINT "payroll_reconciliations_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "payment_checks" ADD CONSTRAINT "payment_checks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_checks" ADD CONSTRAINT "payment_checks_run_fk" FOREIGN KEY ("tenant_id","run_id") REFERENCES "public"."payroll_runs"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_reconciliations" ADD CONSTRAINT "payroll_reconciliations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_reconciliations" ADD CONSTRAINT "payroll_reconciliations_run_fk" FOREIGN KEY ("tenant_id","run_id") REFERENCES "public"."payroll_runs"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_checks_run_idx" ON "payment_checks" USING btree ("tenant_id","run_id");--> statement-breakpoint
CREATE INDEX "payroll_reconciliations_run_idx" ON "payroll_reconciliations" USING btree ("tenant_id","run_id");