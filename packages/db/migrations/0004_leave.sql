CREATE TYPE "public"."holiday_kind" AS ENUM('public', 'festival', 'optional', 'company');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('waiting', 'pending', 'approved', 'rejected', 'skipped', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."approval_step_kind" AS ENUM('manager', 'hr');--> statement-breakpoint
CREATE TYPE "public"."half_day" AS ENUM('first_half', 'second_half');--> statement-breakpoint
CREATE TYPE "public"."leave_accrual" AS ENUM('annual_grant', 'earned', 'per_event');--> statement-breakpoint
CREATE TYPE "public"."leave_request_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."leave_ledger_kind" AS ENUM('taken', 'reversal', 'adjustment', 'opening', 'recalculation');--> statement-breakpoint
CREATE TYPE "public"."statutory_leave" AS ENUM('casual', 'sick', 'annual', 'maternity');--> statement-breakpoint
CREATE TABLE "holiday_calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holiday_calendars_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"calendar_id" uuid NOT NULL,
	"date" date NOT NULL,
	"name" text NOT NULL,
	"name_bn" text,
	"kind" "holiday_kind" NOT NULL,
	"is_tentative" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holidays_calendar_date_uq" UNIQUE("calendar_id","date")
);
--> statement-breakpoint
CREATE TABLE "approval_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"step_no" integer NOT NULL,
	"kind" "approval_step_kind" NOT NULL,
	"approver_employee_id" uuid,
	"status" "approval_status" NOT NULL,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_steps_subject_step_uq" UNIQUE("subject_id","step_no")
);
--> statement-breakpoint
CREATE TABLE "leave_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"leave_type_id" uuid NOT NULL,
	"leave_year" integer NOT NULL,
	"kind" "leave_ledger_kind" NOT NULL,
	"days" numeric(6, 1) NOT NULL,
	"request_id" uuid,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"leave_type_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"half_day" "half_day",
	"days" numeric(6, 1) NOT NULL,
	"reason" text NOT NULL,
	"status" "leave_request_status" DEFAULT 'pending' NOT NULL,
	"needs_document" boolean DEFAULT false NOT NULL,
	"applied_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "leave_requests_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "leave_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"name_bn" text,
	"statutory_key" "statutory_leave",
	"paid" boolean DEFAULT true NOT NULL,
	"accrual" "leave_accrual" NOT NULL,
	"days_per_year" numeric(6, 1),
	"worked_days_per_leave_day" integer,
	"max_days_per_request" integer,
	"carry_forward_max" numeric(6, 1) DEFAULT 0 NOT NULL,
	"min_service_days" integer DEFAULT 0 NOT NULL,
	"gender" "gender",
	"counts_off_days" boolean DEFAULT false NOT NULL,
	"allow_half_day" boolean DEFAULT true NOT NULL,
	"approval_chain" "approval_step_kind"[] DEFAULT '{manager}' NOT NULL,
	"requires_document_after_days" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leave_types_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "leave_types_tenant_code_uq" UNIQUE("tenant_id","code")
);
--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "holiday_calendar_id" uuid;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "weekly_off_days" smallint[] DEFAULT '{5}' NOT NULL;--> statement-breakpoint
ALTER TABLE "holiday_calendars" ADD CONSTRAINT "holiday_calendars_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_calendar_fk" FOREIGN KEY ("tenant_id","calendar_id") REFERENCES "public"."holiday_calendars"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_approver_fk" FOREIGN KEY ("tenant_id","approver_employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_ledger" ADD CONSTRAINT "leave_ledger_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_ledger" ADD CONSTRAINT "leave_ledger_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_ledger" ADD CONSTRAINT "leave_ledger_leave_type_fk" FOREIGN KEY ("tenant_id","leave_type_id") REFERENCES "public"."leave_types"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_ledger" ADD CONSTRAINT "leave_ledger_request_fk" FOREIGN KEY ("tenant_id","request_id") REFERENCES "public"."leave_requests"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_type_fk" FOREIGN KEY ("tenant_id","leave_type_id") REFERENCES "public"."leave_types"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "holiday_calendars_default_uq" ON "holiday_calendars" USING btree ("tenant_id") WHERE "holiday_calendars"."is_default";--> statement-breakpoint
CREATE INDEX "holidays_tenant_date_idx" ON "holidays" USING btree ("tenant_id","date");--> statement-breakpoint
CREATE INDEX "approval_steps_inbox_idx" ON "approval_steps" USING btree ("tenant_id","status","approver_employee_id");--> statement-breakpoint
CREATE INDEX "leave_ledger_balance_idx" ON "leave_ledger" USING btree ("tenant_id","employee_id","leave_type_id","leave_year");--> statement-breakpoint
CREATE INDEX "leave_requests_employee_idx" ON "leave_requests" USING btree ("tenant_id","employee_id","start_date");--> statement-breakpoint
CREATE INDEX "leave_requests_dates_idx" ON "leave_requests" USING btree ("tenant_id","start_date","end_date");--> statement-breakpoint
CREATE UNIQUE INDEX "leave_types_tenant_statutory_uq" ON "leave_types" USING btree ("tenant_id","statutory_key") WHERE "leave_types"."statutory_key" is not null;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_holiday_calendar_fk" FOREIGN KEY ("tenant_id","holiday_calendar_id") REFERENCES "public"."holiday_calendars"("tenant_id","id") ON DELETE no action ON UPDATE no action;