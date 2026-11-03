CREATE TABLE "assurance_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"kind" text NOT NULL,
	"payload_enc" text NOT NULL,
	"payload_hash" text NOT NULL,
	"previous_hash" text NOT NULL,
	"event_hash" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assurance_event_sequence_uq" UNIQUE("program_id","sequence")
);
--> statement-breakpoint
CREATE TABLE "assurance_programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"definition_enc" text NOT NULL,
	"definition_hash" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assurance_events" ADD CONSTRAINT "assurance_events_actor_id_platform_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."platform_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assurance_events" ADD CONSTRAINT "assurance_events_program_id_assurance_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."assurance_programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assurance_programs" ADD CONSTRAINT "assurance_programs_created_by_platform_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."platform_users"("id") ON DELETE no action ON UPDATE no action;