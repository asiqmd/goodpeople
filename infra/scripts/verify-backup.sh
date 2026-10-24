#!/usr/bin/env bash
# Proves a backup can be restored: checks the dump's checksum, restores it into a scratch
# database, runs sanity queries, checks that every live document's file is in the backup, then
# drops the scratch database. Exits non-zero on any problem. Run it monthly (the restore drill)
# and after changing anything about backups.
#
#   verify-backup.sh [--keep] [BACKUP]
#
#   BACKUP   a backup directory, its database.dump, or "latest" (the default)
#   --keep   keep the scratch database for a closer look (drop it yourself afterwards)
#
# Needs RESTORE_ADMIN_URL (a superuser) and the gp_owner and gp_app roles on that server. It
# loads the whole database, so prefer a server other than production; on the production server,
# run it outside working hours. VERIFY_MIN_TENANTS (default 1) is the fewest workspaces a good
# backup may have.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
# shellcheck source-path=SCRIPTDIR source=lib.sh
. "$here/lib.sh"
load_env_file "${GP_ENV_FILE:-$here/../.env}"

keep=false
backup_arg=''
while [[ $# -gt 0 ]]; do
  case $1 in
    --keep) keep=true ;;
    -h | --help)
      sed -n '7,10p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*) die "unknown option $1" ;;
    *) backup_arg=$1 ;;
  esac
  shift
done

require_var RESTORE_ADMIN_URL
need pg_restore psql
min_tenants=${VERIFY_MIN_TENANTS:-1}
dir=$(resolve_backup "${backup_arg:-latest}")
log "verifying $dir"
check_dump "$dir"

owner=$(owner_role)
check_roles_exist "$RESTORE_ADMIN_URL" "$owner" "$(app_role)"
scratch=gp_verify_$(date -u +%Y%m%d%H%M%S)
check_identifier "$scratch"

drop_scratch() {
  if [[ $keep == true ]]; then
    log "kept scratch database $scratch"
  else
    psql_value "$RESTORE_ADMIN_URL" -c "DROP DATABASE IF EXISTS \"$scratch\"" || true
  fi
}
trap drop_scratch EXIT

restore_into "$RESTORE_ADMIN_URL" "$scratch" "$owner" "$dir/database.dump"
url=$(url_with_database "$RESTORE_ADMIN_URL" "$scratch")
count() { psql_value "$url" -c "select count(*) from $1"; }

# As a superuser these counts see every workspace's rows.
tenants=$(count tenants)
super_admins=$(count "platform_users where role = 'super_admin'")
migrations=$(count drizzle.__drizzle_migrations)
employees=$(count employees)
attendance_days=$(count attendance_days)
live_documents=$(count "documents where deleted_at is null")
log "workspaces=$tenants super_admins=$super_admins migrations=$migrations employees=$employees" \
  "attendance_days=$attendance_days live_documents=$live_documents"

failed=false
if ((tenants < min_tenants)); then
  log "FAIL: $tenants workspaces, expected at least $min_tenants"
  failed=true
fi
if ((super_admins < 1)); then
  log "FAIL: no super admin in the backup"
  failed=true
fi
if ((migrations < 1)); then
  log "FAIL: no applied migrations recorded"
  failed=true
fi
expected=$(manifest_value "$dir" tenants)
if [[ -n $expected && $expected != "$tenants" ]]; then
  log "FAIL: backup.txt says $expected workspaces, the restored database has $tenants"
  failed=true
fi

# Every document that is not deleted must have its (encrypted) file in the backup.
if [[ -d $dir/documents ]]; then
  missing=0
  while IFS= read -r key; do
    [[ -n $key ]] || continue
    if [[ ! -f $dir/documents/$key ]]; then
      missing=$((missing + 1))
      log "missing file: $key"
    fi
  done < <(psql_value "$url" -c "select storage_key from documents where deleted_at is null")
  if ((missing > 0)); then
    log "FAIL: $missing of $live_documents documents have no file in the backup"
    failed=true
  fi
elif ((live_documents > 0)); then
  log "FAIL: $live_documents documents, but the backup has no documents directory"
  failed=true
fi

backup_fp=$(manifest_value "$dir" field_key_fingerprint)
if [[ -n $backup_fp && -n ${FIELD_ENCRYPTION_KEY:-} ]]; then
  if [[ $(key_fingerprint "$FIELD_ENCRYPTION_KEY") == "$backup_fp" ]]; then
    log "FIELD_ENCRYPTION_KEY matches the key the backup was taken with"
  else
    log "FAIL: FIELD_ENCRYPTION_KEY here is not the key the backup was taken with"
    failed=true
  fi
else
  log "note: key fingerprint not checked (no FIELD_ENCRYPTION_KEY here or none in backup.txt)"
fi

[[ $failed == false ]] || die "backup $dir failed verification"
log "OK: $dir restores and passes the checks"
