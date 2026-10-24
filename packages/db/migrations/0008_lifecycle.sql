CREATE TYPE "public"."document_category" AS ENUM('photo', 'nid', 'birth_certificate', 'passport', 'educational_certificate', 'experience_certificate', 'appointment_letter', 'contract', 'medical_certificate', 'police_verification', 'nominee_form', 'letter', 'punch_selfie', 'other');--> statement-breakpoint
CREATE TYPE "public"."document_source" AS ENUM('upload', 'generated');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('validated', 'committed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."letter_language" AS ENUM('en', 'bn');--> statement-breakpoint
CREATE TYPE "public"."separation_status" AS ENUM('pending', 'approved', 'completed', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."separation_type" AS ENUM('resignation', 'termination', 'dismissal', 'discharge', 'retrenchment', 'retirement', 'death', 'contract_end');--> statement-breakpoint
CREATE TABLE "document_counters" (
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"year" integer NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "document_counters_tenant_id_key_year_pk" PRIMARY KEY("tenant_id","key","year")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"category" "document_category" NOT NULL,
	"title" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text NOT NULL,
	"source" "document_source" DEFAULT 'upload' NOT NULL,
	"ref_no" text,
	"letter_template_id" uuid,
	"issued_on" date,
	"expires_on" date,
	"visible_to_employee" boolean DEFAULT false NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "documents_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"file_name" text NOT NULL,
	"status" "import_status" DEFAULT 'validated' NOT NULL,
	"total_rows" integer NOT NULL,
	"valid_rows" integer NOT NULL,
	"rows_enc" text,
	"report" jsonb NOT NULL,
	"imported" integer,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"committed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "letter_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"language" "letter_language" NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "letter_templates_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "letter_templates_code_language_uq" UNIQUE("tenant_id","code","language")
);
--> statement-breakpoint
CREATE TABLE "separations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"type" "separation_type" NOT NULL,
	"status" "separation_status" NOT NULL,
	"notice_date" date NOT NULL,
	"last_working_day" date NOT NULL,
	"reason" text NOT NULL,
	"notice_days_required" integer,
	"initiated_by" text NOT NULL,
	"applied_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "separations_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "tenant_users" ADD COLUMN "disabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attendance_punches" ADD COLUMN "selfie_document_id" uuid;--> statement-breakpoint
ALTER TABLE "attendance_settings" ADD COLUMN "require_selfie" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "document_counters" ADD CONSTRAINT "document_counters_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letter_templates" ADD CONSTRAINT "letter_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "separations" ADD CONSTRAINT "separations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "separations" ADD CONSTRAINT "separations_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_employee_idx" ON "documents" USING btree ("tenant_id","employee_id","category");--> statement-breakpoint
CREATE INDEX "documents_expiry_idx" ON "documents" USING btree ("tenant_id","expires_on") WHERE "documents"."expires_on" is not null and "documents"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "import_batches_tenant_idx" ON "import_batches" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "separations_open_uq" ON "separations" USING btree ("employee_id") WHERE "separations"."status" in ('pending', 'approved');--> statement-breakpoint
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_selfie_fk" FOREIGN KEY ("tenant_id","selfie_document_id") REFERENCES "public"."documents"("tenant_id","id") ON DELETE no action ON UPDATE no action;