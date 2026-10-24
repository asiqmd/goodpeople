CREATE TYPE "public"."attendance_flag" AS ENUM('late', 'early_out', 'over_daily_limit', 'regularized', 'on_duty', 'outside_geofence');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('present', 'half_day', 'absent', 'on_leave', 'missing_punch', 'off', 'pending');--> statement-breakpoint
CREATE TYPE "public"."day_type" AS ENUM('working', 'weekly_off', 'holiday');--> statement-breakpoint
CREATE TYPE "public"."device_vendor" AS ENUM('zkteco', 'hikvision', 'other');--> statement-breakpoint
CREATE TYPE "public"."punch_direction" AS ENUM('in', 'out', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."punch_source" AS ENUM('device', 'web', 'mobile', 'manual', 'regularization');--> statement-breakpoint
CREATE TYPE "public"."regularization_kind" AS ENUM('missed_punch', 'on_duty');--> statement-breakpoint
CREATE TYPE "public"."regularization_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."self_punch_mode" AS ENUM('off', 'geofenced', 'anywhere');--> statement-breakpoint
CREATE TABLE "attendance_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"date" date NOT NULL,
	"shift_id" uuid,
	"day_type" "day_type" NOT NULL,
	"status" "attendance_status" NOT NULL,
	"first_in" timestamp with time zone,
	"last_out" timestamp with time zone,
	"worked_minutes" integer DEFAULT 0 NOT NULL,
	"late_minutes" integer DEFAULT 0 NOT NULL,
	"early_out_minutes" integer DEFAULT 0 NOT NULL,
	"overtime_minutes" integer DEFAULT 0 NOT NULL,
	"leave_request_id" uuid,
	"leave_days" numeric(2, 1) DEFAULT 0 NOT NULL,
	"flags" "attendance_flag"[] DEFAULT '{}' NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_days_employee_date_uq" UNIQUE("tenant_id","employee_id","date")
);
--> statement-breakpoint
CREATE TABLE "attendance_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"agent_id" uuid,
	"location_id" uuid,
	"vendor" "device_vendor" NOT NULL,
	"serial_number" text NOT NULL,
	"name" text NOT NULL,
	"last_seen_at" timestamp with time zone,
	"last_ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_devices_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "attendance_devices_tenant_serial_uq" UNIQUE("tenant_id","serial_number")
);
--> statement-breakpoint
CREATE TABLE "attendance_punches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid,
	"punched_at" timestamp with time zone NOT NULL,
	"source" "punch_source" NOT NULL,
	"direction" "punch_direction" DEFAULT 'unknown' NOT NULL,
	"device_id" uuid,
	"device_user_id" text,
	"latitude" double precision,
	"longitude" double precision,
	"accuracy_m" double precision,
	"distance_m" integer,
	"inside_geofence" boolean,
	"regularization_id" uuid,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text,
	CONSTRAINT "attendance_punches_device_uq" UNIQUE("tenant_id","device_id","device_user_id","punched_at")
);
--> statement-breakpoint
CREATE TABLE "attendance_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"self_punch" "self_punch_mode" DEFAULT 'geofenced' NOT NULL,
	"regularization_chain" "approval_step_kind"[] DEFAULT '{manager}' NOT NULL,
	"regularization_window_days" integer DEFAULT 30 NOT NULL,
	"tracking_from" date DEFAULT current_date NOT NULL,
	"processed_through" date,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edge_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"agent_version" text,
	"queued" integer,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "edge_agents_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "regularization_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"date" date NOT NULL,
	"kind" "regularization_kind" NOT NULL,
	"in_time" time,
	"out_time" time,
	"reason" text NOT NULL,
	"status" "regularization_status" DEFAULT 'pending' NOT NULL,
	"applied_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "regularization_requests_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "roster_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"date" date NOT NULL,
	"shift_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roster_entries_employee_date_uq" UNIQUE("tenant_id","employee_id","date")
);
--> statement-breakpoint
CREATE TABLE "shift_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"name_bn" text,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"break_minutes" integer DEFAULT 60 NOT NULL,
	"late_grace_minutes" integer DEFAULT 10 NOT NULL,
	"early_out_grace_minutes" integer DEFAULT 0 NOT NULL,
	"half_day_minutes" integer DEFAULT 240 NOT NULL,
	"full_day_minutes" integer DEFAULT 360 NOT NULL,
	"overtime_enabled" boolean DEFAULT true NOT NULL,
	"overtime_min_minutes" integer DEFAULT 30 NOT NULL,
	"overtime_rounding_minutes" integer DEFAULT 30 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shifts_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "shifts_tenant_code_uq" UNIQUE("tenant_id","code")
);
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "attendance_pin" text;--> statement-breakpoint
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_shift_fk" FOREIGN KEY ("tenant_id","shift_id") REFERENCES "public"."shifts"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_leave_fk" FOREIGN KEY ("tenant_id","leave_request_id") REFERENCES "public"."leave_requests"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_devices" ADD CONSTRAINT "attendance_devices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_devices" ADD CONSTRAINT "attendance_devices_agent_fk" FOREIGN KEY ("tenant_id","agent_id") REFERENCES "public"."edge_agents"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_devices" ADD CONSTRAINT "attendance_devices_location_fk" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."locations"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_device_fk" FOREIGN KEY ("tenant_id","device_id") REFERENCES "public"."attendance_devices"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_regularization_fk" FOREIGN KEY ("tenant_id","regularization_id") REFERENCES "public"."regularization_requests"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_settings" ADD CONSTRAINT "attendance_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edge_agents" ADD CONSTRAINT "edge_agents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regularization_requests" ADD CONSTRAINT "regularization_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regularization_requests" ADD CONSTRAINT "regularization_requests_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_entries" ADD CONSTRAINT "roster_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_entries" ADD CONSTRAINT "roster_entries_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roster_entries" ADD CONSTRAINT "roster_entries_shift_fk" FOREIGN KEY ("tenant_id","shift_id") REFERENCES "public"."shifts"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_shift_fk" FOREIGN KEY ("tenant_id","shift_id") REFERENCES "public"."shifts"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_days_date_idx" ON "attendance_days" USING btree ("tenant_id","date");--> statement-breakpoint
CREATE INDEX "attendance_punches_employee_idx" ON "attendance_punches" USING btree ("tenant_id","employee_id","punched_at");--> statement-breakpoint
CREATE INDEX "attendance_punches_unmatched_idx" ON "attendance_punches" USING btree ("tenant_id","device_user_id") WHERE "attendance_punches"."employee_id" is null;--> statement-breakpoint
CREATE INDEX "regularization_requests_employee_idx" ON "regularization_requests" USING btree ("tenant_id","employee_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "regularization_requests_pending_uq" ON "regularization_requests" USING btree ("employee_id","date") WHERE "regularization_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "shift_assignments_employee_idx" ON "shift_assignments" USING btree ("tenant_id","employee_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "shift_assignments_open_uq" ON "shift_assignments" USING btree ("employee_id") WHERE "shift_assignments"."effective_to" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "shifts_default_uq" ON "shifts" USING btree ("tenant_id") WHERE "shifts"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "employees_tenant_pin_uq" ON "employees" USING btree ("tenant_id","attendance_pin") WHERE "employees"."attendance_pin" is not null;