# Good People production runbook

How to deploy, upgrade, back up and watch Good People. The files it refers to:

- `apps/api/Dockerfile`, `apps/web/Dockerfile`, `.dockerignore`: the images
- `infra/docker-compose.prod.yml`, `infra/Caddyfile`, `infra/.env.prod.example`: the stack
- `infra/scripts/backup.sh`, `restore.sh`, `verify-backup.sh`: backups

Contents: [Architecture](#architecture) · [First deployment](#first-deployment) ·
[Environment variables](#environment-variables) · [Upgrades](#upgrades) ·
[Backups and the restore drill](#backups-and-the-restore-drill) · [Keys and secrets](#keys-and-secrets) ·
[Background jobs](#background-jobs) · [Chrome for PDFs](#chrome-for-pdfs) ·
[Edge Agents and the mobile app](#edge-agents-and-the-mobile-app) · [Monitoring](#monitoring) ·
[Data protection in Bangladesh](#data-protection-in-bangladesh) · [Known gaps](#known-gaps)

## Architecture

Start with one virtual machine running Docker Compose:

```
   browsers               mobile app, Edge Agents at the sites
      │ https://GP_DOMAIN       │ https://GP_API_DOMAIN
 ┌────┼─────────────────────────┼──────────── one VM, docker compose ─┐
 │    ▼                         ▼                                     │
 │  caddy :80 :443 (Let's Encrypt certificates)                       │
 │    │                         │                                     │
 │    ▼                         ▼                                     │
 │  web :3000 ───────────────► api :4000 (NestJS, Chromium, jobs)     │
 │  Next.js    API_URL=http://api:4000    │                           │
 │             (server to server)         ▼                           │
 │                              postgres :5432 (127.0.0.1 only)       │
 │                                                                    │
 │  /srv/good-people/documents  encrypted files (STORAGE_DRIVER=local)│
 │  /srv/good-people/backups    backup.sh output ──► off-site rsync   │
 └────────────────────────────────────────────────────────────────────┘
```

- **Two names, one proxy.** Caddy serves the web app at `GP_DOMAIN` and the API at
  `GP_API_DOMAIN` (for example `hr.example.com` and `api.hr.example.com`), with certificates it
  obtains and renews itself.
- **Browsers never call the API.** The web app calls it from its server, over the internal
  network, at `API_URL=http://api:4000`. That includes file downloads, which go through the web
  app's routes under `/workspace/files`.
- **The API is public only for the mobile app and the Edge Agents.** Caddy hides `/docs`
  (OpenAPI) on the public name. The web app would keep working with the API removed from Caddy,
  but phones and sites would not.
- **One API process.** It also runs the background jobs (see [Background jobs](#background-jobs)).
- **The same API image runs the database commands.** `pnpm deploy` copies the compiled
  `@gp/db` scripts and the SQL migrations into the image, so `setup`, `migrate` and (for
  staging) `seed` run with plain `node`. No separate migration image is needed.

**Managed variant.** Use a managed PostgreSQL 17 and an S3 bucket instead of the bundled ones:

- remove `db` from `COMPOSE_PROFILES`
- point the three `DATABASE_*` URLs at the managed host, with the TLS settings the provider
  requires
- set `STORAGE_DRIVER=s3` and the `S3_*` variables
- rely on the provider's snapshots or point-in-time recovery, as well as `backup.sh`

On PostgreSQL 16 and later, a provider's admin user is often not a real superuser. `setup` may
then fail at `CREATE DATABASE ... OWNER gp_owner` or `ALTER DEFAULT PRIVILEGES FOR ROLE gp_owner`.
If so, run `GRANT gp_owner TO <admin user>;` and run `setup` again (it is idempotent).
`restore.sh` and `verify-backup.sh` need a role that may load tables with forced row-level
security (a superuser or `BYPASSRLS`); without one, restore with the provider's own tools. The
managed variant has not been tested.

## First deployment

All commands run on the server, from the checkout. Define this helper first:

```sh
cd /opt/good-people
gp() { docker compose -f infra/docker-compose.prod.yml "$@"; }
```

### 1. Prepare the server

- **Machine.** Ubuntu 24.04 LTS or Debian 13. Start with 2 vCPU, 4 GB RAM and 40 GB of disk,
  plus room for documents and backups. Chromium needs a few hundred MB while it renders.
- **Docker.** Docker Engine 25 or later with the Compose plugin 2.24 or later
  (`docker compose version`). Compose must support `depends_on.required`.
- **Host tools for backups.** `postgresql-client-17` (from the PostgreSQL apt repository;
  Ubuntu 24.04's own client is 16 and cannot dump a 17 server) and `rsync`. With S3 storage,
  also the `aws` CLI (or `mc`).
- **Firewall.** Allow 80/tcp, 443/tcp and 443/udp from anywhere, and 22/tcp from your office
  only. Nothing else: PostgreSQL and MinIO listen on 127.0.0.1.
- **DNS.** Create A (and AAAA) records for `GP_DOMAIN` and `GP_API_DOMAIN` pointing at the
  server, before Caddy first starts.
- **Outbound access.** Let's Encrypt and, during builds, the npm registry, Debian mirrors and
  Google Fonts (`next/font` downloads Inter and Noto Sans Bengali at build time). At runtime:
  your SMTP, SMS and push providers.

### 2. Get the code and configure

As a user in the `docker` group:

```sh
sudo install -d -o "$USER" /opt/good-people
git clone <repository> /opt/good-people && cd /opt/good-people
git checkout <release tag>
cp infra/.env.prod.example infra/.env && chmod 600 infra/.env
```

Fill in `infra/.env`. Every variable is explained in the file and in
[Environment variables](#environment-variables). Generate the secrets on the server:

```sh
openssl rand -hex 24      # each database password: postgres, gp_owner, gp_app, gp_backup
openssl rand -base64 48   # JWT_ACCESS_SECRET
openssl rand -base64 32   # FIELD_ENCRYPTION_KEY: store it in the password manager right now
```

- **Where the file lives.** `infra/.env` is ignored by git, and Compose reads it automatically
  for this stack. Do not name it `.env.prod`: git does not ignore that name.
- **Image tag.** Set `GP_VERSION` to the release tag or `git rev-parse --short HEAD`, so you can
  roll back to a known image.

### 3. Directories, images and the database

```sh
sudo install -d -o 1000 -g 1000 -m 750 /srv/good-people/documents   # uid 1000 = the image's node user
sudo install -d -m 700 /srv/good-people/backups
gp build                      # both images; several minutes the first time
gp up -d postgres
gp run --rm setup             # "Roles and databases ready: good_people, good_people_test"
gp run --rm migrate           # "Migrations applied"
```

About `setup`:

- It creates `gp_owner` (owns the schema, runs migrations) and `gp_app` (what the API uses).
  Both have `NOBYPASSRLS`, and `gp_app` cannot create tables.
- It also creates `good_people_test`, which production does not use. You may drop it:
  `gp exec postgres dropdb -U postgres good_people_test`.

Create the backup role. It is read-only, but it must bypass row-level security: every tenant
table has `FORCE ROW LEVEL SECURITY`, so a dump made as `gp_owner` fails ("query would be affected
by row-level security policy"). With `--enable-row-security`, the same dump silently leaves out
every workspace's rows.

```sh
gp exec postgres psql -U postgres -d good_people
```

```sql
CREATE ROLE gp_backup LOGIN BYPASSRLS;
GRANT pg_read_all_data TO gp_backup;
-- The backup scripts record each run here (see "Backups and the restore drill").
GRANT INSERT ON backup_runs TO gp_backup;
\password gp_backup
-- Check the roles: gp_app and gp_owner must show f, f; gp_backup f, t.
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname LIKE 'gp\_%';
```

Put the `gp_backup` password into `BACKUP_DATABASE_URL` in `infra/.env`.

### 4. The first super admin

`create-super-admin` upserts the plan catalogue (**Assign company** needs it) and creates one
super admin, and nothing else: no demo workspaces. The password is read from your terminal and
never appears in the command line:

```sh
read -r -p 'Super admin e-mail: ' GP_ADMIN_EMAIL
read -r -s -p 'Password (12+ characters): ' GP_ADMIN_PASSWORD; echo
export GP_ADMIN_EMAIL GP_ADMIN_PASSWORD
gp run --rm -e GP_ADMIN_EMAIL -e GP_ADMIN_PASSWORD migrate \
  node node_modules/@gp/db/dist/scripts/create-super-admin.js
unset GP_ADMIN_PASSWORD
```

It is safe to run again: plans are refreshed and an existing e-mail is left unchanged. With
`REQUIRE_ADMIN_MFA=on` (the production default), the first sign-in asks the super admin to set
up two-step sign-in with an authenticator app before anything else.

On **staging**, the full demo `seed` is fine instead:

```sh
gp run --rm -e SEED_SUPER_ADMIN_EMAIL=ops@example.com -e SEED_PASSWORD='<staging only>' \
  -e FIELD_ENCRYPTION_KEY="$(sed -n 's/^FIELD_ENCRYPTION_KEY=//p' infra/.env)" \
  migrate node node_modules/@gp/db/dist/scripts/seed.js
```

### 5. Start everything

```sh
gp up -d                      # runs migrate again (a no-op), then api, web and caddy
gp ps                         # api and web become "healthy" within a minute
curl -fsS https://api.hr.example.com/health      # {"status":"ok","db":"up"}
```

Then:

1. Open `https://<GP_DOMAIN>/platform/login` and sign in as the super admin. With
   `REQUIRE_ADMIN_MFA=on` (Phase 1 M5), the first sign-in asks you to set up an authenticator
   app. Keep the recovery codes somewhere safe.
2. Create the first company with **Assign company**.

### 6. Turn on backups

```sh
sudo crontab -e
# 15 1 * * *  /opt/good-people/infra/scripts/backup.sh >>/var/log/good-people-backup.log 2>&1
sudo /opt/good-people/infra/scripts/backup.sh
sudo /opt/good-people/infra/scripts/verify-backup.sh
```

## Environment variables

Compose reads `infra/.env` and passes each container only what it needs. "Image" or "compose"
means the value is fixed there, not in `infra/.env`.

**API: database and security**

| Variable                   | Used by          | Meaning                                                                                                                                                |
| -------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`             | api              | Required. `gp_app` connection. Never a role with `BYPASSRLS`.                                                                                          |
| `DATABASE_OWNER_URL`       | migrate, setup   | Required. `gp_owner` connection; runs migrations. The API never gets it.                                                                               |
| `DATABASE_ADMIN_URL`       | setup            | Superuser connection, used once to create roles and databases.                                                                                         |
| `JWT_ACCESS_SECRET`        | api              | Required, 32+ characters. Signs access tokens.                                                                                                         |
| `FIELD_ENCRYPTION_KEY`     | api              | Required. 32 random bytes, base64. Encrypts documents and identity and account numbers. [Back it up separately](#keys-and-secrets).                    |
| `ACCESS_TOKEN_TTL_SECONDS` | api              | Access token lifetime. Default 900.                                                                                                                    |
| `REFRESH_TOKEN_TTL_DAYS`   | api              | Refresh token lifetime. Default 30.                                                                                                                    |
| `REQUIRE_ADMIN_MFA`        | api              | `on` (compose default): admins and platform staff must use two-step sign-in.                                                                           |
| `TRUST_PROXY`              | api (compose: 1) | Proxies in front of the API, so rate limits see the visitor's address: Caddy for the app and agents, the web server (which passes it on) for browsers. |
| `WEB_ORIGIN`               | api (compose)    | `https://${GP_DOMAIN}`; the CORS origin.                                                                                                               |
| `PORT`                     | api (image)      | 4000.                                                                                                                                                  |
| `NODE_ENV`                 | api, web (image) | `production`: secure cookies, and `reset` refuses to run.                                                                                              |

**API: jobs, documents and PDFs**

| Variable                          | Used by       | Meaning                                                                               |
| --------------------------------- | ------------- | ------------------------------------------------------------------------------------- |
| `BACKGROUND_JOBS`                 | api (compose) | `on` for exactly one API process. See [Background jobs](#background-jobs).            |
| `ATTENDANCE_JOB_INTERVAL_MINUTES` | api           | How often attendance is processed. Default 15.                                        |
| `STORAGE_DRIVER`                  | api, scripts  | `local` (default) or `s3`.                                                            |
| `STORAGE_DIR`                     | api (image)   | `/data/documents`, mounted from `GP_DOCUMENTS_DIR`.                                   |
| `GP_DOCUMENTS_DIR`                | compose       | Host directory of the local store. Owned by uid 1000.                                 |
| `S3_BUCKET`                       | api, scripts  | Bucket name (S3 only).                                                                |
| `S3_ACCESS_KEY_ID`                | api, scripts  | S3 credentials. With the `minio` profile, also MinIO's root user.                     |
| `S3_SECRET_ACCESS_KEY`            | api, scripts  | S3 credentials. With the `minio` profile, also MinIO's root password (8+ characters). |
| `S3_REGION`                       | api, scripts  | Default `ap-south-1`, which is Mumbai, not Bangladesh.                                |
| `S3_ENDPOINT`                     | api, scripts  | MinIO or another S3-compatible store, e.g. `http://minio:9000`. Leave it out for AWS. |
| `S3_FORCE_PATH_STYLE`             | api           | `true` for MinIO.                                                                     |
| `CHROME_PATH`                     | api (image)   | `/usr/local/bin/chromium-no-sandbox`. See [Chrome for PDFs](#chrome-for-pdfs).        |

**API: notifications**

| Variable                                                                    | Used by | Meaning                                                                                                            |
| --------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| `EMAIL_DRIVER`, `SMTP_URL`, `EMAIL_FROM`                                    | api     | `smtp` sends through `SMTP_URL`. `log` (the development default) writes e-mails to the log; production refuses it. |
| `SMS_DRIVER`, `SSLWIRELESS_API_TOKEN`, `SSLWIRELESS_SID`, `SSLWIRELESS_URL` | api     | `sslwireless`, for sign-in codes; the provider usually allow-lists the server's IP. `log` as for e-mail.           |
| `ALLOW_LOG_SENDERS`                                                         | api     | `on` lets production start with the `log` drivers, for a staging box; codes are hidden in what it logs.            |
| `SUPPORT_INBOX_EMAIL`                                                       | api     | Required in production: the shared inbox for new support tickets and customer replies.                             |
| `PUSH_DRIVER`, `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`      | api     | `log` (default) or `fcm`, for mobile push. Write the key's line breaks as `\n`, in single quotes.                  |

The optional API variables are passed only when `infra/.env` sets them, so the API's own
defaults apply otherwise. An empty `S3_ENDPOINT` or `SSLWIRELESS_URL` would fail its URL check.

**Web, stack and backups**

| Variable                                                 | Used by         | Meaning                                                                                    |
| -------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------ |
| `API_URL`                                                | web (compose)   | `http://api:4000`. Server to server only.                                                  |
| `GP_SUPPORT_EMAIL`                                       | web             | The contact address in the public pages' footer.                                           |
| `LOG_FORMAT`, `LOG_LEVEL`                                | api             | `json` (production default) or `pretty`; `debug`, `info` (default), `warn`, `error`.       |
| `API_DOCS`                                               | api             | `on` serves the OpenAPI pages at `/docs`. Off in production by default.                    |
| `STATUS_WEB_URL`                                         | api             | What the status checks fetch for the web app (compose: `http://web:3000/login`).           |
| `GP_DOMAIN`, `GP_API_DOMAIN`, `ACME_EMAIL`               | caddy, api      | Public names, and the Let's Encrypt contact.                                               |
| `COMPOSE_PROFILES`                                       | compose         | `db` for bundled PostgreSQL; add `minio` for MinIO.                                        |
| `GP_API_IMAGE`, `GP_WEB_IMAGE`                           | compose         | Image names.                                                                               |
| `GP_VERSION`                                             | compose         | Image tag.                                                                                 |
| `POSTGRES_PASSWORD`                                      | postgres        | Bundled PostgreSQL's superuser password.                                                   |
| `BACKUP_DIR`, `BACKUP_RETENTION_DAYS`, `BACKUP_KEEP_MIN` | scripts         | Where backups go; delete after N days (14); always keep the newest M (3).                  |
| `BACKUP_DATABASE_URL`                                    | backup.sh       | `gp_backup` via `127.0.0.1`. Must bypass row-level security.                               |
| `RESTORE_ADMIN_URL`                                      | restore, verify | Superuser via `127.0.0.1`.                                                                 |
| `BACKUP_REPORT_DATABASE_URL`                             | verify          | Optional. Where a drill on another machine records itself (default `BACKUP_DATABASE_URL`). |
| `BACKUP_OFFSITE_RSYNC`                                   | backup.sh       | Optional rsync destination off the server.                                                 |
| `BACKUP_S3_ENDPOINT`                                     | scripts         | Optional. The bucket's endpoint as seen from the host (MinIO: `http://127.0.0.1:9000`).    |
| `VERIFY_MIN_TENANTS`                                     | verify          | Fewest workspaces a good backup may have. Default 1.                                       |
| `GP_ENV_FILE`                                            | scripts         | Another env file instead of `infra/.env`.                                                  |

## Upgrades

**Migrate before switching versions.** Migrations are forward-only (there are no down
migrations). Drizzle applies all pending migrations in one transaction, so a failure leaves the
schema as it was.

1. Read what changed, especially new files in `packages/db/migrations`.
2. Back up: `sudo infra/scripts/backup.sh`.
3. Build the new version while the old one keeps serving:
   - `git fetch && git checkout <new tag>`
   - set `GP_VERSION=<new tag>` in `infra/.env`
   - `gp build`
4. `gp run --rm migrate`. The old API keeps running against the new schema for a moment. Keep
   migrations additive (add, backfill, and drop only in a later release) and upgrade outside
   working hours.
5. `gp up -d`. This recreates `api` and `web` from the new images; `migrate` runs again and does
   nothing.
6. Check:
   - `gp ps`
   - `curl -fsS https://<GP_API_DOMAIN>/health`
   - `gp logs --since 10m api`
   - sign in once

**Rolling back.** Set the previous `GP_VERSION` and run `gp up -d`. That is safe only if the old
code works with the new schema. Otherwise, restore the backup from step 2 with `restore.sh`;
anything written since that backup is lost.

## Backups and the restore drill

**What `backup.sh` takes.** Each run writes `BACKUP_DIR/<UTC time>/`:

- `database.dump`: pg_dump in custom format, as `gp_backup`, with its SHA-256 checksum.
- `documents/`: the document store at that moment. Files are copied with rsync, and unchanged
  files are hard links to the previous backup, so every backup is complete but small. With S3,
  the script first refreshes a mirror of the bucket (`aws s3 sync` or `mc mirror`, never
  deleting) and snapshots that.
- `backup.txt`: counts, versions and a fingerprint of `FIELD_ENCRYPTION_KEY`. The fingerprint is
  16 hex characters of its SHA-256, never the key.

**Retention.** Backups older than `BACKUP_RETENTION_DAYS` are deleted, but the newest
`BACKUP_KEEP_MIN` are always kept.

**Failures.** The script exits non-zero if anything fails, and leaves no partial backup.

**Secrets stay off command lines,** where any user on the host could read them. The scripts
give `pg_dump`, `pg_restore` and `psql` each URL without its password, and the password in
`PGPASSWORD` for that command only. The S3 keys reach `aws` and `mc` through their environment.

**Every run is recorded.** `backup.sh` adds a row to the `backup_runs` table through
`BACKUP_DATABASE_URL`, whether the run worked or not:

- when it started and finished, the backup's name, the host and the dump's size
- for a good run: the workspaces and document files, the storage driver, and whether the
  off-site copy was made
- for a failed run: the step that failed (`lock`, `database`, `documents`, `manifest`,
  `retention` or `offsite`) and the exit code

`verify-backup.sh` records each drill the same way, with its counts, missing files and the key
check. It writes through `BACKUP_REPORT_DATABASE_URL`, else `BACKUP_DATABASE_URL`; with neither
set, it logs that the drill is not recorded. On a drill machine that cannot reach the
production database, leave both unset and note the result yourself.

Recording never changes a run's result. If the database cannot be reached, or `gp_backup`
lacks `INSERT ON backup_runs` (granted by migration 0030 where the role exists, and in step 3
above), the script logs a warning and carries on. Values go to `psql` as variables, never as
SQL text.

The console's **Operations** page shows the last 30 runs. It warns when the newest successful
backup is more than 26 hours old, or the last passed drill more than 35 days old. Once any run
has been recorded, the API also logs an `ERROR` once an hour while no backup has succeeded for
26 hours.

**Not in the backup:**

- **`FIELD_ENCRYPTION_KEY`, on purpose.** Keep it in a password manager or vault that at least
  two people can open. Without it, the documents and the identity and account numbers in a
  backup cannot be read.
- **Roles.** `setup` recreates them, from the passwords in `infra/.env`.
- **The Caddy volume.** Caddy re-issues certificates if it is lost.

**Off-site.** A backup on the same disk is not a backup. Set `BACKUP_OFFSITE_RSYNC`, or copy
`BACKUP_DIR` elsewhere yourself. The script copies without `--delete`, so an emptied
`BACKUP_DIR` cannot wipe the off-site copy; prune that side on its own schedule. If Bangladeshi
rules require it, keep the off-site copy in-country.

**Recovery point.** Daily dumps mean up to a day of data can be lost. To do better, use a
managed database with point-in-time recovery, or add WAL archiving (pgBackRest or WAL-G). The
bundled setup has neither.

**Monthly restore drill.**

1. Run `infra/scripts/verify-backup.sh`, preferably on a different machine that has a copy of
   the backups and its own PostgreSQL 17. It:
   - checks the checksum
   - restores into a scratch database `gp_verify_<time>`
   - checks there is at least one workspace and one super admin, that migrations are recorded,
     and that the workspace count matches `backup.txt`
   - checks that every live document's file is present
   - compares the key fingerprint with the `FIELD_ENCRYPTION_KEY` it can see
   - drops the scratch database
2. Once a quarter, do a full restore into a staging stack with the production key. Sign in and
   open a document and a letter. That is the only test that the key decrypts real files.
3. Check that the drill shows on the console's **Operations** page. If it was not recorded
   (see above), note the date and the result yourself.

**Restoring.**

1. On a new server, do the first deployment up to `setup`, so the roles exist.
2. Run the restore:

   ```sh
   sudo infra/scripts/restore.sh latest                          # or a backup directory
   sudo infra/scripts/restore.sh --documents --target-db good_people_restored /srv/good-people/backups/20261024T011500Z
   ```

   `restore.sh` always creates a new database; it refuses to restore into one that exists. It
   asks you to type the new database's name (`--yes` skips that, for scripts).

3. Follow the switch-over steps it prints: stop `caddy web api`, rename the databases, then
   `gp up -d`. `migrate` brings an older backup up to the current schema.

## Keys and secrets

**`FIELD_ENCRYPTION_KEY`** encrypts every document file and every identity and account number
in the database, with AES-256-GCM.

- **Losing it** loses all of them.
- **Never change it** on a running system. There is no re-encryption job yet; the `GPF1` file
  header leaves room for one.
- **Use a different key** for staging and for each production.
- **If it leaks** together with a database or document copy, the data is readable. Treat it as
  a breach.

**`JWT_ACCESS_SECRET`** signs only access tokens, which live `ACCESS_TOKEN_TTL_SECONDS` (15
minutes). Refresh tokens are random values stored hashed in `auth_sessions`, so they are not
affected.

- **Rotating it** (`infra/.env`, then `gp up -d api`) invalidates every current access token at
  once. Apps that refresh get a new token; some users will have to sign in again. The API
  accepts only one secret, so there is no overlap period.
- **To sign everyone out**, for example after a leak, also revoke the sessions:
  `UPDATE auth_sessions SET revoked_at = now() WHERE revoked_at IS NULL;` as `gp_owner`.

**Database passwords.** Change one with `ALTER ROLE ... PASSWORD`, update the URL in
`infra/.env`, then `gp up -d`.

**Edge Agent tokens** (`gpe.…`) are separate from all of the above. They are managed per agent
in the workspace.

## Background jobs

The API runs these on timers inside its own process, when `BACKGROUND_JOBS=on`:

| Job                                                                       | When                                                                |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Attendance processing: stores `attendance_days`, catching up to 35 days   | Every `ATTENDANCE_JOB_INTERVAL_MINUTES` (15), first 5 s after start |
| Completing separations whose last working day has passed                  | Hourly, first 10 s after start                                      |
| Notifications (Phase 1 M5): sending the outbox, and reminders             | Every 30 s and hourly                                               |
| Status checks (Phase 3 M5); pruning old checks and the stale-backup alert | Every minute, first 15 s after start; hourly                        |
| Closing support tickets solved more than 7 days ago with no reply         | Hourly                                                              |

**Exactly one process may have them on.** Nothing elects a leader: every process with
`BACKGROUND_JOBS=on` starts the same timers.

- **Duplicate work.** Attendance takes a per-workspace advisory lock, and the outbox locks its
  rows, so a second runner mostly repeats work. Reminders and separation completion, though,
  assume a single runner.
- **In-memory state.** The sign-in rate limiter keeps its counts in memory, so with two API
  processes every limit doubles.

The compose file therefore runs one `api` with `BACKGROUND_JOBS=on`.

**To scale out later**, add API copies with `BACKGROUND_JOBS=off` and keep one copy with `on`.
On the copies with `off`, new notifications wait for the jobs copy's 30-second sweep. Solve the
rate limiter first: the code notes that it needs a shared store, planned for Phase 2.

**Restarts are safe.** Processing resumes from where it got to, and recomputes days from their
inputs ([ADR 005](../adr/005-attendance-processing.md)). Stored days can lag the live screens by
up to one interval.

## Chrome for PDFs

Letters, ID cards and service books are rendered by headless Chromium through `puppeteer-core`
([ADR 006](../adr/006-documents-and-pdfs.md)).

**What the image installs.** Debian's `chromium` and `fonts-liberation`; the API embeds Noto
Sans Bengali itself. `CHROME_PATH` is set to `/usr/local/bin/chromium-no-sandbox`, a two-line
wrapper:

```sh
exec /usr/bin/chromium --no-sandbox --disable-dev-shm-usage "$@"
```

**Why the sandbox is off.** Chromium's sandbox needs unprivileged user namespaces or seccomp and
capabilities that Docker's default profile denies, so inside a container it usually cannot start.
The API's own code adds `--no-sandbox` only when it runs as root. That leaves two choices:

- **Run as root (rejected).** A compromised renderer would be root in the container.
- **Run as `node` (uid 1000) with the wrapper (chosen).** The API's code and dependencies are
  owned by root and read-only to it. Compose drops all capabilities and sets
  `no-new-privileges`. `--disable-dev-shm-usage` avoids crashes from Docker's 64 MB `/dev/shm`.

**The remaining risk.** A Chromium renderer exploit would run as the API user, which can read
the API's environment: the database URL and `FIELD_ENCRYPTION_KEY`. The input is narrow, which
limits that risk:

- the HTML comes from the API's own templates, with escaped content
- each page has JavaScript disabled
- every request other than `data:` URLs is blocked

**Keep Chromium patched**, by rebuilding the image regularly. That also picks up Debian security
updates.

**To keep the sandbox instead**, run the API with a seccomp profile that allows Chromium's
namespaces, and set `CHROME_PATH=/usr/bin/chromium`. On Ubuntu 24.04 you may also have to allow
unprivileged user namespaces in AppArmor. This has not been tried here.

**Without Chromium**, the PDF endpoints answer 503 `pdf_unavailable`. CI renders a test PDF in
the built image as the `node` user, to catch a broken image.

## Edge Agents and the mobile app

**Edge Agents** run at each factory or office and forward ZKTeco and Hikvision punches. See
[`apps/edge-agent/README.md`](../../apps/edge-agent/README.md) for installation as a service or
in Docker, and for device setup. For a production site:

1. Register the agent in the workspace (Attendance → Devices). Copy the `gpe.…` token, which is
   shown once.
2. Set `GP_API_URL=https://<GP_API_DOMAIN>`, the token, and `GP_TIME_ZONE` if the device clocks
   are not on `Asia/Dhaka`.
3. Give the agent PC a fixed LAN address.
   - Devices reach it on port 8081 on the LAN only. Never forward 8081 from the internet.
   - The agent needs only outbound HTTPS to `GP_API_DOMAIN`.
4. Check it: `curl http://<agent-ip>:8081/health` on site, and the device list in the workspace.

**The mobile app** is built per environment:

```sh
flutter build apk --dart-define=API_BASE_URL=https://<GP_API_DOMAIN> --dart-define=APP_ENV=prod
```

See `apps/mobile/README.md`.

## Monitoring

**Health checks.**

- **API.** `GET /health` returns `{"status":"ok","db":"up"}` after a `select 1`. It is the API
  image's Docker health check. Check it from outside too:
  `https://<GP_API_DOMAIN>/health`.
- **Web.** The web image checks `/login`. Watch `https://<GP_DOMAIN>/login` from outside.
- **Readiness.** `GET /ready` returns 200 with `{"status":"ready","checks":{...}}` when:
  - the database answers
  - the document store takes, returns and deletes a small probe file (under `status/probe/`)
  - Chrome or Chromium is installed (it is not started)

  Otherwise it returns 503 with `"status":"not_ready"` and `ok` or `failed` for each check:
  never a host, a path or an error message. Results are cached for 5 seconds. Point an uptime
  monitor or a load balancer at it. Keep `/health` as the container health check: a document
  store outage should not restart the API.

- **Containers.** `gp ps` shows the health of each container.

**Status page.** `https://<GP_DOMAIN>/status` is public, in English and Bangla. Workspace pages
and the sign-in page show a banner for open incidents and for maintenance under way or starting
within 24 hours.

- **Automated checks.** With `BACKGROUND_JOBS=on`, the API checks every minute:

  | Part          | Check                                                                          |
  | ------------- | ------------------------------------------------------------------------------ |
  | API           | `select 1` and its time                                                        |
  | Documents     | a probe file in the document store, and that Chromium is installed             |
  | Web           | `GET STATUS_WEB_URL` (default `WEB_ORIGIN/login`) within 5 s; 2xx or 3xx is ok |
  | Notifications | the outbox job swept successfully within the last 2 minutes                    |
  | Attendance    | attendance processing ran successfully within twice its interval               |
  | Payments      | none: post an incident when a gateway is down                                  |

  The web check goes through Caddy, as customers do, unless `STATUS_WEB_URL` says otherwise.

- **States.** One failed check makes a part _degraded_; three in a row, a _partial outage_. An
  open incident sets its impact. Maintenance shows only inside its window, and as upcoming
  before it. Each day's bar shows the share of checks that passed and the worst incident.
- **History.** Checks are kept 7 days and daily totals 90 days. The details of a failure appear
  only in the console, never on the public page.
- **Incidents and maintenance.** Post them in the console under **Status**, in English and
  Bangla, with the parts affected. Post updates as you go, and resolve or complete them there.
  Staff with the `platform_ops` or `support` role can do this, as can the Super Admin.
- **Operations.** The console's **Operations** page shows the latest check of each part, with
  its time and why it failed, a fresh readiness result, and the backups.

**Logs.** `gp logs -f api` (likewise `web` and `caddy`).

- **API logs are JSON lines** (`LOG_FORMAT=json`, the production default): one line per request
  with its `requestId`, method, route pattern, status, duration, workspace and client address,
  and Nest's own messages in the same form. `LOG_FORMAT=pretty` gives readable lines.
- **What is never logged:** request bodies, query strings, tokens, passwords, sign-in codes and
  identity numbers. The anonymous speak-up pages are logged without the client's address, in
  the API and in Caddy (ADR 015).
- **Finding a request:** every error a person sees carries a reference, which is the
  `requestId` of its log line (and the `x-request-id` response header).
- Caddy writes JSON access logs without query strings or the Authorization, Cookie and Referer
  headers.
- Docker keeps 5 × 10 MB per container.

Ship them to your log service if you have one.

**Alert on:**

- `/health` failing, or the containers `api` or `web` restarting or unhealthy
- API log lines with `"level":"error"`, especially:
  - `Attendance processing failed for`
  - `Completing separations failed for`
  - `Sending notifications failed for`
- 503 `pdf_unavailable`, or PDF errors
- many 429 responses: sign-in rate limits are being hit
- `/ready` returning 503
- the backup cron exiting non-zero, or no new directory in `BACKUP_DIR` for 26 hours, or the
  API log line `No successful backup in 26 hours`
- a failed monthly `verify-backup.sh`
- disk use above 80% on the data volume: documents, backups, `pgdata` and Docker logs
- certificate errors in Caddy's log, or a certificate within 14 days of expiry
- sites whose Edge Agent heartbeat or punches have stopped. Watch the devices page; `/health`
  on the agent shows the queue and the last upload.

## Data protection in Bangladesh

The vault holds identity documents, and the database holds NID and bank account numbers.

- **The API encrypts both** before storage, so a copied disk or bucket alone is not readable.
- **The rules are still settling** ([ADR 006](../adr/006-documents-and-pdfs.md)). A Bangladeshi
  personal data protection law may require some data to stay in the country, or to be copied
  there. Confirm the current position with counsel before choosing where to host.
- **A BD-hosted option.** The stack needs only a Linux VM with Docker. Run it in a data centre
  or on a cloud provider inside Bangladesh, with `STORAGE_DRIVER=local` (or an in-country S3)
  and in-country off-site backups.
  - The defaults are not in Bangladesh: `S3_REGION=ap-south-1` is Mumbai.
  - A managed database abroad moves the data abroad.
- **Keep the key in-country too**, and limit who can read `infra/.env` and the backups.
  `backup.sh` makes them readable by root only.
- **SMS and push.** Sign-in codes go through SSL Wireless, a Bangladeshi SMS gateway. Push goes
  through Firebase (Google).

## Known gaps

Things production needs that the code does not provide yet. They are listed here rather than
worked around.

**Setup and operations**

- **`setup` always creates `<database>_test`** as well. It also does not create the backup
  role, which is done by hand above.
- **`/ready` is shallow.** It checks the database, the document store and that Chromium is
  installed. It does not start Chromium, send email or SMS, or reach the payment gateways.
- **No metrics endpoint.** Logs are JSON lines with request IDs, but there is no Prometheus
  endpoint; count from the logs.

**Scaling**

- **Background jobs and rate limits live in one process.** There is no leader election and no
  shared rate-limit store. So: one API process (see [Background jobs](#background-jobs)).
  The kiosk PIN budgets and the record that each two-step code was used once live in its
  memory too, so a restart forgets them.

**Secrets and backups**

- **No key rotation.** `FIELD_ENCRYPTION_KEY` has no re-encryption job, and
  `JWT_ACCESS_SECRET` cannot overlap two secrets.
- **Up to a day of data can be lost.** Backups are daily logical dumps, with no point-in-time
  recovery for the bundled database.
- **Off-site copies are not encrypted by the scripts.** Documents and identity numbers inside
  them are (with `FIELD_ENCRYPTION_KEY`), but the rest of the database is not: send them only
  to an encrypted destination you control.

**Images and deployment**

- **The web image is large.** `next.config.ts` has no `output: 'standalone'`, so the web image
  carries about 350 MB of node_modules.
  - Recommended follow-up: set `output: 'standalone'`, with `outputFileTracingRoot` pointing
    at the monorepo root so the workspace packages are traced.
  - Then the image copies `.next/standalone` plus `.next/static`, and runs the traced
    `apps/web/server.js` instead of `next start`.
- **No image registry.** CI builds and smoke-tests the images but does not push them, so
  servers build their own. A release workflow that pushes tagged images would make deployments
  and rollbacks faster and identical.
- **The `minio` profile uses the S3 keys as MinIO's root credentials.** Its `latest` tags are not
  pinned. MinIO's free community images have not been reliably maintained; pin a vetted tag, or
  prefer `local` storage or a managed bucket.
- **Not tested here:**
  - the managed-database variant
  - the S3 branches of the backup scripts
  - MinIO
