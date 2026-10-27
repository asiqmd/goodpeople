---
title: Worker kiosks
summary: Set up a shared tablet where workers without smartphones sign in with their ID card and a PIN to see their attendance, leave and payslips.
category: time
order: 30
updated: 2026-10-27
related: /workspace/attendance/kiosks /workspace/employees/id-cards /kiosk
---

A kiosk is a shared tablet at a site, for workers who do not have a smartphone or a login. A worker scans the QR code on their ID card (or types the number on it), enters a PIN, and sees their own records. Kiosks come with the Business plan and above.

## Register a kiosk

1. Go to **Attendance setup → Kiosks**. Only people who manage attendance see it.
2. Give the kiosk a name (for example "Gate 2 tablet"), choose its site, and choose **Add kiosk**.
3. Copy the token straight away: it is shown only once.
4. On the tablet, open the kiosk address shown on the page (`/kiosk` on your Good People web address) in Chrome and allow the camera.
5. Paste the token and tap **Start the kiosk**. The token stays on that tablet only.
6. Pin the screen, or use a kiosk browser, so the tablet stays on this page in landscape.

The list shows each kiosk's site and when it was last seen. If a tablet is lost, **Revoke** it: it stops working at once, and setting it up again needs a new token.

> On Android tablets, Chrome saves a payslip PDF to the tablet's downloads, where the next worker could open it. Use a kiosk browser that shows PDFs on the page before workers open payslips there.

## Prepare the workers

- **ID cards:** the QR code on the ID card carries the worker's employee code. Print them from **Employees → ID cards**; cards printed before kiosks came in need printing again. Where the tablet's browser cannot read QR codes, the worker types the code, or a USB scanner reads it.
- **Mobile numbers:** the first time, a worker taps **First time here, or forgot your PIN?** and gets a six-digit code by SMS on the mobile number in their employee record. The code works for 10 minutes. They then choose a PIN of 4 to 6 digits. Easy PINs such as 1234 or 1111 are refused.

Five wrong PINs in a row lock the worker out of that kiosk for 15 minutes, and a kiosk that sees many wrong PINs, whoever's card was used, stops taking sign-ins for a few minutes. Workers who have left, or whose login HR has disabled, cannot use a kiosk.

## What a worker sees

- **Today:** the day's status, their shift and the times they punched.
- **This month:** days present, absent and on leave, and overtime hours.
- **Leave left:** their balances, and **Apply for leave** with the same checks and approvals as the web. Maternity and other leave given per event is applied for with HR.
- **Payslips:** their last three published payslips, when the workspace has payroll.
- **Speak up:** tell the company about a problem at work, anonymously unless they give their name.

The kiosk is in Bangla unless the worker switches it to English. It signs out after a minute untouched, and a session lasts at most three minutes; the worker taps **Done** when finished. A kiosk does not record punches: attendance still comes from the devices.
