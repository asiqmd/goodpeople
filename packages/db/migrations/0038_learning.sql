ALTER TYPE "public"."notification_event" ADD VALUE 'learning.notice' BEFORE 'auth.otp';--> statement-breakpoint
CREATE TABLE "fire_drills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"held_on" date NOT NULL,
	"next_due_on" date NOT NULL,
	"participants" integer NOT NULL,
	"evacuation_seconds" integer NOT NULL,
	"conductor" text NOT NULL,
	"findings" text NOT NULL,
	"actions" text NOT NULL,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fire_drills_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "fire_drills_dates_ck" CHECK ("fire_drills"."next_due_on" > "fire_drills"."held_on"),
	CONSTRAINT "fire_drills_people_ck" CHECK ("fire_drills"."participants" > 0),
	CONSTRAINT "fire_drills_seconds_ck" CHECK ("fire_drills"."evacuation_seconds" > 0)
);
--> statement-breakpoint
CREATE TABLE "learning_certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"enrolment_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"course_name" text NOT NULL,
	"course_name_bn" text NOT NULL,
	"trainer" text NOT NULL,
	"completed_on" date NOT NULL,
	"expires_on" date,
	"revoked_at" timestamp with time zone,
	"revoke_reason" text,
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_certificates_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "learning_certificates_enrolment_uq" UNIQUE("enrolment_id"),
	CONSTRAINT "learning_certificates_expiry_ck" CHECK ("learning_certificates"."expires_on" is null or "learning_certificates"."expires_on" >= "learning_certificates"."completed_on")
);
--> statement-breakpoint
CREATE TABLE "learning_courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"name_bn" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"description_bn" text DEFAULT '' NOT NULL,
	"category" text NOT NULL,
	"validity_months" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_courses_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "learning_courses_code_uq" UNIQUE("tenant_id","code"),
	CONSTRAINT "learning_courses_validity_ck" CHECK ("learning_courses"."validity_months" is null or "learning_courses"."validity_months" between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "learning_enrolments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"status" text DEFAULT 'enrolled' NOT NULL,
	"enrolled_by" uuid NOT NULL,
	CONSTRAINT "learning_enrolments_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "learning_enrolments_person_uq" UNIQUE("session_id","employee_id"),
	CONSTRAINT "learning_enrolments_status_ck" CHECK ("learning_enrolments"."status" in ('enrolled','cancelled','attended','absent'))
);
--> statement-breakpoint
CREATE TABLE "learning_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"designation_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"grace_days" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "learning_requirements_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "learning_requirements_dates_ck" CHECK ("learning_requirements"."effective_to" is null or "learning_requirements"."effective_to" >= "learning_requirements"."effective_from"),
	CONSTRAINT "learning_requirements_grace_ck" CHECK ("learning_requirements"."grace_days" between 0 and 365)
);
--> statement-breakpoint
CREATE TABLE "learning_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"location_id" uuid,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"trainer" text NOT NULL,
	"venue" text NOT NULL,
	"capacity" integer NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"note" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_sessions_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "learning_sessions_dates_ck" CHECK ("learning_sessions"."ends_at" > "learning_sessions"."starts_at"),
	CONSTRAINT "learning_sessions_capacity_ck" CHECK ("learning_sessions"."capacity" between 1 and 5000),
	CONSTRAINT "learning_sessions_status_ck" CHECK ("learning_sessions"."status" in ('planned','completed','cancelled'))
);
--> statement-breakpoint
ALTER TABLE "fire_drills" ADD CONSTRAINT "fire_drills_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fire_drills" ADD CONSTRAINT "fire_drills_company_fk" FOREIGN KEY ("tenant_id","legal_entity_id") REFERENCES "public"."legal_entities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fire_drills" ADD CONSTRAINT "fire_drills_location_fk" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."locations"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_certificates" ADD CONSTRAINT "learning_certificates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_certificates" ADD CONSTRAINT "learning_certificates_enrolment_fk" FOREIGN KEY ("tenant_id","enrolment_id") REFERENCES "public"."learning_enrolments"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_certificates" ADD CONSTRAINT "learning_certificates_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_certificates" ADD CONSTRAINT "learning_certificates_course_fk" FOREIGN KEY ("tenant_id","course_id") REFERENCES "public"."learning_courses"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_certificates" ADD CONSTRAINT "learning_certificates_company_fk" FOREIGN KEY ("tenant_id","legal_entity_id") REFERENCES "public"."legal_entities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_courses" ADD CONSTRAINT "learning_courses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_enrolments" ADD CONSTRAINT "learning_enrolments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_enrolments" ADD CONSTRAINT "learning_enrolments_session_fk" FOREIGN KEY ("tenant_id","session_id") REFERENCES "public"."learning_sessions"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_enrolments" ADD CONSTRAINT "learning_enrolments_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_requirements" ADD CONSTRAINT "learning_requirements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_requirements" ADD CONSTRAINT "learning_requirements_course_fk" FOREIGN KEY ("tenant_id","course_id") REFERENCES "public"."learning_courses"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_requirements" ADD CONSTRAINT "learning_requirements_company_fk" FOREIGN KEY ("tenant_id","legal_entity_id") REFERENCES "public"."legal_entities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_requirements" ADD CONSTRAINT "learning_requirements_designation_fk" FOREIGN KEY ("tenant_id","designation_id") REFERENCES "public"."designations"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_course_fk" FOREIGN KEY ("tenant_id","course_id") REFERENCES "public"."learning_courses"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_company_fk" FOREIGN KEY ("tenant_id","legal_entity_id") REFERENCES "public"."legal_entities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_sessions" ADD CONSTRAINT "learning_sessions_location_fk" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."locations"("tenant_id","id") ON DELETE no action ON UPDATE no action;