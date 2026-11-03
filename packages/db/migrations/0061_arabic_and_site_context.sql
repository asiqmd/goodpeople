ALTER TYPE "public"."user_language" ADD VALUE 'ar';--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "country_code" text DEFAULT 'BD' NOT NULL;