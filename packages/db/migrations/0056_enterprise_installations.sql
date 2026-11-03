CREATE TABLE "enterprise_installations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"customer_id" text NOT NULL,
	"release" text NOT NULL,
	"license_envelope" text,
	"accepted_claims" jsonb,
	"license_sequence" integer DEFAULT 0 NOT NULL,
	"last_import_error" text,
	"max_observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"clock_rollback_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "enterprise_installations_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "installation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" uuid NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "installation_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	CONSTRAINT "installation_invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "tenant_placements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"installation_id" uuid NOT NULL,
	"customer_id" text NOT NULL,
	"region" text NOT NULL,
	"route_key" text NOT NULL,
	"api_origin" text NOT NULL,
	"web_origin" text NOT NULL,
	"proof_public_key" text NOT NULL,
	"challenge" uuid NOT NULL,
	"challenge_expires_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'provisioning' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"residency" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"receipt_accepted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_placements_tenant_id_unique" UNIQUE("tenant_id"),
	CONSTRAINT "tenant_placements_installation_id_unique" UNIQUE("installation_id"),
	CONSTRAINT "tenant_placements_route_key_unique" UNIQUE("route_key")
);
--> statement-breakpoint
ALTER TABLE "enterprise_installations" ADD CONSTRAINT "enterprise_installations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installation_events" ADD CONSTRAINT "installation_events_installation_id_enterprise_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."enterprise_installations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installation_invitations" ADD CONSTRAINT "installation_invitations_installation_id_enterprise_installations_id_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."enterprise_installations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_placements" ADD CONSTRAINT "tenant_placements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;