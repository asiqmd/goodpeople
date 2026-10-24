CREATE TYPE "public"."user_language" AS ENUM('en', 'bn');--> statement-breakpoint
CREATE TYPE "public"."delivery_channel" AS ENUM('email', 'sms', 'push');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('queued', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."device_platform" AS ENUM('android', 'ios', 'web');--> statement-breakpoint
CREATE TYPE "public"."notification_event" AS ENUM('approval.requested', 'approval.decided', 'document.expiring', 'probation.ending', 'letter.issued', 'attendance.missing_punch', 'auth.otp');--> statement-breakpoint
ALTER TYPE "public"."tenant_role" ADD VALUE 'hr_officer' BEFORE 'employee';--> statement-breakpoint
ALTER TYPE "public"."tenant_role" ADD VALUE 'attendance_officer' BEFORE 'employee';--> statement-breakpoint
ALTER TYPE "public"."tenant_role" ADD VALUE 'auditor' BEFORE 'employee';--> statement-breakpoint
CREATE TABLE "device_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" "device_platform" NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_tokens_token_uq" UNIQUE("tenant_id","token")
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"notification_id" uuid,
	"event" "notification_event" NOT NULL,
	"channel" "delivery_channel" NOT NULL,
	"recipient" text NOT NULL,
	"subject" text,
	"body" text NOT NULL,
	"status" "delivery_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"provider_ref" text,
	"segments" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"sms_enabled" boolean DEFAULT false NOT NULL,
	"push_enabled" boolean DEFAULT true NOT NULL,
	"channels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"event" "notification_event" NOT NULL,
	"language" "user_language" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"sms" text NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_templates_event_uq" UNIQUE("tenant_id","event","language")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid,
	"employee_id" uuid,
	"event" "notification_event" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"link" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "notifications_recipient_ck" CHECK ("notifications"."user_id" is not null or "notifications"."employee_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_users" ADD COLUMN "mfa_secret_enc" text;--> statement-breakpoint
ALTER TABLE "platform_users" ADD COLUMN "mfa_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "platform_users" ADD COLUMN "mfa_recovery_codes" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_users" ADD COLUMN "last_sign_in_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant_users" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "tenant_users" ADD COLUMN "language" "user_language" DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_users" ADD COLUMN "mfa_secret_enc" text;--> statement-breakpoint
ALTER TABLE "tenant_users" ADD COLUMN "mfa_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant_users" ADD COLUMN "mfa_recovery_codes" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_users" ADD COLUMN "last_sign_in_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attendance_punches" ADD COLUMN "offline" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_punches" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_fk" FOREIGN KEY ("tenant_id","user_id") REFERENCES "public"."tenant_users"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_fk" FOREIGN KEY ("tenant_id","notification_id") REFERENCES "public"."notifications"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_fk" FOREIGN KEY ("tenant_id","user_id") REFERENCES "public"."tenant_users"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_user_fk" FOREIGN KEY ("tenant_id","user_id") REFERENCES "public"."tenant_users"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_tokens_user_idx" ON "device_tokens" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "notification_deliveries_queue_idx" ON "notification_deliveries" USING btree ("tenant_id","next_attempt_at") WHERE "notification_deliveries"."status" = 'queued';--> statement-breakpoint
CREATE INDEX "notification_deliveries_created_idx" ON "notification_deliveries" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_inbox_idx" ON "notifications" USING btree ("tenant_id","user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_dedupe_uq" ON "notifications" USING btree ("tenant_id","dedupe_key") WHERE "notifications"."dedupe_key" is not null;--> statement-breakpoint
CREATE INDEX "otp_challenges_phone_idx" ON "otp_challenges" USING btree ("tenant_id","phone","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_punches_client_uq" ON "attendance_punches" USING btree ("tenant_id","client_id") WHERE "attendance_punches"."client_id" is not null;--> statement-breakpoint
ALTER TABLE "tenant_users" ADD CONSTRAINT "tenant_users_tenant_phone_uq" UNIQUE("tenant_id","phone");--> statement-breakpoint
ALTER TABLE "tenant_users" ADD CONSTRAINT "tenant_users_contact_ck" CHECK ("tenant_users"."email" is not null or "tenant_users"."phone" is not null);