# ADR 018: Hiring ends in the employee record, and candidates' data is kept only on their terms

**Status:** accepted for Phase 4 M1 · 2026-10-28

## Decision

### The opening is the unit of hiring

**An opening is approved before it is posted.**

- **What it is:** a position to fill: company, unit, location, designation and grade, the
  employment type, how many people, a monthly gross budget and a hiring manager.
- **Approval:** it goes through the same approvals engine as leave, to the hiring manager's
  line manager and then HR.
- **Posting:** only an approved opening can be posted, so the careers page never advertises a
  job nobody agreed to pay for.

**An opening's life is one status.** It moves from draft to pending approval, to approved
(or rejected), to open while posted, then closed, filled or cancelled. It closes by itself on
its closing date, and is filled when its hires reach its headcount.

### The careers page is the workspace's own

**Where it lives:** `/careers/<workspace>`, in English and Bangla, off until the workspace
turns it on.

**Public, and only public:** a job's page shows the post, never the budget (unless the
workspace shows the salary), the justification or the hiring manager.

**Google, not job-board APIs:**

- **Google:** each open job's own page carries Google's `JobPosting` markup with the
  properties Google requires. Closed jobs and the list page carry none, as Google asks.
- **Other boards:** bdjobs.com and LinkedIn offer no public posting API, so the post is
  copied to them as text. Their candidates are added by hand with their source.

### One candidate, many applications

**Found again by email or mobile:** one person who applies twice, or is added by hand after
applying, is one candidate. The careers page and HR's form use the same intake code, which
also stores the CV.

**CVs are checked and encrypted:** a CV is a PDF or a Word file, checked by its bytes. It is
encrypted with the field key like every document, under its own purpose, so files cannot be
swapped between people.

**Every stage move is a record:** each move of an application, and who made it, is an event.
Hired is set only by hiring.

### Candidates' data is theirs

**Consent with a stated period:**

- **Asked for:** the careers page asks for explicit consent. It names the company, how long
  the application is kept and whom to ask about it, as the Personal Data Protection Ordinance
  2025 asks.
- **Added by HR:** for candidates HR adds by hand, HR records that the person agreed.

**Erased, not archived:**

- **After the retention period:** a candidate not hired is erased once every application of
  theirs has closed and the workspace's retention period (12 months unless set) has passed.
  The exception is a candidate who joined the talent pool.
- **On request:** HR can erase a candidate at any time.
- **What erasure does:**
  - blanks the person;
  - deletes the CV;
  - empties cover notes and interviewers' written feedback.

  Stages and ratings stay, so the workspace's hiring figures still add up.

- **Hired candidates:** their data becomes the employee's, under the employee's rules.

### Interviews and scorecards

**Calendar invitations, not calendar integrations:**

- **The invitation:** each interview is sent to the candidate and the interviewers as an
  RFC 5545 invitation by email, which every mail client offers to add.
- **Changes:** a change sends the same invitation again with a higher sequence; cancelling
  sends a cancellation.
- **Why not integrations:** Google and Microsoft calendar integrations need each user's
  consent and tokens, which can wait.

**Independent scores:** an interviewer sees the others' scorecards for a candidate only after
submitting their own. HR and the hiring manager see them all.

### Offers are accepted online, and hiring is one step from there

**Approval only when the budget is passed:** an offer within the opening's budget is sent by
HR. One above it is approved by another HR login through the approvals engine first.

**Accepting online:**

- **The link:** the candidate opens a private link (only its hash is stored), reads the letter
  and accepts by typing their name, or declines.
- **The record:** it keeps the name typed, when, from where, and the letter as accepted,
  stored with its SHA-256.
- **The law:** this is an electronic record of acceptance, which the ICT Act 2006 recognises
  (ss.6–7). It does not replace the appointment letter the Labour Act requires on joining
  (s.5), which Letters still issues.

**Hiring:**

- **From the accepted offer**, the employee and their first job are created through the
  ordinary hire, with all its checks.
- **The CV and the accepted letter** become the employee's documents.
- **The offered pay** is proposed through payroll's maker-checker, never set directly.

## Why

- **Approval before posting:** headcount and budget are the decisions that matter; the
  approvals engine already records them with the people who made them.
- **The workspace's own careers page:** a Bangladeshi employer often has no site of its own
  that HR can change. A page on the workspace, read by Google, gives a job a public home the
  day it is approved.
- **One intake:** duplicate candidates are the commonest mess in recruiting, and two places
  creating them is how it starts.
- **Erasure on a stated period:** CVs carry personal data, often national ID numbers and
  photographs. Keeping them only as promised is the law's default and the candidate's
  expectation.
- **Hiring from the offer:** retyping the joining date, designation and pay into the hire form
  is where offers and contracts start to disagree.

## Consequences

- **Bijoy CVs:** CVs typed in legacy Bangla fonts (Bijoy/SutonnyMJ) cannot be read for contact
  details; HR types them.
- **No calendar integrations:** an interviewer whose mail client ignores invitations sees
  interviews in Good People only.
- **No job-board posting:** bdjobs and LinkedIn are posted by hand until either offers an API
  or a partnership.
- **The candidate types their name, nothing more:** acceptance is recorded, not signed with a
  certificate from a licensed certifying authority. A workspace that needs certified
  signatures signs the appointment letter on joining.
