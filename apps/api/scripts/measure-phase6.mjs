// Run against an isolated synthetic lab. The private input contains API tokens and fixture IDs.
// Usage: node apps/api/scripts/measure-phase6.mjs /path/to/private-input.json [baseline|mixed]
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

const [file, mode = 'baseline'] = process.argv.slice(2);
if (!file || !['baseline', 'mixed'].includes(mode))
  throw new Error('Supply a private input and a mode');
const {
  origin,
  tenant,
  month,
  serial = 25,
  rounds = 16,
  concurrency = 8,
} = JSON.parse(await readFile(file, 'utf8'));
const url = new URL(origin);
if (
  url.protocol !== 'http:' ||
  url.hostname !== '127.0.0.1' ||
  url.origin !== origin ||
  !tenant.slug.startsWith('m5-') ||
  !/^20\d\d-(0[1-9]|1[0-2])$/.test(month)
)
  throw new Error('Use the loopback API for an M5 synthetic tenant');
for (const [value, max] of [
  [serial, 100],
  [rounds, 100],
  [concurrency, 16],
])
  if (!Number.isInteger(value) || value < 1 || value > max) throw new Error('Invalid load bound');
if (mode === 'mixed' && concurrency < 2)
  throw new Error('Mixed load requires at least two clients');
const access = await fetch(origin + '/tenant/access', {
  headers: { authorization: 'Bearer ' + tenant.token },
  signal: AbortSignal.timeout(5000),
});
const workspace = access.ok ? (await access.json()).tenant : null;
if (
  workspace?.id !== tenant.id ||
  workspace.slug !== tenant.slug ||
  workspace.billingMode !== 'internal'
)
  throw new Error('The session must belong to the named internal scale fixture');
const monthEnd = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0))
  .toISOString()
  .slice(0, 10);
const base = '/tenant/analytics';
const query = new URLSearchParams({ companyId: tenant.companyId, month }).toString();
const endpoints = {
  workforce: {
    path: base + '/workforce?asOf=' + monthEnd,
    valid: (r) => r.metrics.some((m) => m.id === 'headcount' && m.value === tenant.size),
  },
  attendance: {
    path: base + '/insight?kind=attendance&' + query,
    valid: (r) => r.points[0].values.worked_minutes === String(tenant.size * 2400),
  },
  payrollInsight: {
    path: base + '/insight?kind=payroll&month=' + month,
    valid: (r) =>
      r.points.find((p) => p.month === month).values.employer_cost ===
      (tenant.size * 105.5).toFixed(2),
  },
  anomalyInbox: {
    path: base + '/anomalies/inbox?rule=attendance_movement&' + query,
    valid: (r) => Array.isArray(r.findings),
  },
  assistantAdmission: { path: '/tenant/assistant', valid: (r) => r.tenantId === tenant.id },
  employeePage: { path: '/tenant/employees?pageSize=25', valid: (r) => r.total === tenant.size },
  payrollRuns: { path: '/tenant/payroll/runs', valid: (r) => Array.isArray(r) && r.length === 4 },
};
const checks = [
  [
    'anomalyCheck',
    base + '/anomalies/scan',
    { rule: 'attendance_movement', month, companyId: tenant.companyId },
  ],
  ['assistantBudget', '/tenant/assistant/read', {}],
];

async function sample(path, { method = 'GET', body, valid } = {}) {
  const started = performance.now();
  try {
    const response = await fetch(origin + path, {
      method,
      headers: { authorization: 'Bearer ' + tenant.token, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    const ok = response.ok && (!valid || valid(JSON.parse(bytes.toString('utf8'))));
    return { ms: performance.now() - started, status: response.status, bytes: bytes.length, ok };
  } catch (error) {
    return { ms: performance.now() - started, status: error.name, bytes: 0, ok: false };
  }
}

function stats(samples) {
  const times = samples.map((r) => r.ms).toSorted((a, b) => a - b);
  const percentile = (q) => Number(times[Math.ceil(times.length * q) - 1].toFixed(2));
  return {
    requests: samples.length,
    errors: samples.filter((r) => !r.ok).length,
    statuses: Object.fromEntries(
      [...new Set(samples.map((r) => r.status))].map((status) => [
        status,
        samples.filter((r) => r.status === status).length,
      ]),
    ),
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    p99Ms: percentile(0.99),
    maxBytes: Math.max(...samples.map((r) => r.bytes)),
  };
}

const results = {};
const started = performance.now();
if (mode === 'baseline') {
  for (const [label, { path, valid }] of Object.entries(endpoints)) {
    const first = await sample(path, { valid });
    const warm = [];
    for (let i = 0; i < serial; i++) warm.push(await sample(path, { valid }));
    results[label] = { first, warm: stats(warm) };
  }
  for (const [label, path, body] of checks)
    results[label] = await sample(path, { method: 'POST', body });
} else {
  const samples = new Map();
  // One writer updates one synthetic employee serially while the other clients read.
  const work = Array.from({ length: rounds }, () => Object.entries(endpoints)).flat();
  const clients = Array.from({ length: concurrency - 1 }, async () => {
    while (work.length) {
      const [label, endpoint] = work.shift();
      const value = await sample(endpoint.path, endpoint);
      const group = samples.get(label) ?? [];
      group.push(value);
      samples.set(label, group);
    }
  });
  const writes = [];
  await Promise.all([
    ...clients,
    (async () => {
      for (let i = 0; i < rounds; i++)
        writes.push(
          await sample('/tenant/employees/' + tenant.employeeId, {
            method: 'PATCH',
            body: { fullName: 'Synthetic M5 timed edit ' + i },
          }),
        );
    })(),
  ]);
  for (const [label, group] of samples) results[label] = stats(group);
  results.employeeWrite = stats(writes);
}
console.log(
  JSON.stringify(
    {
      mode,
      employees: tenant.size,
      month,
      concurrency: mode === 'baseline' ? 1 : concurrency,
      elapsedMs: performance.now() - started,
      results,
    },
    null,
    2,
  ),
);
if (
  Object.values(results).some(
    (r) => r.errors || r.ok === false || r.first?.ok === false || r.warm?.errors,
  )
)
  process.exitCode = 1;
