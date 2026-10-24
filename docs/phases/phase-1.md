# Phase 1: Core HR, leave & attendance

**Goal:** our own organizations run attendance and leave on the platform for 2 consecutive
months, and at least 2 external design partners are live.

Phase 1 ships in five milestones. Each one is merged only when its tests pass and it has
been walked through in the browser.

| Milestone                                    | Scope                                                                          | Depends on | Status |
| -------------------------------------------- | ------------------------------------------------------------------------------ | ---------- | ------ |
| **M1 Org & employees**                       | Org structure, employee master, job history, roles, encrypted identity fields  | Phase 0    | Done   |
| **M2 Rules, holidays & leave**               | BD country-pack rules engine, holiday calendars, leave and approvals           | M1         | Next   |
| **M3 Attendance**                            | Shifts, punches, Edge Agent, daily processing, regularization                  | M1, M2     |        |
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

## Later milestones (outline; detailed when each starts)

- **M2:**
  - Country-pack rule store (effective-dated parameters with legal references).
  - BD leave types: casual 10, sick 14, annual accrual, maternity 120 days, festival 13.
  - Holiday calendars with tentative lunar dates.
  - Leave policies, accrual, balances, requests, multi-level approvals (first piece of the
    workflow engine), team calendar.
  - Leave apply/approve on mobile.
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
