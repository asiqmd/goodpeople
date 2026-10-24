#!/usr/bin/env bash
# Shared by backup.sh, restore.sh and verify-backup.sh; sourced, not run. Works with bash 3.2+.

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
die() {
  log "ERROR: $*"
  exit 1
}

# Reads KEY=VALUE lines from an env file (infra/.env by default) without running it as shell
# code. Variables already set in the environment win. Surrounding quotes are removed.
load_env_file() {
  local file=$1 line key value
  [[ -f $file ]] || return 0
  while IFS= read -r line || [[ -n $line ]]; do
    line=${line%$'\r'}
    [[ $line =~ ^[[:space:]]*(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
    key=${BASH_REMATCH[2]}
    value=${BASH_REMATCH[3]}
    if [[ $value =~ ^\"(.*)\"$ ]] || [[ $value =~ ^\'(.*)\'$ ]]; then
      value=${BASH_REMATCH[1]}
    fi
    if declare -p "$key" >/dev/null 2>&1; then continue; fi
    export "$key=$value"
  done <"$file"
}

need() {
  local cmd
  for cmd in "$@"; do
    command -v "$cmd" >/dev/null 2>&1 || die "$cmd is not installed (see docs/ops/runbook.md)"
  done
}

require_var() {
  local name
  for name in "$@"; do
    [[ -n ${!name:-} ]] || die "$name is not set (see infra/.env.prod.example)"
  done
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

# The first 16 hex characters of the key's SHA-256: enough to tell keys apart, useless for
# recovering the key.
key_fingerprint() {
  if command -v sha256sum >/dev/null 2>&1; then
    printf '%s' "$1" | sha256sum | cut -c1-16
  else
    printf '%s' "$1" | shasum -a 256 | cut -c1-16
  fi
}

# Database names this script creates are interpolated into SQL, so they are restricted.
check_identifier() {
  [[ $1 =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || die "invalid name '$1' (lowercase letters, digits, _)"
}

# postgres://user:pass@host:port/db?opts -> db
url_database() {
  local rest=${1%%\?*}
  printf '%s\n' "${rest##*/}"
}

# postgres://user:pass@host:port/db?opts -> user
url_user() {
  local rest=${1#*://}
  rest=${rest%%@*}
  printf '%s\n' "${rest%%:*}"
}

# The same server and credentials, another database.
url_with_database() {
  local url=$1 database=$2 base query=''
  base=${url%%\?*}
  if [[ $url == *\?* ]]; then query="?${url#*\?}"; fi
  printf '%s/%s%s\n' "${base%/*}" "$database" "$query"
}

psql_value() {
  local url=$1
  shift
  psql -X -q -At -v ON_ERROR_STOP=1 --dbname="$url" "$@"
}

# Resolves a backup argument (a directory, its database.dump, or "latest") to a directory.
resolve_backup() {
  local arg=${1:-latest} dir
  if [[ $arg == latest ]]; then
    require_var BACKUP_DIR
    [[ -e $BACKUP_DIR/latest ]] || die "no backups in $BACKUP_DIR yet"
    dir=$BACKUP_DIR/latest
  elif [[ -f $arg ]]; then
    dir=$(dirname "$arg")
  else
    dir=$arg
  fi
  [[ -f $dir/database.dump ]] || die "$dir does not contain database.dump"
  (cd "$dir" && pwd -P)
}

# Checks the dump against the checksum written by backup.sh and that pg_restore can read it.
check_dump() {
  local dir=$1 expected actual
  if [[ -f $dir/database.dump.sha256 ]]; then
    expected=$(cut -d' ' -f1 "$dir/database.dump.sha256")
    actual=$(sha256_of "$dir/database.dump")
    [[ $expected == "$actual" ]] || die "checksum mismatch for $dir/database.dump"
  else
    log "warning: no checksum file next to $dir/database.dump"
  fi
  pg_restore --list "$dir/database.dump" >/dev/null || die "pg_restore cannot read $dir/database.dump"
}

# The value of KEY in a backup's backup.txt (KEY=value lines), or nothing.
manifest_value() {
  local file=$1/backup.txt key=$2
  [[ -f $file ]] || return 0
  sed -n "s/^$key=//p" "$file" | head -n 1
}

# Creates an empty database owned by the schema owner and restores a dump into it, all or
# nothing. Needs a superuser connection: the dump has row-level-security tables whose data
# only a superuser (or BYPASSRLS role) may load.
restore_into() {
  local admin_url=$1 database=$2 owner=$3 dump=$4
  psql_value "$admin_url" -c "CREATE DATABASE \"$database\" OWNER \"$owner\""
  if ! pg_restore --exit-on-error --single-transaction --no-password \
    --dbname="$(url_with_database "$admin_url" "$database")" "$dump"; then
    log "restore failed; dropping the new, empty database $database"
    psql_value "$admin_url" -c "DROP DATABASE IF EXISTS \"$database\"" || true
    return 1
  fi
}

# Owner and app role names: from the URLs in infra/.env, else the defaults setup.ts uses.
owner_role() {
  if [[ -n ${DATABASE_OWNER_URL:-} ]]; then url_user "$DATABASE_OWNER_URL"; else echo gp_owner; fi
}
app_role() {
  if [[ -n ${DATABASE_URL:-} ]]; then url_user "$DATABASE_URL"; else echo gp_app; fi
}

check_roles_exist() {
  local admin_url=$1 role found
  shift
  for role in "$@"; do
    check_identifier "$role"
    found=$(psql_value "$admin_url" -c "select count(*) from pg_roles where rolname = '$role'")
    [[ $found == 1 ]] ||
      die "role $role does not exist on this server; run the setup service first (see the runbook)"
  done
}
