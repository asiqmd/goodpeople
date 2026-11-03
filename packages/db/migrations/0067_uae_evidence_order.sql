ALTER TABLE "uae_pilot_comparisons" ADD COLUMN "sequence" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "uae_wps_events" ADD COLUMN "sequence" integer NOT NULL;
--> statement-breakpoint
ALTER TABLE uae_pilot_comparisons ADD CONSTRAINT uae_comparison_sequence_uq UNIQUE(tenant_id,run_id,sequence);
ALTER TABLE uae_wps_events ADD CONSTRAINT uae_event_sequence_uq UNIQUE(tenant_id,batch_id,sequence);
ALTER TABLE uae_pilot_comparisons ADD CONSTRAINT uae_comparison_sequence_positive CHECK(sequence>0);
ALTER TABLE uae_wps_events ADD CONSTRAINT uae_event_sequence_positive CHECK(sequence>0);

--> statement-breakpoint
CREATE FUNCTION gp_uae_sequence_guard() RETURNS trigger LANGUAGE plpgsql AS $$DECLARE prior_sequence integer; BEGIN
 IF TG_TABLE_NAME='uae_pilot_comparisons' THEN
  PERFORM id FROM uae_pilot_runs WHERE tenant_id=NEW.tenant_id AND id=NEW.run_id FOR UPDATE;
  SELECT coalesce(max(sequence),0) INTO prior_sequence FROM uae_pilot_comparisons WHERE tenant_id=NEW.tenant_id AND run_id=NEW.run_id;
 ELSE
  PERFORM id FROM uae_wps_batches WHERE tenant_id=NEW.tenant_id AND id=NEW.batch_id FOR UPDATE;
  SELECT coalesce(max(sequence),0) INTO prior_sequence FROM uae_wps_events WHERE tenant_id=NEW.tenant_id AND batch_id=NEW.batch_id;
 END IF;
 IF NEW.sequence<>prior_sequence+1 THEN RAISE EXCEPTION 'uae_evidence_sequence_conflict'; END IF;
 RETURN NEW;
END$$;
CREATE TRIGGER uae_sequence_guard BEFORE INSERT ON uae_pilot_comparisons FOR EACH ROW EXECUTE FUNCTION gp_uae_sequence_guard();
CREATE TRIGGER uae_sequence_guard BEFORE INSERT ON uae_wps_events FOR EACH ROW EXECUTE FUNCTION gp_uae_sequence_guard();
