---
title: Organisation sign-in and access
summary: Sign in through your organisation, manage company and field access, and prepare emergency recovery.
category: start
order: 100
updated: 2026-11-01
related: /workspace/identity /login
---

## Sign in through your organisation

Choose Organisation sign-in on the sign-in page, enter your workspace, and continue to your organisation's identity provider. Complete its checks. Good People may also ask for your authenticator code or first-time two-step setup. Matching email addresses do not automatically join accounts: your IT team must provision the login or you must verify and link your existing account from Account.

In the mobile app, choose Organisation, enter the workspace, and open the secure browser. After completing sign-in, return to the app and press Finish sign-in. The app must be the one that started the request. If the request expires, start again.

SSO enforcement covers enrolled accounts. Managed logins use SSO; local worker sign-in and emergency administrators may have separate arrangements. Ask your administrator which method applies to you. An HR disable remains in effect even if the identity provider marks a login active. IT and HR may need to resolve separate restrictions.

## Give only the access needed

Enterprise administrators open Identity and access and confirm a recent authenticator code before changes. Create a custom role, choose its allowed and denied actions, and set read, write and export access for identity, bank, contact and pay fields. Then assign the role to selected companies or explicitly all current and future companies. A denial takes priority over an allowance. Field restrictions apply conservatively when roles overlap.

The preview shows permission coverage by company. Own and direct-report directory relationships further limit which employees appear. Removing the final assignment removes delegated access; a linked employee keeps their own employee service until the login is disabled. Returning to a built-in role requires an explicit administrator action.

Restricted fields are hidden or unavailable in searches, changes and exports. A download may be refused when it cannot safely exclude restricted fields. Payroll and historical workspace-wide financial reports currently require all-company access. A restricted editor offers safe partial profile changes rather than submitting hidden values.

## Connect and recover safely

Your IT team registers the provider and enters its details using the callback shown in the console. Only one provider can be active. Two different administrators must test it before enforcement. Provisioning groups grant only roles that a local administrator has approved; provisioning does not hire an employee or change pay. Link a managed login to the correct existing employee explicitly.

Prepare two individual local emergency administrators with passwords and two-step sign-in. Each must actually sign in successfully before enforcement can be enabled. Keep their recovery codes safe. Emergency use appears in the audit and alerts administrators. The last two recovery administrators are protected while enforcement is on.

Provisioning credentials are shown once and have an expiry. Store them securely, rotate them before expiry and revoke ones no longer needed. A deleted managed login is retained inactive for history. Restoring access is a deliberate approved action; contact IT if the provider cannot complete it automatically. Disabling a login ends its existing sessions without deleting the employee's payroll or employment record.
