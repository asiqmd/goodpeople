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
| **M3 Compensation planning**          | An increment matrix by rating and position in range, budgets per company and unit, managers' proposals, approval, effective-dated pay changes into payroll; the RMG minimum-wage annual increment                                                                                                           | M2         |        |
| **M4 Learning**                       | Courses and sessions, attendance, training required by designation (fire safety, health and safety, anti-harassment), certificates with expiry, fire drills, training in the buyer-audit report                                                                                                             | Phase 3    |        |
| **M5 Engagement & employee services** | Surveys and eNPS with anonymity thresholds, recognition, announcements and policy acknowledgements, an HR helpdesk for employees, assets issued and returned                                                                                                                                                | Phase 3    |        |

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

## Later milestones (outline; detailed when each starts)

- **M3 Compensation planning:** increments by rating and position in the grade's range, budgets,
  managers' proposals, approval and the pay changes in payroll; the RMG wage board's annual
  increment.
- **M4 Learning:** courses, sessions and attendance; training required by designation; fire
  drills; certificates with expiry; the buyer-audit report's training section.
- **M5 Engagement & employee services:** surveys and eNPS, recognition, announcements, policy
  acknowledgements, an HR helpdesk for employees, and assets.

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
