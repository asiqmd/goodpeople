---
title: Data Processing Agreement
summary: How Good People processes the personal data in a customer's workspace on the customer's behalf, and the safeguards that apply.
updated: 2026-10-27
version: 2026-11-01
---

This agreement is part of our [Terms of Service](/legal/terms). It applies whenever Good People processes personal data in a customer's workspace on the customer's behalf. It is also published in Bangla; if the English and Bangla texts differ, the English text prevails.

## 1. Roles

The customer (the organisation that uses the workspace) is the data controller: it decides what personal data is recorded and why. Good People is the processor: it processes that data only to provide the service and only on the customer's instructions.

## 2. Subject matter, duration, nature and purpose

- **Subject matter:** hosting and running the customer's workspace for human resources, attendance, leave and payroll.
- **Duration:** for as long as the Terms of Service apply, and afterwards until the data is deleted under section 11.
- **Nature:** storing, organising, computing (for example attendance, leave balances, pay and tax), displaying, sending notifications, producing documents and files, backing up and deleting.
- **Purpose:** to provide Good People to the customer, keep it secure and support it.

## 3. Types of personal data and data subjects

- **Data subjects:** the customer's employees and workers, past and present, including adolescent workers (aged 14 to 18); their nominees, family members named in their records and emergency contacts; committee members from outside the workforce; workers who raise a grievance; and the people who have logins in the workspace.
- **Personal data:** names in English and Bangla, family details, date of birth, gender, contact details and addresses; identity numbers (national ID, birth registration, passport, TIN) and bank and mobile wallet account numbers; jobs and their history; pay, payroll results, tax, provident fund, loans and payments; attendance punches with app locations and photos where the customer requires them; leave, documents, letters and approvals; the workspace's logins and audit log.
- **Sensitive data, where the customer records it:** religion (for festival bonuses), health and pregnancy (sick and maternity leave, maternity cases, certificates of fitness, disability for tax), trade union membership and grievances, which are anonymous unless the worker gives their name.

## 4. Instructions

We process the data only on the customer's documented instructions. These are the Terms of Service, the way the customer's users set up and use the workspace, and any written instructions sent through support. If we think an instruction breaks the law, we tell the customer. We may also process data where Bangladeshi law requires it; we tell the customer first unless the law forbids that.

## 5. Confidentiality

Everyone at Good People who can reach customer data is bound to keep it confidential, and only staff who need access for their work have it. Our support staff can see a workspace only when a workspace admin grants access: read-only, for at most 7 days at a time, ended early whenever the admin chooses, and with every page they open recorded in the workspace's audit log.

## 6. Security

We keep these measures in place, and improve them over time:

- identity numbers, account numbers, pay amounts and payroll results encrypted in the database with AES-256-GCM, and documents encrypted for their workspace and document before they are stored;
- each workspace's records kept apart in the database by row-level security, and permissions by role, so each login sees only what its role allows;
- connections encrypted with HTTPS; passwords stored only as Argon2id hashes; limits on repeated sign-in attempts;
- two-step sign-in for every login with a password, which the server can require for admins and those who handle pay;
- a second person's approval for pay changes and payroll runs, unless a one-person workspace turns it off, which its audit log records;
- an audit log in each workspace, and a separate log of what our platform staff do;
- daily backups, checked by restoring them, with the encryption key kept apart from the backups.

We do not claim any security certification.

## 7. Sub-processors

The customer allows us to use these sub-processors, as each installation is configured:

- an email provider, to send email;
- SSL Wireless, for SMS;
- Firebase Cloud Messaging (Google), for notifications to the mobile app;
- SSLCommerz and bKash, for online payments (these receive billing data, not workspace data);
- the data centre or cloud provider that hosts the installation.

We tell the customer before we add or replace a sub-processor, and the customer may object on reasonable grounds. Each sub-processor is bound to protect the data, and we remain responsible to the customer for its work.

## 8. Where the data is processed

Where an installation is hosted is chosen for each deployment, and an option hosted in Bangladesh is available. We tell the customer where its workspace is hosted and do not move it elsewhere without telling the customer first. Push notifications pass through Google's Firebase service, which may process them outside Bangladesh.

## 9. Assistance

We help the customer, as far as the service allows, to:

- answer requests from the people whose data it holds; HR can find and correct most records in the workspace itself;
- keep the data secure and handle any breach;
- carry out any assessment the law asks of it.

## 10. Personal data breaches

If we become aware of a breach of security that affects the customer's personal data, we tell the customer without undue delay. We say what we know, what we are doing about it and whom to contact, and we keep the customer informed as we learn more.

## 11. Deletion or return at the end

- While the agreement runs, the customer can see and download its data in the workspace, including while it is read-only.
- When the agreement ends, the workspace stays read-only for 90 days so the customer can download what it needs. On the customer's written request in that period, we provide a copy of the workspace's data in a common machine-readable format.
- We then delete the workspace's data. Copies in backups are deleted as the backups expire in their normal rotation.
- We keep only what the law requires us to keep, such as our own invoices.
- The customer remains responsible for keeping the records the law requires an employer to keep, for example the registers that the Bangladesh Labour Rules 2015 require to be kept for three years (rule 363). If it needs us to keep the workspace for longer, it can ask for a separate agreement.

## 12. Audits

We give the customer the information it reasonably needs to show that this agreement is kept. The customer, or an auditor bound by confidentiality, may audit our compliance once a year, or after a breach, on 30 days' written notice, during business hours and in a way that does not harm the service or other customers. Each side bears its own costs.

## 13. Liability and precedence

The limits of liability in the Terms of Service apply to this agreement. Where this agreement and the Terms of Service differ on the protection of personal data, this agreement prevails.

## 14. Law

This agreement is governed by the laws of Bangladesh. The Personal Data Protection Ordinance 2025 is not yet in force; when it is, we will follow it and update this agreement to match.
