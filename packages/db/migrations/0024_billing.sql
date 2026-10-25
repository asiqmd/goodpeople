ALTER TYPE "public"."notification_event" ADD VALUE 'billing.invoice_issued' BEFORE 'auth.otp';--> statement-breakpoint
ALTER TYPE "public"."notification_event" ADD VALUE 'billing.payment_received' BEFORE 'auth.otp';--> statement-breakpoint
ALTER TYPE "public"."notification_event" ADD VALUE 'billing.payment_due' BEFORE 'auth.otp';--> statement-breakpoint
ALTER TYPE "public"."notification_event" ADD VALUE 'trial.ending' BEFORE 'auth.otp';--> statement-breakpoint
CREATE TABLE "partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"address" text NOT NULL,
	"bin" text,
	"discount_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"supplier_name" text NOT NULL,
	"supplier_address" text NOT NULL,
	"bin" text NOT NULL,
	"tin" text,
	"service_code" text DEFAULT 'S099.10' NOT NULL,
	"startup_exempt" boolean DEFAULT false NOT NULL,
	"due_days" integer DEFAULT 10 NOT NULL,
	"grace_days" integer DEFAULT 7 NOT NULL,
	"bank_details" text NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_settings_one_row" CHECK ("billing_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "coupon_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coupon_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"months_used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupon_redemptions_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"percent_off" numeric(5, 2),
	"amount_off" numeric(14, 2),
	"months" integer,
	"max_redemptions" integer,
	"valid_until" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "invoice_counters" (
	"fiscal_year" text NOT NULL,
	"kind" text NOT NULL,
	"last" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "invoice_counters_fiscal_year_kind_pk" PRIMARY KEY("fiscal_year","kind")
);
--> statement-breakpoint
CREATE TABLE "invoice_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"method" text,
	"status" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"reference" text,
	"provider_ref" text,
	"raw" jsonb,
	"recorded_by" uuid,
	"recorded_by_user" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"tenant_id" uuid,
	"partner_id" uuid,
	"period_start" date,
	"period_end" date,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_date" date,
	"supplier" jsonb NOT NULL,
	"buyer" jsonb NOT NULL,
	"lines" jsonb NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	"discount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"taxable" numeric(14, 2) NOT NULL,
	"service_code" text NOT NULL,
	"vat_rate" numeric(5, 2) NOT NULL,
	"vat" numeric(14, 2) NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"credits_invoice_id" uuid,
	"reason" text,
	"paid_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "plan_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_code" "plan_code" NOT NULL,
	"staff_seat" numeric(10, 2) NOT NULL,
	"worker_seat" numeric(10, 2) NOT NULL,
	"minimum" numeric(14, 2) DEFAULT '0' NOT NULL,
	"effective_from" date NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_prices_plan_from_uq" UNIQUE("plan_code","effective_from")
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "started_on" date;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "cancel_at" date;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "buyer" jsonb;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "partner_id" uuid;--> statement-breakpoint
ALTER TABLE "billing_settings" ADD CONSTRAINT "billing_settings_updated_by_platform_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."platform_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_created_by_platform_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."platform_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_settlements" ADD CONSTRAINT "invoice_settlements_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_settlements" ADD CONSTRAINT "invoice_settlements_recorded_by_platform_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."platform_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_platform_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."platform_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_prices" ADD CONSTRAINT "plan_prices_created_by_platform_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."platform_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_settlements_invoice_idx" ON "invoice_settlements" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_tenant_idx" ON "invoices" USING btree ("tenant_id","issued_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_tenant_period_uq" ON "invoices" USING btree ("tenant_id","period_start") WHERE "invoices"."kind" = 'invoice' and "invoices"."status" <> 'void' and "invoices"."tenant_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_partner_period_uq" ON "invoices" USING btree ("partner_id","period_start") WHERE "invoices"."kind" = 'invoice' and "invoices"."status" <> 'void' and "invoices"."partner_id" is not null;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;