CREATE TABLE "auth_proofs" (
	"hash" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_users" ADD COLUMN "mfa_last_step" integer;--> statement-breakpoint
ALTER TABLE "tenant_users" ADD COLUMN "mfa_last_step" integer;