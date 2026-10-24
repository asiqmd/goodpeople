CREATE TYPE "public"."pay_basis" AS ENUM('gross', 'basic');--> statement-breakpoint
CREATE TYPE "public"."pay_calculation" AS ENUM('structure', 'fixed', 'run');--> statement-breakpoint
CREATE TYPE "public"."pay_change_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."pay_component_kind" AS ENUM('earning', 'deduction', 'employer_cost', 'info');--> statement-breakpoint
CREATE TYPE "public"."pay_frequency" AS ENUM('monthly', 'weekly');--> statement-breakpoint
CREATE TYPE "public"."tax_treatment" AS ENUM('taxable', 'exempt', 'partly_exempt');--> statement-breakpoint
ALTER TYPE "public"."tenant_role" ADD VALUE 'payroll_officer' BEFORE 'auditor';--> statement-breakpoint
ALTER TYPE "public"."tenant_role" ADD VALUE 'finance_officer' BEFORE 'auditor';--> statement-breakpoint
ALTER TYPE "public"."approval_step_kind" ADD VALUE 'payroll';--> statement-breakpoint
CREATE TABLE "employee_pay" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"status" "pay_change_status" NOT NULL,
	"structure_id" uuid NOT NULL,
	"pay_group_id" uuid NOT NULL,
	"amounts_enc" text NOT NULL,
	"wage_grade" text,
	"reason" text NOT NULL,
	"requested_by" uuid,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_pay_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "pay_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"name_bn" text,
	"kind" "pay_component_kind" NOT NULL,
	"calculation" "pay_calculation" NOT NULL,
	"tax_treatment" "tax_treatment" DEFAULT 'taxable' NOT NULL,
	"in_gross" boolean DEFAULT false NOT NULL,
	"in_overtime_base" boolean DEFAULT false NOT NULL,
	"prorate" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pay_components_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "pay_components_tenant_code_uq" UNIQUE("tenant_id","code")
);
--> statement-breakpoint
CREATE TABLE "pay_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"frequency" "pay_frequency" NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pay_groups_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "pay_groups_tenant_code_uq" UNIQUE("tenant_id","code")
);
--> statement-breakpoint
CREATE TABLE "payroll_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"maker_checker" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salary_structures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"name_bn" text,
	"basis" "pay_basis" NOT NULL,
	"lines" jsonb NOT NULL,
	"wage_board" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "salary_structures_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "salary_structures_tenant_code_uq" UNIQUE("tenant_id","code")
);
--> statement-breakpoint
ALTER TABLE "employee_pay" ADD CONSTRAINT "employee_pay_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_pay" ADD CONSTRAINT "employee_pay_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_pay" ADD CONSTRAINT "employee_pay_structure_fk" FOREIGN KEY ("tenant_id","structure_id") REFERENCES "public"."salary_structures"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_pay" ADD CONSTRAINT "employee_pay_group_fk" FOREIGN KEY ("tenant_id","pay_group_id") REFERENCES "public"."pay_groups"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_components" ADD CONSTRAINT "pay_components_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pay_groups" ADD CONSTRAINT "pay_groups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_settings" ADD CONSTRAINT "payroll_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_pay_employee_idx" ON "employee_pay" USING btree ("tenant_id","employee_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_pay_pending_uq" ON "employee_pay" USING btree ("employee_id") WHERE "employee_pay"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "pay_groups_default_uq" ON "pay_groups" USING btree ("tenant_id") WHERE "pay_groups"."is_default";