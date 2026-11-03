CREATE TABLE "access_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"company_ids" uuid[] DEFAULT '{}' NOT NULL,
	"relationship" text DEFAULT 'all' NOT NULL,
	"source" text DEFAULT 'local' NOT NULL,
	"source_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_assignments_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "access_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"permissions" text[] NOT NULL,
	"denied_permissions" text[] DEFAULT '{}' NOT NULL,
	"fields" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_roles_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "access_roles_name_uq" UNIQUE("tenant_id","name")
);
--> statement-breakpoint
CREATE TABLE "external_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_identities_subject_uq" UNIQUE("tenant_id","connection_id","issuer","subject"),
	CONSTRAINT "external_identities_user_uq" UNIQUE("tenant_id","connection_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "identity_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"issuer" text NOT NULL,
	"client_id" text NOT NULL,
	"client_secret_enc" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"enforced" boolean DEFAULT false NOT NULL,
	"tested_by" uuid,
	"second_test_by" uuid,
	"tested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_connections_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "identity_connections_issuer_uq" UNIQUE("tenant_id","issuer")
);
--> statement-breakpoint
CREATE TABLE "provisioning_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"actor_kind" text NOT NULL,
	"action" text NOT NULL,
	"resource_id" uuid,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scim_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scim_credentials_tenant_id_uq" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "scim_group_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"company_ids" uuid[] DEFAULT '{}' NOT NULL,
	"relationship" text DEFAULT 'all' NOT NULL,
	CONSTRAINT "scim_group_mapping_uq" UNIQUE("tenant_id","group_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "scim_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"external_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scim_groups_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "scim_groups_external_uq" UNIQUE("tenant_id","connection_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "scim_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"scim_user_id" uuid NOT NULL,
	CONSTRAINT "scim_memberships_uq" UNIQUE("tenant_id","group_id","scim_user_id")
);
--> statement-breakpoint
CREATE TABLE "scim_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"external_id" text,
	"active" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scim_users_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "scim_users_external_uq" UNIQUE("tenant_id","connection_id","external_id"),
	CONSTRAINT "scim_users_user_uq" UNIQUE("tenant_id","connection_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "family_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "auth_method" text DEFAULT 'password' NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "mfa_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "authenticated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_users" ADD COLUMN "auth_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_users" ADD COLUMN "access_mode" text DEFAULT 'template' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_users" ADD COLUMN "scope_mode" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_users" ADD COLUMN "provision_disabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_users" ADD COLUMN "emergency_local" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "access_assignments" ADD CONSTRAINT "access_assignments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_assignments" ADD CONSTRAINT "access_assignment_user_fk" FOREIGN KEY ("tenant_id","user_id") REFERENCES "public"."tenant_users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_assignments" ADD CONSTRAINT "access_assignment_role_fk" FOREIGN KEY ("tenant_id","role_id") REFERENCES "public"."access_roles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_roles" ADD CONSTRAINT "access_roles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identity_user_fk" FOREIGN KEY ("tenant_id","user_id") REFERENCES "public"."tenant_users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identity_connection_fk" FOREIGN KEY ("tenant_id","connection_id") REFERENCES "public"."identity_connections"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_connections" ADD CONSTRAINT "identity_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_connections" ADD CONSTRAINT "identity_test_user_fk" FOREIGN KEY ("tenant_id","tested_by") REFERENCES "public"."tenant_users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_connections" ADD CONSTRAINT "identity_second_test_user_fk" FOREIGN KEY ("tenant_id","second_test_by") REFERENCES "public"."tenant_users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provisioning_events" ADD CONSTRAINT "provisioning_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_credentials" ADD CONSTRAINT "scim_credentials_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_credentials" ADD CONSTRAINT "scim_credential_connection_fk" FOREIGN KEY ("tenant_id","connection_id") REFERENCES "public"."identity_connections"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_group_mappings" ADD CONSTRAINT "scim_group_mappings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_group_mappings" ADD CONSTRAINT "scim_group_mapping_group_fk" FOREIGN KEY ("tenant_id","group_id") REFERENCES "public"."scim_groups"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_group_mappings" ADD CONSTRAINT "scim_group_mapping_role_fk" FOREIGN KEY ("tenant_id","role_id") REFERENCES "public"."access_roles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_groups" ADD CONSTRAINT "scim_groups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_groups" ADD CONSTRAINT "scim_group_connection_fk" FOREIGN KEY ("tenant_id","connection_id") REFERENCES "public"."identity_connections"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_memberships" ADD CONSTRAINT "scim_memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_memberships" ADD CONSTRAINT "scim_membership_group_fk" FOREIGN KEY ("tenant_id","group_id") REFERENCES "public"."scim_groups"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_memberships" ADD CONSTRAINT "scim_membership_user_fk" FOREIGN KEY ("tenant_id","scim_user_id") REFERENCES "public"."scim_users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_users" ADD CONSTRAINT "scim_users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_users" ADD CONSTRAINT "scim_user_connection_fk" FOREIGN KEY ("tenant_id","connection_id") REFERENCES "public"."identity_connections"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_users" ADD CONSTRAINT "scim_user_login_fk" FOREIGN KEY ("tenant_id","user_id") REFERENCES "public"."tenant_users"("tenant_id","id") ON DELETE no action ON UPDATE no action;