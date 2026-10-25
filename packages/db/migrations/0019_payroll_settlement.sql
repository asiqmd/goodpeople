ALTER TYPE "public"."payroll_run_kind" ADD VALUE 'settlement';--> statement-breakpoint
ALTER TYPE "public"."payroll_run_kind" ADD VALUE 'wppf';--> statement-breakpoint
CREATE TABLE "wppf_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"accounting_year" text NOT NULL,
	"year_start" date NOT NULL,
	"year_end" date NOT NULL,
	"amounts_enc" text NOT NULL,
	"min_service_months" integer NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wppf_years_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "wppf_years_year_uq" UNIQUE("tenant_id","accounting_year")
);
--> statement-breakpoint
ALTER TABLE "employee_payment_accounts" ADD COLUMN "split_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "pay_components" ADD COLUMN "gl_account" text;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "separation_id" uuid;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "wppf_id" uuid;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "paid_on" date;--> statement-breakpoint
ALTER TABLE "payroll_settings" ADD COLUMN "gl_accounts" jsonb DEFAULT '{"salaryExpense":"5100","netPayable":"2100","taxPayable":"2110","pfPayable":"2120","loansReceivable":"1410","gratuityExpense":"5150","gratuityProvision":"2200","wppfPayable":"2300"}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_settings" ADD COLUMN "gratuity_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "wppf_years" ADD CONSTRAINT "wppf_years_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_separation_fk" FOREIGN KEY ("tenant_id","separation_id") REFERENCES "public"."separations"("tenant_id","id") ON DELETE no action ON UPDATE no action;