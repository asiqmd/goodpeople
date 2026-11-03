import type { InsightDefinition } from '@gp/shared';

export const insightsPath = '/workspace/analytics/insights';
export function insightQuery(definition: InsightDefinition) {
  return new URLSearchParams(Object.entries(definition)).toString();
}
export function insightLink(definition: InsightDefinition) {
  return insightsPath + '?' + insightQuery(definition);
}
