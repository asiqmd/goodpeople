---
title: Privacy Policy
summary: What personal data Good People holds, why, how it is protected, who helps us process it, where it is stored and how long it is kept.
updated: 2026-10-27
version: 2026-11-01
---

This policy explains how Good People handles personal data: the data about the people in our customers' workspaces, and the data about our customers, the people who sign up and the visitors to this site. It is also published in Bangla; if the English and Bangla texts differ, the English text prevails.

## Who is responsible

- **Data in a workspace.** An organisation that uses Good People (the employer) decides what it records about its employees and workers, and why. The employer is the data controller for that data, and we process it only on its instructions, as the [Data Processing Agreement](/legal/dpa) sets out. If you work for one of our customers and have a question about your records, ask your employer's HR team first; we help them answer.
- **Data about our customers and visitors.** For the data we collect to run our own business (sign-ups, logins, billing, support and this website), Good People is responsible.

## What a workspace holds

On the employer's behalf, a workspace can hold:

- employee records: names in English and Bangla, parents' and spouse's names, date of birth, gender, religion, marital status, blood group, nationality, phone numbers and email addresses, present and permanent addresses, an emergency contact, and nominees;
- identity numbers (national ID, birth registration, passport and TIN) and bank and mobile wallet account numbers;
- jobs and their history: company, site, unit, designation, grade, manager, employment type, joining, probation, transfers and separation;
- pay: salary records, payroll results, payslips, tax, provident fund, loans, bonuses, final settlements and payment files;
- attendance: punches from devices, the web and the app, with the location of an app punch where the employer uses geofencing and a photo where the employer requires one, plus shifts, rosters and corrections;
- leave, approvals, documents the employer uploads, letters, ID cards and the service book;
- where the employer uses them: maternity cases, certificates of fitness for adolescent workers, women's consent to night work, committee and trade union records, production, projects and timesheets;
- grievances raised through Speak up, which are anonymous unless the worker chooses to give their name;
- the workspace's logins and its audit log.

Some of this is sensitive, such as religion, health, pregnancy and union membership. The employer records it only where the law or its own policies need it, for example religion for festival bonuses.

## What we collect for our own business

- **Sign-up:** your name, work email, company, industry and language, the network address the request came from, and the version of the terms you accepted.
- **Logins:** name, email address or mobile number, language, and two-step sign-in settings. Passwords are stored only as a one-way hash (Argon2id), and session tokens are stored hashed.
- **Billing:** the company your invoices go to, with its address and BIN, your invoices, payments and the VAT and tax certificates you record. Card details and bKash PINs are entered on the payment gateway's own page; we never see or store them, only the gateway's confirmation of the payment.
- **Support:** your tickets, messages and attachments, and the error reference and page you tell us about.
- **Security records:** network addresses for rate limits against password guessing and floods of sign-ups, and the platform's audit log of what our staff do.
- **Cookies:** only those the site needs, to keep you signed in and to remember your language. There are no advertising or analytics cookies, and our pages load nothing from other sites.

## How we use it

We use personal data only to provide, secure and support Good People: to run your workspace, send the messages it needs (sign-in codes, the notifications your HR team turns on, invoices and reminders), bill you, answer support requests, and meet our own legal duties such as VAT and tax records. We do not sell personal data, show advertising, or use workspace data for any other purpose.

## How it is protected

- Identity numbers, account numbers, pay amounts and payroll results are encrypted in the database (AES-256-GCM), and documents are encrypted for their workspace and document before they are stored.
- Each workspace's records are kept apart in the database by row-level security, and each role sees only what it needs.
- Connections are encrypted (HTTPS). Two-step sign-in is available for every login with a password, and our server can require it for admins and anyone who handles pay.
- Our support staff can see a workspace only when a workspace admin grants access: read-only, for at most 7 days, ended early whenever the admin chooses, and every page they open is recorded in the workspace's audit log.
- We back up the service every day and check that the backups restore.

## Who helps us process it

We use these services, as each installation of Good People is configured:

- an email provider, to send email;
- SSL Wireless, a Bangladeshi SMS gateway, for sign-in codes and text messages;
- Firebase Cloud Messaging (Google), for notifications to the mobile app;
- SSLCommerz (cards and internet banking) and bKash, for online payments;
- the data centre or cloud provider that hosts the installation.

Each receives only what it needs for its task. We share personal data with authorities only when the law requires us to.

## Where it is stored

Where Good People is hosted is chosen for each deployment, and an option hosted in Bangladesh is available. We tell customers where their installation is hosted. Push notifications pass through Google's Firebase service, which may process them outside Bangladesh.

## How long we keep it

- Workspace data is kept while the agreement runs and is then deleted as the [Data Processing Agreement](/legal/dpa) describes. Backups are overwritten in their normal rotation.
- Our invoices and billing records are kept for as long as VAT and tax law requires.
- Sign-up and security records are kept for as long as we need them to run the service and prevent abuse.

## Your rights

You can ask us for a copy of the personal data we hold about you for our own business, and ask us to correct it or, where the law does not require us to keep it, delete it. For data in an employer's workspace, ask the employer; HR can correct most records in the workspace itself, and we help the employer with anything it cannot do there.

The Personal Data Protection Ordinance 2025 is not yet in force. When it is, we will follow it and update this policy.

## Children

Good People is a service for organisations. Employers may record adolescent workers (aged 14 to 18) as the Labour Act allows. We do not knowingly collect personal data from children for any other purpose.

## Changes and contact

We date each version of this policy and announce changes to workspaces before they take effect. Questions about privacy, or a security problem you have found, can go to the address at the foot of this page.
