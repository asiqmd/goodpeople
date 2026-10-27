---
title: Pay by bank, wallet or cash
summary: Set up payment accounts, then download a locked run's bank and wallet files, print the cash sheet, record the payment date and check what came back.
category: payroll
order: 40
updated: 2026-10-27
related: /workspace/payroll/runs /workspace/employees
---

Good People does not move money itself. For a locked run it splits each person's net pay across their payment accounts and gives you the files your bank and mobile wallet providers take, the cash sheet for those paid by hand, and a letter to your bank.

## Payment accounts

Each employee's accounts are on their **Payment** tab:

- a **Bank account**, with the bank, branch, routing number, account name and number;
- a **Mobile wallet**: bKash, Nagad, Rocket or Upay, with the wallet number;
- **Cash**, or no account at all, which is paid in cash.

One account is **Primary**. Another account can take a **Fixed amount each pay**: that much goes there, and the primary account gets the rest. Account numbers are stored encrypted, and only their last four digits are shown.

## What a locked run pays

Once a run is **Locked**, its page has a **Payments** card: the people and the amount for each channel (**Bank transfer (BEFTN)**, each wallet, **Cash**) and the total. It also warns about:

- bank accounts missing a routing or account number;
- wallets with no number;
- wallet payments over the Tk 5 lakh a personal wallet may hold. Pay those by bank.

The codes of the people concerned are listed, so you can fix their **Payment** tab before downloading.

## Files and sheets

- **Download file** beside the bank transfer: one row per payment with the beneficiary, bank, branch, routing number, account number, amount and a reference such as `SAL-2026-09`.
- **Download file** beside each wallet: the wallet number, amount, name, employee code and reference, for that provider's bulk disbursement.
- **Cash pay sheet**, in English or Bangla: the wage record (Form 38) by unit, with a column to sign over a revenue stamp or give a thumbprint.
- **Advice to the bank**, in English or Bangla: the covering letter asking your bank to make the payments.
- **Journal (CSV)**: the run's accounting entries, which balance.

The bank and wallet files are CSV. They hold the account numbers in full, so only people who run payroll can download them, and every download is recorded in the audit log. Banks' upload templates differ in column order rather than content; rearrange the columns if your bank's portal asks for its own layout.

## Record the payment

When the money has gone out, enter the date under **Record payment**. The card then shows **Paid on** that date, or **Paid late** when it is after the run's legal deadline (for a month's wages, the seventh working day after it ends, Labour Act s.123).

## Check what came back

Upload your bank's or wallet provider's report under **The bank's report** (.xlsx or .csv with an account number column): a returns file listing only what bounced, or a status for every payment. Click **Check the payments**. Rows are matched to the run's payments by account number, then amount. You see what was credited and returned with the bank's reason and the account's last four digits, payments the report does not mention, and rows that are not yours.

**Download the returned payments (CSV)** and pay them in cash or with the next run.

> During the parallel months, while your old payroll still pays people, do not send these files: see [Run a payroll month](/help/run-payroll).
