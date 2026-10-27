---
title: Import your employees from Excel
summary: Fill in the workspace's Excel template, check every row, then import all of them or only the valid ones.
category: start
order: 20
updated: 2026-10-27
related: /workspace/employees/import /workspace/employees/new /workspace/users
---

The fastest way to bring your people in is the Excel import. Workspace admins, HR admins and HR officers can use it, from **Employees** → **Import employees**.

## 1. Fill in the template

Choose **Download the Excel template**. It is made for your workspace and has three sheets:

- **Employees:** one row per person. The required columns are in bold: employee code, full name, father's and mother's names, date of birth, gender, mobile phone, present address with district and division, joining date, company (`legal_entity`), employment type and worker category.
- **Lists:** your own codes for companies, locations, units, designations, grades and cost centres, the division codes, and the allowed values such as genders and religions. Use the code before the "·".
- **Instructions:** the rules in short.

A few things to know:

- Write dates as `YYYY-MM-DD` and mobile numbers as `01XXXXXXXXX`.
- Everyone needs an NID, a birth registration number or a passport number.
- Leave the permanent address empty when it is the same as the present one.
- Leave `probation_ends_on` empty to use the Labour Act's probation period.
- `manager` is the employee code of their manager, someone already in the workspace or earlier in the file.
- `attendance_pin` is the number the person is enrolled under on the attendance devices.

One file holds up to 2,000 employees. For more, split them over several files.

## 2. Upload and check

Upload the filled-in file and choose **Check the file**. Every row is checked with the same rules as the hire form, and also for:

- employee codes, NIDs and device PINs used twice, in the file or already in the workspace;
- codes that do not exist in your workspace;
- managers who are neither employees yet nor earlier in the file.

You see how many rows are ready, and each row with a problem, its column and what is wrong. The problems are written in English.

> Nothing is created while you check. The checked rows are kept, encrypted, for one day; after that, upload the file again.

## 3. Import

- When every row is ready, choose **Import N employees**.
- When some rows have problems, fix the file and check it again, or choose **Import the N valid rows and skip the rest**.

The rows are imported in one go: either all of them are created or none are. The import also stays within your plan's employee limit: if the new people would take you past the number of active employees your plan allows, nothing is imported and you are told the limit. Each import is in the audit log.

## After the import

- **Logins:** the import does not create logins. Give them on the **Users** page with **Add a login**, linking each one to the employee code. Workers who only punch on the devices do not need one.
- **Pay:** give everyone their salary on their **Pay** tab. A salary needs a second person's approval unless your workspace has turned maker-checker off.
- **One person at a time:** for a new joiner, use **Hire employee** on the Employees page instead. The hire form can also give the person a workspace login.
