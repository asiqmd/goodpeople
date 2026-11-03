ALTER TABLE "enterprise_installations" ADD COLUMN "recovery_pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "installation_events" ADD COLUMN "reason" text;--> statement-breakpoint
CREATE FUNCTION public.enterprise_schema_version() RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,drizzle AS $$ SELECT count(*)::integer FROM drizzle.__drizzle_migrations $$;
