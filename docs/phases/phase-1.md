# Phase 1: Core HR, leave & attendance

**Goal:** our own organizations run attendance and leave on the platform for 2 consecutive
months, and at least 2 external design partners are live.

Phase 1 ships in five milestones. Each one is merged only when its tests pass and it has
been walked through in the browser.

| Milestone                                    | Scope                                                                          | Depends on | Status |
| -------------------------------------------- | ------------------------------------------------------------------------------ | ---------- | ------ |
| **M1 Org & employees**                       | Org structure, employee master, job history, roles, encrypted identity fields  | Phase 0    | Done   |
| **M2 Rules, holidays & leave**               | BD country-pack rules engine, holiday calendars, leave and approvals           | M1         | Done   |
| **M3 Attendance**                            | Shifts, punches, Edge Agent, daily processing, regularization                  | M1, M2     | Next   |
| **M4 Lifecycle & documents**                 | Lifecycle events, documents vault, letters, ID card, service book, bulk import | M1         |        |
| **M5 Notifications, self-service & go-live** | EN/BN templates, phone OTP, mobile v1, hardening                               | M2–M4      |        |

**Carried into later milestones from M1:**

- **API error messages are English only.** The web and mobile apps should translate them from
  the `code` field (M5).
- **Back-dated job corrections** (changing history before the latest change) are not
  supported yet (M4).
- **Upazilas are free text** until the full gazetteer is added to the BD country pack (M2).

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

## Later milestones (outline; detailed when each starts)

- **M3:**
  - Shift and roster masters (night and rotating shifts).
  - Punch ingestion from devices, web and mobile, with geo-fenced selfie punch.
  - Edge Agent for ZKTeco ADMS and Hikvision, with an offline buffer.
  - Daily processing: late, early-out, absent, OT hours.
  - Regularization requests.
- **M4:**
  - Probation, confirmation and separation workflows.
  - Documents vault (S3/MinIO) with expiry alerts.
  - EN/BN letters rendered to PDF in headless Chromium, ID cards and the service book.
  - Excel bulk import with a validation report.
- **M5:**
  - Email, SMS and push notification templates (EN/BN), and phone OTP sign-in.
  - Mobile v1: team view, push and offline queue.
  - Role templates; performance and security hardening.
  - Internal go-live checklist.
