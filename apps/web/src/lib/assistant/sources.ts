import 'server-only';
import { createHash } from 'node:crypto';
import {
  ASSISTANT_VERSION,
  assistantInsightResultSchema,
  assistantWorkforceResultSchema,
  INSIGHT_METRICS,
  type AssistantAdmission,
  type AssistantCitation,
  type AssistantMetric,
  type InsightMetric,
  type InsightIssue,
  type InsightState,
  type MetricState,
  type WorkforceMetric,
} from '@gp/shared';
import { contentFor, type ContentLocale } from '../help/content';
import { plainText } from '../help/markdown';
import { searchArticles, tokenize } from '../help/search';

const APPROVED_HELP = new Set([
  'analytics',
  'getting-started',
  'identity-and-access',
  'international-foundations',
  'learning',
  'leave-policies',
  'mobile-punch',
  'payslips',
  'sign-in-and-two-step',
]);

const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'my',
  'our',
  'i',
  'me',
  'can',
  'do',
  'does',
  'how',
  'where',
  'what',
  'to',
  'is',
  'are',
  'and',
  'for',
  'in',
  'show',
  'find',
  'see',
  'view',
  'open',
  'আমি',
  'আমার',
  'কীভাবে',
  'কিভাবে',
  'কোথায়',
  'কি',
  'কী',
  'দেখব',
  'দেখুন',
  'كيف',
  'أين',
  'ما',
  'هل',
  'لي',
  'في',
  'عن',
  'أرى',
]);

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function documents(locale: ContentLocale) {
  const library = contentFor(locale, true);
  return [
    ...library.help
      .filter((a) => APPROVED_HELP.has(a.slug))
      .map((a) => ({
        ...a,
        id: 'help:' + a.slug,
        href: '/help/' + a.slug,
        version: a.updated,
        classification: 'help' as const,
      })),
    ...library.legal
      .filter((a) => a.doc === 'privacy')
      .map((a) => ({
        ...a,
        id: 'policy:' + a.doc,
        slug: a.doc,
        href: '/legal/' + a.doc,
        locale: locale === 'ar' ? ('en' as const) : locale,
        classification: 'policy' as const,
      })),
  ];
}

type Document = ReturnType<typeof documents>[number];
export type DocumentAnswer = {
  title: string;
  quote: string;
  locale: ContentLocale;
  version: string;
  updated: string;
  classification: Document['classification'];
  href: string;
  citation: Extract<AssistantCitation, { kind: 'document' }>;
};

function passages(document: Document) {
  return [document.summary, ...plainText(document.body).split('\n').filter(Boolean)].slice(0, 201);
}

function documentAnswer(document: Document, passage: number): DocumentAnswer | null {
  const text = passages(document)[passage];
  if (!text) return null;
  return {
    title: document.title,
    quote: text.length > 320 ? text.slice(0, 317).replace(/\s+\S*$/, '') + '…' : text,
    locale: document.locale,
    version: document.version,
    updated: document.updated,
    classification: document.classification,
    href: document.href,
    citation: {
      kind: 'document',
      id: document.id,
      locale: document.locale,
      passage,
      revision: digest(document),
    },
  };
}

export function searchApprovedHelp(locale: ContentLocale, question: string): DocumentAnswer[] {
  const query = question
    .replace(/বেতনের\s+স্লিপ|বেতন\s+স্লিপ/gu, 'বেতন বিবরণী')
    .replace(/قسيمة\s+(?:راتبي|الراتب)/gu, 'payslip');
  const words = [...new Set(tokenize(query))].filter((word) => !STOP_WORDS.has(word)).slice(0, 10);
  if (!words.length) return [];
  const results = searchArticles(documents(locale), words.join(' '));
  const titleMatches = results.filter((document) => {
    const title = tokenize(document.title);
    return words.every((word) => title.some((token) => token.startsWith(word)));
  });
  const navigationQuestion = /\b(?:where|view|see|read|open|find)\b|কোথায়|দেখ|أين|عرض/iu.test(
    question,
  );
  const personalQuestion = /\bmy\b|আমার|নিজের|حسابي|راتبي/iu.test(question);
  return (titleMatches.length ? titleMatches : results).slice(0, 3).flatMap((document) => {
    let best = 0;
    let highest = -1;
    for (const [index, passage] of passages(document).entries()) {
      const tokens = tokenize(passage);
      const matches = words.filter((word) => tokens.some((token) => token.startsWith(word)));
      const navigationStep = /\b(?:opens?|go to|select|choose|tap)\b|খুলুন|যান|افتح|اختر/iu.test(
        passage,
      );
      const selfService = /\b(?:employees?|self-service)\b|কর্মী|আপনার|موظف|حسابك/iu.test(passage);
      const score =
        matches.length * 4 +
        Number(navigationQuestion && navigationStep) +
        Number(personalQuestion && selfService) * 2;
      if (score > highest) {
        highest = score;
        best = index;
      }
    }
    const answer = documentAnswer(document, best);
    return answer ? [answer] : [];
  });
}

export function resolveDocument(citation: Extract<AssistantCitation, { kind: 'document' }>) {
  const document = documents(citation.locale).find(
    (a) => a.id === citation.id && a.locale === citation.locale,
  );
  if (!document) return null;
  const answer = documentAnswer(document, citation.passage);
  return answer?.citation.revision === citation.revision ? answer : null;
}

type Reading = {
  id: WorkforceMetric | InsightMetric;
  value: string | null;
  state: MetricState | InsightState;
};

export type MetricAnswer = {
  kind: 'workforce' | 'insight';
  version: string;
  dataAsOf: string;
  from: string;
  through: string;
  scope: 'companies' | 'relationship' | 'company' | 'workspace';
  companyName?: string;
  currency?: string;
  reportKind?: 'attendance' | 'leave' | 'learning' | 'payroll';
  issue?: InsightIssue;
  readings: Reading[];
  href: string;
  citation: Extract<AssistantCitation, { kind: 'metric' }>;
};

function metricCitation(request: AssistantMetric, actor: AssistantAdmission, revision: string) {
  return {
    kind: 'metric' as const,
    request,
    revision: digest([ASSISTANT_VERSION, actor.tenantId, actor.actorId, request, revision]),
  };
}

export async function readAuthorizedMetric(
  request: AssistantMetric,
  actor: AssistantAdmission,
  read: (path: string) => Promise<unknown>,
): Promise<MetricAnswer | null> {
  if (request.kind === 'workforce') {
    const params = new URLSearchParams({ asOf: request.asOf });
    if (request.companyId) params.set('companyIds', request.companyId);
    const parsed = assistantWorkforceResultSchema.safeParse(
      await read('/tenant/analytics/workforce?' + params),
    );
    if (
      !parsed.success ||
      parsed.data.asOf !== request.asOf ||
      parsed.data.period.through !== request.asOf ||
      parsed.data.period.from !== request.asOf.slice(0, 7) + '-01'
    )
      return null;
    const report = parsed.data;
    const company = report.companies.find((c) => c.id === request.companyId);
    if (request.companyId && (!company || report.companies.length !== 1)) return null;
    return {
      kind: 'workforce',
      version: report.version,
      dataAsOf: report.dataAsOf,
      from: report.period.from,
      through: report.period.through,
      scope: report.scope,
      companyName: company?.name,
      readings: report.metrics.map((metric) => ({
        id: metric.id,
        state: metric.state,
        value:
          metric.value !== null && (metric.state === 'current' || metric.state === 'provisional')
            ? String(metric.value)
            : null,
      })),
      href: '/workspace/analytics?' + params,
      citation: metricCitation(request, actor, report.sourceRevision),
    };
  }
  const params = new URLSearchParams(Object.entries(request.report));
  const parsed = assistantInsightResultSchema.safeParse(
    await read('/tenant/analytics/insight?' + params),
  );
  if (
    !parsed.success ||
    new URLSearchParams(Object.entries(parsed.data.definition)).toString() !== params.toString()
  )
    return null;
  const report = parsed.data;
  const point = report.points.find((item) => item.month === request.report.month);
  if (!point) return null;
  const showValues = point.state === 'recorded' || point.state === 'provisional';
  if (showValues && request.report.kind === 'payroll' && !point.currency) return null;
  return {
    kind: 'insight',
    version: report.version,
    dataAsOf: report.dataAsOf,
    from: point.month,
    through: point.month,
    reportKind: request.report.kind,
    scope: request.report.kind === 'payroll' ? 'workspace' : 'company',
    currency: showValues ? (point.currency ?? undefined) : undefined,
    issue: point.issue,
    readings: INSIGHT_METRICS[request.report.kind].map((id) => ({
      id,
      state: point.state,
      value: showValues ? (point.values[id] ?? null) : null,
    })),
    href: '/workspace/analytics/insights?' + params,
    citation: metricCitation(request, actor, report.sourceRevision),
  };
}
