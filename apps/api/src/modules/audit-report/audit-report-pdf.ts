import type { AuditReportView } from '@gp/shared';
import { escapeHtml, page } from '../letters/render.js';
import { date } from '../payroll/payslip.js';

// The buyer-audit report as a printable A4 document in English or Bangla. Every figure comes
// with the rule it is read against, so an auditor can check the working.

type Language = 'en' | 'bn';

const LABELS = {
  en: {
    title: 'Social compliance report',
    period: 'Period',
    establishment: 'Establishment',
    all: 'All companies and sites',
    generated: 'Prepared',
    note: 'Prepared by Good People from attendance, payroll, leave and HR records; there is no separate set of figures for audits.',
    workforce: 'Workforce',
    total: 'People employed in the period',
    workers: 'Workers',
    staff: 'Staff',
    women: 'Women',
    men: 'Men',
    children: 'Under 14 (not allowed, s.34)',
    adolescents: 'Adolescents (14–17) and their certificates of fitness (s.34, s.37)',
    code: 'Code',
    name: 'Name',
    age: 'Age',
    certificate: 'Certificate valid until',
    missing: 'Missing',
    none: 'None',
    hours: 'Working hours (s.100–s.103)',
    notTracked: 'Attendance is not tracked for this period.',
    workerWeeks: 'Person-weeks recorded',
    over48: 'Weeks over 48 hours (overtime worked)',
    over60: 'Weeks over 60 hours (above the legal maximum)',
    maxWeek: 'Longest week, hours',
    avgWeek: 'Average week, hours',
    over10: 'Days over 10 hours',
    noHoliday: 'People who worked 7 or more days in a row',
    longest: 'Longest weeks',
    weekFrom: 'Week from',
    hoursCol: 'Hours',
    otCol: 'Overtime',
    overtime: 'Overtime (s.102, s.108)',
    otTotal: 'Overtime hours worked',
    otPeople: 'People who worked overtime',
    otMaxMonth: 'Most overtime by one person in a month, hours',
    otAvgMonth: 'Average overtime per person per month, hours',
    otCap: (h: string) => `Over the company's monthly cap of ${h} hours`,
    otPaid: 'Overtime paid in locked payrolls',
    otRecorded: (r: string, p: string, d: string) =>
      `${r} hours recorded, ${p} hours paid; ${d} people with a difference`,
    wages: 'Wages (s.120–s.123, s.149)',
    runs: 'Payrolls for the period',
    payGroup: 'Pay group',
    status: 'Status',
    due: 'Pay by',
    paid: 'Paid on',
    late: 'Late',
    onTime: 'On time',
    onBoard: 'People paid under a wage board',
    belowMinimum: 'Pay below the wage board minimum',
    grade: 'Grade',
    gross: 'Gross',
    minimum: 'Minimum gross',
    leave: 'Leave and holidays (s.115–s.118)',
    type: 'Leave',
    days: 'Days',
    people: 'People',
    festival: 'Festival holidays in the period',
    maternity: 'Maternity benefit (s.45–s.50)',
    cases: 'Cases',
    eligible: 'With benefit',
    partsDue: 'Payments due',
    paidOnTime: 'Paid on time',
    paidLate: 'Paid late',
    overdue: 'Overdue',
    committees: 'Committees (s.90A, s.205–s.208, s.332A)',
    kind: {
      participation: 'Participation committee',
      safety: 'Safety committee',
      complaint: 'Complaint committee (harassment)',
      other: 'Other committee',
    } as Record<string, string>,
    formed: 'Formed',
    ends: 'Term ends',
    workerSide: 'Workers',
    employerSide: 'Employer',
    lastMeeting: 'Last meeting',
    meetings: 'Meetings in period',
    unions: 'Trade unions',
    cba: 'Collective bargaining agent',
    members: 'Members',
    checkOff: 'Dues deducted from wages',
    yes: 'Yes',
    no: 'No',
    grievances: 'Grievances (s.33)',
    received: 'Received in the period',
    overdueGrievances: 'Open beyond the 30 days to decide',
    medianReply: 'Median days to the first answer',
    byCategory: 'By subject',
    alerts: 'Compliance alerts in the period',
    open: 'Open',
    acknowledged: 'Acknowledged',
    resolved: 'Resolved',
  },
  bn: {
    title: 'সামাজিক কমপ্লায়েন্স প্রতিবেদন',
    period: 'সময়কাল',
    establishment: 'প্রতিষ্ঠান',
    all: 'সব কোম্পানি ও কর্মস্থল',
    generated: 'প্রস্তুত',
    note: 'হাজিরা, বেতন, ছুটি ও মানবসম্পদ রেকর্ড থেকে Good People প্রস্তুত করেছে; অডিটের জন্য আলাদা কোনো হিসাব নেই।',
    workforce: 'জনবল',
    total: 'এ সময়ে নিযুক্ত',
    workers: 'শ্রমিক',
    staff: 'স্টাফ',
    women: 'নারী',
    men: 'পুরুষ',
    children: '১৪ বছরের কম (নিষিদ্ধ, ধারা ৩৪)',
    adolescents: 'কিশোর (১৪–১৭) ও তাদের সক্ষমতা সনদ (ধারা ৩৪, ৩৭)',
    code: 'কোড',
    name: 'নাম',
    age: 'বয়স',
    certificate: 'সনদের মেয়াদ',
    missing: 'নেই',
    none: 'নেই',
    hours: 'কর্মঘণ্টা (ধারা ১০০–১০৩)',
    notTracked: 'এই সময়ের হাজিরা রাখা হয়নি।',
    workerWeeks: 'লিপিবদ্ধ জন-সপ্তাহ',
    over48: '৪৮ ঘণ্টার বেশি সপ্তাহ (অতিরিক্ত কাজসহ)',
    over60: '৬০ ঘণ্টার বেশি সপ্তাহ (আইনি সীমার বেশি)',
    maxWeek: 'সবচেয়ে দীর্ঘ সপ্তাহ, ঘণ্টা',
    avgWeek: 'গড় সপ্তাহ, ঘণ্টা',
    over10: '১০ ঘণ্টার বেশি দিন',
    noHoliday: 'টানা ৭ দিন বা বেশি কাজ করেছেন',
    longest: 'সবচেয়ে দীর্ঘ সপ্তাহগুলো',
    weekFrom: 'সপ্তাহ শুরু',
    hoursCol: 'ঘণ্টা',
    otCol: 'অতিরিক্ত',
    overtime: 'অতিরিক্ত কাজ (ধারা ১০২, ১০৮)',
    otTotal: 'অতিরিক্ত কাজের মোট ঘণ্টা',
    otPeople: 'অতিরিক্ত কাজ করেছেন',
    otMaxMonth: 'এক মাসে একজনের সর্বোচ্চ অতিরিক্ত কাজ, ঘণ্টা',
    otAvgMonth: 'মাসে জনপ্রতি গড় অতিরিক্ত কাজ, ঘণ্টা',
    otCap: (h: string) => `কোম্পানির মাসিক সীমা ${h} ঘণ্টার বেশি`,
    otPaid: 'লক করা বেতনে পরিশোধিত অতিরিক্ত কাজ',
    otRecorded: (r: string, p: string, d: string) =>
      `${r} ঘণ্টা লিপিবদ্ধ, ${p} ঘণ্টা পরিশোধিত; ${d} জনের হিসাবে পার্থক্য`,
    wages: 'মজুরি (ধারা ১২০–১২৩, ১৪৯)',
    runs: 'এ সময়ের বেতন',
    payGroup: 'বেতন গ্রুপ',
    status: 'অবস্থা',
    due: 'পরিশোধের শেষ দিন',
    paid: 'পরিশোধ',
    late: 'বিলম্বিত',
    onTime: 'সময়মতো',
    onBoard: 'মজুরি বোর্ডের অধীনে বেতনপ্রাপ্ত',
    belowMinimum: 'মজুরি বোর্ডের ন্যূনতমের কম বেতন',
    grade: 'গ্রেড',
    gross: 'মোট',
    minimum: 'ন্যূনতম মোট',
    leave: 'ছুটি ও উৎসব ছুটি (ধারা ১১৫–১১৮)',
    type: 'ছুটি',
    days: 'দিন',
    people: 'জন',
    festival: 'এ সময়ের উৎসব ছুটি',
    maternity: 'প্রসূতি কল্যাণ সুবিধা (ধারা ৪৫–৫০)',
    cases: 'ঘটনা',
    eligible: 'সুবিধাপ্রাপ্ত',
    partsDue: 'পরিশোধযোগ্য কিস্তি',
    paidOnTime: 'সময়মতো পরিশোধ',
    paidLate: 'বিলম্বে পরিশোধ',
    overdue: 'বকেয়া',
    committees: 'কমিটি (ধারা ৯০ক, ২০৫–২০৮, ৩৩২ক)',
    kind: {
      participation: 'অংশগ্রহণকারী কমিটি',
      safety: 'সেফটি কমিটি',
      complaint: 'অভিযোগ কমিটি (হয়রানি)',
      other: 'অন্যান্য কমিটি',
    } as Record<string, string>,
    formed: 'গঠন',
    ends: 'মেয়াদ শেষ',
    workerSide: 'শ্রমিক',
    employerSide: 'মালিক',
    lastMeeting: 'শেষ সভা',
    meetings: 'এ সময়ের সভা',
    unions: 'ট্রেড ইউনিয়ন',
    cba: 'যৌথ দরকষাকষি প্রতিনিধি',
    members: 'সদস্য',
    checkOff: 'মজুরি থেকে চাঁদা কর্তন',
    yes: 'হ্যাঁ',
    no: 'না',
    grievances: 'অভিযোগ (ধারা ৩৩)',
    received: 'এ সময়ে প্রাপ্ত',
    overdueGrievances: 'সিদ্ধান্তের ৩০ দিন পেরিয়ে খোলা',
    medianReply: 'প্রথম উত্তরে মধ্যম দিন',
    byCategory: 'বিষয় অনুযায়ী',
    alerts: 'এ সময়ের কমপ্লায়েন্স সতর্কতা',
    open: 'খোলা',
    acknowledged: 'স্বীকৃত',
    resolved: 'সমাধান',
  },
};

const CATEGORY = {
  en: {
    wages: 'Wages',
    hours: 'Hours',
    leave: 'Leave',
    safety: 'Safety',
    harassment: 'Harassment',
    discrimination: 'Discrimination',
    facilities: 'Facilities',
    other: 'Other',
  },
  bn: {
    wages: 'মজুরি',
    hours: 'কর্মঘণ্টা',
    leave: 'ছুটি',
    safety: 'নিরাপত্তা',
    harassment: 'হয়রানি',
    discrimination: 'বৈষম্য',
    facilities: 'সুবিধাদি',
    other: 'অন্যান্য',
  },
} as Record<Language, Record<string, string>>;

const ALERT = {
  en: {
    daily_hours: 'Over 10 hours in a day',
    weekly_hours: 'Over 60 hours in a week',
    no_weekly_holiday: 'No weekly holiday',
    overtime_daily: 'Over the daily overtime cap',
    overtime_weekly: 'Over the weekly overtime cap',
    overtime_monthly: 'Over the monthly overtime cap',
    adolescent_daily: 'Adolescent: over the daily hours',
    adolescent_weekly: 'Adolescent: over the weekly hours',
    adolescent_night: 'Adolescent: work at night',
    adolescent_certificate: 'Adolescent: no valid certificate of fitness',
    women_night: 'Woman at night without consent',
    committee_missing: 'Committee missing',
    committee_meeting_overdue: 'Committee meeting overdue',
    committee_minutes_late: 'Minutes sent late',
    committee_term_ended: 'Committee term ended',
  },
  bn: {
    daily_hours: 'দিনে ১০ ঘণ্টার বেশি',
    weekly_hours: 'সপ্তাহে ৬০ ঘণ্টার বেশি',
    no_weekly_holiday: 'সাপ্তাহিক ছুটি নেই',
    overtime_daily: 'দৈনিক অতিরিক্ত কাজের সীমার বেশি',
    overtime_weekly: 'সাপ্তাহিক অতিরিক্ত কাজের সীমার বেশি',
    overtime_monthly: 'মাসিক অতিরিক্ত কাজের সীমার বেশি',
    adolescent_daily: 'কিশোর: দৈনিক ঘণ্টার বেশি',
    adolescent_weekly: 'কিশোর: সাপ্তাহিক ঘণ্টার বেশি',
    adolescent_night: 'কিশোর: রাতে কাজ',
    adolescent_certificate: 'কিশোর: বৈধ সক্ষমতা সনদ নেই',
    women_night: 'সম্মতি ছাড়া নারীর রাতে কাজ',
    committee_missing: 'কমিটি নেই',
    committee_meeting_overdue: 'কমিটির সভা বকেয়া',
    committee_minutes_late: 'কার্যবিবরণী দেরিতে পাঠানো',
    committee_term_ended: 'কমিটির মেয়াদ শেষ',
  },
} as Record<Language, Record<string, string>>;

const CSS = `
@page{size:A4;margin:12mm 14mm}
h1{font-size:15pt;margin:0 0 4px}
h2{font-size:11pt;margin:14px 0 6px;border-bottom:1.5px solid #15803d;padding-bottom:2px}
.meta{font-size:9pt;color:#374151}
.note{font-size:8pt;color:#6b7280;margin-top:4px}
.figures{display:grid;grid-template-columns:1fr 1fr;gap:2px 18px;font-size:9pt}
.figures div{display:flex;justify-content:space-between;border-bottom:1px dotted #e5e7eb;padding:2px 0}
.figures b{font-variant-numeric:tabular-nums}
.bad{color:#b91c1c;font-weight:700}
.num{text-align:right;font-variant-numeric:tabular-nums}
table{margin-top:6px}
section{break-inside:avoid}`;

const n = (language: Language, value: number | string) =>
  new Intl.NumberFormat(language === 'bn' ? 'bn-BD' : 'en-IN', { maximumFractionDigits: 1 }).format(
    Number(value),
  );

export function auditReportHtml(r: AuditReportView, language: Language): string {
  const l = LABELS[language];
  const d = (iso: string) => date(language, iso);
  const figure = (label: string, value: number | string, bad = false) =>
    `<div><span>${label}</span><b class="${bad ? 'bad' : ''}">${typeof value === 'number' ? n(language, value) : escapeHtml(value)}</b></div>`;
  const table = (head: string[], rows: string[][], numeric: number[] = []) =>
    rows.length === 0
      ? `<p class="meta">${l.none}</p>`
      : `<table><thead><tr>${head.map((h, i) => `<th${numeric.includes(i) ? ' class="num"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>${rows
          .map(
            (row) =>
              `<tr>${row.map((c, i) => `<td${numeric.includes(i) ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`,
          )
          .join('')}</tbody></table>`;
  const place =
    [r.establishment.entity, r.establishment.location].filter(Boolean).join(', ') || l.all;
  const w = r.workforce;
  const h = r.hours;
  const o = r.overtime;
  const m = r.leave.maternity;
  return page(
    language,
    CSS,
    `<h1>${l.title}</h1>
<div class="meta">${l.establishment}: ${escapeHtml(place)} · ${l.period}: ${d(r.from)} – ${d(r.to)} · ${l.generated}: ${d(r.generatedAt.slice(0, 10))}</div>
<div class="note">${l.note}</div>

<section><h2>${l.workforce}</h2><div class="figures">
${figure(l.total, w.total)}${figure(l.workers, w.workers)}${figure(l.staff, w.staff)}${figure(l.women, w.women)}${figure(l.men, w.men)}${figure(l.children, w.children, w.children > 0)}
</div>
<p class="meta">${l.adolescents}</p>
${table(
  [l.code, l.name, l.age, l.certificate],
  w.adolescents.map((a) => [
    escapeHtml(a.code),
    escapeHtml(a.name),
    n(language, a.age),
    a.certificateUntil ? d(a.certificateUntil) : `<span class="bad">${l.missing}</span>`,
  ]),
  [2],
)}</section>

<section><h2>${l.hours}</h2>${
      h.tracked
        ? `<div class="figures">
${figure(l.workerWeeks, h.workerWeeks)}${figure(l.over48, h.weeksOver48)}${figure(l.over60, h.weeksOver60, h.weeksOver60 > 0)}${figure(l.maxWeek, h.maxWeeklyHours)}${figure(l.avgWeek, h.averageWeeklyHours)}${figure(l.over10, h.daysOver10, h.daysOver10 > 0)}${figure(l.noHoliday, h.withoutWeeklyHoliday, h.withoutWeeklyHoliday > 0)}
</div>
<p class="meta">${l.longest}</p>
${table(
  [l.code, l.name, l.weekFrom, l.hoursCol, l.otCol],
  h.longest.map((x) => [
    escapeHtml(x.code),
    escapeHtml(x.name),
    d(x.weekStart),
    n(language, x.hours),
    n(language, x.overtime),
  ]),
  [3, 4],
)}`
        : `<p class="meta">${l.notTracked}</p>`
    }</section>

<section><h2>${l.overtime}</h2><div class="figures">
${figure(l.otTotal, o.totalHours)}${figure(l.otPeople, o.people)}${figure(l.otMaxMonth, o.maxMonthlyHours)}${figure(l.otAvgMonth, o.averageMonthlyHours)}${
      o.monthlyCapHours === null
        ? ''
        : figure(l.otCap(n(language, o.monthlyCapHours)), o.overMonthlyCap, o.overMonthlyCap > 0)
    }${figure(
      l.otPaid,
      l.otRecorded(
        n(language, o.paid.recordedHours),
        n(language, o.paid.paidHours),
        n(language, o.paid.differences),
      ),
      o.paid.differences > 0,
    )}
</div></section>

<section><h2>${l.wages}</h2>
<p class="meta">${l.runs}</p>
${table(
  [l.period, l.payGroup, l.status, l.due, l.paid, ''],
  r.wages.runs.map((x) => [
    escapeHtml(x.period),
    escapeHtml(x.payGroup),
    escapeHtml(x.status),
    d(x.paymentDue),
    x.paidOn ? d(x.paidOn) : '—',
    x.late ? `<span class="bad">${l.late}</span>` : l.onTime,
  ]),
)}
<div class="figures">${figure(l.onBoard, r.wages.onWageBoard)}${figure(l.belowMinimum, r.wages.belowMinimum.length, r.wages.belowMinimum.length > 0)}</div>
${
  r.wages.belowMinimum.length
    ? table(
        [l.code, l.name, l.grade, l.gross, l.minimum],
        r.wages.belowMinimum.map((x) => [
          escapeHtml(x.code),
          escapeHtml(x.name),
          escapeHtml(`${x.board} ${x.grade}`),
          n(language, x.gross),
          n(language, x.minimumGross),
        ]),
        [3, 4],
      )
    : ''
}</section>

<section><h2>${l.leave}</h2>
${table(
  [l.type, l.days, l.people],
  r.leave.byType.map((x) => [
    escapeHtml(`${x.code} ${x.name}`),
    n(language, x.days),
    n(language, x.people),
  ]),
  [1, 2],
)}
<div class="figures">${figure(l.festival, r.leave.festivalHolidays)}</div>
<p class="meta">${l.maternity}</p>
<div class="figures">${figure(l.cases, m.cases)}${figure(l.eligible, m.eligible)}${figure(l.partsDue, m.partsDue)}${figure(l.paidOnTime, m.paidOnTime)}${figure(l.paidLate, m.paidLate, m.paidLate > 0)}${figure(l.overdue, m.overdue, m.overdue > 0)}</div>
</section>

<section><h2>${l.committees}</h2>
${table(
  [l.type, l.name, l.formed, l.ends, l.workerSide, l.employerSide, l.lastMeeting, l.meetings],
  r.committees.map((c) => [
    l.kind[c.kind] ?? c.kind,
    escapeHtml(c.name),
    d(c.formedOn),
    c.endsOn ? d(c.endsOn) : '—',
    n(language, c.workerMembers),
    n(language, c.employerMembers),
    c.lastMeeting ? d(c.lastMeeting) : '—',
    n(language, c.meetingsInPeriod),
  ]),
  [4, 5, 7],
)}
<p class="meta">${l.unions}</p>
${table(
  [l.name, l.cba, l.members, l.checkOff],
  r.unions.map((u) => [
    escapeHtml(u.name),
    u.isCba ? l.yes : l.no,
    n(language, u.members),
    u.checkOff ? l.yes : l.no,
  ]),
  [2],
)}</section>

<section><h2>${l.grievances}</h2><div class="figures">
${figure(l.received, r.grievances.total)}${figure(l.overdueGrievances, r.grievances.overdue, r.grievances.overdue > 0)}${figure(l.medianReply, r.grievances.medianDaysToFirstReply ?? '—')}
</div>
<p class="meta">${l.byCategory}</p>
<div class="figures">${Object.entries(r.grievances.byCategory)
      .map(([k, v]) => figure(CATEGORY[language][k] ?? k, v ?? 0))
      .join('')}</div></section>

<section><h2>${l.alerts}</h2>
${table(
  ['', l.open, l.acknowledged, l.resolved],
  r.alerts.map((a) => [
    ALERT[language][a.kind] ?? escapeHtml(a.kind),
    n(language, a.open),
    n(language, a.acknowledged),
    n(language, a.resolved),
  ]),
  [1, 2, 3],
)}</section>`,
  );
}
