ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_tenant_id_uq" UNIQUE("tenant_id","id");
--> statement-breakpoint
CREATE TABLE "compensation_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"org_unit_id" uuid,
	"job_id" uuid NOT NULL,
	"source_pay_id" uuid NOT NULL,
	"review_id" uuid,
	"rating" integer,
	"increment_recommended" boolean DEFAULT false NOT NULL,
	"amounts_enc" text NOT NULL,
	"submitted" boolean DEFAULT false NOT NULL,
	"reason" text,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_by" uuid,
	"pay_change_id" uuid,
	CONSTRAINT "compensation_lines_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "compensation_lines_person_uq" UNIQUE("round_id","employee_id"),
	CONSTRAINT "compensation_lines_rating_ck" CHECK ("compensation_lines"."rating" is null or "compensation_lines"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "compensation_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"cycle_id" uuid,
	"effective_from" date NOT NULL,
	"rmg_annual" boolean DEFAULT false NOT NULL,
	"matrix" jsonb NOT NULL,
	"ranges" jsonb NOT NULL,
	"budgets" jsonb NOT NULL,
	"skipped" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"exported_at" timestamp with time zone,
	CONSTRAINT "compensation_rounds_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "compensation_rounds_status_ck" CHECK ("compensation_rounds"."status" in ('open', 'payroll', 'cancelled'))
);
--> statement-breakpoint
ALTER TABLE "compensation_lines" ADD CONSTRAINT "compensation_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensation_lines" ADD CONSTRAINT "compensation_lines_round_fk" FOREIGN KEY ("tenant_id","round_id") REFERENCES "public"."compensation_rounds"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensation_lines" ADD CONSTRAINT "compensation_lines_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensation_lines" ADD CONSTRAINT "compensation_lines_unit_fk" FOREIGN KEY ("tenant_id","org_unit_id") REFERENCES "public"."org_units"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensation_lines" ADD CONSTRAINT "compensation_lines_job_fk" FOREIGN KEY ("tenant_id","job_id") REFERENCES "public"."job_assignments"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensation_lines" ADD CONSTRAINT "compensation_lines_source_pay_fk" FOREIGN KEY ("tenant_id","source_pay_id") REFERENCES "public"."employee_pay"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensation_lines" ADD CONSTRAINT "compensation_lines_review_fk" FOREIGN KEY ("tenant_id","review_id") REFERENCES "public"."reviews"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensation_lines" ADD CONSTRAINT "compensation_lines_pay_change_fk" FOREIGN KEY ("tenant_id","pay_change_id") REFERENCES "public"."employee_pay"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensation_rounds" ADD CONSTRAINT "compensation_rounds_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensation_rounds" ADD CONSTRAINT "compensation_rounds_company_fk" FOREIGN KEY ("tenant_id","legal_entity_id") REFERENCES "public"."legal_entities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compensation_rounds" ADD CONSTRAINT "compensation_rounds_cycle_fk" FOREIGN KEY ("tenant_id","cycle_id") REFERENCES "public"."review_cycles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
