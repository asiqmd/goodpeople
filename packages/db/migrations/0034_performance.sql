ALTER TYPE "public"."notification_event" ADD VALUE IF NOT EXISTS 'performance.task' BEFORE 'auth.otp';--> statement-breakpoint
ALTER TYPE "public"."notification_event" ADD VALUE IF NOT EXISTS 'performance.released' BEFORE 'auth.otp';--> statement-breakpoint
CREATE TABLE "goal_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"goal_id" uuid NOT NULL,
	"progress" integer,
	"value" numeric(14, 2),
	"note" text,
	"author_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid,
	"org_unit_id" uuid,
	"cycle_id" uuid,
	"parent_goal_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"kind" text NOT NULL,
	"key_results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"measure_unit" text,
	"target" numeric(14, 2),
	"direction" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"current_value" numeric(14, 2),
	"progress" integer DEFAULT 0 NOT NULL,
	"weight" numeric(5, 2),
	"starts_on" date,
	"due_on" date,
	"status" text DEFAULT 'draft' NOT NULL,
	"agreed_at" timestamp with time zone,
	"agreed_by_user_id" uuid,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "goals_owner_ck" CHECK ("goals"."employee_id" is not null or "goals"."org_unit_id" is not null),
	CONSTRAINT "goals_progress_ck" CHECK ("goals"."progress" between 0 and 100),
	CONSTRAINT "goals_weight_ck" CHECK ("goals"."weight" is null or "goals"."weight" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "improvement_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"manager_employee_id" uuid,
	"review_id" uuid,
	"reason" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"objectives" jsonb NOT NULL,
	"support" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"outcome_note" text,
	"decided_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"employee_comment" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "improvement_plans_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "improvement_plans_period_ck" CHECK ("improvement_plans"."ends_on" > "improvement_plans"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "peer_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"review_id" uuid NOT NULL,
	"peer_employee_id" uuid NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"proposed_by_user_id" uuid,
	"answers" jsonb,
	"rating" integer,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "peer_feedback_review_peer_uq" UNIQUE("review_id","peer_employee_id"),
	CONSTRAINT "peer_feedback_rating_ck" CHECK ("peer_feedback"."rating" is null or "peer_feedback"."rating" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "performance_settings" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"competencies" jsonb NOT NULL,
	"rating_guide" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"held_on" date NOT NULL,
	"note" text NOT NULL,
	"author_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "probation_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"manager_employee_id" uuid,
	"probation_ends_on" date NOT NULL,
	"ratings" jsonb,
	"recommendation" text,
	"comment" text,
	"submitted_at" timestamp with time zone,
	"acted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "probation_reviews_employee_end_uq" UNIQUE("employee_id","probation_ends_on")
);
--> statement-breakpoint
CREATE TABLE "review_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"legal_entity_ids" uuid[] DEFAULT '{}' NOT NULL,
	"joined_on_or_before" date,
	"self_review" boolean DEFAULT true NOT NULL,
	"peer_review" boolean DEFAULT false NOT NULL,
	"competencies" jsonb NOT NULL,
	"goals_due_on" date,
	"self_due_on" date,
	"peer_due_on" date,
	"manager_due_on" date,
	"calibration_due_on" date,
	"status" text DEFAULT 'draft' NOT NULL,
	"launched_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_cycles_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "review_cycles_period_ck" CHECK ("review_cycles"."period_end" >= "review_cycles"."period_start")
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"cycle_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"manager_employee_id" uuid,
	"status" text NOT NULL,
	"self_answers" jsonb,
	"self_submitted_at" timestamp with time zone,
	"manager_answers" jsonb,
	"manager_submitted_at" timestamp with time zone,
	"goal_score" numeric(3, 2),
	"proposed_rating" integer,
	"recommendations" jsonb,
	"final_rating" integer,
	"calibration_note" text,
	"calibrated_by_user_id" uuid,
	"calibrated_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"employee_comment" text,
	"employee_agrees" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reviews_tenant_id_uq" UNIQUE("tenant_id","id"),
	CONSTRAINT "reviews_cycle_employee_uq" UNIQUE("cycle_id","employee_id"),
	CONSTRAINT "reviews_proposed_ck" CHECK ("reviews"."proposed_rating" is null or "reviews"."proposed_rating" between 1 and 5),
	CONSTRAINT "reviews_final_ck" CHECK ("reviews"."final_rating" is null or "reviews"."final_rating" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "goal_checkins" ADD CONSTRAINT "goal_checkins_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_checkins" ADD CONSTRAINT "goal_checkins_goal_fk" FOREIGN KEY ("tenant_id","goal_id") REFERENCES "public"."goals"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_unit_fk" FOREIGN KEY ("tenant_id","org_unit_id") REFERENCES "public"."org_units"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_cycle_fk" FOREIGN KEY ("tenant_id","cycle_id") REFERENCES "public"."review_cycles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_parent_fk" FOREIGN KEY ("tenant_id","parent_goal_id") REFERENCES "public"."goals"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "improvement_plans" ADD CONSTRAINT "improvement_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "improvement_plans" ADD CONSTRAINT "improvement_plans_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "improvement_plans" ADD CONSTRAINT "improvement_plans_manager_fk" FOREIGN KEY ("tenant_id","manager_employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "improvement_plans" ADD CONSTRAINT "improvement_plans_review_fk" FOREIGN KEY ("tenant_id","review_id") REFERENCES "public"."reviews"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_feedback" ADD CONSTRAINT "peer_feedback_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_feedback" ADD CONSTRAINT "peer_feedback_review_fk" FOREIGN KEY ("tenant_id","review_id") REFERENCES "public"."reviews"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_feedback" ADD CONSTRAINT "peer_feedback_peer_fk" FOREIGN KEY ("tenant_id","peer_employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_settings" ADD CONSTRAINT "performance_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_checkins" ADD CONSTRAINT "plan_checkins_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_checkins" ADD CONSTRAINT "plan_checkins_plan_fk" FOREIGN KEY ("tenant_id","plan_id") REFERENCES "public"."improvement_plans"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probation_reviews" ADD CONSTRAINT "probation_reviews_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probation_reviews" ADD CONSTRAINT "probation_reviews_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "probation_reviews" ADD CONSTRAINT "probation_reviews_manager_fk" FOREIGN KEY ("tenant_id","manager_employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_cycles" ADD CONSTRAINT "review_cycles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_cycle_fk" FOREIGN KEY ("tenant_id","cycle_id") REFERENCES "public"."review_cycles"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_employee_fk" FOREIGN KEY ("tenant_id","employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_manager_fk" FOREIGN KEY ("tenant_id","manager_employee_id") REFERENCES "public"."employees"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goal_checkins_goal_idx" ON "goal_checkins" USING btree ("tenant_id","goal_id","created_at");--> statement-breakpoint
CREATE INDEX "goals_employee_idx" ON "goals" USING btree ("tenant_id","employee_id","cycle_id");--> statement-breakpoint
CREATE INDEX "goals_unit_idx" ON "goals" USING btree ("tenant_id","org_unit_id");--> statement-breakpoint
CREATE INDEX "improvement_plans_employee_idx" ON "improvement_plans" USING btree ("tenant_id","employee_id");--> statement-breakpoint
CREATE INDEX "peer_feedback_peer_idx" ON "peer_feedback" USING btree ("tenant_id","peer_employee_id","status");--> statement-breakpoint
CREATE INDEX "plan_checkins_plan_idx" ON "plan_checkins" USING btree ("tenant_id","plan_id");--> statement-breakpoint
CREATE INDEX "probation_reviews_manager_idx" ON "probation_reviews" USING btree ("tenant_id","manager_employee_id");--> statement-breakpoint
CREATE INDEX "review_cycles_status_idx" ON "review_cycles" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "reviews_manager_idx" ON "reviews" USING btree ("tenant_id","manager_employee_id","status");