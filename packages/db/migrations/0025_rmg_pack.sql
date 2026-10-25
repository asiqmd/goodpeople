ALTER TYPE "public"."document_category" ADD VALUE 'fitness_certificate' BEFORE 'police_verification';--> statement-breakpoint
ALTER TYPE "public"."notification_event" ADD VALUE 'compliance.alert' BEFORE 'auth.otp';--> statement-breakpoint
ALTER TYPE "public"."notification_event" ADD VALUE 'grievance.received' BEFORE 'auth.otp';--> statement-breakpoint
ALTER TYPE "public"."notification_event" ADD VALUE 'maternity.payment_due' BEFORE 'auth.otp';--> statement-breakpoint
CREATE TABLE "committee_meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"committee_id" uuid NOT NULL,
	"held_on" date NOT NULL,
	"agenda" text,
	"minutes" text,
	"attendees" integer,
	"minutes_sent_on" date,
	"decisions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "committee_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"committee_id" uuid NOT NULL,
	"employee_id" uuid,
	"name" text NOT NULL,
	"gender" "gender",
	"side" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"selection" text NOT NULL,
	"from_on" date NOT NULL,
	"to_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "committees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"legal_entity_id" uuid,
	"location_id" uuid,
	"name" text NOT NULL,
	"formed_on" date NOT NULL,
	"ends_on" date,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "committees_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "compliance_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"employee_id" uuid,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"value" integer NOT NULL,
	"limit" integer NOT NULL,
	"detail" jsonb,
	"status" text DEFAULT 'open' NOT NULL,
	"note" text,
	"acknowledged_by" uuid,
	"acknowledged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "compliance_alerts_subject_uq" UNIQUE("tenant_id","kind","subject_id","period_start")
);
--> statement-breakpoint
CREATE TABLE "compliance_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"overtime_daily_cap_minutes" integer DEFAULT 120 NOT NULL,
	"overtime_weekly_cap_minutes" integer DEFAULT 720 NOT NULL,
	"overtime_monthly_cap_minutes" integer,
	"warn_at_percent" integer DEFAULT 90 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grievance_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"grievance_id" uuid NOT NULL,
	"author" text NOT NULL,
	"staff_user_id" uuid,
	"body_enc" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grievances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"pin_hash" text NOT NULL,
	"category" text NOT NULL,
	"body_enc" text NOT NULL,
	"anonymous" boolean DEFAULT true NOT NULL,
	"reporter_employee_id" uuid,
	"location_id" uuid,
	"channel" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"restricted" boolean DEFAULT false NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grievances_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "grievances_reference_uq" UNIQUE("tenant_id","reference")
);
--> statement-breakpoint
CREATE TABLE "kiosk_pin_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"kiosk_id" uuid,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kiosks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"location_id" uuid,
	"name" text NOT NULL,
	"token_prefix" text NOT NULL,
	"secret_hash" text NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kiosks_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "maternity_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"leave_request_id" uuid,
	"notice_on" date NOT NULL,
	"expected_delivery_on" date NOT NULL,
	"delivered_on" date,
	"proof_on" date,
	"surviving_children" integer DEFAULT 0 NOT NULL,
	"nominee_name" text,
	"nominee_relation" text,
	"payment_option" text NOT NULL,
	"eligible" boolean NOT NULL,
	"ineligible_reason" text,
	"wage_total_enc" text,
	"wage_days_worked" integer,
	"average_daily_wage_enc" text,
	"benefit_days" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maternity_cases_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "maternity_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"part" integer NOT NULL,
	"days" integer NOT NULL,
	"amount_enc" text NOT NULL,
	"due_on" date,
	"paid_on" date,
	"method" text,
	"reference" text,
	"paid_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maternity_payments_part_uq" UNIQUE("tenant_id","case_id","part")
);
--> statement-breakpoint
CREATE TABLE "production_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"operation_id" uuid NOT NULL,
	"date" date NOT NULL,
	"quantity" integer NOT NULL,
	"piece_rate" numeric(10, 4),
	"daily_target" integer,
	"incentive_rate" numeric(10, 4),
	"org_unit_id" uuid,
	"source" text DEFAULT 'manual' NOT NULL,
	"entered_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_entries_day_uq" UNIQUE("tenant_id","employee_id","date","operation_id"),
	CONSTRAINT "production_entries_quantity_ck" CHECK ("production_entries"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "production_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"name_bn" text,
	"style" text,
	"piece_rate" numeric(10, 4),
	"daily_target" integer,
	"incentive_rate" numeric(10, 4),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_operations_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "production_operations_tenant_code_uq" UNIQUE("tenant_id","code")
);
--> statement-breakpoint
CREATE TABLE "trade_unions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"legal_entity_id" uuid,
	"name" text NOT NULL,
	"registration_no" text,
	"registered_on" date,
	"federation" text,
	"is_cba" boolean DEFAULT false NOT NULL,
	"check_off" boolean DEFAULT false NOT NULL,
	"monthly_subscription" numeric(10, 2),
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trade_unions_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "union_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"union_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_on" date NOT NULL,
	"left_on" date,
	"check_off_consent_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "union_memberships_uq" UNIQUE("tenant_id","union_id","employee_id","joined_on")
);
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "night_work_consent_from" date;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "kiosk_pin_hash" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "kiosk_pin_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "committee_meetings" ADD CONSTRAINT "committee_meetings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_meetings" ADD CONSTRAINT "committee_meetings_committee_fk" FOREIGN KEY ("tenant_id","committee_id") REFERENCES "public"."committees"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_members" ADD CONSTRAINT "committee_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_members" ADD CONSTRAINT "committee_members_committee_fk" FOREIGN KEY ("tenant_id","committee_id") REFERENCES "public"."committees"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_members" ADD CONSTRAINT "committee_members_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committees" ADD CONSTRAINT "committees_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committees" ADD CONSTRAINT "committees_entity_fk" FOREIGN KEY ("tenant_id","legal_entity_id") REFERENCES "public"."legal_entities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committees" ADD CONSTRAINT "committees_location_fk" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."locations"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_alerts" ADD CONSTRAINT "compliance_alerts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_alerts" ADD CONSTRAINT "compliance_alerts_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_settings" ADD CONSTRAINT "compliance_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grievance_messages" ADD CONSTRAINT "grievance_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grievance_messages" ADD CONSTRAINT "grievance_messages_grievance_fk" FOREIGN KEY ("tenant_id","grievance_id") REFERENCES "public"."grievances"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grievance_messages" ADD CONSTRAINT "grievance_messages_staff_fk" FOREIGN KEY ("tenant_id","staff_user_id") REFERENCES "public"."tenant_users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grievances" ADD CONSTRAINT "grievances_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grievances" ADD CONSTRAINT "grievances_reporter_fk" FOREIGN KEY ("tenant_id","reporter_employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grievances" ADD CONSTRAINT "grievances_location_fk" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."locations"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kiosk_pin_codes" ADD CONSTRAINT "kiosk_pin_codes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kiosk_pin_codes" ADD CONSTRAINT "kiosk_pin_codes_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kiosk_pin_codes" ADD CONSTRAINT "kiosk_pin_codes_kiosk_fk" FOREIGN KEY ("tenant_id","kiosk_id") REFERENCES "public"."kiosks"("tenant_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kiosks" ADD CONSTRAINT "kiosks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kiosks" ADD CONSTRAINT "kiosks_location_fk" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."locations"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maternity_cases" ADD CONSTRAINT "maternity_cases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maternity_cases" ADD CONSTRAINT "maternity_cases_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maternity_cases" ADD CONSTRAINT "maternity_cases_leave_fk" FOREIGN KEY ("tenant_id","leave_request_id") REFERENCES "public"."leave_requests"("tenant_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maternity_payments" ADD CONSTRAINT "maternity_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maternity_payments" ADD CONSTRAINT "maternity_payments_case_fk" FOREIGN KEY ("tenant_id","case_id") REFERENCES "public"."maternity_cases"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_entries" ADD CONSTRAINT "production_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_entries" ADD CONSTRAINT "production_entries_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_entries" ADD CONSTRAINT "production_entries_operation_fk" FOREIGN KEY ("tenant_id","operation_id") REFERENCES "public"."production_operations"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_entries" ADD CONSTRAINT "production_entries_org_unit_fk" FOREIGN KEY ("tenant_id","org_unit_id") REFERENCES "public"."org_units"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_operations" ADD CONSTRAINT "production_operations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_unions" ADD CONSTRAINT "trade_unions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_unions" ADD CONSTRAINT "trade_unions_entity_fk" FOREIGN KEY ("tenant_id","legal_entity_id") REFERENCES "public"."legal_entities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "union_memberships" ADD CONSTRAINT "union_memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "union_memberships" ADD CONSTRAINT "union_memberships_union_fk" FOREIGN KEY ("tenant_id","union_id") REFERENCES "public"."trade_unions"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "union_memberships" ADD CONSTRAINT "union_memberships_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "committee_meetings_held_idx" ON "committee_meetings" USING btree ("tenant_id","committee_id","held_on");--> statement-breakpoint
CREATE INDEX "compliance_alerts_open_idx" ON "compliance_alerts" USING btree ("tenant_id","status","period_start");--> statement-breakpoint
CREATE INDEX "kiosk_pin_codes_employee_idx" ON "kiosk_pin_codes" USING btree ("tenant_id","employee_id","created_at");--> statement-breakpoint
CREATE INDEX "maternity_cases_employee_idx" ON "maternity_cases" USING btree ("tenant_id","employee_id");--> statement-breakpoint
CREATE INDEX "production_entries_date_idx" ON "production_entries" USING btree ("tenant_id","date");