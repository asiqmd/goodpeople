#!/usr/bin/env bash
# Backs up Good People into BACKUP_DIR/<UTC timestamp>/:
#
#   database.dump          pg_dump, custom format (restore with restore.sh)
#   database.dump.sha256   its checksum
#   documents/             the document store at that moment; unchanged files are hard links
#                          to the previous backup, so each backup is complete but small
#   backup.txt             what was backed up, and a fingerprint of FIELD_ENCRYPTION_KEY
#
# then deletes backups older than BACKUP_RETENTION_DAYS (always keeping the newest
# BACKUP_KEEP_MIN), and copies BACKUP_DIR off the server if BACKUP_OFFSITE_RSYNC is set.
# Exits non-zero if any step fails; a failed run leaves no partial backup behind.
#
# Settings come from the environment, else from infra/.env (GP_ENV_FILE=path to use another):
#   BACKUP_DIR, BACKUP_DATABASE_URL, BACKUP_RETENTION_DAYS (14), BACKUP_KEEP_MIN (3)
#   STORAGE_DRIVER=local: GP_DOCUMENTS_DIR
#   STORAGE_DRIVER=s3:    S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION,
#                         BACKUP_S3_ENDPOINT or S3_ENDPOINT; needs the aws CLI or mc
#   BACKUP_OFFSITE_RSYNC (optional)
#
# Needs pg_dump/pg_restore/psql 17 or later, and rsync. Run it as root from cron, e.g.:
#   15 1 * * * /opt/good-people/infra/scripts/backup.sh >>/var/log/good-people-backup.log 2>&1
#
# FIELD_ENCRYPTION_KEY is deliberately NOT in the backup. Without it the documents and the
# identity and account numbers cannot be read: keep it in a password manager or vault.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
# shellcheck source-path=SCRIPTDIR source=lib.sh
. "$here/lib.sh"
load_env_file "${GP_ENV_FILE:-$here/../.env}"

require_var BACKUP_DIR BACKUP_DATABASE_URL
need pg_dump pg_restore psql rsync
retention=${BACKUP_RETENTION_DAYS:-14}
keep_min=${BACKUP_KEEP_MIN:-3}
driver=${STORAGE_DRIVER:-local}
[[ $retention =~ ^[0-9]+$ ]] || die "BACKUP_RETENTION_DAYS must be a number of days"
[[ $keep_min =~ ^[1-9][0-9]*$ ]] || die "BACKUP_KEEP_MIN must be 1 or more"

umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
lock=$BACKUP_DIR/.lock
mkdir "$lock" 2>/dev/null || die "another backup is running (or a stale $lock is left; remove it)"

stamp=$(date -u +%Y%m%dT%H%M%SZ)
work=$BACKUP_DIR/$stamp.partial
if [[ -e $BACKUP_DIR/$stamp ]]; then
  rmdir "$lock"
  die "a backup named $stamp already exists; try again in a second"
fi
cleanup() {
  rm -rf "$work"
  rmdir "$lock" 2>/dev/null || true
}
trap cleanup EXIT
mkdir "$work"

# The newest complete backup, for hard-linking unchanged documents.
previous=''
if [[ -e $BACKUP_DIR/latest ]]; then
  previous=$(cd "$BACKUP_DIR/latest" && pwd -P)
fi

# ── Database ───────────────────────────────────────────────────────────────────────────────
# Every tenant table has FORCE ROW LEVEL SECURITY, so only a superuser or a BYPASSRLS role sees
# all rows. pg_dump fails loudly for any other role; check first for a clearer message.
bypass=$(psql_value "$BACKUP_DATABASE_URL" \
  -c "select rolsuper or rolbypassrls from pg_roles where rolname = current_user")
[[ $bypass == t ]] ||
  die "BACKUP_DATABASE_URL's role does not bypass row-level security; use gp_backup (see the runbook)"

database=$(url_database "$BACKUP_DATABASE_URL")
log "dumping database $database"
pg_dump --format=custom --no-password --file="$work/database.dump" --dbname="$BACKUP_DATABASE_URL"
pg_restore --list "$work/database.dump" >/dev/null
(cd "$work" && printf '%s  database.dump\n' "$(sha256_of database.dump)" >database.dump.sha256)
server_version=$(psql_value "$BACKUP_DATABASE_URL" -c 'show server_version')
tenants=$(psql_value "$BACKUP_DATABASE_URL" -c 'select count(*) from tenants')

# ── Documents ──────────────────────────────────────────────────────────────────────────────
snapshot_documents() {
  local from=$1
  local args=(-a)
  if [[ -n $previous && -d $previous/documents ]]; then
    args+=("--link-dest=$previous/documents")
  fi
  rsync "${args[@]}" "$from/" "$work/documents/"
}

case $driver in
  local)
    require_var GP_DOCUMENTS_DIR
    [[ -d $GP_DOCUMENTS_DIR ]] || die "GP_DOCUMENTS_DIR $GP_DOCUMENTS_DIR is not a directory"
    log "copying documents from $GP_DOCUMENTS_DIR"
    snapshot_documents "$GP_DOCUMENTS_DIR"
    ;;
  s3)
    require_var S3_BUCKET S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY
    endpoint=${BACKUP_S3_ENDPOINT:-${S3_ENDPOINT:-}}
    # A running mirror of the bucket, refreshed incrementally. Nothing is deleted from it, so
    # an older database dump still finds the files it refers to.
    mirror=$BACKUP_DIR/s3-mirror
    mkdir -p "$mirror"
    log "mirroring s3://$S3_BUCKET"
    if command -v aws >/dev/null 2>&1; then
      aws_args=(s3 sync --only-show-errors "s3://$S3_BUCKET" "$mirror")
      if [[ -n $endpoint ]]; then aws_args+=(--endpoint-url "$endpoint"); fi
      AWS_ACCESS_KEY_ID=$S3_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY=$S3_SECRET_ACCESS_KEY \
        AWS_DEFAULT_REGION=${S3_REGION:-ap-south-1} aws "${aws_args[@]}"
    elif command -v mc >/dev/null 2>&1; then
      [[ -n $endpoint ]] || die "mc needs BACKUP_S3_ENDPOINT or S3_ENDPOINT"
      mc_config=$work/.mc
      mc --config-dir "$mc_config" alias set gpbackup "$endpoint" \
        "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY" >/dev/null
      mc --config-dir "$mc_config" mirror --quiet --overwrite "gpbackup/$S3_BUCKET" "$mirror"
      rm -rf "$mc_config"
    else
      die "STORAGE_DRIVER=s3 needs the aws CLI or mc to copy the bucket"
    fi
    snapshot_documents "$mirror"
    ;;
  *)
    die "unknown STORAGE_DRIVER $driver"
    ;;
esac
document_files=$(find "$work/documents" -type f | wc -l | tr -d ' ')

# ── Manifest ───────────────────────────────────────────────────────────────────────────────
{
  echo "created_at=$stamp"
  echo "database=$database"
  echo "server_version=$server_version"
  echo "pg_dump_version=$(pg_dump --version)"
  echo "tenants=$tenants"
  echo "storage_driver=$driver"
  echo "document_files=$document_files"
  echo "app_version=${GP_VERSION:-unknown}"
  if [[ -n ${FIELD_ENCRYPTION_KEY:-} ]]; then
    echo "field_key_fingerprint=$(key_fingerprint "$FIELD_ENCRYPTION_KEY")"
  fi
} >"$work/backup.txt"

mv "$work" "$BACKUP_DIR/$stamp"
ln -sfn "$stamp" "$BACKUP_DIR/latest"
log "backup complete: $BACKUP_DIR/$stamp ($tenants workspaces, $document_files document files)"

# ── Retention ──────────────────────────────────────────────────────────────────────────────
# Names sort by time; the newest keep_min are kept whatever their age.
shopt -s nullglob
backups=("$BACKUP_DIR"/[0-9]*T[0-9]*Z)
shopt -u nullglob
count=${#backups[@]}
i=0
while ((i < count - keep_min)); do
  old=${backups[$i]}
  if [[ -n $(find "$old" -maxdepth 0 -mtime +"$retention") ]]; then
    log "deleting backup older than $retention days: $old"
    rm -rf "$old"
  fi
  i=$((i + 1))
done

# ── Off-site copy ──────────────────────────────────────────────────────────────────────────
# Without --delete: a damaged or emptied BACKUP_DIR must never wipe the off-site copy. Prune
# that side with its own retention.
if [[ -n ${BACKUP_OFFSITE_RSYNC:-} ]]; then
  log "copying $BACKUP_DIR to $BACKUP_OFFSITE_RSYNC"
  rsync -aH --exclude=.lock --exclude='*.partial' "$BACKUP_DIR/" "$BACKUP_OFFSITE_RSYNC"
fi
