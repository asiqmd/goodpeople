import type { TrainingCertificateView } from '@gp/shared';
import { escapeHtml, page } from '../letters/render.js';
import { date } from '../payroll/payslip.js';
export function trainingCertificateHtml(c: TrainingCertificateView, language: 'en' | 'bn') {
  const bn = language === 'bn';
  const text = (en: string, local: string) => (bn ? local : en);
  const e = escapeHtml;
  return page(
    language,
    'main{padding:38px}h1{font-size:24pt;margin:30px 0}.revoked{color:#b91c1c;border:2px solid #b91c1c;padding:12px}.note{margin-top:36px;font-size:9pt;color:#475569}',
    `<main><p>${e(c.company.name)}</p><h1>${text('Training completion record', 'প্রশিক্ষণ সম্পন্ন করার রেকর্ড')}</h1><p>${e(c.number)}</p>${c.revokedAt ? `<p class="revoked">${text('REVOKED', 'প্রত্যাহৃত')}: ${e(c.revokeReason ?? '')}</p>` : ''}<h2>${e(bn ? (c.employee.fullNameBn ?? c.employee.fullName) : c.employee.fullName)}</h2><p>${e(c.employee.employeeCode)}</p><p>${text('Course', 'কোর্স')}: <strong>${e(bn ? c.courseNameBn : c.courseName)}</strong></p><p>${text('Trainer', 'প্রশিক্ষক')}: ${e(c.trainer)}</p><p>${text('Completed on', 'সম্পন্ন হয়েছে')}: ${e(date(language, c.completedOn))}</p><p>${text('Valid through', 'মেয়াদ শেষ')}: ${c.expiresOn ? e(date(language, c.expiresOn)) : text('No expiry under the recorded course policy', 'নথিভুক্ত কোর্স নীতিতে মেয়াদ নির্ধারিত নেই')}</p><p class="note">${text('Attendance recorded by the employer in Good People. This record does not imply external accreditation.', 'নিয়োগকর্তা Good People-এ উপস্থিতি নথিভুক্ত করেছেন। এই রেকর্ড বাইরের কোনো প্রতিষ্ঠানের স্বীকৃতি বোঝায় না।')}</p></main>`,
  );
}
