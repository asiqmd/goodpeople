ALTER TABLE "webhook_subscriptions" ADD COLUMN "pending_key_id" uuid;--> statement-breakpoint
ALTER TABLE "webhook_subscriptions" ADD COLUMN "pending_secret_enc" text;