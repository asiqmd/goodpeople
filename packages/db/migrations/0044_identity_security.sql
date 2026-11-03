-- Existing scope rows retain their old meaning. Empty scope for new managed users is explicit.
DO $$ DECLARE tid uuid; BEGIN
  FOR tid IN SELECT id FROM tenants LOOP
    PERFORM set_config('app.tenant_id',tid::text,true);
    UPDATE tenant_users SET scope_mode='selected' WHERE EXISTS (SELECT 1 FROM user_entity_scopes s WHERE s.user_id=tenant_users.id);
  END LOOP;
  PERFORM set_config('app.tenant_id','',true);
END $$;
--> statement-breakpoint
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['access_roles','access_assignments','identity_connections','external_identities','scim_credentials','scim_users','scim_groups','scim_memberships','scim_group_mappings','provisioning_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',t);
  END LOOP;
END $$;
--> statement-breakpoint
ALTER TABLE tenant_users ADD CONSTRAINT tenant_users_access_mode_ck CHECK (access_mode IN ('template','custom'));
ALTER TABLE tenant_users ADD CONSTRAINT tenant_users_scope_mode_ck CHECK (scope_mode IN ('none','selected','all'));
ALTER TABLE access_assignments ADD CONSTRAINT access_assignments_scope_ck CHECK (scope IN ('none','selected','all') AND ((scope='selected' AND cardinality(company_ids)>0) OR (scope<>'selected' AND cardinality(company_ids)=0)));
ALTER TABLE access_assignments ADD CONSTRAINT access_assignments_relationship_ck CHECK (relationship IN ('all','own','direct_reports'));
ALTER TABLE access_assignments ADD CONSTRAINT access_assignments_source_ck CHECK (source IN ('local','scim'));
ALTER TABLE scim_group_mappings ADD CONSTRAINT scim_mapping_scope_ck CHECK (scope IN ('none','selected','all') AND ((scope='selected' AND cardinality(company_ids)>0) OR (scope<>'selected' AND cardinality(company_ids)=0)));
--> statement-breakpoint
-- Validate array references at the database boundary too: a foreign tenant ID is never a scope.
CREATE FUNCTION check_access_companies() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF EXISTS (SELECT 1 FROM unnest(NEW.company_ids) c WHERE NOT EXISTS
    (SELECT 1 FROM legal_entities e WHERE e.id=c AND e.tenant_id=NEW.tenant_id)) THEN
    RAISE EXCEPTION 'Access assignment references another tenant company' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER access_companies_check BEFORE INSERT OR UPDATE ON access_assignments FOR EACH ROW EXECUTE FUNCTION check_access_companies();
CREATE TRIGGER scim_mapping_companies_check BEFORE INSERT OR UPDATE ON scim_group_mappings FOR EACH ROW EXECUTE FUNCTION check_access_companies();
--> statement-breakpoint
CREATE FUNCTION revise_login_authority() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  NEW.auth_revision := OLD.auth_revision + 1;
  IF (NEW.disabled_at IS NOT NULL AND OLD.disabled_at IS NULL) OR (NEW.provision_disabled AND NOT OLD.provision_disabled) THEN
    UPDATE auth_sessions SET revoked_at=now() WHERE subject_kind='tenant' AND subject_id=NEW.id AND tenant_id=NEW.tenant_id AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER tenant_user_authority BEFORE UPDATE OF role,disabled_at,provision_disabled,scope_mode,access_mode,password_hash,emergency_local,auth_revision ON tenant_users FOR EACH ROW EXECUTE FUNCTION revise_login_authority();
--> statement-breakpoint
CREATE FUNCTION revise_assignment_authority() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE uid uuid; tid uuid;
BEGIN
  uid := CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  tid := CASE WHEN TG_OP='DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
  UPDATE tenant_users SET auth_revision=auth_revision+1 WHERE id=uid AND tenant_id=tid;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER access_assignment_authority AFTER INSERT OR UPDATE OR DELETE ON access_assignments FOR EACH ROW EXECUTE FUNCTION revise_assignment_authority();
CREATE TRIGGER entity_scope_authority AFTER INSERT OR UPDATE OR DELETE ON user_entity_scopes FOR EACH ROW EXECUTE FUNCTION revise_assignment_authority();
--> statement-breakpoint
CREATE FUNCTION revise_role_authority() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  UPDATE tenant_users SET auth_revision=auth_revision+1 WHERE tenant_id=NEW.tenant_id AND id IN
    (SELECT user_id FROM access_assignments WHERE role_id=NEW.id AND tenant_id=NEW.tenant_id);
  RETURN NEW;
END $$;
CREATE TRIGGER access_role_authority AFTER UPDATE ON access_roles FOR EACH ROW EXECUTE FUNCTION revise_role_authority();
--> statement-breakpoint
CREATE FUNCTION immutable_provisioning_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  RAISE EXCEPTION 'Provisioning events are append-only' USING ERRCODE='42501';
END $$;
CREATE TRIGGER provisioning_events_append_only BEFORE UPDATE OR DELETE ON provisioning_events FOR EACH ROW EXECUTE FUNCTION immutable_provisioning_event();
--> statement-breakpoint
-- The new guard rejects legacy untyped access tokens. End their refresh sessions at cutover.
UPDATE auth_sessions SET revoked_at=now() WHERE revoked_at IS NULL;
--> statement-breakpoint
UPDATE plans SET features=array_append(features,'custom_roles') WHERE code='enterprise' AND NOT ('custom_roles'=ANY(features));

--> statement-breakpoint
CREATE TRIGGER external_identity_authority AFTER INSERT OR UPDATE OR DELETE ON external_identities FOR EACH ROW EXECUTE FUNCTION revise_assignment_authority();
