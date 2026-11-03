DO $$DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['saudi_employer_coverage','saudi_worker_coverage','saudi_pilot_runs','saudi_pilot_comparisons','saudi_qualification_evidence','saudi_wps_batches','saudi_wps_events'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',t);
 END LOOP;
END$$;
--> statement-breakpoint
CREATE FUNCTION gp_saudi_company_guard() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
 IF NOT EXISTS(SELECT 1 FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id AND country_code='SA') THEN RAISE EXCEPTION 'saudi_employer_required'; END IF;
 RETURN NEW;
END$$;
--> statement-breakpoint
CREATE FUNCTION gp_saudi_append_only() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'saudi_evidence_is_append_only'; END$$;
--> statement-breakpoint
CREATE FUNCTION gp_saudi_coverage_guard() RETURNS trigger LANGUAGE plpgsql AS $$DECLARE coverage_overlap boolean; BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'saudi_coverage_is_versioned'; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.effective_to IS NOT NULL OR NEW.effective_to IS NULL OR NEW.effective_to<OLD.effective_from OR (to_jsonb(NEW)-'effective_to') IS DISTINCT FROM (to_jsonb(OLD)-'effective_to') THEN RAISE EXCEPTION 'saudi_coverage_is_versioned'; END IF;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text||NEW.legal_entity_id::text,56));
 IF NEW.effective_to IS NOT NULL AND NEW.effective_to<NEW.effective_from THEN RAISE EXCEPTION 'saudi_invalid_coverage_range'; END IF;
 IF TG_TABLE_NAME='saudi_employer_coverage' THEN
  SELECT EXISTS(SELECT 1 FROM saudi_employer_coverage p WHERE p.tenant_id=NEW.tenant_id AND p.legal_entity_id=NEW.legal_entity_id AND p.id<>NEW.id AND daterange(p.effective_from,p.effective_to,'[]') && daterange(NEW.effective_from,NEW.effective_to,'[]')) INTO coverage_overlap;
 ELSE
  SELECT EXISTS(SELECT 1 FROM saudi_worker_coverage p WHERE p.tenant_id=NEW.tenant_id AND p.employee_id=NEW.employee_id AND p.id<>NEW.id AND daterange(p.effective_from,p.effective_to,'[]') && daterange(NEW.effective_from,NEW.effective_to,'[]')) INTO coverage_overlap;
  IF NOT EXISTS(SELECT 1 FROM job_assignments j WHERE j.tenant_id=NEW.tenant_id AND j.employee_id=NEW.employee_id AND j.legal_entity_id=NEW.legal_entity_id AND j.effective_from<=NEW.effective_from AND (j.effective_to IS NULL OR j.effective_to>=NEW.effective_from)) THEN RAISE EXCEPTION 'saudi_employee_employer_mismatch'; END IF;
 END IF;
 IF coverage_overlap THEN RAISE EXCEPTION 'saudi_overlapping_coverage'; END IF;
 RETURN NEW;
END$$;
--> statement-breakpoint
DO $$DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['saudi_employer_coverage','saudi_worker_coverage','saudi_pilot_runs','saudi_pilot_comparisons','saudi_qualification_evidence','saudi_wps_batches','saudi_wps_events'] LOOP
  EXECUTE format('CREATE TRIGGER saudi_company_guard BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION gp_saudi_company_guard()',t);
  IF t IN ('saudi_employer_coverage','saudi_worker_coverage') THEN
   EXECUTE format('CREATE TRIGGER saudi_coverage_guard BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION gp_saudi_coverage_guard()',t);
  ELSE
   EXECUTE format('CREATE TRIGGER saudi_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION gp_saudi_append_only()',t);
  END IF;
 END LOOP;
END$$;
--> statement-breakpoint
ALTER TABLE saudi_pilot_runs ADD CONSTRAINT saudi_pilot_preview CHECK (mode='preview' AND currency='SAR' AND kind IN ('payroll','settlement') AND period_end>=period_start AND manifest_hash ~ '^[a-f0-9]{64}$' AND context_hash ~ '^[a-f0-9]{64}$' AND calculation_hash ~ '^[a-f0-9]{64}$');
ALTER TABLE saudi_pilot_comparisons ADD CONSTRAINT saudi_comparison_kind CHECK (evidence_kind IN ('synthetic','independent') AND outcome IN ('matched','differences'));
ALTER TABLE saudi_qualification_evidence ADD CONSTRAINT saudi_evidence_kind CHECK (kind IN ('law_and_cohorts','privacy','hosting_transfer','documents_en','documents_ar','bank_format'));
ALTER TABLE saudi_wps_batches ADD CONSTRAINT saudi_wps_synthetic CHECK (mode='synthetic' AND file_hash ~ '^[a-f0-9]{64}$');
ALTER TABLE saudi_wps_events ADD CONSTRAINT saudi_wps_kind CHECK (kind IN ('uploaded','accepted','rejected','reconciled'));
CREATE INDEX saudi_pilot_company_period_idx ON saudi_pilot_runs(tenant_id,legal_entity_id,period_start);
CREATE INDEX saudi_worker_employee_idx ON saudi_worker_coverage(tenant_id,employee_id,effective_from);
CREATE INDEX saudi_comparison_run_idx ON saudi_pilot_comparisons(tenant_id,run_id);
CREATE INDEX saudi_wps_events_batch_idx ON saudi_wps_events(tenant_id,batch_id,created_at);

--> statement-breakpoint
ALTER TABLE saudi_pilot_comparisons ADD CONSTRAINT saudi_comparison_sequence_uq UNIQUE(tenant_id,run_id,sequence);
ALTER TABLE saudi_wps_events ADD CONSTRAINT saudi_event_sequence_uq UNIQUE(tenant_id,batch_id,sequence);
ALTER TABLE saudi_pilot_comparisons ADD CONSTRAINT saudi_comparison_sequence_positive CHECK(sequence>0);
ALTER TABLE saudi_wps_events ADD CONSTRAINT saudi_event_sequence_positive CHECK(sequence>0);

--> statement-breakpoint
CREATE FUNCTION gp_saudi_sequence_guard() RETURNS trigger LANGUAGE plpgsql AS $$DECLARE prior_sequence integer; BEGIN
 IF TG_TABLE_NAME='saudi_pilot_comparisons' THEN
  PERFORM id FROM saudi_pilot_runs WHERE tenant_id=NEW.tenant_id AND id=NEW.run_id FOR UPDATE;
  SELECT coalesce(max(sequence),0) INTO prior_sequence FROM saudi_pilot_comparisons WHERE tenant_id=NEW.tenant_id AND run_id=NEW.run_id;
 ELSE
  PERFORM id FROM saudi_wps_batches WHERE tenant_id=NEW.tenant_id AND id=NEW.batch_id FOR UPDATE;
  SELECT coalesce(max(sequence),0) INTO prior_sequence FROM saudi_wps_events WHERE tenant_id=NEW.tenant_id AND batch_id=NEW.batch_id;
 END IF;
 IF NEW.sequence<>prior_sequence+1 THEN RAISE EXCEPTION 'saudi_evidence_sequence_conflict'; END IF;
 RETURN NEW;
END$$;
CREATE TRIGGER saudi_sequence_guard BEFORE INSERT ON saudi_pilot_comparisons FOR EACH ROW EXECUTE FUNCTION gp_saudi_sequence_guard();
CREATE TRIGGER saudi_sequence_guard BEFORE INSERT ON saudi_wps_events FOR EACH ROW EXECUTE FUNCTION gp_saudi_sequence_guard();
