ALTER TYPE "public"."notification_event" ADD VALUE IF NOT EXISTS 'recruitment.application' BEFORE 'auth.otp';--> statement-breakpoint
ALTER TYPE "public"."notification_event" ADD VALUE IF NOT EXISTS 'recruitment.interview' BEFORE 'auth.otp';--> statement-breakpoint
ALTER TYPE "public"."notification_event" ADD VALUE IF NOT EXISTS 'recruitment.offer' BEFORE 'auth.otp';--> statement-breakpoint
CREATE TABLE "application_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"from_stage" text,
	"to_stage" text,
	"note" text,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"opening_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"stage" text DEFAULT 'applied' NOT NULL,
	"stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rejection_reason" text,
	"source" text NOT NULL,
	"cover_note" text,
	"employee_id" uuid,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "applications_opening_candidate_uq" UNIQUE("opening_id","candidate_id")
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"phone" text,
	"source" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"referred_by_employee_id" uuid,
	"cv_storage_key" text,
	"cv_file_name" text,
	"cv_content_type" text,
	"cv_size_bytes" integer,
	"consent_at" timestamp with time zone,
	"talent_pool" boolean DEFAULT false NOT NULL,
	"notes" text,
	"erased_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "candidates_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "interview_panel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"interview_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"ratings" jsonb,
	"recommendation" text,
	"feedback" text,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interview_panel_member_uq" UNIQUE("interview_id","employee_id")
);
--> statement-breakpoint
CREATE TABLE "interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"location" text,
	"meeting_url" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"ics_uid" text NOT NULL,
	"ics_sequence" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interviews_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "interviews_time_ck" CHECK ("interviews"."ends_at" > "interviews"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "job_openings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"org_unit_id" uuid,
	"location_id" uuid,
	"designation_id" uuid,
	"grade_id" uuid,
	"title" text NOT NULL,
	"employment_type" text NOT NULL,
	"headcount" integer DEFAULT 1 NOT NULL,
	"reason" text DEFAULT 'new_position' NOT NULL,
	"replaces_employee_id" uuid,
	"budget_min" numeric(14, 2),
	"budget_max" numeric(14, 2),
	"justification" text,
	"hiring_manager_employee_id" uuid,
	"status" text DEFAULT 'draft' NOT NULL,
	"post_title_en" text,
	"post_title_bn" text,
	"description_en" text,
	"description_bn" text,
	"show_salary" boolean DEFAULT false NOT NULL,
	"closes_on" date,
	"published_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"scorecard_criteria" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_openings_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "job_openings_headcount_ck" CHECK ("job_openings"."headcount" between 1 and 1000),
	CONSTRAINT "job_openings_budget_ck" CHECK ("job_openings"."budget_min" is null or "job_openings"."budget_max" is null or "job_openings"."budget_min" <= "job_openings"."budget_max")
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"org_unit_id" uuid,
	"location_id" uuid,
	"designation_id" uuid,
	"grade_id" uuid,
	"employment_type" text NOT NULL,
	"joining_on" date NOT NULL,
	"monthly_gross" numeric(14, 2) NOT NULL,
	"probation_months" integer,
	"expires_on" date NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"terms" text,
	"token_hash" text,
	"sent_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"accepted_name" text,
	"accepted_ip" text,
	"decline_reason" text,
	"letter_storage_key" text,
	"letter_sha256" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "offers_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "recruitment_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"careers_enabled" boolean DEFAULT false NOT NULL,
	"intro_en" text,
	"intro_bn" text,
	"retention_months" integer DEFAULT 12 NOT NULL,
	"privacy_email" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_application_fk" FOREIGN KEY ("tenant_id","application_id") REFERENCES "public"."applications"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_opening_fk" FOREIGN KEY ("tenant_id","opening_id") REFERENCES "public"."job_openings"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_candidate_fk" FOREIGN KEY ("tenant_id","candidate_id") REFERENCES "public"."candidates"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_referrer_fk" FOREIGN KEY ("tenant_id","referred_by_employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_panel" ADD CONSTRAINT "interview_panel_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_panel" ADD CONSTRAINT "interview_panel_interview_fk" FOREIGN KEY ("tenant_id","interview_id") REFERENCES "public"."interviews"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_panel" ADD CONSTRAINT "interview_panel_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_application_fk" FOREIGN KEY ("tenant_id","application_id") REFERENCES "public"."applications"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_openings" ADD CONSTRAINT "job_openings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_openings" ADD CONSTRAINT "job_openings_entity_fk" FOREIGN KEY ("tenant_id","legal_entity_id") REFERENCES "public"."legal_entities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_openings" ADD CONSTRAINT "job_openings_unit_fk" FOREIGN KEY ("tenant_id","org_unit_id") REFERENCES "public"."org_units"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_openings" ADD CONSTRAINT "job_openings_location_fk" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."locations"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_openings" ADD CONSTRAINT "job_openings_designation_fk" FOREIGN KEY ("tenant_id","designation_id") REFERENCES "public"."designations"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_openings" ADD CONSTRAINT "job_openings_grade_fk" FOREIGN KEY ("tenant_id","grade_id") REFERENCES "public"."grades"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_openings" ADD CONSTRAINT "job_openings_replaces_fk" FOREIGN KEY ("tenant_id","replaces_employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_openings" ADD CONSTRAINT "job_openings_manager_fk" FOREIGN KEY ("tenant_id","hiring_manager_employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_application_fk" FOREIGN KEY ("tenant_id","application_id") REFERENCES "public"."applications"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_entity_fk" FOREIGN KEY ("tenant_id","legal_entity_id") REFERENCES "public"."legal_entities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_unit_fk" FOREIGN KEY ("tenant_id","org_unit_id") REFERENCES "public"."org_units"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_location_fk" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."locations"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_designation_fk" FOREIGN KEY ("tenant_id","designation_id") REFERENCES "public"."designations"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_grade_fk" FOREIGN KEY ("tenant_id","grade_id") REFERENCES "public"."grades"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_settings" ADD CONSTRAINT "recruitment_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_events_application_idx" ON "application_events" USING btree ("tenant_id","application_id","created_at");--> statement-breakpoint
CREATE INDEX "applications_opening_idx" ON "applications" USING btree ("tenant_id","opening_id","stage");--> statement-breakpoint
CREATE UNIQUE INDEX "candidates_email_uq" ON "candidates" USING btree ("tenant_id","email") WHERE "candidates"."email" is not null and "candidates"."erased_at" is null;--> statement-breakpoint
CREATE INDEX "candidates_phone_idx" ON "candidates" USING btree ("tenant_id","phone");--> statement-breakpoint
CREATE INDEX "interview_panel_employee_idx" ON "interview_panel" USING btree ("tenant_id","employee_id");--> statement-breakpoint
CREATE INDEX "interviews_application_idx" ON "interviews" USING btree ("tenant_id","application_id");--> statement-breakpoint
CREATE INDEX "job_openings_status_idx" ON "job_openings" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "offers_token_uq" ON "offers" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "offers_application_idx" ON "offers" USING btree ("tenant_id","application_id");