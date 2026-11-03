DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['company_legal_profiles','employment_statutory_profiles','employee_identifiers'] LOOP EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'',true),'''')::uuid)',t);END LOOP;END$$;
--> statement-breakpoint
CREATE FUNCTION gp_default_company_profile() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 INSERT INTO company_legal_profiles(tenant_id,legal_entity_id,country_code,regime,currency,effective_from,business_time_zone,calendar,review_status,reason) VALUES(NEW.tenant_id,NEW.id,NEW.country_code,CASE NEW.country_code WHEN 'BD' THEN 'BD_PRIVATE' WHEN 'AE' THEN 'AE_FEDERAL_PRIVATE' WHEN 'SA' THEN 'SA_PRIVATE' ELSE 'UNSUPPORTED' END,CASE NEW.country_code WHEN 'BD' THEN 'BDT' WHEN 'AE' THEN 'AED' WHEN 'SA' THEN 'SAR' ELSE 'UNSUPPORTED' END,'1900-01-01',CASE NEW.country_code WHEN 'BD' THEN 'Asia/Dhaka' WHEN 'AE' THEN 'Asia/Dubai' ELSE 'Asia/Riyadh' END,'gregorian',CASE WHEN NEW.country_code='BD' THEN 'existing_bd' ELSE 'needs_review' END,'Initial explicit employer context; existing BD review statuses retained');RETURN NEW;END$$;
CREATE TRIGGER default_company_profile AFTER INSERT ON legal_entities FOR EACH ROW EXECUTE FUNCTION gp_default_company_profile();
--> statement-breakpoint
-- The owner remains under FORCE RLS. Backfill one tenant context at a time.
DO $$DECLARE t record; e record;BEGIN FOR t IN SELECT id FROM tenants LOOP PERFORM set_config('app.tenant_id',t.id::text,true);FOR e IN SELECT * FROM legal_entities WHERE tenant_id=t.id LOOP INSERT INTO company_legal_profiles(tenant_id,legal_entity_id,country_code,regime,currency,effective_from,business_time_zone,calendar,review_status,reason) VALUES(t.id,e.id,'BD','BD_PRIVATE','BDT','1900-01-01',coalesce((SELECT time_zone FROM locations WHERE tenant_id=t.id AND legal_entity_id=e.id ORDER BY created_at,id LIMIT 1),'Asia/Dhaka'),'gregorian','existing_bd','M4 additive BD reconciliation; no locked financial values or recorded site zones changed');END LOOP;END LOOP;PERFORM set_config('app.tenant_id','',true);END$$;
--> statement-breakpoint
CREATE FUNCTION gp_profile_guard() RETURNS trigger LANGUAGE plpgsql AS $$DECLARE employer_country text;BEGIN
 SELECT country_code INTO employer_country FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id;
 IF NEW.country_code<>employer_country OR NOT ((NEW.country_code='BD' AND NEW.regime='BD_PRIVATE' AND NEW.currency='BDT') OR (NEW.country_code='AE' AND NEW.regime='AE_FEDERAL_PRIVATE' AND NEW.currency='AED') OR (NEW.country_code='SA' AND NEW.regime='SA_PRIVATE' AND NEW.currency='SAR')) THEN RAISE EXCEPTION 'country_profile_mismatch';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=NEW.business_time_zone) OR NEW.calendar NOT IN ('gregorian','hijri_required') THEN RAISE EXCEPTION 'unsupported_calendar_or_zone';END IF;
 IF (NEW.country_code<>'BD' AND NEW.review_status<>'needs_review') OR (NEW.country_code='BD' AND NEW.review_status<>'existing_bd') THEN RAISE EXCEPTION 'country_review_cannot_be_self_approved';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.legal_entity_id::text,54));
 IF NEW.effective_to IS NOT NULL AND NEW.effective_to<NEW.effective_from THEN RAISE EXCEPTION 'invalid_profile_range';END IF;
 IF EXISTS(SELECT 1 FROM company_legal_profiles p WHERE p.tenant_id=NEW.tenant_id AND p.legal_entity_id=NEW.legal_entity_id AND p.id<>NEW.id AND daterange(p.effective_from,p.effective_to,'[]')&&daterange(NEW.effective_from,NEW.effective_to,'[]')) THEN RAISE EXCEPTION 'overlapping_legal_profile';END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'effective_to')<>(to_jsonb(OLD)-'effective_to') THEN RAISE EXCEPTION 'legal_profiles_are_versioned_not_overwritten';END IF;
 RETURN NEW;END$$;
CREATE TRIGGER company_profile_guard BEFORE INSERT OR UPDATE ON company_legal_profiles FOR EACH ROW EXECUTE FUNCTION gp_profile_guard();
--> statement-breakpoint
CREATE FUNCTION gp_keep_company_country() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.country_code<>OLD.country_code THEN RAISE EXCEPTION 'new_jurisdiction_requires_new_legal_employer';END IF;RETURN NEW;END$$;
CREATE TRIGGER keep_company_country BEFORE UPDATE ON legal_entities FOR EACH ROW EXECUTE FUNCTION gp_keep_company_country();
--> statement-breakpoint
CREATE FUNCTION gp_assert_bd_context(tenant uuid,company uuid,on_date date) RETURNS void LANGUAGE plpgsql AS $$BEGIN
 IF company IS NULL AND NOT EXISTS(SELECT 1 FROM company_legal_profiles WHERE tenant_id=tenant AND effective_from<=on_date AND (effective_to IS NULL OR effective_to>=on_date)) THEN RAISE EXCEPTION 'explicit_company_profile_required';END IF;
 IF company IS NOT NULL AND NOT EXISTS(SELECT 1 FROM company_legal_profiles WHERE tenant_id=tenant AND legal_entity_id=company AND effective_from<=on_date AND (effective_to IS NULL OR effective_to>=on_date)) THEN RAISE EXCEPTION 'explicit_company_profile_required';END IF;
 IF EXISTS(SELECT 1 FROM company_legal_profiles WHERE tenant_id=tenant AND (company IS NULL OR legal_entity_id=company) AND effective_from<=on_date AND (effective_to IS NULL OR effective_to>=on_date) AND (country_code<>'BD' OR regime<>'BD_PRIVATE' OR currency<>'BDT' OR calendar<>'gregorian')) THEN RAISE EXCEPTION 'country_pack_unreviewed_or_calendar_unsupported';END IF;
END$$;
--> statement-breakpoint
CREATE FUNCTION gp_statutory_boundary() RETURNS trigger LANGUAGE plpgsql AS $$DECLARE v jsonb; company uuid; d date; e uuid;group_currency text;group_company uuid;BEGIN
 v=to_jsonb(NEW);d=coalesce(nullif(v->>'period_start','')::date,nullif(v->>'effective_from','')::date,nullif(v->>'start_date','')::date,nullif(v->>'from_on','')::date,nullif(v->>'on_date','')::date,nullif(v->>'date','')::date,current_date);company=nullif(v->>'legal_entity_id','')::uuid;e=nullif(v->>'employee_id','')::uuid;
 IF company IS NULL AND e IS NOT NULL THEN SELECT legal_entity_id INTO company FROM job_assignments WHERE tenant_id=NEW.tenant_id AND employee_id=e AND effective_from<=d AND (effective_to IS NULL OR effective_to>=d) ORDER BY effective_from DESC LIMIT 1;END IF;
 IF TG_TABLE_NAME='payroll_runs' THEN IF TG_OP='UPDATE' AND OLD.status='locked' THEN IF NEW.currency<>OLD.currency OR NEW.statutory_context IS DISTINCT FROM OLD.statutory_context THEN RAISE EXCEPTION 'locked_statutory_context_immutable';END IF;RETURN NEW;END IF;SELECT legal_entity_id INTO company FROM pay_groups WHERE tenant_id=NEW.tenant_id AND id=NEW.pay_group_id;END IF;
 PERFORM gp_assert_bd_context(NEW.tenant_id,company,d);
 IF e IS NOT NULL AND EXISTS(SELECT 1 FROM employees WHERE tenant_id=NEW.tenant_id AND id=e AND nationality<>'BD') THEN RAISE EXCEPTION 'cohort_country_unreviewed';END IF;
 IF e IS NOT NULL AND EXISTS(SELECT 1 FROM employment_statutory_profiles WHERE tenant_id=NEW.tenant_id AND employee_id=e AND effective_from<=d AND (effective_to IS NULL OR effective_to>=d) AND (citizenship<>'BD' OR insurance_class<>'BD_general' OR contract_class NOT IN ('permanent','probationer','temporary','casual','badli','apprentice'))) THEN RAISE EXCEPTION 'cohort_profile_unreviewed';END IF;

 IF v ? 'currency' AND v->>'currency'<>'BDT' THEN RAISE EXCEPTION 'currency_mismatch_bd_adapter';END IF;
 IF TG_TABLE_NAME='employee_pay' THEN SELECT currency INTO group_currency FROM pay_groups WHERE tenant_id=NEW.tenant_id AND id=NEW.pay_group_id;IF group_currency<>NEW.currency OR NOT EXISTS(SELECT 1 FROM salary_structures WHERE tenant_id=NEW.tenant_id AND id=NEW.structure_id AND currency=NEW.currency) THEN RAISE EXCEPTION 'pay_structure_group_currency_mismatch';END IF;END IF;
 IF TG_TABLE_NAME='payroll_runs' THEN
  IF TG_OP='UPDATE' AND OLD.status='locked' THEN RETURN NEW;END IF;
  PERFORM gp_assert_bd_context(NEW.tenant_id,company,NEW.period_end);
  SELECT currency INTO group_currency FROM pay_groups WHERE tenant_id=NEW.tenant_id AND id=NEW.pay_group_id;IF group_currency<>NEW.currency THEN RAISE EXCEPTION 'run_group_currency_mismatch';END IF;
  IF NEW.statutory_context IS NULL THEN NEW.statutory_context=jsonb_build_object('adapter','explicit_bd','currency','BDT','calendar','gregorian','regime','BD_PRIVATE','implementationVersion','5.4.0','reviewer',null,'note','Existing BD source review status; no new approval asserted');END IF;
 END IF;RETURN NEW;END$$;
--> statement-breakpoint
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['employee_pay','payroll_runs','payroll_inputs','employee_loans','pf_entries','tax_declarations','tax_openings','tax_deposits','maternity_cases','maternity_payments','production_entries','wppf_years','timesheets','compensation_rounds','compensation_lines','offers','leave_requests','leave_ledger','attendance_days','separations'] LOOP EXECUTE format('CREATE TRIGGER international_statutory_boundary BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION gp_statutory_boundary()',t);END LOOP;END$$;
--> statement-breakpoint
CREATE FUNCTION gp_job_currency_boundary() RETURNS trigger LANGUAGE plpgsql AS $$DECLARE c text;prior_country text;BEGIN
 SELECT country_code INTO c FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id;
 SELECT e.country_code INTO prior_country FROM job_assignments j JOIN legal_entities e ON e.tenant_id=j.tenant_id AND e.id=j.legal_entity_id WHERE j.tenant_id=NEW.tenant_id AND j.employee_id=NEW.employee_id AND j.id<>NEW.id AND j.effective_from<=NEW.effective_from ORDER BY j.effective_from DESC LIMIT 1;
 IF prior_country IS NOT NULL AND prior_country<>c THEN RAISE EXCEPTION 'cross_country_transfer_requires_reviewed_settlement_and_openings';END IF;
 NEW.currency=CASE c WHEN 'BD' THEN 'BDT' WHEN 'AE' THEN 'AED' WHEN 'SA' THEN 'SAR' ELSE 'UNSUPPORTED' END;RETURN NEW;END$$;
CREATE TRIGGER job_currency_boundary BEFORE INSERT OR UPDATE ON job_assignments FOR EACH ROW EXECUTE FUNCTION gp_job_currency_boundary();
--> statement-breakpoint
-- Corporate commercial invoices are separate from BD Mushak/VAT invoices and employee pay.
ALTER TABLE commercial_prices ADD CONSTRAINT commercial_price_currency CHECK(currency IN ('USD','AED'));
ALTER TABLE merchant_ledger ADD CONSTRAINT merchant_currency CHECK(currency IN ('USD','AED'));
CREATE FUNCTION gp_immutable_merchant_ledger() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'merchant_ledger_is_append_only';END$$;
CREATE TRIGGER immutable_merchant_ledger BEFORE UPDATE OR DELETE ON merchant_ledger FOR EACH ROW EXECUTE FUNCTION gp_immutable_merchant_ledger();
