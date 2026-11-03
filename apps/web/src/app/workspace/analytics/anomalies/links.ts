import { addDays, addMonths, type AnomalyDefinition } from '@gp/shared';

export const anomalyPath = '/workspace/analytics/anomalies';
export const anomalyApi = '/tenant/analytics/anomalies';
export const anomalyQuery = (definition: AnomalyDefinition) =>
  new URLSearchParams(Object.entries(definition)).toString();

export function anomalySources(definition: AnomalyDefinition) {
  const from = definition.month + '-01';
  const through = addDays(addMonths(from, 1), -1);
  if (definition.rule === 'assignment_coverage')
    return { source: '/workspace/analytics?asOf=' + through, correction: '/workspace/employees' };
  if (definition.rule === 'payroll_movement')
    return {
      source: '/workspace/analytics/insights?kind=payroll&month=' + definition.month,
      correction: '/workspace/payroll/runs',
    };
  return {
    source:
      '/workspace/analytics/insights?' +
      new URLSearchParams({
        kind: 'attendance',
        month: definition.month,
        companyId: definition.companyId,
      }),
    correction: '/workspace/attendance/summary?month=' + definition.month,
  };
}
