---
title: Workforce analytics
summary: Read authorized headcount, joiners and completed leavers with an explicit date, company scope and source history.
category: packs
order: 40
updated: 2026-11-03
related: /workspace/analytics /workspace/employees /workspace/identity
---

Open **Analytics** to see closing headcount, new joiners and completed leavers. This local preview needs an explicit Analytics feature grant, Core HR and both the **View workforce analytics** and **View employees** permissions. Existing plans and installed licenses do not automatically activate it. A self-hosted installation also needs the feature in its signed license. Your administrator can assign a custom role with an approved company and employee relationship scope.

## Choose the measurement

Choose an **As-of date**, a company or all authorized companies, and optionally a **Site**, then select **Show metrics**. The period starts on the first day of that month and ends on the selected date. Dates use the Gregorian calendar and the company's business time zone; selecting a site uses its time zone and narrows the result to its company. Changing the company clears the site filter. Future business dates are refused. Current-day results are provisional.

- **Closing headcount:** people who joined by that date and have not separated on or before it. Exactly one effective assignment must identify their company and site.
- **Joiners:** continuous-service starts during the period, counted in the company and site at joining. A transfer is not another joiner.
- **Completed leavers:** recorded completed separations during the period, counted in the company and site left. Pending and future separations are excluded.

These are workforce counts, not salary calculations. The closing-headcount convention does not decide pay for a last working day.

## Read the source and quality notes

An exact **0** is a valid empty measurement. A **dash** means incomplete or unavailable: read the company notes for missing or overlapping assignments, inconsistent sites or unsupported company context. Review the authorized employee history through the usual HR workflow. Analytics does not guess a company or repair employment records.

**Source details** shows the definition version, source revision and snapshot time. Backdated corrections can restate a historical result. Your current company and relationship permissions apply even to an old date. A company filter can narrow access, never expand it.

This first slice has no payroll or demographic analysis, employee export, saved report or AI assistant. Arabic remains a technical preview awaiting human review.

## Operating and financial insight

Open **Operating and financial insight** from the workspace menu when your workspace has the additional insight feature. Choose a completed business month and a report. Attendance, leave activity and learning use a single authorized company. Employer payroll cost shows six monthly figures for the workspace and requires MFA and payroll read access.

**Save report** keeps the definition in your account. Use **Generate CSV** on a saved report and refresh its status. A ready file requires the originating sign-in and current access. Payroll also requires pay export permission. Files expire after 24 hours. If the report changes before download, generate a new CSV. A withheld figure means a contributing group was too small to display.
