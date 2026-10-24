CREATE TYPE "public"."blood_group" AS ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-');--> statement-breakpoint
CREATE TYPE "public"."employee_status" AS ENUM('active', 'separated');--> statement-breakpoint
CREATE TYPE "public"."employment_type" AS ENUM('permanent', 'probationer', 'apprentice', 'badli', 'casual', 'temporary', 'seasonal', 'contractual');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female', 'third_gender');--> statement-breakpoint
CREATE TYPE "public"."job_event" AS ENUM('hire', 'confirmation', 'transfer', 'promotion', 'increment', 'redesignation', 'change', 'separation');--> statement-breakpoint
CREATE TYPE "public"."location_kind" AS ENUM('head_office', 'factory', 'branch', 'field_office', 'warehouse', 'other');--> statement-breakpoint
CREATE TYPE "public"."marital_status" AS ENUM('single', 'married', 'widowed', 'divorced', 'separated');--> statement-breakpoint
CREATE TYPE "public"."org_unit_kind" AS ENUM('department', 'section', 'line', 'team');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('bank', 'mfs', 'cash');--> statement-breakpoint
CREATE TYPE "public"."religion" AS ENUM('islam', 'hinduism', 'buddhism', 'christianity', 'other');--> statement-breakpoint
CREATE TYPE "public"."worker_category" AS ENUM('worker', 'staff');--> statement-breakpoint
CREATE TABLE "cost_centres" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cost_centres_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "cost_centres_tenant_code_uq" UNIQUE("tenant_id","code")
);--> statement-breakpoint
CREATE TABLE "designations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"name_bn" text,
	"worker_category" "worker_category" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "designations_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "designations_tenant_code_uq" UNIQUE("tenant_id","code")
);--> statement-breakpoint
CREATE TABLE "employee_nominees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"name" text NOT NULL,
	"relation" text NOT NULL,
	"share_percent" integer NOT NULL,
	"date_of_birth" date,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "employee_payment_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"method" "payment_method" NOT NULL,
	"provider" text,
	"branch_name" text,
	"routing_number" text,
	"account_name" text,
	"account_number_enc" text,
	"account_number_last4" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_code" text NOT NULL,
	"user_id" uuid,
	"status" "employee_status" DEFAULT 'active' NOT NULL,
	"full_name" text NOT NULL,
	"full_name_bn" text,
	"father_name" text NOT NULL,
	"mother_name" text NOT NULL,
	"spouse_name" text,
	"date_of_birth" date NOT NULL,
	"gender" "gender" NOT NULL,
	"religion" "religion",
	"marital_status" "marital_status",
	"blood_group" "blood_group",
	"nationality" text DEFAULT 'BD' NOT NULL,
	"mobile_phone" text NOT NULL,
	"work_email" text,
	"personal_email" text,
	"present_address" jsonb NOT NULL,
	"permanent_address" jsonb NOT NULL,
	"emergency_contact" jsonb,
	"nid_enc" text,
	"nid_hash" text,
	"birth_registration_enc" text,
	"passport_enc" text,
	"tin_enc" text,
	"joined_on" date NOT NULL,
	"probation_ends_on" date,
	"confirmed_on" date,
	"separated_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "employees_tenant_code_uq" UNIQUE("tenant_id","employee_code"),
	CONSTRAINT "employees_user_uq" UNIQUE("user_id")
);--> statement-breakpoint
CREATE TABLE "grades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"rank" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grades_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "grades_tenant_code_uq" UNIQUE("tenant_id","code")
);--> statement-breakpoint
CREATE TABLE "job_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"event" "job_event" NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"legal_entity_id" uuid NOT NULL,
	"location_id" uuid,
	"org_unit_id" uuid,
	"designation_id" uuid,
	"grade_id" uuid,
	"cost_centre_id" uuid,
	"manager_id" uuid,
	"employment_type" "employment_type" NOT NULL,
	"worker_category" "worker_category" NOT NULL,
	"reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" "location_kind" NOT NULL,
	"address" jsonb,
	"latitude" double precision,
	"longitude" double precision,
	"geofence_radius_m" integer,
	"time_zone" text DEFAULT 'Asia/Dhaka' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "locations_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "locations_tenant_code_uq" UNIQUE("tenant_id","code")
);--> statement-breakpoint
CREATE TABLE "org_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"parent_id" uuid,
	"kind" "org_unit_kind" NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"name_bn" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_units_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "org_units_tenant_code_uq" UNIQUE("tenant_id","code")
);--> statement-breakpoint
CREATE TABLE "tenant_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "legal_entities" ADD COLUMN "legal_name" text;--> statement-breakpoint
ALTER TABLE "legal_entities" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "legal_entities" ADD COLUMN "registration_no" text;--> statement-breakpoint
ALTER TABLE "legal_entities" ADD COLUMN "bin" text;--> statement-breakpoint
ALTER TABLE "legal_entities" ADD COLUMN "address" jsonb;--> statement-breakpoint
ALTER TABLE "legal_entities" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Unique keys that the composite foreign keys below reference.
ALTER TABLE "legal_entities" ADD CONSTRAINT "legal_entities_tenant_id_uq" UNIQUE("tenant_id","id");--> statement-breakpoint
ALTER TABLE "legal_entities" ADD CONSTRAINT "legal_entities_tenant_code_uq" UNIQUE("tenant_id","code");--> statement-breakpoint
ALTER TABLE "tenant_users" ADD CONSTRAINT "tenant_users_tenant_id_uq" UNIQUE("tenant_id","id");--> statement-breakpoint
ALTER TABLE "cost_centres" ADD CONSTRAINT "cost_centres_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designations" ADD CONSTRAINT "designations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_nominees" ADD CONSTRAINT "employee_nominees_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_nominees" ADD CONSTRAINT "employee_nominees_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_payment_accounts" ADD CONSTRAINT "employee_payment_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_payment_accounts" ADD CONSTRAINT "employee_payment_accounts_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_fk" FOREIGN KEY ("tenant_id","user_id") REFERENCES "public"."tenant_users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grades" ADD CONSTRAINT "grades_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_legal_entity_fk" FOREIGN KEY ("tenant_id","legal_entity_id") REFERENCES "public"."legal_entities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_location_fk" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."locations"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_org_unit_fk" FOREIGN KEY ("tenant_id","org_unit_id") REFERENCES "public"."org_units"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_designation_fk" FOREIGN KEY ("tenant_id","designation_id") REFERENCES "public"."designations"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_grade_fk" FOREIGN KEY ("tenant_id","grade_id") REFERENCES "public"."grades"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_cost_centre_fk" FOREIGN KEY ("tenant_id","cost_centre_id") REFERENCES "public"."cost_centres"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_assignments" ADD CONSTRAINT "job_assignments_manager_fk" FOREIGN KEY ("tenant_id","manager_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_legal_entity_fk" FOREIGN KEY ("tenant_id","legal_entity_id") REFERENCES "public"."legal_entities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_legal_entity_fk" FOREIGN KEY ("tenant_id","legal_entity_id") REFERENCES "public"."legal_entities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_parent_fk" FOREIGN KEY ("tenant_id","parent_id") REFERENCES "public"."org_units"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_audit_log" ADD CONSTRAINT "tenant_audit_log_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_nominees_employee_idx" ON "employee_nominees" USING btree ("tenant_id","employee_id");--> statement-breakpoint
CREATE INDEX "employee_payment_accounts_employee_idx" ON "employee_payment_accounts" USING btree ("tenant_id","employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_payment_accounts_primary_uq" ON "employee_payment_accounts" USING btree ("employee_id") WHERE "employee_payment_accounts"."is_primary";--> statement-breakpoint
CREATE UNIQUE INDEX "employees_tenant_nid_uq" ON "employees" USING btree ("tenant_id","nid_hash") WHERE "employees"."nid_hash" is not null;--> statement-breakpoint
CREATE INDEX "employees_tenant_name_idx" ON "employees" USING btree ("tenant_id","full_name");--> statement-breakpoint
CREATE INDEX "job_assignments_employee_idx" ON "job_assignments" USING btree ("tenant_id","employee_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "job_assignments_open_uq" ON "job_assignments" USING btree ("employee_id") WHERE "job_assignments"."effective_to" is null;--> statement-breakpoint
CREATE INDEX "tenant_audit_log_entity_idx" ON "tenant_audit_log" USING btree ("tenant_id","entity_type","entity_id");
