import type { SaudiPilotView } from '@gp/shared';
import { page, escapeHtml as e } from '../letters/render.js';
export function renderSaudiPreview(pilot: SaudiPilotView, language: 'en' | 'bn' | 'ar') {
  const labels =
    language === 'ar'
      ? {
          title:
            '\u0645\u0639\u0627\u064a\u0646\u0629 \u0631\u0648\u0627\u062a\u0628 \u0627\u0644\u0633\u0639\u0648\u062f\u064a\u0629',
          notice:
            '\u0645\u0639\u0627\u064a\u0646\u0629 \u063a\u064a\u0631 \u0645\u0631\u0627\u062c\u0639\u0629 - \u0644\u064a\u0633\u062a \u0643\u0634\u0641 \u0631\u0627\u062a\u0628 \u0635\u0627\u062f\u0631\u0627 \u0623\u0648 \u0625\u062b\u0628\u0627\u062a \u062f\u0641\u0639. \u0627\u0644\u0645\u0631\u0627\u062c\u0639\u0629 \u0627\u0644\u0642\u0627\u0646\u0648\u0646\u064a\u0629 \u0648\u0627\u0644\u0644\u063a\u0648\u064a\u0629 \u0645\u0637\u0644\u0648\u0628\u0629.',
          gross: '\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a',
          employee: '\u0627\u0634\u062a\u0631\u0627\u0643 \u0627\u0644\u0645\u0648\u0638\u0641',
          employer:
            '\u0627\u0634\u062a\u0631\u0627\u0643 \u0635\u0627\u062d\u0628 \u0627\u0644\u0639\u0645\u0644',
          government: '\u0627\u0644\u062f\u0639\u0645 \u0627\u0644\u062d\u0643\u0648\u0645\u064a',
          deductions: '\u0627\u0644\u062e\u0635\u0648\u0645\u0627\u062a',
          net: '\u0627\u0644\u0635\u0627\u0641\u064a',
        }
      : {
          title: 'Saudi payroll / settlement preview',
          notice:
            'UNREVIEWED PREVIEW - not an issued payslip or proof of payment. Legal, payroll and language review required.',
          gross: 'Gross',
          employee: 'Employee contribution',
          employer: 'Employer contribution',
          government: 'Government support',
          deductions: 'Other deductions',
          net: 'Net',
        };
  const body =
    `<h1>${e(labels.title)}</h1><p class="notice">${e(labels.notice)}</p><p><bdi>${e(pilot.kind)} / ${e(pilot.periodStart)} - ${e(pilot.periodEnd)} / SAR</bdi></p>` +
    pilot.result.lines
      .map(
        (line) =>
          `<section><h2><bdi>${e(line.employeeId)}</bdi></h2><table>${[
            [labels.gross, line.gross],
            [labels.employee, line.employeeContribution],
            [labels.employer, line.employerContribution],
            [labels.government, line.governmentContribution],
            [labels.deductions, line.deductions],
            [labels.net, line.net],
          ]
            .map(
              ([label, value]) =>
                `<tr><td>${e(label!)}</td><td><bdi>SAR ${e(value!)}</bdi></td></tr>`,
            )
            .join(
              '',
            )}</table><ul>${line.components.map((c) => `<li><bdi>${e(c.code)}: SAR ${e(c.amount)}</bdi></li>`).join('')}</ul></section>`,
      )
      .join('') +
    `<p class="hash"><bdi>Manifest: ${e(pilot.manifestHash)}<br>Calculation: ${e(pilot.calculationHash)}</bdi></p><p dir="ltr">${pilot.result.warnings.map(e).join('<br>')}</p>`;
  return page(
    language,
    '@page{size:A4;margin:18mm}body{width:auto;margin:0;padding:0;font-size:11pt}h1{font-size:18pt}h2{font-size:10pt}section{break-inside:avoid;border:1px solid #cbd5e1;padding:4mm;margin:5mm 0}table{width:100%;border-collapse:collapse}td{padding:2mm;border-bottom:1px solid #e2e8f0}.notice{background:#fef3c7;padding:4mm;font-weight:bold}.hash{overflow-wrap:anywhere;font-size:8pt}bdi{direction:ltr;unicode-bidi:isolate}',
    body,
  );
}
