# Phase 1: Core HR, leave & attendance

**Goal:** our own organizations run attendance and leave on the platform for 2 consecutive
months, and at least 2 external design partners are live.

Phase 1 ships in five milestones. Each one is merged only when its tests pass and it has
been walked through in the browser.

| Milestone                                    | Scope                                                                          | Depends on | Status |
| -------------------------------------------- | ------------------------------------------------------------------------------ | ---------- | ------ |
| **M1 Org & employees**                       | Org structure, employee master, job history, roles, encrypted identity fields  | Phase 0    | Done   |
| **M2 Rules, holidays & leave**               | BD country-pack rules engine, holiday calendars, leave and approvals           | M1         | Done   |
| **M3 Attendance**                            | Shifts, punches, Edge Agent, daily processing, regularization                  | M1, M2     | Done   |
| **M4 Lifecycle & documents**                 | Lifecycle events, documents vault, letters, ID card, service book, bulk import | M1         | Done   |
| **M5 Notifications, self-service & go-live** | EN/BN templates, phone OTP, mobile v1, hardening                               | M2–M4      | Done   |

**Carried into later milestones from M1:**

- ~~API error messages are English only~~: the web and mobile apps translate them from their
  `code` in M5 (field-level messages are still English).
- ~~Back-dated job corrections~~: done in M4.
- **Upazilas are free text** until the full gazetteer is added to the BD country pack (M2).

**Carried into later milestones from M3:**

- ~~Selfie punches~~: done in M4, with the documents vault.
- **Adolescent working hours** (Labour Act s.41) are not flagged yet; they come with the RMG
  pack's adolescent controls (Phase 3).
- **Overtime caps** are flagged (over 10 hours a day, weeks over 60 hours) but not blocked.
- **Payroll lock:** processed days can still be recomputed; payroll (Phase 2) adds locking.
- **Edge Agent:** tested against simulated ZKTeco ADMS and Hikvision traffic, not real
  devices yet. ZKTeco "PUSH 3" registration and Hikvision's older XML events are not handled.
- ~~Forms clear after a refused submit~~: they keep the entered values since M5.

**Carried into later milestones from M4:**

- ~~Notifications~~ for expiring documents, probation ending and resignations: done in M5.
- **Final settlement** (dues, wages in lieu of notice, gratuity, the resignation benefit) is
  payroll's job (Phase 2). M4 records the separation and the notice shortfall.
- **Legal entities have no Bangla name** yet, so letterheads stay in English.
- **The S3 driver** is tested against a stand-in S3 server, not MinIO or AWS itself.
- **Pay** is not in letters yet: an appointment letter asks for wages as an extra field until
  pay structures arrive (Phase 2).

## M1: Org structure & employee master

### Org structure (inside a tenant)

- **Legal entities:** registration, TIN and BIN.
- **Locations:** head office, factory, branch, field office; a geofence for later punches.
- **Org units:** a department → section → line → team hierarchy, per legal entity.
- **Designations, grades and cost centres.**
- Donor projects move to the NGO pack (Phase 3).

### Employees

- **Employee master with Bangladesh fields:**
  - names in English and Bangla, and parents' and spouse's names
  - date of birth: minimum age 14, with adolescents (under 18) flagged
  - religion, which drives festival bonuses later
  - blood group
  - present and permanent addresses on the division → district → upazila hierarchy
  - emergency contact
- **Identity numbers:** NID, birth registration, passport and TIN.
  - Encrypted at the application level with AES-256-GCM.
  - A keyed hash keeps NIDs unique per tenant without storing them in plain text.
- **Effective-dated job history:**
  - Events: hire, confirmation, transfer (including inter-company, keeping continuous
    service), promotion, increment, redesignation, change.
  - Each row records legal entity, location, org unit, designation, grade, cost centre,
    manager, employment type (the BLA classes) and worker category.
- **Nominees** (shares must total 100%) and **payment accounts** (bank or bKash/Nagad/Rocket),
  with account numbers encrypted.
- **Portal access** is optional at hire: it creates a workspace login linked to the employee.
- **Limits:** hiring respects the tenant's `max_employees` limit.

### Roles

- `tenant_admin` and `hr_admin` manage the org and employees.
- `employee` sees their own record (`/tenant/me/employee`).

### Data safety

- Every new table has `tenant_id` with forced row-level security.
- References between tenant tables use composite `(tenant_id, id)` foreign keys, so the
  database rejects a reference to another tenant's record even when its id is known.

### Done when

- The API end-to-end tests cover hiring, effective-dated changes, encryption at rest, roles,
  cross-tenant references and limits.
- HR can run the org setup and hire → change → view flow in the web app in English and Bangla.
- The mobile app shows the signed-in employee's profile.

## M2: Rules engine, holidays & leave

### Rules engine (`packages/country-packs`)

Statutory rules are data in code, reviewed by pull request like any other change. Each rule
has versions, and each version carries:

- **effective dates:** from, and to when superseded
- **its legal reference:** act and section
- **a review status:** `verified`, or `needs_review` when sources conflict or the gazette has
  not been checked

`ruleOn(key, date)` returns the version in force on a date.

**Statutory rules are a floor; companies can be more generous.**

- A leave type's own settings apply when they are better for the worker.
- Settings below the statutory minimum are refused, quoting the section.

**Bangladesh rules in M2:**

| Rule                       | Value                                                                        | Reference  |
| -------------------------- | ---------------------------------------------------------------------------- | ---------- |
| Casual leave               | 10 days a year, not carried forward                                          | BLA s.115  |
| Sick leave                 | 14 days a year, not carried forward                                          | BLA s.116  |
| Annual leave earning       | 1 day per 18 days worked; factories 1 per 14 from 17 Nov 2025 (needs review) | s.117      |
| Annual leave eligibility   | after 1 year of continuous service                                           | s.117      |
| Annual leave carry-forward | up to 40 days (needs review)                                                 | s.117      |
| Maternity leave            | 112 days, then 120 from 17 Nov 2025 (needs review); 6 months' service        | s.46, s.47 |
| Festival holidays          | 11 days, then 13 from 17 Nov 2025 (needs review)                             | s.118      |

### Holiday calendars

- **Setup:** each workspace has calendars, and each location picks one plus its weekly off
  days (Friday by default).
- **Kinds:** a holiday is public, festival, optional or company. Lunar dates can be marked
  **tentative** until the moon-sighting announcement.
- **Bangladesh template:** imports the fixed national days plus estimated Eid, Puja and other
  lunar dates for a year, all estimates marked tentative.
- **Compliance check:** a calendar shows a warning when it has fewer festival days than the
  Labour Act requires.
- **Recalculation:** moving, adding or removing a holiday recalculates the day count of
  overlapping leave requests. Approved leave gets a balance correction entry; nothing is
  silently rewritten.

### Leave

- **Leave types:** BD defaults are provisioned for every workspace (casual, sick, annual,
  maternity), and HR can add company types. Each type has:
  - its accrual: annual grant, earned per days worked, or per event
  - days, carry-forward cap and minimum service
  - a gender restriction (maternity)
  - whether off days and holidays count (maternity counts calendar days)
  - half days
  - its approval chain
- **Balances are computed, not stored:**
  - entitlement for the year (pro-rated in the joining year; earned leave from the previous
    year's working days)
  - plus carry-forward
  - plus ledger movements (taken, reversals, HR adjustments, recalculations)
  - minus pending requests
  - Until attendance arrives (M3), "days worked" means scheduled working days.
- **Requests:** the day count skips weekly offs and holidays unless the type counts them.
  Requests are refused when they:
  - overlap another request
  - cross 31 December
  - exceed the balance
  - fall short of the minimum service
- **Approvals (first piece of the workflow engine):**
  - Each type has an ordered chain of `manager` and `hr` steps.
  - A manager without a workspace login is skipped, so requests never get stuck; if that
    leaves nobody to decide, an HR step is added (leave is never auto-approved by default).
  - An empty approval chain means the type needs no approval.
  - Nobody decides their own request.
  - Rejection ends the chain.
  - Cancelling approved future leave reverses the balance.
- **Team calendar:** HR sees everyone; others see their unit and direct reports.

### Done when

- **Tests:** unit tests cover rule lookup across the 2025 amendment dates and day counting.
  The API end-to-end tests cover:
  - balances
  - apply → manager → HR approval
  - rejection, cancellation and reversal
  - statutory floors
  - holiday recalculation
  - permissions
- **Web:** employees apply and see balances, managers and HR approve, and HR manages leave
  types and holiday calendars, in English and Bangla.
- **Mobile:** shows balances, applying, my requests and the approvals inbox.

## M3: Attendance

### Rules (`packages/country-packs`)

| Rule                      | Value                                                       | Reference |
| ------------------------- | ----------------------------------------------------------- | --------- |
| Ordinary daily hours      | 8                                                           | BLA s.100 |
| Daily hours with OT       | 10                                                          | s.100     |
| Rest interval             | 30 min after 5 hours of work, 1 hour after 6                | s.101     |
| Weekly hours              | 48; 60 with overtime; 56 average over a year (needs review) | s.102     |
| Overtime rate             | 2 × the ordinary rate (basic + DA + ad hoc/interim)         | s.108     |
| Paid leave as days worked | counted for earning annual leave (needs review)             | s.117     |

A shift may schedule at most 8 hours of work (overtime is worked after it) and must allow the
rest interval; anything else is refused quoting the section.

### Shifts and rosters

- **Shifts** have local start and end times (an early end runs past midnight), a break, grace
  minutes for lateness and early leaving, thresholds for a half and a full day, and overtime
  settings (minimum and rounding block). Every workspace gets a default general shift.
- **Which shift applies on a date:** a roster entry (a shift or a day off), else the
  employee's effective-dated shift assignment, else the default shift.
- **Rotating rosters:** a pattern of shifts and days off repeated over a date range. A rostered
  shift on a weekly holiday makes it a working day.
- Weekly offs and holidays come from the location the employee is assigned to that day (M2).

### Punches

- **Sources:** devices (through the Edge Agent), the web and mobile apps, HR's manual entries,
  and approved corrections. Punches are never deleted; HR voids a wrong one with a reason.
- **App punching** is off, geofenced (default) or anywhere, per workspace. Geofenced punches
  must come from inside the location's radius, allowing for GPS accuracy up to 50 m. A second
  punch within a minute is refused.
- **Devices** know people by their enrolment number. HR records it as the employee's
  attendance PIN; punches from unknown numbers wait as "unmatched" and are claimed when the PIN
  is set.

### Edge Agent (`apps/edge-agent`)

A small Node service at each site, with no third-party dependencies:

- Receives ZKTeco ADMS pushes (`/iclock/*`) and Hikvision ISAPI event notifications.
- Buffers every punch in SQLite before acknowledging the device, so nothing is lost offline.
- Uploads in batches to `POST /edge/v1/punches` with its own revocable token; resends are
  safe because the cloud treats the same device, user and second as one punch.
- Keeps everything queued on 401/403 (revoked token, read-only workspace) and backs off on
  errors; isolates a bad row by splitting the batch.
- Reports its version, queue and devices to `POST /edge/v1/heartbeat`.

### Daily processing

- **Which day a punch belongs to:** up to four hours before the shift, and never past the
  midpoint of the gap to the next shift, so a night shift's morning out-punch stays with the
  night it started.
- **A day's result:** first punch in, last punch out. The break is taken out of anything over
  five hours. Late and early-out minutes count beyond the grace. Overtime is time after the
  shift's end beyond the scheduled hours, in whole blocks; on weekly offs and holidays all
  work is overtime. Over 10 hours is flagged.
- **Statuses:** present, half day, absent, on leave (approved leave), missing punch (one punch
  only), off, pending (the day is not over yet).
- **Computed and stored:** screens compute days from the current inputs, so they are never
  stale. The same computation is stored for reports and payroll: whenever a punch, leave,
  holiday, shift, roster or correction changes, and every 15 minutes in the background (which
  also catches up after downtime). Nothing before the workspace's attendance go-live date is
  processed, so nobody shows absent for days before tracking started.
- **Annual leave** is now earned from days actually worked where attendance is tracked
  (scheduled days before that).

### Corrections (regularization)

- An employee asks to add a missed in or out time, or to count a day on official duty, within
  the workspace's correction window (30 days by default).
- Approved through the same approvals inbox as leave (manager, then HR; the chain is a
  workspace setting). The inbox now holds both kinds of request.
- An approved missed punch becomes a punch marked as a correction.

### Screens

- **Web:** my attendance (punch, month, corrections), team attendance by day, HR setup
  (settings and shifts, shifts and roster, devices and agents, monthly summary), the
  employee's Attendance tab (PIN, shifts, month, punches, manual punch), approvals.
- **Mobile:** today with punching, my month, corrections, approvals of corrections.

### Done when

- Unit tests cover the rules, time zones, day boundaries and day evaluation.
- API end-to-end tests cover device ingestion and deduplication, unmatched punches and PIN
  claims, geofenced punching, manual and voided punches, corrections through approvals, leave
  showing on attendance, shift rules and reassignment, rosters, team scope and the summary.
- The Edge Agent has been run against the API with simulated ZKTeco and Hikvision traffic.

## M4: Lifecycle & documents

### Rules (`packages/country-packs`)

| Rule                | Value                                                                       | Reference |
| ------------------- | --------------------------------------------------------------------------- | --------- |
| Probation           | 3 months; 6 for clerical work; +3 for a skilled worker                      | BLA s.4   |
| Deemed permanent    | working on after probation without a decision                               | s.4       |
| Resignation notice  | permanent 60 days; temporary 30 (monthly-rated) or 14 days (needs review)   | s.27      |
| Termination notice  | permanent 120 days (monthly-rated) or 60; temporary 30 or 14 (needs review) | s.26      |
| Retrenchment notice | 30 days                                                                     | s.20      |
| Retirement age      | 60                                                                          | s.28      |

Staff are treated as clerical for probation, and workers as monthly-rated for notice, until pay
structures say otherwise.

### Lifecycle

- **Probation:** a probationer hired without an end date gets the statutory one. HR confirms
  (the existing confirmation change) or extends it, never beyond the Act's limit. People
  past probation without a decision are flagged as deemed permanent.
- **Separation:** resignation, termination, dismissal, discharge, retrenchment, retirement,
  death or end of contract.
  - An employee resigns from their profile; it goes to their manager, then HR.
  - What HR records stands approved.
  - Each shows the notice the Act asks for and any shortfall.
  - After the last working day it completes, hourly in the background:
    - the employee is separated and their job and shift end;
    - future rosters and pending leave are cleared;
    - their login is disabled and their sessions revoked.
- **Back-dated changes and corrections:**
  - A job change dated before the latest one splits the history at that date.
  - A correction fixes an entry in place.
  - Either way, later entries take the new values unless they had changed those fields
    themselves.
  - Attendance is reprocessed from that date.
- **People events:** probation ending in 30 days, separations in progress, people turning 60
  within six months, and documents expired or expiring within 60 days.

### Documents vault

- **What it holds:** PDFs and images (checked by content, not by name), up to 10 MB, with a
  kind, an issue date and an expiry date.
- **Visibility:** each document is shown to the employee or kept for HR.
- **Encryption:** files are encrypted for their workspace and document (AES-256-GCM) before
  they reach the store: a local directory in development, or S3 / MinIO.
- **Deleting** removes the file and keeps a record that it existed.
- **Selfie punches:** when a workspace requires one, an app punch carries a photo, kept as a
  document and shown with the punch.

### Letters, ID cards and the service book

- **Letter templates:**
  - Six letters in English and Bangla come from the country pack: appointment, confirmation,
    probation extension, transfer or promotion, acceptance of resignation, and certificate of
    service (s.31).
  - HR edits the text and can reset it to the standard.
  - Placeholders (`{{employee.name}}`) fill from the record, in the letter's language.
  - `{{extra.…}}` fields are asked for when issuing.
- **Issuing:** a letter is previewed first, cannot be issued with a placeholder left empty,
  and is numbered per legal entity and year (`MGT/HR/2026/0001`). It is saved as a PDF in the
  employee's documents.
- **ID cards (s.5)** and **the service book (s.6):** PDFs in English or Bangla; employees can
  download their own service book.
- **PDF rendering:** headless Chrome with Noto Sans Bengali embedded, so Bangla conjuncts
  shape correctly. JavaScript is off and network requests are blocked while rendering.

### Bulk import

- HR downloads an Excel template listing the workspace's codes, then uploads it. Every row is
  checked with the same rules as the hire form, plus:
  - duplicates in the file and in the workspace (employee code, NID, PIN)
  - codes that do not exist
  - managers who are not employees yet and not earlier in the file
- Nothing is created until HR imports, all rows or only the valid ones, in one transaction
  within the plan's employee limit.
- The checked rows are kept encrypted for a day.

### Done when

- **Unit tests:** probation and notice rules, file-type checks, template filling, file stores
  (including S3 against a stand-in server).
- **API end-to-end tests:**
  - encryption at rest and what employees may see
  - expiry and deletion
  - resignation through the approvals inbox
  - completing a separation and disabling the login
  - probation limits
  - back-dated changes and corrections
  - letters in both languages with numbering
  - templates, ID cards and service books
  - the Excel import
  - selfie punches
  - isolation between workspaces
- **Web:** HR does all of the above, and employees see their documents and resign, in English
  and Bangla.
- **Mobile:** employees see their documents and service book, resign, and punch with a selfie
  when required; managers approve resignations.

## M5: Notifications, self-service & go-live

### Roles and logins

- **Role templates** are named sets of permissions; routes check permissions, never role names
  ([ADR 007](../adr/007-notifications-and-sign-in.md)):

  | Role               | Can                                                                              |
  | ------------------ | -------------------------------------------------------------------------------- |
  | Workspace admin    | everything, including logins                                                     |
  | HR admin           | all HR, notification settings and the audit log; not logins                      |
  | HR officer         | people (with identity numbers), leave, attendance, documents, lifecycle, imports |
  | Attendance officer | attendance, and the employee list with identity numbers hidden                   |
  | Auditor            | the employee list (identity hidden) and the audit log; changes nothing           |
  | Employee           | self-service, and their team's approvals                                         |

- **Users page:** admins add logins (email and password, or a mobile number for employees),
  link them to employees, change roles, disable logins (signed out at once), and reset
  passwords or two-step sign-in. Nobody changes their own role, and the last active admin
  stays an admin.

### Sign-in and security

- **SMS codes:** employees sign in with a six-digit code sent to their mobile, valid five
  minutes, five guesses, once. The answer never reveals whether a number has a login.
- **Two-step sign-in:** authenticator apps (TOTP) with eight recovery codes. With
  `REQUIRE_ADMIN_MFA=on` (production), admins set it up during their first sign-in.
- **Rate limits** per login and per address on passwords, codes and second steps; the web
  passes each visitor's address on to the API.
- **Headers:** a strict content security policy on the web and the API, HSTS, no framing.
- **Accounts:** everyone changes their own password (other sessions end) and language; the
  language also decides the language of their notifications.
- **Forms keep what was typed** after a refused submit, and API errors show in the reader's
  language from their `code`.

### Notifications

- **Inbox** in the web (a bell with the unread count) and the app.
- **Channels:** email, SMS and push, chosen per event by HR, with SMS off by default and
  counted against the plan's monthly credits.
- **Events:** a request waits for your decision; your request was decided; a document is
  expiring (30, 7 and 1 days before, and on expiry); probation ends within 14 days; a letter
  was issued to you; yesterday has one punch only.
- **Wording:** English and Bangla templates per event, which HR may reword or reset; the SMS
  editor counts messages (160 Latin or 70 Bangla characters).
- **Delivery log** with addresses masked, retries with backoff, and "send again".

### Mobile v1

- Sign-in with a password, an SMS code or a second step; API errors translated.
- Notifications inbox and push (Firebase), registered per device and removed on sign-out.
- **Offline punches:** a punch without a connection is kept on the phone and sent later with
  its own time; the server takes each one once and refuses those over 72 hours old.
- **Team view:** who is in today and who is on leave in the next week, for managers and HR
  (and colleagues in the same unit, as the web's team pages show).
- **Account:** password change (this phone stays signed in), and the app's language is saved
  for notifications. Calls that find the session expired together share one refresh, so a
  busy home screen no longer looks like a stolen token.

### Performance at 5,000 employees

Measured on a MacBook Air (M-series) against the `scale-test` seed: 5,000 employees and
185,250 punches over 19 working days (`apps/api/scripts/measure-scale.mjs`, 20 runs each).

| Call                                       | p50                   | p95     |
| ------------------------------------------ | --------------------- | ------- |
| Employees, a page of 50 / a search         | 5–11 ms               | 7–14 ms |
| One employee                               | 3 ms                  | 4 ms    |
| Attendance, all 5,000 on one day (live)    | 221 ms                | 240 ms  |
| Attendance, a manager's team               | 16 ms                 | 18 ms   |
| Attendance summary, the month (5,000 rows) | 443 ms                | 474 ms  |
| My attendance today; approvals; inbox      | 1–6 ms                | 1–8 ms  |
| Reprocessing the whole month for everyone  | 15.8 s (120,000 days) |         |

The all-staff daily view was 735 ms before M5: computing days looked each person up in the
full lists of punches, jobs and leave. Grouping them once made it three times faster. The
background run every 15 minutes covers two days, about 1.5 s at this size.

### Go-live

- **Go-live checklist page** (`/workspace/setup`): fourteen steps read from the workspace's
  data (company details, geofences, logins, admins' two-step sign-in, devices reporting,
  device numbers, holidays, email and SMS delivery).
- **The internal go-live plan** is in [docs/ops/go-live.md](../ops/go-live.md): four weeks
  of preparation, a parallel month, cut-over and the two months that end Phase 1.
- **Production kit:** Dockerfiles, a Compose stack with Caddy, backups that are verified by
  restoring, `create-super-admin`, and the [runbook](../ops/runbook.md).

### Done when

- **Unit tests:** TOTP against RFC 6238's vectors, recovery codes, SMS segment counting, role
  permissions.
- **API end-to-end tests:**
  - role templates and masked identity numbers
  - logins: phone-only, temporary passwords, self-protection, the last admin, disabling
  - SMS sign-in, unknown numbers, wrong guesses and request limits
  - two-step sign-in, recovery codes, resetting it, and admins required to set it up
  - password limits and changes
  - notifications for requests and decisions, in Bangla with the workspace's wording,
    channel switches, and document reminders sent once
  - offline punches taken once, and refused when too old
  - security headers and the go-live checklist
- **Web:** walked through in English and Bangla: sign-in by SMS code and with a second step,
  account and users pages, notifications (inbox, channels, wording, log), the checklist, and
  a refused form keeping its values.

**Carried into later work from M5:**

- **Field-level validation messages** from the API are still English; the banner above them
  is translated.
- **Rate limits and the dispatcher live in one API process.** Several instances need Redis,
  which arrives with payroll's job queue (Phase 2).
- **The SMS driver** follows SSL Wireless's v3 API and is untested against a live account;
  push is untested against a live Firebase project.
- **Custom roles per workspace** wait for field-level permissions (Phase 5).
- **Docker images** are built and smoke-tested only in CI (Docker is not installed on the
  development machine).
- **Mobile builds:** `flutter analyze` and `flutter test` pass, but no Android or iOS build ran
  here (no Android SDK). iOS push still needs the Push Notifications capability and an APNs key
  in Firebase.
- **The app keeps its session in memory**, so restarting it means signing in again. Queued
  punches survive and are sent at the next sign-in. Secure storage for the refresh token is a
  follow-up.

## After Phase 1

Phase 1 ends when our organisations have run on it for two months
([go-live plan](../ops/go-live.md)) and two external design partners are live. Payroll and
Bangladesh statutory compliance (Phase 2) start from the processed attendance and leave.
