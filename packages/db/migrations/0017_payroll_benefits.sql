CREATE TYPE "public"."tax_declaration_status" AS ENUM('draft', 'submitted', 'verified');--> statement-breakpoint
CREATE TYPE "public"."increment_basis" AS ENUM('basic', 'gross');--> statement-breakpoint
CREATE TYPE "public"."loan_kind" AS ENUM('advance', 'loan', 'pf_loan');--> statement-breakpoint
CREATE TYPE "public"."loan_status" AS ENUM('pending', 'active', 'closed', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."pay_batch_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."pf_account" AS ENUM('own', 'employer');--> statement-breakpoint
CREATE TYPE "public"."pf_entry_kind" AS ENUM('opening', 'contribution', 'interest', 'loan_out', 'loan_repaid', 'withdrawal', 'forfeited');--> statement-breakpoint
CREATE TYPE "public"."tax_area" AS ENUM('dhaka_chattogram_city', 'other_city', 'elsewhere');--> statement-breakpoint
ALTER TYPE "public"."payroll_run_kind" ADD VALUE 'bonus';--> statement-breakpoint
CREATE TABLE "employee_loans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"kind" "loan_kind" NOT NULL,
	"status" "loan_status" DEFAULT 'pending' NOT NULL,
	"amounts_enc" text NOT NULL,
	"start_month" text NOT NULL,
	"reason" text NOT NULL,
	"requested_by" uuid,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_loans_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "loan_repayments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"loan_id" uuid NOT NULL,
	"run_id" uuid,
	"date" date NOT NULL,
	"amount_enc" text NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pay_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"basis" "increment_basis" NOT NULL,
	"percent" numeric(6, 2) NOT NULL,
	"status" "pay_batch_status" DEFAULT 'pending' NOT NULL,
	"people" integer DEFAULT 0 NOT NULL,
	"reason" text NOT NULL,
	"requested_by" uuid,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pay_batches_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "pf_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"date" date NOT NULL,
	"kind" "pf_entry_kind" NOT NULL,
	"account" "pf_account" NOT NULL,
	"amount_enc" text NOT NULL,
	"run_id" uuid,
	"loan_id" uuid,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pf_members" (
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"joined_on" date NOT NULL,
	"left_on" date,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pf_members_employee_uq" UNIQUE("tenant_id","employee_id")
);
--> statement-breakpoint
CREATE TABLE "tax_declarations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"fiscal_year" text NOT NULL,
	"status" "tax_declaration_status" DEFAULT 'draft' NOT NULL,
	"items_enc" text NOT NULL,
	"submitted_at" timestamp with time zone,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_declarations_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "tax_declarations_employee_year_uq" UNIQUE("tenant_id","employee_id","fiscal_year")
);
--> statement-breakpoint
CREATE TABLE "tax_deposits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"challan_no" text NOT NULL,
	"deposited_on" date NOT NULL,
	"amount_enc" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_deposits_run_uq" UNIQUE("tenant_id","run_id")
);
--> statement-breakpoint
CREATE TABLE "tax_openings" (
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"fiscal_year" text NOT NULL,
	"amounts_enc" text NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_openings_employee_year_uq" UNIQUE("tenant_id","employee_id","fiscal_year")
);
--> statement-breakpoint
CREATE TABLE "tax_profiles" (
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"freedom_fighter" boolean DEFAULT false NOT NULL,
	"disabled_dependants" integer DEFAULT 0 NOT NULL,
	"area" "tax_area",
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tax_profiles_employee_uq" UNIQUE("tenant_id","employee_id")
);
--> statement-breakpoint
ALTER TABLE "employee_pay" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "bonus" jsonb;--> statement-breakpoint
ALTER TABLE "payroll_settings" ADD COLUMN "auto_tax" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_settings" ADD COLUMN "tax_area" text DEFAULT 'dhaka_chattogram_city' NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_settings" ADD COLUMN "pf_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_settings" ADD COLUMN "pf_employee_rate" numeric(5, 2) DEFAULT '7' NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_settings" ADD COLUMN "pf_employer_rate" numeric(5, 2) DEFAULT '7' NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_settings" ADD COLUMN "pf_recognised" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_settings" ADD COLUMN "pf_vesting" jsonb DEFAULT '[{"afterYears":0,"percent":0},{"afterYears":3,"percent":100}]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_loans" ADD CONSTRAINT "employee_loans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_loans" ADD CONSTRAINT "employee_loans_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_repayments" ADD CONSTRAINT "loan_repayments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_repayments" ADD CONSTRAINT "loan_repayments_loan_fk" FOREIGN KEY ("tenant_id","loan_id") REFERENCES "public"."employee_loans"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_repayments" ADD CONSTRAINT "loan_repayments_run_fk" FOREIGN KEY ("tenant_id","run_id") REFERENCES "public"."payroll_runs"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_batches" ADD CONSTRAINT "pay_batches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pf_entries" ADD CONSTRAINT "pf_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pf_entries" ADD CONSTRAINT "pf_entries_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pf_entries" ADD CONSTRAINT "pf_entries_run_fk" FOREIGN KEY ("tenant_id","run_id") REFERENCES "public"."payroll_runs"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pf_members" ADD CONSTRAINT "pf_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pf_members" ADD CONSTRAINT "pf_members_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_declarations" ADD CONSTRAINT "tax_declarations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_declarations" ADD CONSTRAINT "tax_declarations_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_deposits" ADD CONSTRAINT "tax_deposits_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_deposits" ADD CONSTRAINT "tax_deposits_run_fk" FOREIGN KEY ("tenant_id","run_id") REFERENCES "public"."payroll_runs"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_openings" ADD CONSTRAINT "tax_openings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_openings" ADD CONSTRAINT "tax_openings_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_profiles" ADD CONSTRAINT "tax_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_profiles" ADD CONSTRAINT "tax_profiles_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_loans_employee_idx" ON "employee_loans" USING btree ("tenant_id","employee_id");--> statement-breakpoint
CREATE INDEX "loan_repayments_loan_idx" ON "loan_repayments" USING btree ("tenant_id","loan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pay_batches_pending_uq" ON "pay_batches" USING btree ("tenant_id") WHERE "pay_batches"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "pf_entries_employee_idx" ON "pf_entries" USING btree ("tenant_id","employee_id","date");