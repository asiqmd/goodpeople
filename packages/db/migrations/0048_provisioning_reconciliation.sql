CREATE TABLE "scim_membership_removals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"scim_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scim_membership_removal_uq" UNIQUE("tenant_id","group_id","scim_user_id")
);
--> statement-breakpoint
ALTER TABLE "scim_groups" ADD COLUMN "require_membership_version" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "scim_users" ADD COLUMN "attributes" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "scim_membership_removals" ADD CONSTRAINT "scim_membership_removals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_membership_removals" ADD CONSTRAINT "scim_membership_removal_group_fk" FOREIGN KEY ("tenant_id","group_id") REFERENCES "public"."scim_groups"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scim_membership_removals" ADD CONSTRAINT "scim_membership_removal_user_fk" FOREIGN KEY ("tenant_id","scim_user_id") REFERENCES "public"."scim_users"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_proofs_expiry_idx" ON "auth_proofs" USING btree ("expires_at");