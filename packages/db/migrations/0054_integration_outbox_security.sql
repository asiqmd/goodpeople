-- Tenant ownership, explicit grants, immutable envelopes and in-transaction event capture.
DO $$ DECLARE n text; BEGIN
 FOREACH n IN ARRAY ARRAY['api_clients','api_client_credentials','api_client_grants','webhook_subscriptions','integration_events','webhook_deliveries'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',n);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',n);
 END LOOP;
END $$;
ALTER TABLE api_client_grants ADD CONSTRAINT api_grant_scope_ck CHECK ((scope='selected' AND cardinality(company_ids)>0) OR (scope IN ('none','all') AND cardinality(company_ids)=0));
CREATE FUNCTION validate_api_companies() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM unnest(NEW.company_ids) c WHERE NOT EXISTS(SELECT 1 FROM legal_entities e WHERE e.id=c AND e.tenant_id=NEW.tenant_id)) THEN RAISE EXCEPTION 'Company does not belong to workspace';END IF;RETURN NEW;END $$;
CREATE TRIGGER api_companies_check BEFORE INSERT OR UPDATE ON api_client_grants FOR EACH ROW EXECUTE FUNCTION validate_api_companies();
CREATE FUNCTION revise_api_client() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.version:=OLD.version+1;RETURN NEW;END $$;
CREATE TRIGGER api_client_revision BEFORE UPDATE ON api_clients FOR EACH ROW EXECUTE FUNCTION revise_api_client();
CREATE FUNCTION revise_api_grants() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE api_clients SET version=version+1 WHERE id=coalesce(NEW.client_id,OLD.client_id);RETURN coalesce(NEW,OLD);END $$;
CREATE TRIGGER api_grant_revision AFTER INSERT OR UPDATE OR DELETE ON api_client_grants FOR EACH ROW EXECUTE FUNCTION revise_api_grants();
CREATE FUNCTION review_owned_api_clients() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.disabled_at IS NOT NULL OR NEW.provision_disabled THEN UPDATE api_clients SET review_required=true WHERE owner_id=NEW.id AND NOT review_required;END IF;RETURN NEW;END $$;
CREATE TRIGGER api_owner_review AFTER UPDATE OF disabled_at,provision_disabled ON tenant_users FOR EACH ROW EXECUTE FUNCTION review_owned_api_clients();
CREATE FUNCTION immutable_integration_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (to_jsonb(NEW)-'fanned_at') IS DISTINCT FROM (to_jsonb(OLD)-'fanned_at') THEN RAISE EXCEPTION 'Integration event contents are immutable';END IF;RETURN NEW;END $$;
CREATE TRIGGER integration_event_immutable BEFORE UPDATE ON integration_events FOR EACH ROW EXECUTE FUNCTION immutable_integration_event();
CREATE FUNCTION enqueue_integration_event(t uuid,kind text,r uuid,rt text,c uuid,dedup text,day date DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE eid uuid:=gen_random_uuid(); stamp timestamptz:=clock_timestamp(); retention int:=coalesce(nullif(current_setting('app.integration_retention_days',true),''),'14')::int; BEGIN
 IF NOT EXISTS(SELECT 1 FROM api_clients WHERE tenant_id=t) THEN RETURN;END IF;
 INSERT INTO integration_events(id,tenant_id,type,resource_id,resource_type,company_id,dedup_key,body,occurred_at,expires_at)
 VALUES(eid,t,kind,r,rt,c,dedup,json_build_object('id',eid,'schema_version','1','type',kind,'tenant_id',t,'occurred_at',to_char(stamp at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'resource',json_strip_nulls(json_build_object('id',r,'type',rt,'company_id',c,'date',day)))::text,stamp,stamp+make_interval(days=>greatest(1,least(90,retention))))
 ON CONFLICT(tenant_id,dedup_key) DO NOTHING;END $$;
CREATE FUNCTION capture_employee_integration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE eid uuid;t uuid;c uuid;kind text; BEGIN
 IF TG_TABLE_NAME='employees' THEN
  eid:=NEW.id;t:=NEW.tenant_id;
  IF TG_OP='UPDATE' AND (NEW.employee_code,NEW.full_name,NEW.status) IS NOT DISTINCT FROM (OLD.employee_code,OLD.full_name,OLD.status) THEN RETURN NULL;END IF;
  kind:=CASE WHEN TG_OP='INSERT' THEN 'employee.created' WHEN NEW.status='separated' AND OLD.status IS DISTINCT FROM NEW.status THEN 'employment.ended' ELSE 'employee.updated' END;
 ELSE eid:=NEW.employee_id;t:=NEW.tenant_id;kind:='employee.updated';END IF;
 SELECT legal_entity_id INTO c FROM job_assignments WHERE tenant_id=t AND employee_id=eid AND effective_from<=(clock_timestamp() at time zone 'Asia/Dhaka')::date ORDER BY effective_from DESC,id DESC LIMIT 1;
 IF c IS NOT NULL THEN PERFORM enqueue_integration_event(t,kind,eid,'employee',c,txid_current()::text||':'||kind||':'||eid::text);END IF;RETURN NULL;END $$;
CREATE CONSTRAINT TRIGGER employee_integration_event AFTER INSERT OR UPDATE ON employees DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION capture_employee_integration();
CREATE CONSTRAINT TRIGGER job_integration_event AFTER INSERT OR UPDATE ON job_assignments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION capture_employee_integration();
CREATE FUNCTION capture_attendance_integration() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE c uuid;BEGIN
 IF NEW.date >= (clock_timestamp() at time zone 'Asia/Dhaka')::date THEN RETURN NULL;END IF;
 IF TG_OP='UPDATE' AND (NEW.status,NEW.day_type,NEW.worked_minutes,NEW.late_minutes,NEW.early_out_minutes,NEW.overtime_minutes) IS NOT DISTINCT FROM (OLD.status,OLD.day_type,OLD.worked_minutes,OLD.late_minutes,OLD.early_out_minutes,OLD.overtime_minutes) THEN RETURN NULL;END IF;
 SELECT legal_entity_id INTO c FROM job_assignments WHERE tenant_id=NEW.tenant_id AND employee_id=NEW.employee_id AND effective_from<=NEW.date ORDER BY effective_from DESC,id DESC LIMIT 1;
 IF c IS NOT NULL THEN PERFORM enqueue_integration_event(NEW.tenant_id,'attendance.day.finalized',NEW.id,'attendance_day',c,txid_current()::text||':attendance:'||NEW.id::text,NEW.date);END IF;RETURN NULL;END $$;
CREATE TRIGGER attendance_integration_event AFTER INSERT OR UPDATE ON attendance_days FOR EACH ROW EXECUTE FUNCTION capture_attendance_integration();
