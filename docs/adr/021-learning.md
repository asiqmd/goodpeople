# ADR 021: Learning records attendance, policy coverage and retained certificates

**Status:** accepted for Phase 4 M4 · 2026-11-01

Courses are a shared bilingual catalogue, with optional renewal periods. Sessions belong to
one company and optional site. HR manages within company scopes; employees enrol/withdraw
before start; managers see current direct reports' coverage and certificates. The `lms`
entitlement gates learning. Reads compute without writing.

A session lock serializes enrolment and capacity. Completion is an atomic transition after
end time: HR supplies one attended/absent decision for every active enrolment. Attendees
receive one certificate per enrolment. Completed and cancelled sessions never reopen.
Certificates snapshot course names, trainer, completion date and expiry; changing policy
means a new course, not rewriting old certificates. A completion record attests to employer-
recorded attendance, not an external qualification. Wrong records are revoked with reasons,
retained and visibly marked on PDF; they never satisfy coverage. There is no public
certificate lookup that could reveal employee records.

Certificates are generated from controlled records through the existing PDF renderer. A GET
creates no document-vault entries, files or counters. Employees and authorized managers/HR
can download EN/BN PDFs; tenant-bound records remain protected by forced RLS. Fire-drill
mistakes are voided with reasons, not deleted. Archive preserves course history.

Required courses are effective-dated by company/designation. Overlaps serialize on the
company and are refused. Grace begins at the later of policy start and continuous time in
the current company/designation; a salary or location change in the same position does not
restart it. Coverage is as of a selected date and requires an unrevoked completion on or
before that date, through inclusive expiry. Revocation invalidates the record even on a
historical report; the report reflects currently known evidence, not a frozen past report.

Daily reminders cover sessions in the next 24 hours and certificates within 30 days of expiry,
then once expired. Existing outbox/deduplication makes repeated jobs safe. Notifications open
Learning in web and mobile. Required-training policies do not automatically enrol or certify
anyone. Read-only/suspended workspaces do not run learning reminder jobs.

The buyer-audit report includes training only with `lms`. Its API now normalizes and validates
company-limited users' selected company before any report section or file export is built;
without a selection, a single scoped company is used, and multiple scopes require a choice.
Training coverage is at period end; completions are in the period; drills up to period end
are shown latest first, excluding voided records. JSON, web and EN/BN PDF use the same data.

The Labour Act s.62(8) provides a six-month drill requirement for establishments with at least
50 workers/employees. The app records the site's chosen next date and evidence; counsel and
the safety lead determine other applicable rules, fire-licence and buyer conditions. It does
not label a workplace legally compliant from a course list or one drill.

## Limits

- No SCORM, video hosting, quizzes or external-provider integrations; sessions are trainer-led.
- Course fields and completed attendance are immutable in this milestone; archive/new courses
  and reasoned revocation/new attendance records provide corrections.
- HR web lists are currently unpaged. Mobile covers employee self-service; HR authoring and
  direct-report coverage are on the web.
- PDFs are generated, not cryptographically signed third-party credentials. Signed registers,
  fire-service notices and physical evidence remain with the employer.

## Source

Official consolidated Bangladesh Labour Act 2006, s.62(8), checked 1 November 2026:
https://bdlaws.minlaw.gov.bd/act-details-952.html?lang=en
