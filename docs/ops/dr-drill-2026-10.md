# Restore drill, October 2026

**Date:** 2026-10-27 · **Done by:** the Phase 3 M5 build · **Result:** passed

The first restore drill, run before launch on a development machine. It checks that the
backup scripts produce a backup that restores, decrypts and serves, and measures how long the
restore itself takes at launch size. The monthly drill in production follows
[runbook.md → Backups and the restore drill](runbook.md#backups-and-the-restore-drill), and is
recorded on the console's Operations page.

## What was restored

A scratch database built the way production is: setup, migrations, the seed's workspaces, and
the scale seed's 20,000-person workspace (`scale-20k`) with this month's device punches and
approved pay.

| Measure        | Value   |
| -------------- | ------- |
| Workspaces     | 5       |
| Employees      | 20,017  |
| Device punches | 858,359 |
| Database size  | 324 MB  |
| Dump (`-Fc`)   | 40.8 MB |
| Documents      | 1 PDF   |

One real document (a 53,789-byte PDF) was uploaded through the API before the backup, so the
drill could prove that restored files decrypt with the key.

## Steps and timings

The scripts are the ones production uses (`infra/scripts/`), against PostgreSQL 17 on an Apple
M-series laptop, with local document storage.

| Step                                                                                                  | Time  | Result                                                                       |
| ----------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------- |
| `backup.sh`: dump, checksum, documents, `backup.txt`                                                  | 2.5 s | Recorded in `backup_runs` (ok)                                               |
| `verify-backup.sh`: restore into a scratch database, check, drop it                                   | 6.9 s | All checks passed; key fingerprint matched; recorded (ok)                    |
| `restore.sh --documents` into a new database                                                          | 6.3 s | 5 workspaces, 20,017 employees                                               |
| Start the API on the restored copy, `/ready` 200, sign in to two workspaces and download the document | 1.1 s | database, documents and Chromium ok; the file's SHA-256 matches the original |
| **From starting the restore to a working, signed-in API**                                             | 7.4 s |                                                                              |

The restored copy had the same counts as the source: 20,017 employees, 858,359 punches, and
20,000 people in `scale-20k` as the API listed them.

## Against the four-hour target

The restore itself takes seconds at this size. In production the recovery time is dominated
by everything around it, estimated from [runbook.md](runbook.md):

| Production step                                                    | Estimate      |
| ------------------------------------------------------------------ | ------------- |
| Decide to restore, and announce on the status page or by email     | 15 min        |
| A new VM, Docker and the checkout (first deployment, steps 1 to 3) | 60–90 min     |
| Copy the latest backup from off-site (tens of MB at launch)        | 5 min         |
| `setup`, then `restore.sh --documents`                             | 5 min         |
| Start, check `/ready`, sign in, open a document and a letter       | 15 min        |
| Point DNS at the new server and wait for it                        | 15–60 min     |
| **Total**                                                          | **2–3 hours** |

That is inside the four-hour target, with margin. The data lost is everything since the last
nightly backup: up to a day with the bundled database (see
[launch.md → Limits we launch with](launch.md#limits-we-launch-with)).

## Found on the way

- **A mistyped command.** Running `pnpm --filter @gp/db setup` without `run` starts pnpm's own
  `setup` command (which edits the shell profile), not the database setup. The runbook and
  scripts always use `pnpm --filter @gp/db run setup` or the root `pnpm db:setup`. Use those.
- Nothing in the scripts needed changing.

## Still to do in production

- [ ] The same drill on the production backups, on a separate machine, within the first
      month, timed end to end including the new VM and DNS.
- [ ] Once a quarter, a full restore into staging with the production key, opening a document
      and a letter.
