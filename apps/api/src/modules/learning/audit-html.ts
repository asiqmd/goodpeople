import type { TrainingAuditSection } from '@gp/shared';
import { escapeHtml } from '../letters/render.js';
import { date } from '../payroll/payslip.js';
export function learningAuditHtml(r: TrainingAuditSection, lang: 'en' | 'bn') {
  const bn = lang === 'bn';
  const label = (en: string, b: string) => (bn ? b : en);
  const n = (v: number) => new Intl.NumberFormat(bn ? 'bn-BD' : 'en-GB').format(v);
  const e = escapeHtml;
  return `<section><h2>${label('Training and fire drills', 'প্রশিক্ষণ ও অগ্নিনির্বাপন মহড়া')}</h2><p>${label('Coverage as of', 'প্রশিক্ষণের অবস্থা')} ${e(date(lang, r.asOf))}: ${label('Required / current / due / overdue', 'প্রয়োজনীয় / হালনাগাদ / বাকি / মেয়াদোত্তীর্ণ')} ${[r.required, r.current, r.due, r.overdue].map(n).join(' / ')}. ${label('Completions in period', 'সময়কালে সম্পন্ন')}: ${n(r.completions)}</p><table><thead><tr><th>${label('Employee', 'কর্মী')}</th><th>${label('Required course', 'প্রয়োজনীয় কোর্স')}</th><th>${label('Due on', 'নির্ধারিত তারিখ')}</th></tr></thead><tbody>${r.gaps.map((g) => `<tr><td>${e(g.employee.employeeCode)} ${e(bn ? (g.employee.fullNameBn ?? g.employee.fullName) : g.employee.fullName)}</td><td>${e(bn ? g.course.nameBn : g.course.name)}</td><td>${e(date(lang, g.dueOn))}</td></tr>`).join('')}</tbody></table><h3>${label('Recorded fire drills (latest first)', 'নথিভুক্ত অগ্নিনির্বাপন মহড়া (সাম্প্রতিকটি আগে)')}</h3><table><thead><tr><th>${label('Site', 'কর্মস্থল')}</th><th>${label('Held on', 'অনুষ্ঠিত')}</th><th>${label('Participants', 'অংশগ্রহণকারী')}</th><th>${label('Next due', 'পরবর্তী তারিখ')}</th></tr></thead><tbody>${r.drills.map((d) => `<tr><td>${e(d.location.name)}</td><td>${e(date(lang, d.heldOn))}</td><td>${n(d.participants)}</td><td>${e(date(lang, d.nextDueOn))}</td></tr>`).join('')}</tbody></table><p>${label('Recorded evidence and policy coverage; this is not a declaration of legal compliance.', 'এগুলো নথিভুক্ত তথ্য ও কোম্পানির নীতির হিসাব; আইনগত পরিপালনের ঘোষণা নয়।')}</p></section>`;
}
