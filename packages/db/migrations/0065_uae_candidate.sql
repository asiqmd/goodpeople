CREATE TABLE "uae_employer_coverage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"definition" jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uae_employer_tenant_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "uae_pilot_comparisons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"evidence_kind" text NOT NULL,
	"outcome" text NOT NULL,
	"payload_enc" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uae_pilot_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"mode" text DEFAULT 'preview' NOT NULL,
	"currency" text DEFAULT 'AED' NOT NULL,
	"manifest_hash" text NOT NULL,
	"context_hash" text NOT NULL,
	"calculation_hash" text NOT NULL,
	"payload_enc" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uae_pilot_tenant_company_uq" UNIQUE("tenant_id","legal_entity_id","id")
);
--> statement-breakpoint
CREATE TABLE "uae_qualification_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"manifest_hash" text NOT NULL,
	"payload_enc" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uae_worker_coverage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"definition_enc" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uae_worker_tenant_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "uae_wps_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"mode" text DEFAULT 'synthetic' NOT NULL,
	"adapter_version" text NOT NULL,
	"file_hash" text NOT NULL,
	"payload_enc" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uae_wps_tenant_company_uq" UNIQUE("tenant_id","legal_entity_id","id")
);
--> statement-breakpoint
CREATE TABLE "uae_wps_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"legal_entity_id" uuid NOT NULL,
	"batch_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"kind" text NOT NULL,
	"payload_hash" text NOT NULL,
	"payload_enc" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uae_wps_event_uq" UNIQUE("tenant_id","event_id")
);
--> statement-breakpoint
ALTER TABLE "uae_employer_coverage" ADD CONSTRAINT "uae_employer_coverage_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uae_employer_coverage" ADD CONSTRAINT "uae_employer_coverage_tenant_id_legal_entity_id_legal_entities_tenant_id_id_fk" FOREIGN KEY ("tenant_id","legal_entity_id") REFERENCES "public"."legal_entities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uae_pilot_comparisons" ADD CONSTRAINT "uae_pilot_comparisons_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uae_pilot_comparisons" ADD CONSTRAINT "uae_pilot_comparisons_tenant_id_legal_entity_id_run_id_uae_pilot_runs_tenant_id_legal_entity_id_id_fk" FOREIGN KEY ("tenant_id","legal_entity_id","run_id") REFERENCES "public"."uae_pilot_runs"("tenant_id","legal_entity_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uae_pilot_runs" ADD CONSTRAINT "uae_pilot_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uae_pilot_runs" ADD CONSTRAINT "uae_pilot_runs_tenant_id_legal_entity_id_legal_entities_tenant_id_id_fk" FOREIGN KEY ("tenant_id","legal_entity_id") REFERENCES "public"."legal_entities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uae_qualification_evidence" ADD CONSTRAINT "uae_qualification_evidence_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uae_qualification_evidence" ADD CONSTRAINT "uae_qualification_evidence_tenant_id_legal_entity_id_legal_entities_tenant_id_id_fk" FOREIGN KEY ("tenant_id","legal_entity_id") REFERENCES "public"."legal_entities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uae_worker_coverage" ADD CONSTRAINT "uae_worker_coverage_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uae_worker_coverage" ADD CONSTRAINT "uae_worker_coverage_tenant_id_legal_entity_id_legal_entities_tenant_id_id_fk" FOREIGN KEY ("tenant_id","legal_entity_id") REFERENCES "public"."legal_entities"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uae_worker_coverage" ADD CONSTRAINT "uae_worker_coverage_tenant_id_employee_id_employees_tenant_id_id_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uae_wps_batches" ADD CONSTRAINT "uae_wps_batches_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uae_wps_batches" ADD CONSTRAINT "uae_wps_batches_tenant_id_legal_entity_id_run_id_uae_pilot_runs_tenant_id_legal_entity_id_id_fk" FOREIGN KEY ("tenant_id","legal_entity_id","run_id") REFERENCES "public"."uae_pilot_runs"("tenant_id","legal_entity_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uae_wps_events" ADD CONSTRAINT "uae_wps_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uae_wps_events" ADD CONSTRAINT "uae_wps_events_tenant_id_legal_entity_id_batch_id_uae_wps_batches_tenant_id_legal_entity_id_id_fk" FOREIGN KEY ("tenant_id","legal_entity_id","batch_id") REFERENCES "public"."uae_wps_batches"("tenant_id","legal_entity_id","id") ON DELETE no action ON UPDATE no action;