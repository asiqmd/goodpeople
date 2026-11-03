# ADR 022: Anonymous aggregates, fixed notices and private employee services

**Status:** accepted for Phase 4 M5 · 2026-11-01

Engagement and employee services use `core_hr`. HR officers and above have separate scoped
`engagement.manage` and `employee_services.manage` permissions. Platform support sessions
do not receive the latter. Ordinary managers do not inherit access to private HR requests.
Every new tenant table has forced RLS and composite tenant foreign keys.

## Survey privacy

Surveys always include eNPS (0–10) and may include up to ten bilingual scored questions
(1–5). Publication freezes one company's active employee audience, questions, threshold and
closing time. The audience must meet the threshold, which cannot be below five.

We store an eligibility/participation marker, and aggregate score histograms on the survey.
There are no individual answer records, response timestamps, respondent scores or score-bearing
audit rows. A survey row lock serializes participation checks and aggregate updates; one
transaction records both or neither. HR cannot answer on behalf of somebody else.

Only scoped HR sees results after closing and at least the chosen response threshold. Before
then the response count is also suppressed. Results contain one fixed cohort's eNPS and
question histograms/means. There are no subgroup filters, participant lists, raw exports or
free-text responses. The app never puts answers in notifications or logs. Closing reminders
go to the entire frozen audience: notification delivery logs must not identify respondents.
Employees see their own participation state only. Database operators observing live writes
remain outside this reporting guarantee; do not promise cryptographic anonymity.

## Company communications

Recognition is named and visible within the sender's company. The sender must be active and
may recognize only a different active colleague there. Sender withdrawal or scoped HR
moderation requires a reason; the hidden record remains but leaves the latest-100 feed.

HR drafts and publishes bilingual plain-text announcements. Published wording cannot change.
General news follows current company membership. Policy notices snapshot acknowledgement
recipients at publication; later joiners require a new notice. An employee acknowledges only
their own live notice. Row locks make repeated receipts idempotent. Retired/expired notices
retain history and stop accepting receipts. Acknowledgement is a reading record, not consent
to changed employment terms or an electronic signature.

## Private requests and inventory

HR service requests are separate from platform support and statutory/harassment grievances.
An active employee creates their own request; only they and HR handlers scoped to its original
company read it. Transfer does not move the case. Subject, original body and messages use the
tenant-bound field cipher. Notification and audit payloads omit their content. Internal notes
are filtered before decryption for employee reads, send no employee notice and do not change
visible activity time. Assignment accepts only enabled, authorized handlers of that company.
HR explains progress/resolution publicly; the requester closes or reopens with a reason.
Closed requests refuse replies until reopened. These ordinary requests infer no legal SLA.

Assets belong to a company. An asset lock and partial unique index allow one outstanding
issue at once. Issue validates employment in that company on the recorded date. Future events,
overlapping history and return before issue are refused. Employees read their own history and
acknowledge an outstanding receipt; HR alone records returns/retirement. Retirement requires
no outstanding issue and preserves history. No inventory action changes pay or deducts salary.

Web provides HR authoring and reports; mobile provides employee responses, reading receipts,
recognition, private requests and asset receipts through the existing session-refresh client.
Read endpoints never persist view/read markers. Full-access tenants alone run deduplicated
deadline and overdue reminders.

## Limits

- No raw survey responses, free text, respondent/subgroup reports or proxy answers.
- No reward payments, rich text, announcement or HR-request attachments, SLA automation,
  inventory procurement/depreciation, payroll deductions or offline proxy acknowledgements.
- HR service and asset lists are unpaged; recognition is bounded to the latest 100 entries.
- Employees without logins need another appropriate channel. Never fabricate responses or
  acknowledge for them. Required signed records remain an employer process.
