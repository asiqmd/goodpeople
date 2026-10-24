#!/usr/bin/env bash
# Restores a Good People backup into a NEW database; it never overwrites an existing one.
#
#   restore.sh [--yes] [--target-db NAME] [--documents] [BACKUP]
#
#   BACKUP          a backup directory made by backup.sh, its database.dump, or "latest"
#                   (the default: BACKUP_DIR/latest)
#   --target-db     the database to create (default: <name>_restored_<UTC time>); must not exist
#   --documents     also copy the backup's documents back into the store (GP_DOCUMENTS_DIR, or
#                   S3_BUCKET with STORAGE_DRIVER=s3). Files are added or replaced, never deleted.
#   --yes           do not ask for confirmation
#
# Needs RESTORE_ADMIN_URL (a superuser; restoring tables with forced row-level security needs
# one) and the roles gp_owner and gp_app on the target server: on a new server, run the setup
# service first. The application is not switched over; the script prints how.
#
# The restored documents and identity numbers are readable only with the FIELD_ENCRYPTION_KEY
# the backup was taken with. The script compares fingerprints when it can.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
# shellcheck source-path=SCRIPTDIR source=lib.sh
. "$here/lib.sh"
load_env_file "${GP_ENV_FILE:-$here/../.env}"

usage() {
  sed -n '4,11p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

assume_yes=false
with_documents=false
target=''
backup_arg=''
while [[ $# -gt 0 ]]; do
  case $1 in
    --yes | -y) assume_yes=true ;;
    --documents) with_documents=true ;;
    --target-db)
      [[ $# -ge 2 ]] || usage 2
      target=$2
      shift
      ;;
    -h | --help) usage 0 ;;
    -*) usage 2 ;;
    *) backup_arg=$1 ;;
  esac
  shift
done

require_var RESTORE_ADMIN_URL
need pg_restore psql
dir=$(resolve_backup "${backup_arg:-latest}")
check_dump "$dir"

source_db=$(manifest_value "$dir" database)
stamp=$(date -u +%Y%m%d%H%M%S)
target=${target:-${source_db:-good_people}_restored_$stamp}
check_identifier "$target"
owner=$(owner_role)
app=$(app_role)
check_roles_exist "$RESTORE_ADMIN_URL" "$owner" "$app"
exists=$(psql_value "$RESTORE_ADMIN_URL" -c "select count(*) from pg_database where datname = '$target'")
[[ $exists == 0 ]] || die "database $target already exists; restore.sh only restores into a new one"

# Documents are only readable with the key the backup was taken with.
backup_fp=$(manifest_value "$dir" field_key_fingerprint)
if [[ -n $backup_fp && -n ${FIELD_ENCRYPTION_KEY:-} ]]; then
  if [[ $(key_fingerprint "$FIELD_ENCRYPTION_KEY") != "$backup_fp" ]]; then
    log "WARNING: FIELD_ENCRYPTION_KEY here is not the key this backup was taken with."
    log "Documents and identity numbers in it will not decrypt with the current key."
  fi
fi

server=$(psql_value "$RESTORE_ADMIN_URL" -c "select host(inet_server_addr()) || ':' || inet_server_port()" || true)
cat >&2 <<EOF

  Backup:         $dir
  Taken:          $(manifest_value "$dir" created_at)
  Server:         ${server:-local socket}
  New database:   $target (owner $owner)
  Documents:      $([[ $with_documents == true ]] && echo "copied back (${STORAGE_DRIVER:-local})" || echo "not touched")

EOF
if [[ $assume_yes != true ]]; then
  [[ -t 0 ]] || die "not a terminal; pass --yes to restore without confirmation"
  read -r -p "Type the new database name ($target) to restore: " answer
  [[ $answer == "$target" ]] || die "cancelled"
fi

log "restoring into $target"
restore_into "$RESTORE_ADMIN_URL" "$target" "$owner" "$dir/database.dump"
target_url=$(url_with_database "$RESTORE_ADMIN_URL" "$target")
log "restored: $(psql_value "$target_url" -c "select count(*) from tenants") workspaces," \
  "$(psql_value "$target_url" -c "select count(*) from employees") employees"

if [[ $with_documents == true ]]; then
  [[ -d $dir/documents ]] || die "the backup has no documents directory"
  case ${STORAGE_DRIVER:-local} in
    local)
      require_var GP_DOCUMENTS_DIR
      need rsync
      log "copying documents into $GP_DOCUMENTS_DIR"
      rsync -a "$dir/documents/" "$GP_DOCUMENTS_DIR/"
      ;;
    s3)
      require_var S3_BUCKET S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY
      need aws
      endpoint=${BACKUP_S3_ENDPOINT:-${S3_ENDPOINT:-}}
      aws_args=(s3 sync --only-show-errors "$dir/documents" "s3://$S3_BUCKET")
      if [[ -n $endpoint ]]; then aws_args+=(--endpoint-url "$endpoint"); fi
      log "copying documents into s3://$S3_BUCKET"
      AWS_ACCESS_KEY_ID=$S3_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY=$S3_SECRET_ACCESS_KEY \
        AWS_DEFAULT_REGION=${S3_REGION:-ap-south-1} aws "${aws_args[@]}"
      ;;
    *) die "unknown STORAGE_DRIVER ${STORAGE_DRIVER}" ;;
  esac
fi

live=$(url_database "${DATABASE_URL:-postgres:///good_people}")
cat >&2 <<EOF

Restored into $target. The application still uses $live. To switch:

  1. Stop the app:   docker compose -f infra/docker-compose.prod.yml stop caddy web api
  2. Swap names (as the superuser, with nothing connected to either database):
       ALTER DATABASE "$live" RENAME TO "${live}_before_$stamp";
       ALTER DATABASE "$target" RENAME TO "$live";
  3. Start again:    docker compose -f infra/docker-compose.prod.yml up -d
     (migrate runs first and applies anything newer than the backup)

Keep ${live}_before_$stamp until you are sure, then drop it.
EOF
