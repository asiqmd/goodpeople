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
      their QR codes; the SMS gateway working for PIN codes, which are sent whatever the
      workspace's SMS switch (each worker's mobile number on their record). Use a kiosk
      browser that shows PDFs on the page: Android's Chrome saves payslips to the tablet's
      downloads, where the next worker could open them (see phase-3.md).

## 8. An NGO or a group of companies (Phase 3)

Before an NGO charges salaries to donors from Good People (Finance, HR, programme managers):

- [ ] Counsel confirms the Foreign Donations Act rules marked for review in the Bangladesh
      pack: the 20% administration cap, and how a multi-year project's approved expenditure
      is read.
- [ ] **Projects:** every donor-funded project entered with its grant reference, FD-6
      approval number and date, period, approved expenditure and staff budget.
- [ ] **Shares:** each person's planned split entered from the start of the month that goes
      live, and checked against the budget sheet the donors approved.
- [ ] **Timesheets:** staff charged to projects know they submit one a month, and their
      managers know to approve them in the inbox. Field staff have the app, with the month
      opened once online so it works offline.
- [ ] **One month in parallel:** the journal's Project column and the personnel cost schedule
      match the finance team's own allocation for that month, or each difference is
      explained.
- [ ] Finance knows the month's split is final once its payroll is locked: timesheets are
      approved before the run is locked.

Before a group runs shared-service HR (HR, IT):

- [ ] **Company overrides:** each company's differences from group policy entered on the
      Group → Policies page (leave, app punching, provident fund, overtime caps), with what
      the union or buyer agreed.
- [ ] **Limited logins:** each shared-service HR login limited to the companies it looks
      after on the Users page, then signed in once to check it sees only those people.
      Payroll is not limited by company: payroll logins see every company's pay.

## 9. Support and status (Phase 3 M5)

Before a customer's workspace relies on Good People (their admin, our Support):

- [ ] The workspace admin and the HR and payroll leads know where **Support** is, what
      counts as urgent, and that every error shows a reference to paste into a ticket.
- [ ] They know the response targets for their plan, counted in support hours (Sunday to
      Thursday, 9:00 to 18:00 Dhaka time), from the help centre's contact-support page.
- [ ] The admin knows how to let support in (Support → Support access), read-only and for at
      most seven days, and how to revoke it; and that we never look inside without it.
- [ ] They have the status page (`/status`) bookmarked, and know that open incidents also show
      as a banner in the workspace.
- [ ] The billing contact's email is right, because invoices and support replies go there.

## 10. Recruitment (Phase 4)

Before a company hires through Good People (HR, its counsel):

- [ ] **Careers page settings:** the introduction in both languages, the retention period
      (12 months unless the company's policy says otherwise), and a privacy contact address
      someone reads. Counsel checks that the consent text on the apply form matches the
      company's privacy notice.
- [ ] **Hiring managers and interviewers** have logins and an employee record, so they are
      on approvals, panels and scorecards. Their own line managers are set, since openings go
      to them for approval before HR.
- [ ] **Scorecard criteria** agreed per kind of job, so interviewers rate the same things.
- [ ] **Offer letters:** each company's legal name and address are right (Organization), and
      HR has read an English and a Bangla offer letter before the first one is sent.
- [ ] **Salary structures** that work from a gross amount exist for the jobs hired into, so
      the offered pay is proposed in payroll at hire.
- [ ] The appointment letter template (Letters) is ready for the joining day, as the Labour
      Act requires (s.5); the accepted offer does not replace it.

## 11. Performance (Phase 4)

Before a company runs its first review cycle (HR, its managers, its counsel):

- [ ] **Managers are set:** everyone in the cycle has a current job with a manager. Launching
      gives each review to the manager on that day; a person without one waits for HR.
- [ ] **Who reviews themselves:** people with logins write a self review; workers without
      logins are reviewed by their manager alone. Decide which lines get logins before launch.
- [ ] **Competencies and the ratings guide** (Performance settings) are agreed with
      management in both languages, and managers are told the guide is never a quota.
- [ ] **Goals are agreed** before the self review date, with weights adding up to 100%. KPIs
      read from the records only where attendance (and, in a factory, daily production with
      targets) is processed every day.
- [ ] **Peer feedback** is turned on only where people have at least three peers to ask;
      with fewer, only the manager and HR read it.
- [ ] **Calibration** is booked before the release date, with each unit's managers, and the
      outcomes file goes to whoever runs the increment round.
- [ ] **Improvement plans:** counsel confirms the plan's legal note (Labour Act s.23–24 for
      misconduct, s.26 for other termination) before HR starts one; managers know a plan never
      ends anyone's employment by itself.
- [ ] **Probation end dates** are right on people's jobs, so managers are asked for probation
      reviews three weeks before (s.4).

## 12. Compensation planning (Phase 4 M3)

Before the first increment round (HR, finance and labour counsel):

- [ ] Agree monthly gross grade ranges, the increment matrix and the company/unit budgets.
      Budgets are additional monthly gross cost, not the entire salary bill.
- [ ] Finish and release the source reviews. Confirm current managers and company scopes;
      managers see only direct reports and cannot propose their own pay.
- [ ] For an RMG annual round, counsel confirms the effective-dated basic increment rule and
      eligibility; HR verifies prior increments, including those outside planning rounds.
- [ ] Reconcile submitted proposals and budget subtotals before sending. If source pay or jobs
      changed, cancel and rebuild; no part of a failed export is saved.
- [ ] Finance knows that each exported pay change needs a second person's approval, even if
      ordinary one-person payroll is enabled. Verify the effective date and the next run.
- [ ] Keep promotions as separate approved job changes. Rejected or withdrawn pay proposals
      are reconsidered in a new round, without editing the exported round.

## 13. Learning (Phase 4 M4)

Before required training is relied on (HR and the safety lead):

- [ ] Agree bilingual course descriptions, renewal periods and required courses by company
      and designation. These policies do not replace applicable legal or buyer requirements.
- [ ] Confirm current jobs/managers and company scopes, then check an HR officer, manager and
      employee view. Workers without logins remain in HR's coverage and attendance records.
- [ ] Schedule sessions in Dhaka time, check trainer/venue/capacity and keep the signed register.
      HR records all attendees and absences only after the session ends.
- [ ] Sample an EN/BN completion PDF and its expiry. Know how to revoke an incorrect record;
      a revoked or expired certificate cannot satisfy required training.
- [ ] Confirm reminder channels and notification links in web/mobile. Employee enrolment and
      withdrawal close at the session start; HR can enter historical attendance.
- [ ] The safety lead confirms the site's drill interval, licence and buyer conditions, and
      maintains required registers/notices. Record findings, corrective actions and next date;
      no automatically generated label declares a site legally compliant.
- [ ] Compare buyer-audit training coverage at the period end with the records. Validate company
      and site filters, and retain the report alongside physical evidence where required.

## 14. Engagement and employee services (Phase 4 M5)

Before opening these services to employees (HR and the workspace admin):

- [ ] Check company scopes and HR handler roles. Managers and platform support must not
      obtain private HR requests; test an employee, a manager and an HR officer from another
      company. Notifications must contain no request subject or message text.
- [ ] Explain anonymous surveys accurately: no individual answers, a frozen company audience,
      at least five responses, results only after closing, and no subgroup reports. Verify a
      below-threshold report stays suppressed. Closing reminders go to the whole audience;
      their delivery logs must not disclose who responded.
- [ ] Provide an appropriate separate channel for workers without logins. Do not enter survey
      answers, policy receipts or asset acknowledgements on their behalf.
- [ ] Approve both languages of each policy notice before publication. Explain that receipt
      records reading, not agreement to changed employment terms. Check its frozen audience,
      due date and outstanding register; issue a new notice for later joiners or corrections.
- [ ] Explain that recognition is named and company-visible, and confirm the reasoned
      withdrawal/moderation process.
- [ ] Set up HR service handlers and teach public replies versus internal notes. Use the
      existing grievance/harassment channel for those cases. Exercise progress, resolution,
      employee closure and reopening; a status-only change must keep the current handler.
- [ ] Reconcile inventory tags and outstanding issues with physical stock. Sample issue,
      employee receipt, return and retirement; dates and conditions must match the record.
      Asset receipts never automatically deduct salary.
- [ ] Test web/mobile notification links, local-language forms, retry behavior and read-only
      access. Agree how HR will monitor outstanding policy receipts and overdue assets.

## If it goes wrong

The old register stays readable and can be reopened for new entries. Going back is a
decision for the go/no-go group, for a problem that cannot be fixed within two working days.
Good People keeps running read-only so nothing recorded is lost, and the switch back is
announced the same way as the cut-over.

## Phase 6 M1 analytics activation

The 6.1.0-local workforce slice is locally verified; it is not production release approval. Before a real pilot, assign an accountable metric/data reviewer, reconcile the approved companies' historical assignments and definitions, approve the company/relationship roles and explicitly grant analytics with core_hr. Existing plans and installed licenses remain unchanged; self-hosted activation also needs a compatible signed license.

Keep missing/overlapping history visible as incomplete, confirm business clocks and current authority, and use the normal HR workflow for corrections. Current-day counts are provisional. No pay/demographic reports, exported employee data or model provider is enabled by M1. Extend M7 evidence and resolve the carried backup/owner/dependency/independent/provider/host/country gates before production activation. See the [M1 record](../phases/phase-6.md#m1-implementation-record); M2 operating/financial insight is next.
