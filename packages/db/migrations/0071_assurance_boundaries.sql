ALTER TABLE assurance_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE assurance_programs FORCE ROW LEVEL SECURITY;
ALTER TABLE assurance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE assurance_events FORCE ROW LEVEL SECURITY;
CREATE POLICY assurance_platform_isolation ON assurance_programs USING (EXISTS(SELECT 1 FROM platform_users u WHERE u.id=nullif(current_setting('app.assurance_actor',true),'')::uuid AND u.role='super_admin')) WITH CHECK (EXISTS(SELECT 1 FROM platform_users u WHERE u.id=nullif(current_setting('app.assurance_actor',true),'')::uuid AND u.role='super_admin'));
CREATE POLICY assurance_platform_isolation ON assurance_events USING (EXISTS(SELECT 1 FROM platform_users u WHERE u.id=nullif(current_setting('app.assurance_actor',true),'')::uuid AND u.role='super_admin')) WITH CHECK (EXISTS(SELECT 1 FROM platform_users u WHERE u.id=nullif(current_setting('app.assurance_actor',true),'')::uuid AND u.role='super_admin'));
--> statement-breakpoint
CREATE FUNCTION gp_assurance_immutable() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'assurance_records_are_append_only'; END$$;
CREATE TRIGGER assurance_immutable BEFORE UPDATE OR DELETE ON assurance_programs FOR EACH ROW EXECUTE FUNCTION gp_assurance_immutable();
CREATE TRIGGER assurance_immutable BEFORE UPDATE OR DELETE ON assurance_events FOR EACH ROW EXECUTE FUNCTION gp_assurance_immutable();
--> statement-breakpoint
CREATE FUNCTION gp_assurance_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$DECLARE prior_sequence integer; prior_hash text; BEGIN
 IF TG_TABLE_NAME='assurance_programs' THEN
  IF NEW.created_by IS DISTINCT FROM nullif(current_setting('app.assurance_actor',true),'')::uuid THEN RAISE EXCEPTION 'assurance_actor_required'; END IF;
 ELSE
  IF NEW.actor_id IS DISTINCT FROM nullif(current_setting('app.assurance_actor',true),'')::uuid THEN RAISE EXCEPTION 'assurance_actor_required'; END IF;
  PERFORM id FROM assurance_programs WHERE id=NEW.program_id FOR UPDATE;
  SELECT sequence,event_hash INTO prior_sequence,prior_hash FROM assurance_events WHERE program_id=NEW.program_id ORDER BY sequence DESC LIMIT 1;
  IF prior_hash IS NULL THEN SELECT definition_hash INTO prior_hash FROM assurance_programs WHERE id=NEW.program_id; END IF;
  IF NEW.sequence<>coalesce(prior_sequence,0)+1 OR NEW.previous_hash IS DISTINCT FROM prior_hash THEN RAISE EXCEPTION 'assurance_sequence_or_hash_conflict'; END IF;
 END IF;
 RETURN NEW;
END$$;
CREATE TRIGGER assurance_insert_guard BEFORE INSERT ON assurance_programs FOR EACH ROW EXECUTE FUNCTION gp_assurance_insert_guard();
CREATE TRIGGER assurance_insert_guard BEFORE INSERT ON assurance_events FOR EACH ROW EXECUTE FUNCTION gp_assurance_insert_guard();
ALTER TABLE assurance_programs ADD CONSTRAINT assurance_definition_hash CHECK (definition_hash ~ '^[a-f0-9]{64}$');
ALTER TABLE assurance_events ADD CONSTRAINT assurance_event_integrity CHECK (sequence>0 AND payload_hash ~ '^[a-f0-9]{64}$' AND previous_hash ~ '^[a-f0-9]{64}$' AND event_hash ~ '^[a-f0-9]{64}$' AND kind IN ('control','evidence','evidence_review','finding','finding_assignment','finding_decision','exception','exception_review','release_review','report'));
