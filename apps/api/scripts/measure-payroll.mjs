// Times a payroll run end to end against a scale workspace (pnpm --filter @gp/db seed:scale;
// SCALE_SLUG=scale-20k SCALE_EMPLOYEES=20000 for the Phase 2 target).
// Usage: SEED_PASSWORD=… node apps/api/scripts/measure-payroll.mjs [slug] [API_URL]
// Processes this month's attendance, opens (or reopens) this month's run, computes it twice,
// reads pages of it, then locks it with maker-checker briefly off and publishes the payslips.
// Then times paying it (the files, the cash sheet, the journal), the gratuity provision and
// the participation fund's beneficiaries.
// With FISCAL_YEAR=1 it first locks every earlier month of the fiscal year, so the salary tax
// projection reads a full year so far.

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
  const type = res.headers.get('content-type') ?? '';
  const file = type.includes('pdf') || type.includes('csv');
  const json = res.status === 204 || file ? null : await res.json();
  if (file) await res.arrayBuffer();
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
// MONTH=2027-06 measures the year's last month, the most the tax projection reads.
const month = process.env.MONTH ?? today.slice(0, 7);

// A month still to come has no attendance to process.
if (`${month}-01` <= today) {
  const processed = await call('/tenant/attendance/process', {
    token,
    method: 'POST',
    body: { from: `${month}-01`, to: today },
  });
  line(`Process ${month} attendance`, processed.ms, `${processed.json.days} days`);
}

const groups = (await call('/tenant/payroll/pay-groups', { token })).json;
const group = groups.find((g) => g.isDefault);
const settings = (await call('/tenant/payroll/settings', { token })).json;
const makerChecker = (on) =>
  call('/tenant/payroll/settings', { token, method: 'PATCH', body: { makerChecker: on } });

if (process.env.FISCAL_YEAR) {
  // July (the fiscal year's first month) up to last month, each opened, computed and locked.
  const existing = (await call('/tenant/payroll/runs', { token })).json;
  const [y, m] = month.split('-').map(Number);
  const first = m >= 7 ? y * 12 + 6 : (y - 1) * 12 + 6;
  await makerChecker(false);
  try {
    for (let i = first; i < y * 12 + m - 1; i++) {
      const earlier = `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
      if (
        existing.some(
          (r) =>
            r.payGroup.id === group.id &&
            r.periodStart === `${earlier}-01` &&
            r.status === 'locked',
        )
      )
        continue;
      const r = (
        await call('/tenant/payroll/runs', {
          token,
          method: 'POST',
          body: { payGroupId: group.id, month: earlier },
        })
      ).json;
      const c = await call(`/tenant/payroll/runs/${r.id}/compute`, { token, method: 'POST' });
      const l = await call(`/tenant/payroll/runs/${r.id}/submit`, { token, method: 'POST' });
      line(`Earlier month ${earlier}: compute, lock`, c.ms + l.ms);
    }
  } finally {
    await makerChecker(settings.makerChecker);
  }
}
for (const run of (await call('/tenant/payroll/runs', { token })).json) {
  if (run.payGroup.id === group.id && run.periodStart === `${month}-01`) {
    if (run.status === 'locked') throw new Error(`${month} is already locked in ${SLUG}`);
    if (run.status !== 'cancelled') {
      await call(`/tenant/payroll/runs/${run.id}/cancel`, { token, method: 'POST' });
    }
  }
}
const run = (
  await call('/tenant/payroll/runs', {
    token,
    method: 'POST',
    body: { payGroupId: group.id, month },
  })
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

await makerChecker(false);
try {
  line(
    'Submit and lock',
    (await call(`/tenant/payroll/runs/${run.id}/submit`, { token, method: 'POST' })).ms,
  );
} finally {
  await makerChecker(settings.makerChecker);
}
line(
  'Publish payslips',
  (await call(`/tenant/payroll/runs/${run.id}/publish`, { token, method: 'POST' })).ms,
);

// Paying the locked run, the gratuity provision and the participation fund (M4).
const paying = `/tenant/payroll/runs/${run.id}`;
const summary = await call(`${paying}/disbursement`, { token });
line(
  'Payment summary',
  summary.ms,
  summary.json.channels.map((c) => `${c.channel} ${c.people}`).join(', '),
);
line('Bank file', (await call(`${paying}/files/bank`, { token })).ms);
line(
  'Cash pay sheet PDF (Bangla)',
  (await call(`${paying}/files/cash-sheet?language=bn`, { token })).ms,
);
line('Journal', (await call(`${paying}/files/journal`, { token })).ms);
const monthEnd = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0))
  .toISOString()
  .slice(0, 10);
const provision = await call(`/tenant/payroll/gratuity?asOf=${monthEnd}`, { token });
line('Gratuity provision, page 1', provision.ms, `${provision.json.people} people`);
line(
  'Gratuity provision CSV',
  (await call(`/tenant/payroll/gratuity/file?asOf=${monthEnd}`, { token })).ms,
);
const fy =
  Number(month.slice(5, 7)) >= 7 ? Number(month.slice(0, 4)) : Number(month.slice(0, 4)) - 1;
const year = `${fy - 1}-${String(fy).slice(2)}`;
const years = (await call('/tenant/payroll/wppf', { token })).json;
if (!years.some((y) => y.accountingYear === year)) {
  const created = await call('/tenant/payroll/wppf', {
    token,
    method: 'POST',
    body: {
      accountingYear: year,
      yearStart: `${fy - 1}-07-01`,
      yearEnd: `${fy}-06-30`,
      netProfit: '500000000',
    },
  });
  line('Participation fund year', created.ms, `${created.json.beneficiaries} beneficiaries`);
}
line('Participation fund years', (await call('/tenant/payroll/wppf', { token })).ms);
