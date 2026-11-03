-- Retire pre-family-root sessions at this one-time identity cutover.
UPDATE auth_sessions SET family_id=id,revoked_at=coalesce(revoked_at,now()) WHERE family_id<>id;
--> statement-breakpoint
ALTER TABLE "auth_sessions" ALTER COLUMN "family_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD COLUMN "family_revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_family_fk" FOREIGN KEY ("family_id") REFERENCES "public"."auth_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_sessions_family_idx" ON "auth_sessions" USING btree ("family_id");
--> statement-breakpoint
DROP TRIGGER tenant_user_authority ON tenant_users;
CREATE TRIGGER tenant_user_authority BEFORE UPDATE OF role,email,phone,disabled_at,provision_disabled,scope_mode,access_mode,password_hash,emergency_local,auth_revision ON tenant_users FOR EACH ROW EXECUTE FUNCTION revise_login_authority();
