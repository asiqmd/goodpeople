ALTER TABLE scim_membership_removals ENABLE ROW LEVEL SECURITY;
ALTER TABLE scim_membership_removals FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON scim_membership_removals USING (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid) WITH CHECK (tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid);
--> statement-breakpoint
CREATE FUNCTION scim_membership_connection() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM scim_groups g JOIN scim_users u ON u.connection_id=g.connection_id AND u.tenant_id=g.tenant_id
    WHERE g.id=NEW.group_id AND u.id=NEW.scim_user_id AND g.tenant_id=NEW.tenant_id) THEN
    RAISE EXCEPTION 'Membership belongs to another provisioning connection' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER scim_member_connection BEFORE INSERT OR UPDATE ON scim_memberships FOR EACH ROW EXECUTE FUNCTION scim_membership_connection();
CREATE TRIGGER scim_removal_connection BEFORE INSERT OR UPDATE ON scim_membership_removals FOR EACH ROW EXECUTE FUNCTION scim_membership_connection();
--> statement-breakpoint
CREATE FUNCTION scim_local_user_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF OLD.name IS DISTINCT FROM NEW.name OR OLD.email IS DISTINCT FROM NEW.email OR OLD.phone IS DISTINCT FROM NEW.phone OR OLD.disabled_at IS DISTINCT FROM NEW.disabled_at OR OLD.provision_disabled IS DISTINCT FROM NEW.provision_disabled THEN
    UPDATE scim_users SET version=version+1 WHERE tenant_id=NEW.tenant_id AND user_id=NEW.id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER scim_local_user_revision AFTER UPDATE OF name,email,phone,disabled_at,provision_disabled ON tenant_users FOR EACH ROW EXECUTE FUNCTION scim_local_user_revision();
