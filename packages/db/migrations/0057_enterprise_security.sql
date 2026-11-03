CREATE FUNCTION guard_enterprise_installation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.id<>OLD.id OR NEW.tenant_id<>OLD.tenant_id OR NEW.mode<>OLD.mode OR NEW.customer_id<>OLD.customer_id THEN RAISE EXCEPTION 'Installation binding is immutable';END IF;
 IF NEW.license_sequence<OLD.license_sequence OR NEW.max_observed_at<OLD.max_observed_at THEN RAISE EXCEPTION 'Installation authority cannot move backwards';END IF;
 IF (NEW.license_envelope IS DISTINCT FROM OLD.license_envelope OR NEW.accepted_claims IS DISTINCT FROM OLD.accepted_claims) AND NEW.license_sequence<=OLD.license_sequence THEN RAISE EXCEPTION 'License replacement requires a newer sequence';END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER enterprise_installation_guard BEFORE UPDATE ON enterprise_installations FOR EACH ROW EXECUTE FUNCTION guard_enterprise_installation();
--> statement-breakpoint
CREATE FUNCTION guard_installed_tenant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM enterprise_installations WHERE tenant_id<>NEW.id) THEN RAISE EXCEPTION 'Installed database is bound to one tenant';END IF;
 IF TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM enterprise_installations WHERE tenant_id=NEW.id) AND NEW.billing_mode<>'license' THEN RAISE EXCEPTION 'Installed tenant requires signed license entitlements';END IF;
 RETURN NEW;
END;$$;
CREATE TRIGGER installed_tenant_guard BEFORE INSERT OR UPDATE OF billing_mode ON tenants FOR EACH ROW EXECUTE FUNCTION guard_installed_tenant();
--> statement-breakpoint
CREATE FUNCTION guard_installed_platform_user() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM enterprise_installations) THEN RAISE EXCEPTION 'Installed deployment uses named local workspace administration';END IF;RETURN NEW;END;$$;
CREATE TRIGGER installed_platform_user_guard BEFORE INSERT ON platform_users FOR EACH ROW EXECUTE FUNCTION guard_installed_platform_user();
--> statement-breakpoint
CREATE FUNCTION immutable_installation_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Installation evidence is append only';END;$$;
CREATE TRIGGER installation_event_immutable BEFORE UPDATE OR DELETE ON installation_events FOR EACH ROW EXECUTE FUNCTION immutable_installation_event();
--> statement-breakpoint
CREATE FUNCTION guard_installation_invite() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.installation_id<>OLD.installation_id OR NEW.token_hash<>OLD.token_hash OR NEW.name<>OLD.name OR NEW.email<>OLD.email OR NEW.expires_at<>OLD.expires_at OR OLD.claimed_at IS NOT NULL THEN RAISE EXCEPTION 'Installation invitation is immutable after creation or use';END IF;RETURN NEW;END;$$;
CREATE TRIGGER installation_invite_guard BEFORE UPDATE ON installation_invitations FOR EACH ROW EXECUTE FUNCTION guard_installation_invite();
