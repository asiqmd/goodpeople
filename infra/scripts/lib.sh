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

# Database URLs carry passwords, and every user on the host can read a command line. So libpq
# commands get the URL without its password, and the password in PGPASSWORD, which only that
# command's own user and root can read.
url_without_password() {
  local url=$1 rest userinfo
  rest=${url#*://}
  userinfo=$(url_userinfo "$url")
  if [[ $userinfo != *:* ]]; then
    printf '%s\n' "$url"
    return
  fi
  printf '%s://%s@%s\n' "${url%%://*}" "${userinfo%%:*}" "${rest:$((${#userinfo} + 1))}"
}

# postgres://user:pass@host:port/db?opts -> user:pass (nothing when there is none)
url_userinfo() {
  local rest=${1#*://} authority
  authority=${rest%%/*}
  [[ $1 == *://* && $authority == *@* ]] || return 0
  printf '%s\n' "${authority%@*}"
}

# The URL's password, percent-decoded, or nothing.
url_password() {
  local userinfo value
  userinfo=$(url_userinfo "$1")
  [[ $userinfo == *:* ]] || return 0
  value=${userinfo#*:}
  value=${value//\\/\\\\}
  printf '%b\n' "${value//%/\\x}"
}

# Percent-encodes a value for the user or password part of a URL.
url_encode() {
  local LC_ALL=C value=$1 out='' c i
  for ((i = 0; i < ${#value}; i++)); do
    c=${value:i:1}
    case $c in
      [A-Za-z0-9._~-]) out="$out$c" ;;
      *) out="$out$(printf '%%%02X' "'$c")" ;;
    esac
  done
  printf '%s\n' "$out"
}

# Runs a libpq command against URL: pg_run URL psql|pg_dump|pg_restore ARGS...
pg_run() {
  local url=$1 cmd=$2 password
  shift 2
  password=$(url_password "$url")
  if [[ -n $password ]]; then
    PGPASSWORD=$password "$cmd" --dbname="$(url_without_password "$url")" "$@"
  else
    "$cmd" --dbname="$url" "$@"
  fi
}

psql_value() {
  local url=$1
  shift
  pg_run "$url" psql -X -q -At -v ON_ERROR_STOP=1 "$@"
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
  if ! pg_run "$(url_with_database "$admin_url" "$database")" pg_restore --exit-on-error \
    --single-transaction --no-password "$dump"; then
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

utc_now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# KEY=VALUE arguments as a JSON object: whole numbers, true, false and null stay bare, anything
# else becomes a string. Pairs with no value are left out.
json_object() {
  local pair key value out='' sep=''
  for pair in "$@"; do
    key=${pair%%=*}
    value=${pair#*=}
    [[ -n $value ]] || continue
    if [[ ! $value =~ ^(-?(0|[1-9][0-9]*)|true|false|null)$ ]]; then
      value=${value//\\/\\\\}
      value=${value//\"/\\\"}
      value="\"$value\""
    fi
    out="$out$sep\"$key\":$value"
    sep=','
  done
  printf '{%s}\n' "$out"
}

# Records a backup or a restore drill in the backup_runs table, so the console and the status
# checks can tell when backups stop. Best effort: a failure to record is logged and never fails
# the run. Values reach SQL only as psql variables.
#   record_run URL KIND OK LABEL STARTED_AT SIZE_BYTES DETAIL_JSON
record_run() {
  local url=$1 kind=$2 ok=$3 label=$4 started_at=$5 size_bytes=$6 detail=$7 host
  host=$(hostname 2>/dev/null || echo unknown)
  if PGCONNECT_TIMEOUT=10 pg_run "$url" psql -X -q -v ON_ERROR_STOP=1 \
    -v kind="$kind" -v ok="$ok" -v label="$label" -v host="$host" \
    -v started_at="$started_at" -v finished_at="$(utc_now)" -v size_bytes="$size_bytes" \
    -v detail="$detail" >/dev/null <<'SQL'; then
INSERT INTO backup_runs (kind, ok, label, host, started_at, finished_at, size_bytes, detail)
VALUES (:'kind', :'ok', NULLIF(:'label', ''), :'host', :'started_at', :'finished_at',
        NULLIF(:'size_bytes', '')::bigint, :'detail'::jsonb);
SQL
    log "recorded this run in backup_runs ($kind, ok=$ok)"
  else
    log "warning: could not record this run in backup_runs; the run itself is not affected"
  fi
}
