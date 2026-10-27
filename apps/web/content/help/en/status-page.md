---
title: The status page
summary: See whether each part of Good People is working, follow an incident until it is fixed, and know about planned maintenance in advance.
category: support
order: 20
updated: 2026-10-27
related: /status
---

The [status page](/status) shows anyone, without signing in, whether each part of Good People is working. Look there first when something seems wrong: if we already know about it, the page says so and what we are doing about it.

## The parts of the service

- **Web app**: signing in and working in the browser.
- **API and mobile app**: the service behind the web app, the mobile app and the Edge Agents, with its database.
- **Attendance**: punches being turned into each day's attendance in the background.
- **Documents and PDFs**: uploading documents and making PDFs such as letters and payslips.
- **Notifications**: email, SMS and push messages going out.
- **Online payments**: paying invoices online by card or bKash. We cannot check the gateways ourselves, so this part shows only the problems we post (**From posted incidents only**).

We check the other parts ourselves every minute. The top of the page gives the overall state, which is the worst of all the parts.

## What the states mean

- **Working**: working normally.
- **Maintenance**: planned work is under way.
- **Degraded**: working, but slower or with some errors. One failed check shows this.
- **Partial outage**: some of it is not working. Three failed checks in a row show this.
- **Major outage**: it is not working.

Each part shows the worst of its latest checks and of any incident open on it.

## Incidents and maintenance

When something goes wrong, we post an incident in English and Bangla. It says which parts are affected and how badly, and then gets updates as it moves on: **Investigating**, **Cause found**, **Monitoring a fix** and **Resolved**. An incident can get better or worse along the way.

Planned maintenance is posted in advance with its start and end. It shows as **Scheduled**, then **In progress**, and **Completed** when it is done.

The page lists **Current incidents**, **Planned maintenance** that is under way or starts within a week, and what finished in the past seven days. Times are Dhaka time.

## History

For each part, the page shows the last 90 days, one bar per day. Its colour shows the worst of that day's incidents and our checks, and the share of checks that passed is given as the uptime for the whole period. A day without checks shows **No data**.

## In your workspace

While an incident is open, or maintenance is under way or starts within a day, a banner says so at the top of every workspace page and on the sign-in page, with a link to the status page. You know before you start a payroll run or an import.

> If your problem is not on the status page, [contact support](/help/contact-support).
