CREATE TABLE "announcement_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"announcement_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"acknowledged_at" timestamp with time zone,
	CONSTRAINT "announcement_receipts_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "announcement_receipts_person_uq" UNIQUE("announcement_id","employee_id")
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"title" text NOT NULL,
	"title_bn" text NOT NULL,
	"body" text NOT NULL,
	"body_bn" text NOT NULL,
	"requires_acknowledgement" boolean DEFAULT false NOT NULL,
	"due_on" date,
	"expires_on" date,
	"status" text DEFAULT 'draft' NOT NULL,
	"retired_at" timestamp with time zone,
	"retire_reason" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcements_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "announcements_due_ck" CHECK (not "announcements"."requires_acknowledgement" or "announcements"."due_on" is not null),
	CONSTRAINT "announcements_status_ck" CHECK ("announcements"."status" in ('draft','published','retired'))
);
--> statement-breakpoint
CREATE TABLE "asset_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"issued_on" date NOT NULL,
	"due_on" date,
	"issue_condition" text NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"returned_on" date,
	"return_condition" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_issues_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "asset_issues_dates_ck" CHECK (("asset_issues"."due_on" is null or "asset_issues"."due_on" >= "asset_issues"."issued_on") and ("asset_issues"."returned_on" is null or "asset_issues"."returned_on" >= "asset_issues"."issued_on"))
);
--> statement-breakpoint
CREATE TABLE "company_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"tag" text NOT NULL,
	"name" text NOT NULL,
	"name_bn" text NOT NULL,
	"kind" text NOT NULL,
	"serial_number" text DEFAULT '' NOT NULL,
	"retired_at" timestamp with time zone,
	"retire_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_assets_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "company_assets_tag_uq" UNIQUE("tenant_id","tag")
);
--> statement-breakpoint
CREATE TABLE "engagement_surveys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"title" text NOT NULL,
	"title_bn" text NOT NULL,
	"description" text NOT NULL,
	"description_bn" text NOT NULL,
	"questions" jsonb NOT NULL,
	"threshold" integer DEFAULT 5 NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"audience_count" integer DEFAULT 0 NOT NULL,
	"totals" jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "engagement_surveys_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "engagement_surveys_threshold_ck" CHECK ("engagement_surveys"."threshold" between 5 and 100),
	CONSTRAINT "engagement_surveys_status_ck" CHECK ("engagement_surveys"."status" in ('draft','open','closed'))
);
--> statement-breakpoint
CREATE TABLE "hr_request_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"author_name" text NOT NULL,
	"body_enc" text NOT NULL,
	"internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hr_request_messages_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "hr_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"content_enc" text NOT NULL,
	"category" text NOT NULL,
	"priority" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"assignee_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hr_requests_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "hr_requests_status_ck" CHECK ("hr_requests"."status" in ('open','in_progress','resolved','closed'))
);
--> statement-breakpoint
CREATE TABLE "recognitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"value" text NOT NULL,
	"message" text NOT NULL,
	"hidden_at" timestamp with time zone,
	"hide_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recognitions_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "recognitions_other_person_ck" CHECK ("recognitions"."sender_id" <> "recognitions"."recipient_id")
);
--> statement-breakpoint
CREATE TABLE "survey_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"survey_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"submitted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "survey_participants_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "survey_participants_person_uq" UNIQUE("survey_id","employee_id")
);
--> statement-breakpoint
ALTER TABLE "announcement_receipts" ADD CONSTRAINT "announcement_receipts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_receipts" ADD CONSTRAINT "announcement_receipts_notice_fk" FOREIGN KEY ("tenant_id","announcement_id") REFERENCES "public"."announcements"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_receipts" ADD CONSTRAINT "announcement_receipts_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_company_fk" FOREIGN KEY ("tenant_id","legal_entity_id") REFERENCES "public"."legal_entities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_issues" ADD CONSTRAINT "asset_issues_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_issues" ADD CONSTRAINT "asset_issues_asset_fk" FOREIGN KEY ("tenant_id","asset_id") REFERENCES "public"."company_assets"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_issues" ADD CONSTRAINT "asset_issues_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_assets" ADD CONSTRAINT "company_assets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_assets" ADD CONSTRAINT "company_assets_company_fk" FOREIGN KEY ("tenant_id","legal_entity_id") REFERENCES "public"."legal_entities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_surveys" ADD CONSTRAINT "engagement_surveys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_surveys" ADD CONSTRAINT "engagement_surveys_company_fk" FOREIGN KEY ("tenant_id","legal_entity_id") REFERENCES "public"."legal_entities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_request_messages" ADD CONSTRAINT "hr_request_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_request_messages" ADD CONSTRAINT "hr_request_messages_request_fk" FOREIGN KEY ("tenant_id","request_id") REFERENCES "public"."hr_requests"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_request_messages" ADD CONSTRAINT "hr_request_messages_author_fk" FOREIGN KEY ("tenant_id","author_id") REFERENCES "public"."tenant_users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_requests" ADD CONSTRAINT "hr_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_requests" ADD CONSTRAINT "hr_requests_company_fk" FOREIGN KEY ("tenant_id","legal_entity_id") REFERENCES "public"."legal_entities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_requests" ADD CONSTRAINT "hr_requests_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_requests" ADD CONSTRAINT "hr_requests_assignee_fk" FOREIGN KEY ("tenant_id","assignee_id") REFERENCES "public"."tenant_users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recognitions" ADD CONSTRAINT "recognitions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recognitions" ADD CONSTRAINT "recognitions_company_fk" FOREIGN KEY ("tenant_id","legal_entity_id") REFERENCES "public"."legal_entities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recognitions" ADD CONSTRAINT "recognitions_sender_fk" FOREIGN KEY ("tenant_id","sender_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recognitions" ADD CONSTRAINT "recognitions_recipient_fk" FOREIGN KEY ("tenant_id","recipient_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_participants" ADD CONSTRAINT "survey_participants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_participants" ADD CONSTRAINT "survey_participants_survey_fk" FOREIGN KEY ("tenant_id","survey_id") REFERENCES "public"."engagement_surveys"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_participants" ADD CONSTRAINT "survey_participants_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_issues_outstanding_uq" ON "asset_issues" USING btree ("asset_id") WHERE "asset_issues"."returned_on" is null;--> statement-breakpoint
CREATE INDEX "hr_requests_queue_idx" ON "hr_requests" USING btree ("tenant_id","legal_entity_id","status");--> statement-breakpoint
CREATE INDEX "recognitions_feed_idx" ON "recognitions" USING btree ("tenant_id","legal_entity_id","created_at");