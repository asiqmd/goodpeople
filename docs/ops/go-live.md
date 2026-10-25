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

## 5. Payroll go-live (Phase 2)

Payroll moves over after attendance and leave have run on Good People for a month. The
**Go-live checklist** page adds three payroll steps (approved pay for everyone, payment
accounts, parallel runs); the rest is below.

### Before the first parallel month

- [ ] **HR:** every active employee has approved pay, on the right structure, wage grade and
      pay group. The checklist shows who does not.
- [ ] **Payroll:** bank and wallet accounts are entered for everyone not paid in cash, with
      split amounts where pay is divided. Wallet payments over Tk 5 lakh are flagged.
- [ ] **Payroll:** go-live openings for the income year so far: salary and tax paid before,
      provident fund balances, loans still being recovered.
- [ ] **Finance:** the ledger accounts in Payroll settings match the chart of accounts, and
      every unit has a code (it is the cost centre in the journal).
- [ ] **Legal and tax:** the labour lawyer has reviewed the separation, gratuity and WPPF
      rules, and the tax consultant the income years in use. Both are marked `needs_review`
      in the country pack until then.
- [ ] **Golden tests:** at least one anonymised person-month per pay structure from the
      current payroll is added to `apps/api/src/modules/payroll/golden/` (see its README) and
      passes, or its difference is explained.

### Three parallel months

Each month, the current payroll still pays people. Good People runs alongside:

1. Process attendance, compute each pay group's regular run, and review its problems.
2. Export the current payroll's sheet for the same month (Excel or CSV, one row per person).
3. On the run's page, upload it under **Register and parallel run**, match the columns
   (codes, gross, net, tax, overtime, days) and compare.
4. Explain every difference: our data (fix it and compute again), the old payroll (note it),
   or a rule (raise it with counsel or the tax consultant). Compare again until every pay
   group matches to the taka.
5. Lock the run. Do not publish payslips or send payment files while the old payroll pays.

- [ ] Month one matched for every pay group.
- [ ] Month two matched.
- [ ] Month three matched. The **Parallel runs** page shows three months in a row: payroll
      can go live.

### Cut-over

- [ ] The go/no-go group signs off on the three months and the open differences (none).
- [ ] The first live month: compute, approve, lock, then publish payslips, send the bank and
      wallet files, print the cash sheet (Form 38), record the payment date and post the
      journal. Deposit the tax and record the challan.
- [ ] The old payroll is kept read-only for at least a year for reference.

## 6. Taking payments (Phase 3)

Before the first workspace is invoiced for real money (Finance, IT, the tax consultant):

- [ ] The tax consultant confirms the VAT service code (S099.10 at 5% or S099.20 at 15%)
      and the values marked for review in the Bangladesh pack's VAT rules. If Good People
      is registered with NBR as a startup, tick the exemption in the settings.
- [ ] **Platform console → Billing → Settings:** our legal name, address, BIN and TIN as
      registered, the bank account for transfers, the days to pay and the grace days. The
      development seed's sample values must not survive.
- [ ] **Prices:** each plan's staff seat, worker seat and minimum, from the day they apply.
- [ ] **Gateways (IT):** `API_ORIGIN` set to the public API address; the SSLCommerz store id
      and password, and the bKash app key, secret, username and password, in the secrets
      store. `SSLCOMMERZ_SANDBOX=off` and the live `BKASH_BASE_URL` only after a sandbox
      payment, a failed payment and a cancelled one have been tried end to end.
- [ ] `BILLING_FAKE_GATEWAY` is unset. With it on, anyone can mark an invoice paid.
- [ ] The SSLCommerz merchant panel's IPN address is `<API_ORIGIN>/billing/notify/sslcommerz`.
- [ ] One test workspace chooses a plan, is invoiced, and pays a small amount by card and by
      bKash. The Mushak-6.3 PDF is checked against a printed form, in both languages.

## 7. A factory on the RMG pack (Phase 3)

Before a garment factory relies on the pack (HR, Compliance, IT):

- [ ] The labour lawyer signs off the rules marked for review in the Bangladesh pack, above
      all the 2025–26 amendments (maternity days, union thresholds, the complaint committee).
- [ ] **Compliance → Settings:** the overtime caps the factory and its buyers have agreed.
- [ ] **Adolescents:** each worker under 18 has a certificate of fitness uploaded (category
      "Certificate of fitness", with its expiry); the Adolescents page shows none missing.
- [ ] **Women at night:** consent recorded for every woman rostered between 10 pm and 6 am.
- [ ] **Committees:** the complaint committee formed (five members, a woman chairing, women
      the majority) and, from 50 workers, the participation and safety committees with their
      last meetings; unions recorded with their members' consent to check-off.
- [ ] **Production:** operations and rates entered, and the structure of piece-rated workers
      checked against one month paid the old way.
- [ ] **Grievances:** the Speak up poster printed in Bangla and English and put up where
      workers pass; at least one complaint committee member has a login.
- [ ] **Kiosks:** each tablet registered and pinned to `/kiosk`; ID cards printed again with
      their QR codes; SMS turned on for the workspace, with credits for PIN codes. Use a kiosk
      browser that shows PDFs on the page: Android's Chrome saves payslips to the tablet's
      downloads, where the next worker could open them (see phase-3.md).

## If it goes wrong

The old register stays readable and can be reopened for new entries. Going back is a
decision for the go/no-go group, for a problem that cannot be fixed within two working days.
Good People keeps running read-only so nothing recorded is lost, and the switch back is
announced the same way as the cut-over.
