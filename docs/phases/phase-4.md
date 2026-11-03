# Phase 4: Talent suite

**Goal:** a company hires, reviews, pays for performance, trains and listens to its people in
Good People, in English and Bangla, on the same records that run its HR and payroll.

Phase 4 builds on Phase 1's people and approvals, Phase 2's pay and its maker-checker, and
Phase 3's plans: recruitment, performance and learning come with the Business plan and up
(`recruitment`, `performance`, `lms`). It ships in five milestones, each merged only when its
tests pass and it has been walked through in the browser.

| Milestone                             | Scope                                                                                                                                                                                                                                                                                                       | Depends on | Status |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ |
| **M1 Recruitment**                    | Openings approved against a budget, a careers page per workspace with Google-ready job posts, applications with CVs and consent, a pipeline by stage, interviews with calendar invites and scorecards, offers accepted online, hiring into the employee record, candidate data kept only as long as allowed | Phase 3    | Done   |
| **M2 Performance**                    | Goals and KPIs, review cycles (self, manager, peers), calibration, improvement plans, outcomes that feed increments and promotions                                                                                                                                                                          | M1         | Done   |
| **M3 Compensation planning**          | An increment matrix by rating and position in range, budgets per company and unit, managers' proposals, approval, effective-dated pay changes into payroll; the RMG minimum-wage annual increment                                                                                                           | M2         | Done   |
| **M4 Learning**                       | Courses and sessions, attendance, training required by designation (fire safety, health and safety, anti-harassment), certificates with expiry, fire drills, training in the buyer-audit report                                                                                                             | Phase 3    | Done   |
| **M5 Engagement & employee services** | Surveys and eNPS with anonymity thresholds, recognition, announcements and policy acknowledgements, an HR helpdesk for employees, assets issued and returned                                                                                                                                                | Phase 3    | Done   |

**Exit test:** a company publishes a job on its careers page, which Google can index; hires a
candidate who applied there through interviews and an offer accepted online, and that person
starts with their job, pay and documents in place. A review cycle produces ratings that a
budgeted increment round turns into approved pay changes in the next payroll. A garment
factory shows, for a buyer audit, who has had the fire safety training their job needs and
when the last drill was. An anonymous survey never shows a group smaller than the threshold.

## Principles

- **One record from applicant to employee.** Hiring a candidate creates the employee from the
  offer they accepted: the same job, pay (through the usual maker-checker) and documents, never
  re-typed.
- **Candidates' data is theirs.** It is kept only with their consent, for the time the
  workspace states, and erased after; the Personal Data Protection Ordinance 2025 makes
  explicit consent, a stated retention and the right to withdraw the rule.
- **Decisions stay with people.** Scores, ratings and matrices inform; a person decides, and
  the record says who.
- **Pay changes go through payroll's own approvals.** Offers, review outcomes and increment
  rounds propose pay; Phase 2's maker-checker approves it.
- **Bangla first-class.** Job posts, offer letters, review forms, courses and surveys exist in
  both languages.

## M1: Recruitment

From a position the company decides to fill to a person on the payroll. Openings are approved
against a budget, posted on the workspace's own careers page, and filled through a pipeline of
interviews and an offer the candidate accepts online. Comes with the Business plan and up
(`recruitment`).

### Openings

- **An opening** is a position to fill: the company, unit, location, designation and grade,
  the employment type, how many people, whether it is new or replaces someone, the monthly
  gross budget, the hiring manager and why it is needed.
- **Approval:** HR drafts openings for anyone; a line manager may draft one with themselves as
  hiring manager. It is approved through the approvals engine like leave, by the hiring
  manager's line manager and then HR; whoever drafted it cannot approve it.
- **The job post:** once approved, HR writes the post (title and description in English, Bangla
  or both, the closing date, and whether to show the salary) and publishes it. It closes by
  hand, on its closing date, or when all its positions are filled.
- **Company limits:** a login limited to some companies (Phase 3 M4) sees only their openings.

### Careers page

- **`/careers/<workspace>`:** the workspace's open jobs in English and Bangla, with an
  introduction the workspace writes. The careers page is off until the workspace turns it on.
- **A job's page** carries Google's job-posting markup (title, description, organisation,
  location, date posted, closing date, employment type and, if shown, the salary), so Google's
  job search can list it. A closed job's page says so and drops the markup.
- **Applying:** name, email, mobile number, a CV (PDF or Word, up to 5 MB) and a note, with
  explicit consent: what the company does with the application and how long it keeps it. A
  confirmation email follows. Spam is held back by rate limits and a hidden field, as at
  sign-up.
- **Other job boards:** bdjobs.com and LinkedIn have no public API for posting. The post can be
  copied as ready text, and candidates from there are added by hand with their source.

### Candidates and the pipeline

- **A candidate** is a person, found again by email or mobile number when they apply twice; each
  application is to one opening.
- **Stages:** applied, screening, interview, offer, hired; or rejected or withdrawn at any stage,
  with a reason. A board per opening shows them; every move is recorded with who made it.
- **Adding by hand:** walk-ins, referrals (with the employee who referred), agencies, bdjobs and
  LinkedIn. The contact details are read from the CV to fill the form, and HR checks them.
- **Keeping data:** a candidate who was not hired is erased after the workspace's retention
  period (12 months unless set otherwise) unless they agreed to stay in its talent pool; HR can
  erase a candidate on request at any time. A hired candidate's CV moves to their documents.

### Interviews and scorecards

- **Scheduling:** in person, by phone or by video (with its link), with one or more interviewers
  who have logins. The candidate and the interviewers get a calendar invitation by email, which
  updates or cancels when the interview does.
- **Scorecards:** each interviewer rates the opening's criteria from 1 to 5, recommends (strong
  no to strong yes) and writes notes. An interviewer sees the others' scorecards only after
  submitting their own.
- **My interviews:** each interviewer's list, with the CV and the scorecard, on the web and in
  the app.

### Offers and hiring

- **The offer:** the job (company, unit, location, designation, grade, employment type), the
  joining date, the monthly gross pay, the probation (at most 6 months for clerical work and 3
  for other work, Labour Act s.4) and the date it expires, with an offer letter in English or
  Bangla.
- **Approval:** an offer above the opening's budget is approved by HR through the approvals
  engine before it is sent; within the budget, HR sends it.
- **Accepting online:** the candidate opens a private link, reads the letter, and accepts by
  typing their name, or declines with a reason. The record keeps who, when, from where and a
  fingerprint of the letter they accepted (an electronic record under the ICT Act 2006,
  ss.6–7). The appointment letter the Labour Act requires (s.5) is still issued on joining.
- **Hiring:** from the accepted offer, HR creates the employee and their first job on the hire
  form, prefilled and checked as any hire (age, adolescents). HR chooses a salary structure that
  works from a gross amount, and the offered pay is proposed through payroll's maker-checker
  from the joining date. The CV and the accepted offer go into their documents, and the opening
  is filled once its hires reach its headcount.

### Roles

- **`recruitment.manage`** (workspace admin, HR admin, HR officer): every opening, candidate and
  offer, within the login's companies.
- **Hiring managers** see and move candidates in their own openings and schedule interviews.
- **Interviewers** see the interviews they are on, with the candidate's CV, and their scorecards.
  The candidate's calendar invitation names only the candidate, so interviewers' addresses stay
  inside the company.

### Done when

- **Unit tests:**
  - opening rules;
  - the job-posting markup and the employment-type mapping;
  - the calendar invitation (line folding, escaping, UTC times);
  - reading contact details from CVs (English, Bangla Unicode, legacy fonts refused);
  - offer letters and name matching;
  - the log driver's attachments.
- **API end-to-end tests:**
  - **openings:** drafts by HR and line managers, the approval chain and its maker, posts,
    publishing, closing and auto-closing, company limits;
  - **careers page:** off and on, public fields only, applying with PDF and Word CVs, the same
    person again, consent, the honeypot, rate limits, closed jobs, the emails;
  - **applications:** adding by hand, stages and who may move them, erasure on request and by
    the retention job, CV access;
  - **interviews:** invitations and their sequence, the candidate's copy, cancellations,
    interviewers' isolation, hidden scorecards and the panel;
  - **offers:** within and above budget, sending, accepting with the kept letter, declining,
    expiry, withdrawal, hiring with documents, the filled opening and the pay proposal.
- **Web:**
  - Recruitment, an opening, the pipeline, candidates, an application, interviews, the
    approvals cards, the hire form from an offer;
  - the careers page and a job;
  - the offer page;
  - in English and Bangla.
- **App:** the opening and offer approval cards, My interviews and the scorecard.

### Checked

- **Automated tests:**
  - API: 605 tests in 74 files (73 new). The suite also passed shuffled runs with two seeds.
  - Shared 109, country pack 53, Edge Agent 70, web 16.
  - Flutter: 265 tests (24 new), and analyze is clean.
- **The browser, in English and Bangla, on the seeded My Group:**
  - **Applying:** Rehana Akter applied on the careers page with a CV. The job page carries
    Google's markup with every required property, and her confirmation email states the
    12-month retention and the privacy contact.
  - **Interview:** HR scheduled her interview with Shirin Akter. The calendar invitations went
    out in UTC with the same UID; the candidate's names only her.
  - **Scorecard:** Shirin, an employee-role login, found Recruitment and Interviews (with its
    count) in her menu and submitted a scorecard.
  - **Offer:** within the budget, so it was approved at once, sent, and opened in Bangla with
    Bangla digits and s.4 cited. It was accepted by typing her name; the letter was kept with its
    SHA-256, emailed to her, and HR and Shirin were notified.
  - **Hire:** from the offer, which created MG-0011 with probation to 7 February 2027, the CV and
    the accepted offer in her documents, and ৳13,000 proposed in payroll from her joining date.
  - **Approval:** an opening Shirin drafted was approved from the Bangla approvals inbox.
- **Fixed on the way:**
  - A refused second application could delete the candidate's CV inside a transaction that
    then rolled back.
  - The candidate's calendar invitation listed the interviewers' work addresses.
  - The log driver wrote attachments' bytes into the log.
  - The interviews link would have disappeared just when a scorecard was due.
  - After hiring from an offer, the hire page showed a refusal instead of the outcome.
  - The pipeline's stage picker was cut off on narrow cards.
  - The disk filled during the test run; build caches were cleared.

**Carried into later milestones from M1:**

- **No calendar integrations:** Google and Microsoft calendars are not linked; invitations go
  by email.
- **No job-board posting:** bdjobs.com and LinkedIn are posted by hand.
- **Legacy Bangla CVs:** CVs typed in Bijoy or SutonnyMJ fonts are not read.
- **An interview after the hire:** an interview still to come when its candidate is hired is
  not cancelled by itself (rejecting or withdrawing does cancel them).
- **Counsel:** checks the consent text and the retention period before a company relies on
  them.

## M2: Performance

Goals people agree with their managers, reviews that rate them against those goals and the
company's expectations, and the record HR and managers need afterwards: calibrated ratings that
feed increments (M3), improvement plans, and probation reviews before confirmation. Comes with
the Business plan and up (`performance`).

### Goals and KPIs

- **A goal** belongs to a person (or to a unit, for the goals people align theirs with): a
  title and description, a weight, a due date, and either key results (an objective) or a
  measure with a target (a KPI: the unit, whether higher or lower is better).
- **KPIs from the records:** a KPI can read its value from Good People instead of being typed:
  the attendance rate from processed attendance, or output against target from daily
  production (the RMG pack). Everything else is updated by hand.
- **Agreeing:** the person drafts their goals for a review cycle, or their manager does; the
  manager agrees them, and the weights of a person's agreed goals add up to 100%.
- **Check-ins:** progress and notes from the person and the manager, dated, through the
  period.

### Review cycles

- **A cycle:** HR sets its name, the period, who is in it (companies, and people who joined
  before a date), whether there are self reviews and peer reviews, the competencies rated
  (e.g. job knowledge, quality, teamwork, reliability, safety; in English and Bangla), and the
  dates for each step. Launching it creates a review for each person, with their manager on
  that day.
- **Self review:** the person rates their goals and the competencies (1 to 5) and comments.
  Workers without a login are reviewed by their manager alone, so a factory can review its
  lines without asking each worker to use a screen.
- **Peer feedback:** the person or their manager names peers; the manager approves them. Peers
  answer a few questions and a rating; the person sees peer feedback only together, and only
  from at least three peers, never who said what.
- **Manager review:** the manager rates each goal and competency, sees the self review, and
  proposes an overall rating with recommendations: an increment, a promotion (to a
  designation), or an improvement plan.
- **Calibration:** HR and the managers of a unit compare the proposed ratings side by side,
  against a distribution the workspace sets as a guide (never a quota), and settle each final
  rating; a change records who made it and why.
- **Release and acknowledgement:** HR releases the reviews; each person reads their own, and
  acknowledges it with a comment, agreeing or not. A released review never changes.
- **Outcomes:** the cycle's final ratings and recommendations are the input to M3's increment
  round.

### Improvement plans

- **A plan** for one person: why, from and to (30, 60 or 90 days), what must improve and how
  it is measured, the support given, check-ins, and the outcome (successful, extended or not
  met). The person acknowledges it.
- **The law:** a plan records performance concerns and the help given; it never ends anyone's
  employment by itself. Dismissal for misconduct follows the Labour Act's procedure (s.23–24:
  a show-cause notice with at least seven days to answer, and an inquiry), and other
  termination follows s.26 with notice or pay. Marked for the labour lawyer to confirm.

### Probation reviews

- Before a person's probation ends (s.4), their manager is asked for a probation review:
  ratings, comments and a recommendation to confirm, extend or end it. HR acts on it from the
  person's probation, as today; the review is kept on their record.

### Who sees what

- **The person:** their goals and check-ins, their self review, and their review once released
  (peer feedback only together).
- **Their manager:** the team's goals, reviews and plans (direct reports, and those below them).
- **`performance.manage`** (workspace admin, HR admin, HR officer): every cycle, review, plan and
  calibration, within the login's companies.
- **Peers:** only what they write.

### Done when

- **Unit tests:**
  - KPI readings from attendance and production, and goal weights;
  - the goal score and the peer summary's threshold;
  - when reminders go out;
  - the probation review's window and due date;
  - the outcomes file.
- **API end-to-end tests:**
  - **goals:** drafted by the person or the manager; agreement, and agreement again after a
    change; weights adding up to 100%; check-ins; unit goals and alignment; KPIs from the
    records; who sees what;
  - **reviews:** settings; launching with the manager of the day; workers without logins; self
    and manager reviews; peers named, approved, answered and summarised only from three; who
    sees which part; the tasks;
  - **calibration:** the spread against the guide; final ratings and their reasons; moving on
    with reviews missing; release and its notices; acknowledgement; no change after release;
  - **development:** plans from draft to close, with the person's acknowledgement; probation
    reviews asked by the job, submitted, told to HR and marked acted on; the performance record;
    outcomes as JSON and CSV within the login's companies.
- **Web, in English and Bangla:**
  - Performance (tasks, goals, reviews), goals and a goal, a review (self, manager, released),
    the team's reviews, peer feedback;
  - cycles, calibration, settings;
  - plans, probation reviews, and the Performance tab on an employee's page.
- **App:** the Performance entry with its badge, my goals and check-ins, goals to agree, the self
  review, acknowledging a released review, peer feedback, and notifications that open them.

### Checked

- **Automated tests:**
  - API: 658 tests in 83 files (9 new). The suite also passed shuffled runs with five seeds.
  - Shared 118, country pack 53, Edge Agent 70, web 16.
  - Flutter: 295 tests (30 new), and analyze is clean.
- **The browser, in English and Bangla, on the seeded My Group:**
  - **Self review:** Rahima Khatun was refused when she submitted an empty form. She saved a
    draft, came back to it and submitted. Her attendance goal read 69.23% against 95% from
    processed attendance.
  - **Manager reviews:** Shirin Akter was notified, read Rahima's self review beside her own
    form, and proposed 3 with an increment; the goal score was 3.3 from weights of 40, 30
    and 30.
  - **Without logins:** Shirin reviewed two operators who have no login alone, on competencies
    only, proposing a promotion to Senior Sewing Operator for one and an improvement plan for
    the other. She left the third unwritten.
  - **Calibration:** HR moved the cycle on with a reason for the missing review. Release was
    refused until every review had a final rating. Lowering a rating, and HR rating the review
    with no manager's part, each needed a reason. The guide showed beside the spread.
  - **Release:** the outcomes CSV listed all four with their recommendations. Rahima was
    notified, read her review and acknowledged it, not agreeing, with her comment.
  - **KPI from production:** a day's output entered for Line 1 (372 against a target of 400 for
    Rahima) showed in her goal at once, as 93% against 90%.
  - **Improvement plan:** Shirin started a 60-day plan for Mitu Begum from the review's
    recommendation, with the legal note shown, and added a check-in.
  - **Probation:** with Mitu's probation end moved into the window in the development database,
    the job asked Shirin for a probation review due a week before the end. She recommended
    extending the probation, with her reasons.
  - **Bangla:** no page under Performance showed untranslated interface text or a message key.
- **Fixed on the way:**
  - The goals page showed a message key instead of "New goal".
  - In Bangla, the rating choices in calibration and the review forms used Latin digits.
  - A manager's probation review task gave the probation's end as its due date, a week late.
  - A submitted probation review listed its ratings in storage order.
  - The outcomes CSV showed Bangla names garbled in Excel; it now starts with a byte-order mark.
  - Older tests:
    - three assumed a past day in the current month, or that October 2026 was not over, and
      failed on 1 November;
    - a reviews test changed the workspace's competencies for every test after it;
    - a notifications test gave up while other tests' mail was still ahead of its own.

**Carried into later milestones from M2:**

- **Paper acknowledgement:** a worker without a login cannot acknowledge a plan or a review in
  Good People, and a signed paper copy cannot be recorded yet.
- **Declining peer feedback:** a peer cannot decline a request; only the manager approves or
  declines the peers named.
- **Peers in the walkthrough:** My Group's seed has no colleagues with logins to name, so peer
  feedback was checked by the tests only.
- **The app** leaves naming peers, drafting, completing and dropping goals, the manager review,
  plans and probation reviews to the web.
- **Counsel:** confirms the improvement plan's legal note (s.23–24, s.26) before HR relies on
  it.

## M3: Compensation planning

One company and effective date per round. HR sets a monthly gross increment budget for the
company and optional unit limits, grade ranges (monthly gross), and a 5 × 3 matrix of suggested
gross increment percentages. Position in range is below midpoint, midpoint to maximum, or
above maximum. Ranges and matrix are copied into the round, so later policy changes do not
rewrite a decision. Suggestions are guidance; a different proposal requires a reason.

Only released reviews with final ratings enter a performance round. Current active employees
with approved pay and a job in the company on the effective date are included; missing pay,
pending/future changes and missing ranges are reported explicitly. A review's recommendation
is shown, never treated as an automatic entitlement. An RMG annual round may run without a
review cycle and includes only wage-board workers with twelve months' service. Its minimum
basic increment comes from an effective-dated country-pack rule, independent of ratings and
range ceilings; a lawyer must confirm the rule and eligibility before production reliance.

Amounts and baseline pay snapshots are encrypted. Managers see only their direct reports'
lines, cannot propose their own pay, and submit each proposal with a reason. HR sees the
company within their login's scope, can revise proposals with a reason, and submits the whole
round to payroll only once every line is submitted and all budgets are met. Zero increments
are explicit submitted decisions. A cancelled round never changes pay.

Sending to payroll is atomic and creates ordinary effective-dated pay proposals. It always
requires a second person's payroll approval, even when one-person payroll is enabled. No
manager proposal changes pay by itself. The source pay and job must still match the snapshot;
otherwise the round must be cancelled and rebuilt. Payroll's existing checks enforce active
structures, minimum wages, one pending change and no backdating. Payroll approval, rejection
or withdrawal is shown on each line; rejected lines are replanned in a new round. Promotions
remain separate effective-dated job changes; this round changes pay only.

### Done when

- Matrix boundaries, decimal rounding, unit/company budgets and the independent RMG floor
  have unit tests.
- API tests cover released-only input, scoped HR and managers, encrypted snapshots, reasons,
  submission, stale/concurrent writes, budget refusal, atomic export, forced maker-checker,
  repeat export, cancellations and approved pay reaching payroll history.
- HR and managers complete the workflow in English and Bangla in the browser. Planning is a
  web workflow; employees continue to see approved pay and payslips in web and mobile.
- A help article, ADR, seed round and handover describe the shipped workflow and its limits.

### Checked

- Full Node suite: API 670 tests in 85 files, plus the added custom-structure regression
  (671 API tests in the final source); shared 121, country pack 54, Edge Agent 70,
  web 16. The API suite also passed shuffled order; compensation, payroll and isolation
  have additional shuffled checks.
- Flutter analyze is clean and all 295 tests pass. Planning remains on the web; existing
  payroll approval cards and employee pay continue to use the same mobile contracts.
- In the browser: HR created a round with ranges and a matrix, with the over-budget total
  visible. Shirin saw only her three direct reports, saved and submitted proposals, and
  could no longer edit them. English and Bangla labels, names, currency and digits were
  checked. Payroll approval, budget refusal, rejection, concurrency and stale snapshots are
  covered end to end at the API and payroll engine. A smoke test against the running local
  API refused and cancelled the over-budget walkthrough, then submitted the seeded round
  and approved three pay changes as the seeded finance officer; one zero-increment decision
  created no pay record. The approved changes start on 1 December 2026.
- Dev migrations applied without resetting the existing database; the seed adds a draft demo
  round without creating pay proposals. Re-running the seed leaves it alone.

**Carried from M3:**

- The company view loads the entire round; pagination, bulk manager submission and measuring
  very large increment rounds remain for later.
- Promotions are separate effective-dated job changes. A review recommendation does not
  automatically promote anyone.
- RMG eligibility and the increment rule require counsel confirmation. Prior increments
  outside this workflow are not automatically classified.
- Once exported, a round is fixed. Rejected or withdrawn pay changes are replanned in a new
  round; there is no partial reopening of the old one.

## M4: Learning

Learning comes with `lms`. HR manages a bilingual catalogue of courses (fire safety, health
and safety, anti-harassment, or other), scheduled sessions for one company/site, enrolment,
attendance and completion. An employee sees sessions offered to their company, enrols or
withdraws before a session starts, and reads their own training record and certificates on
web and mobile. Managers see their direct reports' training coverage. HR officers and above
have `learning.manage`, limited to their companies. Nobody outside those relationships sees
a person's learning record or downloads their certificate.

HR records attendance for every enrolled person after the session ends. Completion is one
atomic action: attended people receive a numbered completion record, absent people do not.
Concurrent enrolments cannot exceed capacity. Completed/cancelled sessions are fixed; wrong
certificates are revoked with a reason, retained on record, and never count as current
training. Certificates snapshot the course name, trainer, completion date and expiry policy.
A PDF in English or Bangla is available without writing on a GET. It attests to attendance
recorded by the employer; it does not imply external accreditation. Course renewal periods
are employer policy, not inferred statutory requirements. Archived courses retain history.

An effective-dated company/designation policy requires a course, with a grace period from
the later of the policy start and the start of the current continuous designation. Transfers
and new designations therefore change coverage; unrelated changes in the same designation
do not restart the grace period. An unrevoked completion on or before the report date counts
through its expiry date. Missing/expired certificates show as due or overdue. Read endpoints
compute this without writing. A daily job sends deduplicated session and expiry reminders.

Fire drills record the company/site, held date, participants, evacuation time, conductor,
findings, corrective actions and the next due date. Records cannot be future-dated and are
voided with a reason rather than deleted. Labour Act s.62(8) requires drills at least every
six months for establishments with 50 or more workers/employees (official consolidated Act,
checked 1 November 2026). The company sets its next date to reflect its applicable rules,
fire licence and buyer conditions; the app makes no automatic legal-compliance declaration.

The buyer-audit JSON, web page and EN/BN PDF gain training coverage as of the period end,
completions in the period and site drill records. Learning data is included only with `lms`,
and company-limited logins cannot obtain other companies' learning evidence through this
report. Existing report sections also respect that company boundary.

### Done when

- Unit tests cover expiry boundaries/month ends, grace periods and continuous designations.
- API tests cover tenancy, company scopes and relationship access, capacity/concurrent
  enrolment, self withdrawal, complete/absent attendance, atomic completion, future dates,
  immutable sessions, revoked/expired certificates, PDF access, requirements, reminders and
  training/drills in the buyer-audit report.
- HR and employees use Learning in English/Bangla; mobile self-service has widget tests.
- Migration/RLS, demo data, help, ADR, README, handover and the go-live checklist are updated.

### Checked

- Migration 0038 and forced RLS migration 0039 applied to the existing local database without
  resetting it. An add-only seed provides three courses, current/expired completion records,
  an upcoming enrolment, required-training policies and a fire drill.
- API coverage includes tenant/company boundaries, direct-report access, concurrent capacity
  and completion, attendance/absence, future-date refusal, cancellation, expiry, revocation,
  PDF access, policy overlap/retirement, reminders and training/drills in buyer-audit JSON/PDF.
- Mobile widget checks cover self enrolment/withdrawal, read-only access, capacity refusal,
  Bangla downloads through the file opener and notification routing.
- Full Node suite: API 682 tests in 87 files, shared 125, country pack 54, Edge Agent 70,
  web 16. The complete API suite also passes shuffled order (seed 41); 22 focused learning,
  audit and tenant-isolation checks pass with seed 17 after the demo-policy correction.
- Flutter: 303 tests pass; analyze is clean. HTTP client checks cover authentication,
  enrolment/withdrawal with empty responses, capacity refusals, malformed responses and
  binary certificate downloads in the selected language.
- Lint, typecheck and the production build pass. Drizzle reports no schema drift.
- Browser walkthrough, in English and Bangla: HR created a bilingual course, scheduled
  historical/future sessions, enrolled Rahima, completed attendance and downloaded her
  Bangla PDF. Rahima enrolled/withdrew herself; seat counts changed correctly and the roster
  stayed private. Shirin saw coverage for her four direct reports. HR recorded a drill and
  read the training/drill section in the buyer report and downloaded its Bangla PDF.
- Browser checks caught and fixed the Learning navigation translation and a demo-policy
  mismatch: Rahima's designation is Senior Sewing Operator. The seed now requires the
  three courses for both Sewing Operator designations; her record shows current and overdue
  training. Existing local demo policies were added through the API without resetting data.

**Carried from M4:**

- Trainer-led courses only: no SCORM, hosted videos, quizzes or external-provider imports.
- HR authoring and manager coverage are web workflows; mobile provides employee self-service.
- Course fields and completed attendance are fixed. Corrections use archive/new courses,
  reasoned revocation and a new session/attendance record.
- HR lists are unpaged. PDFs are employer attendance records, not externally accredited or
  cryptographically signed qualifications; signed registers/notices remain with the employer.

## M5: Engagement and employee services

These services use the existing `core_hr` entitlement. `engagement.manage` lets HR officers
and above publish surveys, announcements and policy notices and moderate recognition within
their company scopes. `employee_services.manage` lets those HR roles handle private employee
requests and inventory. Platform support sessions do not receive the latter permission.
Employees use both areas on web and mobile. HR authoring, reports and inventory are web
workflows. Reads compute views without writing; all tenant tables use forced RLS.

### Surveys and eNPS

HR drafts a bilingual anonymous survey for one company, with one eNPS question (0–10) and
up to ten required pulse questions (1–5). Publishing freezes the active employee audience,
questions, closing time and reporting threshold (at least five). A cohort smaller than the
threshold cannot be published. Only the person can respond, once, before closing; neither
HR proxy responses nor response edits are supported. A locked aggregate is updated in the
same transaction as a participation marker. Individual answers, answer timestamps and an
identity-to-answer relation are never stored. Audit and notification payloads omit scores.

Only authorized HR sees results, after closing and after the threshold is met. Otherwise
counts and distributions are suppressed. Results are a single fixed cohort: eNPS, promoter/
passive/detractor counts and each question's mean/distribution. There are no department,
demographic, date-range or individual drill-downs, participant lists or raw-response exports.
This protects reporting against small-group comparisons; it is not a promise of anonymity
against a database administrator observing live transactions. People without logins remain
in the frozen audience but cannot respond by proxy. HR must provide them a suitable separate
channel; the app never fabricates their answers.

### Recognition and announcements

An active employee can recognize another active colleague in their current company with a
value and message. The form clearly says it is visible to that company. The sender can
withdraw their own recognition; scoped HR can moderate it, with a reason. Hidden messages
are retained but excluded from the feed. Self-recognition and cross-company posts are refused.

HR writes bilingual plain-text announcements for one company. Publishing fixes the wording;
corrections use a new announcement and reasoned retirement of the old one. General news is
visible to current company employees. Policy notices freeze an employee audience and due date
at publication; new joiners require a new notice. Each assigned person acknowledges only their
own receipt, once, including after the due date while the notice remains live. HR sees the
assigned/acknowledged/outstanding register within its company scope. This records reading,
not agreement to changed employment terms or an electronic signature. Retired/expired notices
retain their receipt history and cannot acquire new acknowledgements.

### Employee HR requests

An active employee opens a private request in letters, pay, leave, benefits or other, with
normal/urgent priority. It is separate from Good People platform support and from the existing
grievance/harassment process. Only the requester and scoped HR service handlers read it.
Managers and other employees cannot find it. Subject, original text and replies are encrypted;
notifications and audit logs carry no request content. HR may assign only an active HR handler
who can access the request's original company. Internal notes are HR-only, create no employee
notification and do not expose their text or activity through the employee view.

HR moves open requests to in progress or resolved with a public explanation. The requester
can close a resolved request, or reopen a resolved/closed one with a reason. Closed requests
refuse further replies until reopened. Company transfers do not move an existing private
request to a different HR team. No SLA or legal deadline is inferred for these ordinary
requests; statutory grievances keep their existing dedicated workflow.

### Assets

Scoped HR registers company inventory with a unique tag, bilingual name, kind and optional
serial number. A locked asset can have only one outstanding issue. HR records issue/return
dates and conditions, with an optional due date. Future dates, return before issue, issue
before prior return and issue to somebody outside the company on the issue date are refused.
The employee sees their own issue history and can acknowledge an outstanding issue once.
Only HR records returns or retires an unissued asset, with a reason. History is retained;
there is no automatic salary deduction or change to payroll.

### Notifications and verification

Publishing sends generic links to the eligible recipients. Public HR replies/status changes
and asset issues notify the employee without sensitive text. Daily jobs deduplicate survey
closing reminders (to the whole cohort, so delivery logs reveal no response status),
outstanding policy acknowledgements and overdue assets; read-only or
suspended workspaces do not run these jobs.

**Done when:** survey anonymity and concurrent single submission, company/tenant boundaries,
read-only access, recognition moderation, fixed policy wording/receipts, private/internal
request access and assignment, issue/return concurrency and notifications have API tests.
Web and mobile employee flows work in English and Bangla. Migrations/RLS, seed data, help,
ADR, README, handover and go-live notes describe the shipped scope and verification.

### Checked

- Migrations 0040 (nine tenant tables), 0041 (forced RLS) and 0042 (notification events)
  applied to the existing local database without resetting it. The add-only seed provides
  news, a policy notice, an unanswered survey, recognition, an encrypted HR request and
  issued/available inventory; it invents no anonymous responses.
- Full Node suite: API 695 tests in 88 files, shared 128, country pack 54, Edge Agent 70,
  web 16. The complete API suite also passes shuffled order (seed 41). Focused service and
  tenant-isolation tests also pass shuffled (20 checks, seed 17), covering thresholds,
  concurrency, frozen audiences, private/internal
  access, transfers, handler scopes, historical asset dates and retained history.
- Flutter: 316 tests pass; analyze is clean. New widget/client tests cover Bangla policy
  receipts, complete anonymous responses without employee identifiers, recognition, private
  replies and closure/reopening, asset receipts, authentication, notification routes,
  read-only access, malformed responses and preserving entered data on refusals.
- Lint, typecheck and production builds pass; Drizzle reports no schema drift. Browser walkthrough in English and Bangla on My
  Group: HR created/published a survey and policy notice, and registered/issued an asset.
  Rahima submitted anonymously, acknowledged the notice/asset, recognized Shirin and opened
  a private request. HR assigned it, made internal/public replies and resolved it; Rahima
  closed, reopened and closed it again. Shirin could not open her report's private request.
- HR's register showed Rahima's policy receipt. The closed survey stayed suppressed below
  five responses, without disclosing a count. The returned/retired asset retained its
  acknowledged history. Threshold-met survey arithmetic is covered by automated tests.
- Verification fixed two bugs: showing a mobile form error reset fields (now retained with
  stable field state/controllers); a web status update could clear the handler (now an
  explicit keep/unassign choice, checked again through resolution and reopening).

**Carried scope:** no survey free text or raw-answer exports, recognition rewards, rich-text/
attachment publishing, HR-ticket attachments/SLA automation, asset procurement/depreciation,
or offline proxy acknowledgements. Employee self-service is on mobile; HR tools are on web.

## Sources (checked 28 Oct 2026)

**M1 recruitment:**

- Google Search Central, job posting structured data:
  https://developers.google.com/search/docs/appearance/structured-data/job-posting
- Information and Communication Technology Act 2006 (electronic records and signatures,
  ss.5–7):
  https://sherloc.unodc.org/cld/uploads/res/document/information-and-telecommunication-act_html/Bangladesh_Information_and_Telecommunication_Act_2006.pdf
  and https://legalseba.com/bd-articles/?p=1555
- Personal Data Protection Ordinance 2025 (consent, stated retention, withdrawal):
  https://www.thedailystar.net/tech-startup/news/bangladeshs-personal-data-protection-ordinance-2025-key-takeaways-4015401
- bdjobs.com has no public posting API (vendor note):
  https://www.manatal.com/integrations/my-contract-bdj-jobs

**M3 compensation (checked 1 Nov 2026):**

- BGMEA circular, 30 December 2024, enclosing the Ministry's annual increment decision;
  recorded as 5% under the 2023 award and 9% from 1 December 2024, pending counsel review:
  https://bgmea.com.bd/uploads/circulars/attachments/circular_attachment_Circular_regarding_annual_increment_for_garment_industry_workers__1735622009.pdf

**M4 learning (checked 1 Nov 2026):**

- Official consolidated Bangladesh Labour Act 2006, s.62(8), fire drills and records:
  https://bdlaws.minlaw.gov.bd/act-details-952.html?lang=en
