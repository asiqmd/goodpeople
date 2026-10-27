-- backup.sh and verify-backup.sh record each run in backup_runs as the backup role, which
-- otherwise only reads (pg_read_all_data). Where that role exists yet; the runbook grants it
-- when the role is created later.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gp_backup') THEN
    GRANT INSERT ON backup_runs TO gp_backup;
  END IF;
END
$$;
