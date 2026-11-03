CREATE TABLE "commercial_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_code" text NOT NULL,
	"currency" text NOT NULL,
	"seat_price" numeric(14, 2) NOT NULL,
	"effective_from" date NOT NULL,
	"merchant_product" text NOT NULL,
	"merchant_price" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_legal_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"country_code" text NOT NULL,
	"regime" text NOT NULL,
	"currency" text NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"business_time_zone" text NOT NULL,
	"calendar" text DEFAULT 'gregorian' NOT NULL,
	"registrations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"review_status" text DEFAULT 'needs_review' NOT NULL,
	"reason" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_profile_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "employee_identifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"issuer" text NOT NULL,
	"value_enc" text NOT NULL,
	"last4" text NOT NULL,
	"valid_from" date,
	"valid_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employment_statutory_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"citizenship" text NOT NULL,
	"insurance_class" text NOT NULL,
	"contract_class" text NOT NULL,
	"original_name" text NOT NULL,
	"translated_name" text,
	"supplied_hijri_date" text,
	"calendar_provenance" text,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"kind" text NOT NULL,
	"currency" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"external_invoice" text NOT NULL,
	"external_reference" text NOT NULL,
	"payload_hash" text NOT NULL,
	"reconciled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "merchant_event_uq" UNIQUE("provider","event_id")
);
--> statement-breakpoint
ALTER TABLE "legal_entities" ADD COLUMN "country_code" text DEFAULT 'BD' NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_payment_accounts" ADD COLUMN "currency" text DEFAULT 'BDT' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_assignments" ADD COLUMN "currency" text DEFAULT 'BDT' NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_pay" ADD COLUMN "currency" text DEFAULT 'BDT' NOT NULL;--> statement-breakpoint
ALTER TABLE "pay_groups" ADD COLUMN "currency" text DEFAULT 'BDT' NOT NULL;--> statement-breakpoint
ALTER TABLE "pay_groups" ADD COLUMN "legal_entity_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_checks" ADD COLUMN "currency" text DEFAULT 'BDT' NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_inputs" ADD COLUMN "currency" text DEFAULT 'BDT' NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_reconciliations" ADD COLUMN "currency" text DEFAULT 'BDT' NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_run_items" ADD COLUMN "currency" text DEFAULT 'BDT' NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "currency" text DEFAULT 'BDT' NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD COLUMN "statutory_context" jsonb;--> statement-breakpoint
ALTER TABLE "salary_structures" ADD COLUMN "currency" text DEFAULT 'BDT' NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_loans" ADD COLUMN "currency" text DEFAULT 'BDT' NOT NULL;--> statement-breakpoint
ALTER TABLE "loan_repayments" ADD COLUMN "currency" text DEFAULT 'BDT' NOT NULL;--> statement-breakpoint
ALTER TABLE "pay_batches" ADD COLUMN "currency" text DEFAULT 'BDT' NOT NULL;--> statement-breakpoint
ALTER TABLE "pf_entries" ADD COLUMN "currency" text DEFAULT 'BDT' NOT NULL;--> statement-breakpoint
ALTER TABLE "pf_members" ADD COLUMN "currency" text DEFAULT 'BDT' NOT NULL;--> statement-breakpoint
ALTER TABLE "tax_declarations" ADD COLUMN "currency" text DEFAULT 'BDT' NOT NULL;--> statement-breakpoint
ALTER TABLE "tax_deposits" ADD COLUMN "currency" text DEFAULT 'BDT' NOT NULL;--> statement-breakpoint
ALTER TABLE "tax_openings" ADD COLUMN "currency" text DEFAULT 'BDT' NOT NULL;--> statement-breakpoint
ALTER TABLE "tax_profiles" ADD COLUMN "currency" text DEFAULT 'BDT' NOT NULL;--> statement-breakpoint
ALTER TABLE "wppf_years" ADD COLUMN "currency" text DEFAULT 'BDT' NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_allocations" ADD COLUMN "currency" text DEFAULT 'BDT' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "currency" text DEFAULT 'BDT' NOT NULL;--> statement-breakpoint
ALTER TABLE "timesheets" ADD COLUMN "currency" text DEFAULT 'BDT' NOT NULL;--> statement-breakpoint
ALTER TABLE "entity_policy_overrides" ADD COLUMN "currency" text DEFAULT 'BDT' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_openings" ADD COLUMN "currency" text DEFAULT 'BDT' NOT NULL;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "currency" text DEFAULT 'BDT' NOT NULL;--> statement-breakpoint
ALTER TABLE "compensation_lines" ADD COLUMN "currency" text DEFAULT 'BDT' NOT NULL;--> statement-breakpoint
ALTER TABLE "compensation_rounds" ADD COLUMN "currency" text DEFAULT 'BDT' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_legal_profiles" ADD CONSTRAINT "company_legal_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_legal_profiles" ADD CONSTRAINT "company_legal_profiles_tenant_id_legal_entity_id_legal_entities_tenant_id_id_fk" FOREIGN KEY ("tenant_id","legal_entity_id") REFERENCES "public"."legal_entities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_identifiers" ADD CONSTRAINT "employee_identifiers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_identifiers" ADD CONSTRAINT "employee_identifiers_tenant_id_employee_id_employees_tenant_id_id_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_statutory_profiles" ADD CONSTRAINT "employment_statutory_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employment_statutory_profiles" ADD CONSTRAINT "employment_statutory_profiles_tenant_id_employee_id_employees_tenant_id_id_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_ledger" ADD CONSTRAINT "merchant_ledger_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;