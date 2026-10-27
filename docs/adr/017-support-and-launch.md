# ADR 017: Support sees a workspace only by its consent; status and help come from the product itself

**Status:** accepted for Phase 3 M5 · 2026-10-27

## Decision

### Support tickets

**Tickets are platform records about a workspace.**

- **Where they live:** tickets, their messages and attachments sit in platform tables beside
  the invoices, without row-level security, because our support staff work across workspaces.
- **Filtering:** every workspace-facing read filters by the signed-in workspace. Another
  workspace's ticket is "not found".
- **Names are copied:** a ticket copies the opener's name and email, and each message its
  author's name, so the console never reads inside a workspace to show a ticket.

**Who writes.**

- **Workspace staff:** any staff role may open a ticket and see its own. The workspace admin
  (`support.manage`) sees all of the workspace's tickets.
- **Employees:** they go to their own HR, as everywhere else in the product.
- **Read-only workspaces** can still open and answer tickets: a workspace that stopped paying
  must still be able to reach us.

**Internal notes never leave the console.**

- Support may answer publicly or add an internal note.
- Internal notes and their files are never returned to the workspace or emailed.
- Who is assigned is not shown to the workspace.

**First-response targets are counted in support hours.**

- **Hours:** Sunday to Thursday, 9:00 to 18:00 Dhaka time, the Bangladeshi working week.
- **Targets:** they depend on the plan and on whether the ticket is urgent
  (`FIRST_RESPONSE_HOURS`). The due time is fixed when the ticket is opened, and recomputed
  only if its priority changes before the first answer.
- **Overdue:** a ticket is overdue when it has no first answer by then. The queue puts urgent
  and overdue tickets first.

**A ticket's life.**

- **Open:** it waits on us.
- **Waiting for the customer:** after a public answer.
- **Solved:** support's or the customer's call. A customer reply reopens it; otherwise it
  closes after seven days.
- **Closed:** final. A new problem is a new ticket.

**Attachments are checked by their bytes and stored like documents.**

- **Checks:** the type comes from the file's own bytes, never from the browser or the name,
  and each type has a size limit.
- **Storage:** files are encrypted with the field key in the document store.
- **Downloads:** they are always served as attachments.

**The error reference ties a ticket to a log line.**

- **On every response:** every API response carries a request ID (`x-request-id`), and every
  error body carries it as `requestId`.
- **On the page:** errors show it as a reference with a "Contact support" link, which opens a
  new ticket with the reference and the page filled in.
- **In the log:** the API logs one JSON line per request with the same ID.

### Consented support access

**Support never looks inside a workspace without the workspace's consent.**

- **The grant:** the workspace admin grants access for one to seven days, for a ticket or in
  general. It can be revoked at any time.
- **Who uses it:** any of our support staff may use a running grant, from the console.
- **Without a grant:** there is no way in. The super admin's console shows a workspace's plan
  and billing, never its records.

**Support signs in as a read-only login of the workspace, made for the purpose.**

- **The login:** per support person and workspace, the API keeps a login with the `support`
  role, named after the person. It has no password, cannot receive sign-in codes, never
  appears among the workspace's users, and is never anyone's approver or a notification
  recipient.
- **The session:** opening the workspace issues it a normal session. Its access token lives 15
  minutes, and its refresh session ends at the grant's end or after eight hours, whichever
  comes first.

**Every request is checked against the consent.**

- **Every request** from a support login needs an open session on a running grant. Revoking
  the grant, ending the session or signing out takes effect on the next request.
- **Writes:** every request other than GET or HEAD is refused (`support_read_only`), even on
  routes that stay writable while a workspace is read-only.
- **Identity numbers:** NID, birth registration, passport and TIN are never shown to support.
  The person's record masks them, the tax files that carry TINs are refused, and so are scans
  of identity documents.

**Every page support opens is recorded where the workspace sees it.**

- **What is recorded:** each request is written to the workspace's audit log: the method, the
  route pattern (never the query), the ids in the path and the result.
- **Where the workspace sees it:** the access page lists them.
- **The email:** the admin who granted access is emailed each time someone opens the
  workspace.

### Status page

**The status page is computed from our own checks and from what we post.**

- **Automated checks:** every minute, the API checks:
  - the database;
  - the document store and Chromium;
  - the web app;
  - the heartbeats of the notification and attendance jobs.
- **Posted by staff:** incidents and maintenance, in English and Bangla.
- **A part's state** is the worst of its open incidents, maintenance under way, and its recent
  checks.
- **Payments** has no check of ours; it changes only by incident.
- **History:** the page shows 90 days, a bar per day.
- **The banner:** open incidents and imminent maintenance appear in a banner on every workspace
  page and on the sign-in page.

**`/ready` is for load balancers and monitors; `/status` is for people.**

- `/ready` answers 503 when the database, the document store or Chromium is missing, and says
  only which.
- `/status` never shows a check's error detail.

**Backups report themselves.**

- `backup.sh` and `verify-backup.sh` record each run, failures included, in `backup_runs`.
- The console's Operations page shows the last backup and restore drill, and the API logs an
  error when the last good backup is over 26 hours old.

### Help centre and legal pages

**Help articles and legal texts are files in the repository.**

- **Format:** Markdown, English and Bangla side by side, with the same slug, topic and front
  matter.
- **Ships with the code:** they change with the features they describe, in the same review.
- **Tests:**
  - every article exists in both languages;
  - every in-app help link points at one;
  - the legal texts carry the terms version that sign-up records.

**Rendered by a safe subset, never as HTML.**

- **Allowed:** headings, lists, emphasis, code, notes, and links to app paths or `https://`
  addresses, rendered as React elements.
- **Everything else is text:** raw HTML never passes through.

**Accepting the terms is recorded.** A sign-up must accept the Terms of Service and the Privacy
Policy. The version and the time are stored on the sign-up, and copied to the workspace with
the address that accepted.

## Why

- **Consent rather than a support back door:**
  - Workspaces hold identity numbers, salaries and grievances, so a standing support login
    would be the biggest risk in the system.
  - A grant the customer controls, read-only and logged where they can see it, lets us help
    without asking for blind trust.
  - Banks and NGOs ask exactly this in due diligence.
- **A real workspace login rather than impersonating a user:**
  - The session passes through the same guards, row-level security and permissions as
    everyone.
  - The audit names the support person, not the admin.
- **Platform tables for tickets:** support staff must see the queue across workspaces. Copying
  the names keeps the console out of workspace data.
- **Our own checks on the status page:** customers see a page that changes when things break,
  without waiting for someone to post.
- **Content in the repository:**
  - Articles stay true to the release they ship with.
  - Translations are reviewed together.
  - There is no editor to secure.
  - The cost is a deploy to fix a typo.

## Consequences

- **The status page runs on the same server.** If the server is down, so is the page. Until a
  status page on separate hosting exists, an external uptime monitor and email are how
  customers hear from us ([launch.md](../ops/launch.md#limits-we-launch-with)).
- **Editing help needs a release.** A help centre that support staff edit themselves would
  need its own editor and its own review.
- **Two sessions for one person:** a support person with two sessions open in one workspace
  ends both by revoking the grant, not by ending one.
- **No whole-workspace export.** The DPA promises a machine-readable copy on request after the
  contract ends, made by hand from the database for now.
- **Refunds are paid by hand.** No gateway refund is built.
