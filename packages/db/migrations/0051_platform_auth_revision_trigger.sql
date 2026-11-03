CREATE FUNCTION revise_platform_authority() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  NEW.auth_revision:=OLD.auth_revision+1;
  RETURN NEW;
END $$;
CREATE TRIGGER platform_user_authority BEFORE UPDATE OF role,password_hash,auth_revision ON platform_users FOR EACH ROW EXECUTE FUNCTION revise_platform_authority();
