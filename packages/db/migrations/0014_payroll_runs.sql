CREATE TYPE "public"."payroll_run_kind" AS ENUM('regular', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."payroll_run_status" AS ENUM('draft', 'computed', 'pending', 'locked', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."notification_event" ADD VALUE 'payslip.published' BEFORE 'auth.otp';--> statement-breakpoint
CREATE TABLE "payroll_inputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"component" text NOT NULL,
	"amount_enc" text NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_inputs_uq" UNIQUE("run_id","employee_id","component")
);
--> statement-breakpoint
CREATE TABLE "payroll_run_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"status" text NOT NULL,
	"problems" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"result_enc" text NOT NULL,
	"flagged" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_run_items_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "payroll_run_items_run_employee_uq" UNIQUE("run_id","employee_id")
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"pay_group_id" uuid NOT NULL,
	"kind" "payroll_run_kind" NOT NULL,
	"parent_run_id" uuid,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"payment_due" date NOT NULL,
	"payment_date" date NOT NULL,
	"status" "payroll_run_status" DEFAULT 'draft' NOT NULL,
	"headcount" integer DEFAULT 0 NOT NULL,
	"totals_enc" text,
	"errors" integer DEFAULT 0 NOT NULL,
	"warnings" integer DEFAULT 0 NOT NULL,
	"flagged" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"computed_at" timestamp with time zone,
	"submitted_by" uuid,
	"decided_by" uuid,
	"locked_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_runs_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "pay_components" ADD COLUMN "run_formula" text;--> statement-breakpoint
ALTER TABLE "payroll_inputs" ADD CONSTRAINT "payroll_inputs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_inputs" ADD CONSTRAINT "payroll_inputs_run_fk" FOREIGN KEY ("tenant_id","run_id") REFERENCES "public"."payroll_runs"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_inputs" ADD CONSTRAINT "payroll_inputs_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_run_items" ADD CONSTRAINT "payroll_run_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_run_items" ADD CONSTRAINT "payroll_run_items_run_fk" FOREIGN KEY ("tenant_id","run_id") REFERENCES "public"."payroll_runs"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_run_items" ADD CONSTRAINT "payroll_run_items_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_group_fk" FOREIGN KEY ("tenant_id","pay_group_id") REFERENCES "public"."pay_groups"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_parent_fk" FOREIGN KEY ("tenant_id","parent_run_id") REFERENCES "public"."payroll_runs"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payroll_run_items_employee_idx" ON "payroll_run_items" USING btree ("tenant_id","employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_runs_regular_uq" ON "payroll_runs" USING btree ("tenant_id","pay_group_id","period_start") WHERE "payroll_runs"."kind" = 'regular' and "payroll_runs"."status" <> 'cancelled';--> statement-breakpoint
CREATE INDEX "payroll_runs_period_idx" ON "payroll_runs" USING btree ("tenant_id","period_start");