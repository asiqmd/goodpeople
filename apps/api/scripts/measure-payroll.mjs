// Times a payroll run end to end against a scale workspace (pnpm --filter @gp/db seed:scale;
// SCALE_SLUG=scale-20k SCALE_EMPLOYEES=20000 for the Phase 2 target).
// Usage: SEED_PASSWORD=… node apps/api/scripts/measure-payroll.mjs [slug] [API_URL]
// Processes this month's attendance, opens (or reopens) this month's run, computes it twice,
// reads pages of it, then locks it with maker-checker briefly off and publishes the payslips.

const SLUG = process.argv[2] ?? 'scale-test';
const API = process.argv[3] ?? process.env.API_URL ?? 'http://localhost:4000';
const PASSWORD = process.env.SEED_PASSWORD;
if (!PASSWORD) throw new Error('Set SEED_PASSWORD');

async function call(path, { token, method = 'GET', body } = {}) {
  const started = performance.now();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const pdf = res.headers.get('content-type')?.includes('pdf');
  const json = res.status === 204 || pdf ? null : await res.json();
  if (pdf) await res.arrayBuffer();
  const ms = performance.now() - started;
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(json)}`);
  return { json, ms };
}

const line = (label, ms, extra = '') =>
  console.log(
    `${label.padEnd(40)} ${ms >= 10_000 ? `${(ms / 1000).toFixed(1)} s` : `${ms.toFixed(0)} ms`}${extra && `  ${extra}`}`,
  );

const token = (
  await call('/auth/login', {
    method: 'POST',
    body: { tenant: SLUG, email: `admin@${SLUG}.test`, password: PASSWORD },
  })
).json.accessToken;

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
const month = today.slice(0, 7);

const processed = await call('/tenant/attendance/process', {
  token,
  method: 'POST',
  body: { from: `${month}-01`, to: today },
});
line(`Process ${month} attendance`, processed.ms, `${processed.json.days} days`);

const groups = (await call('/tenant/payroll/pay-groups', { token })).json;
const group = groups.find((g) => g.isDefault);
for (const run of (await call('/tenant/payroll/runs', { token })).json) {
  if (run.payGroup.id === group.id && run.periodStart === `${month}-01`) {
    if (run.status === 'locked') throw new Error(`${month} is already locked in ${SLUG}`);
    if (run.status !== 'cancelled') {
      await call(`/tenant/payroll/runs/${run.id}/cancel`, { token, method: 'POST' });
    }
  }
}
const run = (
  await call('/tenant/payroll/runs', { token, method: 'POST', body: { payGroupId: group.id, month } })
).json;

const first = await call(`/tenant/payroll/runs/${run.id}/compute`, { token, method: 'POST' });
line('Compute', first.ms, `${first.json.headcount} people, ${first.json.warnings} with warnings`);
const again = await call(`/tenant/payroll/runs/${run.id}/compute`, { token, method: 'POST' });
line('Compute again', again.ms);

const items = `/tenant/payroll/runs/${run.id}/items`;
const page = await call(`${items}?size=50`, { token });
line('People, page 1 of 50', page.ms, `${page.json.total} in all`);
line('People, page 200', (await call(`${items}?size=50&page=200`, { token })).ms);
line('People with problems', (await call(`${items}?show=problems&size=50`, { token })).ms);
line('People, search "00042"', (await call(`${items}?search=00042`, { token })).ms);
line('Run summary', (await call(`/tenant/payroll/runs/${run.id}`, { token })).ms);
const itemId = page.json.items[0].id;
line(
  'One payslip PDF (Bangla)',
  (await call(`${items}/${itemId}/payslip?language=bn`, { token })).ms,
);

const settings = (await call('/tenant/payroll/settings', { token })).json;
await call('/tenant/payroll/settings', { token, method: 'PATCH', body: { makerChecker: false } });
try {
  line('Submit and lock', (await call(`/tenant/payroll/runs/${run.id}/submit`, { token, method: 'POST' })).ms);
} finally {
  await call('/tenant/payroll/settings', {
    token,
    method: 'PATCH',
    body: { makerChecker: settings.makerChecker },
  });
}
line('Publish payslips', (await call(`/tenant/payroll/runs/${run.id}/publish`, { token, method: 'POST' })).ms);
