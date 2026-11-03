CREATE OR REPLACE FUNCTION gp_statutory_boundary() RETURNS trigger LANGUAGE plpgsql AS $$DECLARE v jsonb; company uuid; d date; e uuid;group_currency text;group_company uuid;BEGIN
 v=to_jsonb(NEW);d=coalesce(nullif(v->>'period_start','')::date,nullif(v->>'effective_from','')::date,nullif(v->>'start_date','')::date,nullif(v->>'from_on','')::date,nullif(v->>'on_date','')::date,nullif(v->>'date','')::date,current_date);company=nullif(v->>'legal_entity_id','')::uuid;e=nullif(v->>'employee_id','')::uuid;
 IF TG_TABLE_NAME='payroll_run_items' THEN SELECT r.period_start,g.legal_entity_id INTO d,company FROM payroll_runs r JOIN pay_groups g ON g.tenant_id=r.tenant_id AND g.id=r.pay_group_id WHERE r.tenant_id=NEW.tenant_id AND r.id=NEW.run_id;END IF;
 IF company IS NULL AND e IS NOT NULL THEN SELECT legal_entity_id INTO company FROM job_assignments WHERE tenant_id=NEW.tenant_id AND employee_id=e AND effective_from<=d AND (effective_to IS NULL OR effective_to>=d) ORDER BY effective_from DESC LIMIT 1;END IF;
 IF TG_TABLE_NAME='payroll_runs' THEN IF TG_OP='UPDATE' AND OLD.status='locked' THEN IF NEW.currency<>OLD.currency OR NEW.statutory_context IS DISTINCT FROM OLD.statutory_context THEN RAISE EXCEPTION 'locked_statutory_context_immutable';END IF;RETURN NEW;END IF;SELECT legal_entity_id INTO company FROM pay_groups WHERE tenant_id=NEW.tenant_id AND id=NEW.pay_group_id;END IF;
 PERFORM gp_assert_bd_context(NEW.tenant_id,company,d);
 IF e IS NOT NULL AND EXISTS(SELECT 1 FROM employees WHERE tenant_id=NEW.tenant_id AND id=e AND nationality<>'BD') THEN RAISE EXCEPTION 'cohort_country_unreviewed';END IF;
 IF e IS NOT NULL AND EXISTS(SELECT 1 FROM employment_statutory_profiles WHERE tenant_id=NEW.tenant_id AND employee_id=e AND effective_from<=d AND (effective_to IS NULL OR effective_to>=d) AND (citizenship<>'BD' OR insurance_class<>'BD_general' OR contract_class NOT IN ('permanent','probationer','temporary','casual','badli','apprentice'))) THEN RAISE EXCEPTION 'cohort_profile_unreviewed';END IF;
 IF e IS NOT NULL AND EXISTS(SELECT 1 FROM job_assignments j JOIN locations l ON l.tenant_id=j.tenant_id AND l.id=j.location_id JOIN legal_entities le ON le.tenant_id=j.tenant_id AND le.id=j.legal_entity_id WHERE j.tenant_id=NEW.tenant_id AND j.employee_id=e AND j.effective_from<=d AND (j.effective_to IS NULL OR j.effective_to>=d) AND l.country_code<>le.country_code) THEN RAISE EXCEPTION 'country_worksite_regime_unreviewed';END IF;
 IF v ? 'currency' AND v->>'currency'<>'BDT' THEN RAISE EXCEPTION 'currency_mismatch_bd_adapter';END IF;
 IF TG_TABLE_NAME='employee_pay' THEN SELECT currency,legal_entity_id INTO group_currency,group_company FROM pay_groups WHERE tenant_id=NEW.tenant_id AND id=NEW.pay_group_id;IF group_company IS NOT NULL AND group_company IS DISTINCT FROM company THEN RAISE EXCEPTION 'pay_group_company_mismatch';END IF;IF group_currency<>NEW.currency OR NOT EXISTS(SELECT 1 FROM salary_structures WHERE tenant_id=NEW.tenant_id AND id=NEW.structure_id AND currency=NEW.currency) THEN RAISE EXCEPTION 'pay_structure_group_currency_mismatch';END IF;END IF;
 IF TG_TABLE_NAME='payroll_runs' THEN
  IF TG_OP='UPDATE' AND OLD.status='locked' THEN RETURN NEW;END IF;
  PERFORM gp_assert_bd_context(NEW.tenant_id,company,NEW.period_end);
  SELECT currency INTO group_currency FROM pay_groups WHERE tenant_id=NEW.tenant_id AND id=NEW.pay_group_id;IF group_currency<>NEW.currency THEN RAISE EXCEPTION 'run_group_currency_mismatch';END IF;
  IF NEW.statutory_context IS NULL THEN NEW.statutory_context=jsonb_build_object('adapter','explicit_bd','currency','BDT','calendar','gregorian','regime','BD_PRIVATE','implementationVersion','5.4.0','reviewer',null,'note','Existing BD source review status; no new approval asserted');END IF;
 END IF;RETURN NEW;END$$;

--> statement-breakpoint
CREATE TRIGGER international_statutory_boundary BEFORE INSERT OR UPDATE ON payroll_run_items FOR EACH ROW EXECUTE FUNCTION gp_statutory_boundary();
--> statement-breakpoint
CREATE FUNCTION gp_employment_profile_guard() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.employee_id::text,54));
 IF NEW.citizenship !~ '^[A-Z]{2}$' OR (NEW.supplied_hijri_date IS NOT NULL AND length(coalesce(NEW.calendar_provenance,''))<10) THEN RAISE EXCEPTION 'employment_profile_provenance_required';END IF;
 IF NEW.effective_to IS NOT NULL AND NEW.effective_to<NEW.effective_from THEN RAISE EXCEPTION 'employment_profile_invalid_range';END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'effective_to')<>(to_jsonb(OLD)-'effective_to') THEN RAISE EXCEPTION 'employment_profile_version_required';END IF;
 IF EXISTS(SELECT 1 FROM employment_statutory_profiles p WHERE p.tenant_id=NEW.tenant_id AND p.employee_id=NEW.employee_id AND p.id<>NEW.id AND daterange(p.effective_from,p.effective_to,'[]')&&daterange(NEW.effective_from,NEW.effective_to,'[]')) THEN RAISE EXCEPTION 'employment_profile_overlap';END IF;
 RETURN NEW;END$$;
CREATE TRIGGER employment_profile_guard BEFORE INSERT OR UPDATE ON employment_statutory_profiles FOR EACH ROW EXECUTE FUNCTION gp_employment_profile_guard();
--> statement-breakpoint
CREATE FUNCTION gp_bank_context_guard() RETURNS trigger LANGUAGE plpgsql AS $$DECLARE country text;BEGIN
 SELECT le.country_code INTO country FROM job_assignments j JOIN legal_entities le ON le.tenant_id=j.tenant_id AND le.id=j.legal_entity_id JOIN company_legal_profiles p ON p.tenant_id=j.tenant_id AND p.legal_entity_id=le.id WHERE j.tenant_id=NEW.tenant_id AND j.employee_id=NEW.employee_id AND p.effective_from<=(now() AT TIME ZONE p.business_time_zone)::date AND (p.effective_to IS NULL OR p.effective_to>=(now() AT TIME ZONE p.business_time_zone)::date) AND j.effective_from<=(now() AT TIME ZONE p.business_time_zone)::date AND (j.effective_to IS NULL OR j.effective_to>=(now() AT TIME ZONE p.business_time_zone)::date) ORDER BY j.effective_from DESC LIMIT 1;
 IF country IS NULL OR NEW.country_code<>country OR NEW.currency<>(CASE country WHEN 'BD' THEN 'BDT' WHEN 'AE' THEN 'AED' WHEN 'SA' THEN 'SAR' ELSE 'UNSUPPORTED' END) OR (country<>'BD' AND NEW.method<>'bank') THEN RAISE EXCEPTION 'bank_employer_currency_mismatch';END IF;RETURN NEW;END$$;
CREATE TRIGGER bank_context_guard BEFORE INSERT OR UPDATE ON employee_payment_accounts FOR EACH ROW EXECUTE FUNCTION gp_bank_context_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION gp_job_currency_boundary() RETURNS trigger LANGUAGE plpgsql AS $$DECLARE c text;prior_company uuid;BEGIN
 SELECT country_code INTO c FROM legal_entities WHERE tenant_id=NEW.tenant_id AND id=NEW.legal_entity_id;
 IF TG_OP='INSERT' OR NEW.legal_entity_id IS DISTINCT FROM OLD.legal_entity_id THEN
 SELECT legal_entity_id INTO prior_company FROM job_assignments WHERE tenant_id=NEW.tenant_id AND employee_id=NEW.employee_id AND id<>NEW.id AND effective_from<=NEW.effective_from ORDER BY effective_from DESC LIMIT 1;
 IF prior_company IS NOT NULL AND prior_company<>NEW.legal_entity_id THEN RAISE EXCEPTION 'cross_employer_transfer_requires_reviewed_settlement_and_openings';END IF;
 END IF;
 NEW.currency=CASE c WHEN 'BD' THEN 'BDT' WHEN 'AE' THEN 'AED' WHEN 'SA' THEN 'SAR' ELSE 'UNSUPPORTED' END;RETURN NEW;END$$;
--> statement-breakpoint
ALTER TABLE commercial_prices ADD CONSTRAINT commercial_price_positive CHECK(seat_price>0);
CREATE TRIGGER immutable_commercial_prices BEFORE UPDATE OR DELETE ON commercial_prices FOR EACH ROW EXECUTE FUNCTION gp_immutable_merchant_ledger();
--> statement-breakpoint
DO $$DECLARE t record;BEGIN FOR t IN SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='currency' AND table_name NOT IN ('company_legal_profiles','commercial_prices','merchant_ledger') LOOP EXECUTE format('ALTER TABLE %I ADD CONSTRAINT international_currency CHECK(currency IN (''BDT'',''AED'',''SAR''))',t.table_name);END LOOP;END$$;

--> statement-breakpoint
CREATE FUNCTION gp_currency_immutable() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.currency<>OLD.currency THEN RAISE EXCEPTION 'currency_cannot_be_relabelled';END IF;RETURN NEW;END$$;
DO $$DECLARE t record;BEGIN FOR t IN SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='currency' LOOP EXECUTE format('CREATE TRIGGER international_currency_immutable BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION gp_currency_immutable()',t.table_name);END LOOP;END$$;
