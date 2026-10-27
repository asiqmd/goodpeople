---
title: The RMG pack for factories
summary: Piece rates, working-time alerts, maternity benefit, committees, grievances, kiosks and the buyer audit report, all read from the records that pay people.
category: packs
order: 10
updated: 2026-10-27
related: /workspace/production /workspace/compliance /workspace/leave/maternity /workspace/grievances /workspace/compliance/audit
---

The RMG pack is what a garment factory needs on top of HR, attendance and payroll, and it works for any factory. There is no second set of books: every page and report is read from the attendance, leave and payroll that pay people.

## Which plan includes what

- **Piece rates and production** come with Growth and up.
- **Worker kiosks** come with Business and up.
- The rest is the law and comes with the module it builds on: working-time alerts with attendance, maternity benefit with leave, and committees, unions, grievances and the buyer audit report on every plan.

## Production and piece rates

Under **Production**, add **Operations** (collar attach, side seam…) with a piece rate, or a daily target and an incentive per piece above it. In **Daily entry**, pick a line, a date and an operation, then type down the column of that line's workers. **Import** takes an .xlsx or .csv sheet and lists each row it could not save with the reason. **Month summary** shows pieces by worker, line and day, with CSV files.

Payroll reads the month's production. A piece-rated worker stays on their wage-board structure and is paid what the pieces earn above the time wage as `PIECE_PAY`, so the grade's minimum wage is always met. Incentives are paid as `PROD_INCENTIVE`. Pieces cannot change while a run waits for approval or once it is locked.

## Working time

**Compliance** checks working time every hour from processed attendance, and on demand with **Check now**:

- adults over 10 hours a day (s.100) or 60 a week (s.102), or seven days without a day off (s.103);
- your own overtime caps per day, week and month, set under **Settings**;
- adolescents over their limits, or at work between 7 pm and 7 am (s.41);
- women working between 10 pm and 6 am without consent (s.109).

There is one alert per person, rule and period. It follows corrected hours and resolves itself, and HR acknowledges it with what was done. Alerts never block work or change pay: every hour worked is paid.

**Adolescents** lists workers under 18 with their certificates of fitness: upload each to the person's documents as **Certificate of fitness (adolescent)**. **Women at night** records the date each woman's signed consent takes effect.

## Maternity benefit

Under **Maternity**, open a case for each expected birth. It works out whether she is owed the benefit (six months' service; with two or more surviving children she keeps the leave but gets no benefit), the average daily wage from locked payroll, and when each part of the payment option she chose is due. Her linked maternity leave is unpaid in payroll, because the benefit pays it. Record each payment and download the statement in English or Bangla.

## Committees, unions and grievances

- **Committees**: participation, safety and complaint committees per establishment, with members, meetings and minutes. Gaps against what the workforce requires become alerts.
- **Trade unions**: members, the CBA, and dues deducted in payroll (`UNION_SUB`) only for members who consented, with a monthly check-off report.
- **Grievances**: workers speak up from a public page, a kiosk or the QR code on the printed poster, anonymously unless they give their name, and read answers with their reference and PIN. Harassment cases go only to the complaint committee. Each case shows the 30 days the employer has to decide (s.33).

## Kiosks and the buyer audit report

Workers without smartphones use a shared tablet: see [Kiosks for workers](/help/kiosks).

The **Buyer audit report**, under **Compliance**, covers a period for a company or a site: hours and overtime, wages against the wage board, leave, maternity, adolescents, committees, unions, grievance counts and alerts. It is a page, a PDF in English or Bangla, and the weekly hours as CSV.

> Some 2025–26 amendments (maternity days, union thresholds, the complaint committee) still wait for counsel's review. Check them with your labour lawyer before you rely on them.
