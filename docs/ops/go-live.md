# Internal go-live checklist

How our own organisations move their attendance and leave onto Good People. Phase 1 is done
when they have run on it for **two consecutive months**. The server side is in
[runbook.md](runbook.md); the workspace side is also checked live on each workspace's
**Go-live checklist** page (`/workspace/setup`), which reads it from the data.

Owners: **IT** (the server), **HR** (the workspace), **Ops** (devices and the app),
**Legal** (rules and letters).

## 1. Four weeks before

### The server (IT)

- [ ] Production is installed from the runbook: Caddy with TLS, the API, the web app and
      PostgreSQL. `REQUIRE_ADMIN_MFA=on`, `TRUST_PROXY=1`.
- [ ] Backups run nightly. **A restore has been tested** into a scratch database with
      `verify-backup.sh`, including documents.
- [ ] `FIELD_ENCRYPTION_KEY` and `JWT_ACCESS_SECRET` are stored outside the server, in the
      password manager. Losing the field key makes NIDs and documents unreadable.
- [ ] The first super admin was made with `create-super-admin` (not the demo seed), and has
      set up two-step sign-in.
- [ ] Email goes out through a real mail server (`EMAIL_DRIVER=smtp`). SPF and DKIM are set
      for the sending domain, and a test notification reached an outside mailbox.
- [ ] SMS: the gateway account is open and its **sender ID (masking) is approved**. BTRC
      approval can take weeks, so start early. A sign-in code reached a Grameenphone, a Robi
      and a Banglalink number.
- [ ] Push: a Firebase project exists, its service account is set in `FCM_*`, and the app
      build carries the matching `FIREBASE_*` defines.
- [ ] Monitoring: something checks `/health` every minute and alerts someone.

### The workspace (HR)

- [ ] **Assign company** created the workspace as `internal`, with every legal entity.
- [ ] The **Go-live checklist** page is all green or explained:
  - company details (TIN, registration), locations with geofences, departments, designations
  - employees imported and checked against the current register (count, codes, joining
    dates, NIDs)
  - shifts and rosters
  - holidays for the year, with lunar dates marked tentative
  - leave types
  - logins for the HR team; every admin uses two-step sign-in
- [ ] **Opening leave balances** are entered for everyone (the leave already taken this
      year, as an adjustment with a note).
- [ ] Managers are set on every job, so approvals reach a person and not only HR.
- [ ] Notification channels and wording are reviewed in Bangla and English.

### Devices and the app (Ops)

- [ ] The Edge Agent runs at every site, as a service that starts by itself, and the
      Attendance devices page shows each device seen in the last day.
- [ ] Every employee's **device number (PIN)** is set; the "unmatched punches" list is empty.
- [ ] The mobile app is in the hands of a pilot group (Play Store internal testing or an APK
      from the release pipeline): sign-in by SMS code, punching, leave and approvals work.

### Rules and letters (Legal)

- [ ] The BD country pack's rules marked `needs_review` are reviewed by the labour lawyer:
      leave entitlements, notice periods, working-hour limits. Changes go in as new
      effective-dated versions, never edits.
- [ ] The six standard letters are reviewed in both languages and adapted to our letterhead.

## 2. The parallel month

Run Good People **alongside** the current process for one full month. Nothing changes for
employees yet except that they also punch and apply in the new system.

- [ ] Every day, HR compares yesterday's attendance (present, absent, late, overtime) with
      the current register and logs each difference with its cause: a missing PIN, a wrong
      shift, a holiday, a rule.
- [ ] Every week, fix the causes, not the numbers: configuration first, then corrections.
- [ ] At month end, the monthly attendance summary matches the register for every
      employee, or each difference has a known reason that the old register got wrong.
- [ ] Leave balances match the leave cards.
- [ ] HR, managers and a few workers on each floor are trained, with the Bangla quick guide.

## 3. Cut-over

Go on the first day of a month, never mid-month.

- [ ] Go/no-go meeting with HR, Ops and IT: the parallel month's differences are all
      explained, the restore test is less than a month old, the support rota is set.
- [ ] Announce the date to employees in Bangla and English: how to sign in, how to punch,
      whom to call.
- [ ] Freeze the old register for new entries from the cut-over date (keep it readable).
- [ ] Support rota for the first two weeks: one HR person and one IT person reachable during
      every shift, including night shifts.

## 4. The first two months

Review weekly, then monthly. This is Phase 1's exit test.

| Measure                                 | Where                       | Target                     |
| --------------------------------------- | --------------------------- | -------------------------- |
| Days with a missing punch               | Attendance summary          | Under 2% after week two    |
| Unmatched device punches                | Attendance devices          | Zero at each week's end    |
| Corrections requested                   | Approvals, corrections      | Falling week by week       |
| Approvals waiting more than two days    | Approvals inbox             | None                       |
| Failed notifications                    | Notifications, delivery log | Under 1%; each one checked |
| Sign-in problems reported               | Support log                 | Falling; none unresolved   |
| Leave and attendance used without paper | HR's judgement              | All sites by month two     |

- [ ] Month one closed on Good People with no fallback to the old register.
- [ ] Month two closed the same way. **Phase 1 internal go-live is done.**

## If it goes wrong

The old register stays readable and can be reopened for new entries. Going back is a
decision for the go/no-go group, for a problem that cannot be fixed within two working days.
Good People keeps running read-only so nothing recorded is lost, and the switch back is
announced the same way as the cut-over.
