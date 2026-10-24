// Times the busiest API calls against the `scale-test` workspace (pnpm --filter @gp/db seed:scale).
// Usage: SEED_PASSWORD=… node apps/api/scripts/measure-scale.mjs [API_URL]
// Prints p50 / p95 / max in milliseconds for each call, and the time to process the month.

const API = process.argv[2] ?? process.env.API_URL ?? 'http://localhost:4000';
const PASSWORD = process.env.SEED_PASSWORD;
const RUNS = Number(process.env.RUNS ?? 20);
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
  const json = res.status === 204 ? null : await res.json();
  const ms = performance.now() - started;
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${JSON.stringify(json)}`);
  return { json, ms };
}

const signIn = async (email) =>
  (
    await call('/auth/login', {
      method: 'POST',
      body: { tenant: 'scale-test', email, password: PASSWORD },
    })
  ).json.accessToken;

function stats(times) {
  const sorted = times.toSorted((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return { p50: at(0.5), p95: at(0.95), max: sorted.at(-1) };
}

async function measure(label, path, token) {
  await call(path, { token }); // warm up
  const times = [];
  for (let i = 0; i < RUNS; i++) times.push((await call(path, { token })).ms);
  const s = stats(times);
  console.log(
    `${label.padEnd(44)} p50 ${s.p50.toFixed(0).padStart(5)}  p95 ${s.p95.toFixed(0).padStart(5)}  max ${s.max.toFixed(0).padStart(5)}`,
  );
  return s;
}

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
const monthStart = `${today.slice(0, 8)}01`;
const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000)
  .toISOString()
  .slice(0, 10);

const admin = await signIn('admin@scale-test.test');
const manager = await signIn('st-00026@scale.test');
const worker = await signIn('st-00027@scale.test');

const processed = await call('/tenant/attendance/process', {
  token: admin,
  method: 'POST',
  body: { from: monthStart, to: today },
});
console.log(
  `Process ${monthStart}…${today} for everyone`.padEnd(44),
  `${(processed.ms / 1000).toFixed(1)} s, ${processed.json.days} days`,
);

const list = (await call('/tenant/employees?pageSize=1', { token: admin })).json;
const someone = list.items[0].id;
const results = {
  employeesPage: await measure('Employees, page 1 of 50', '/tenant/employees?pageSize=50', admin),
  employeesSearch: await measure(
    'Employees, search "ST-042"',
    '/tenant/employees?search=ST-042&pageSize=50',
    admin,
  ),
  employeesDeep: await measure(
    'Employees, page 80',
    '/tenant/employees?pageSize=50&page=80',
    admin,
  ),
  employee: await measure('One employee', `/tenant/employees/${someone}`, admin),
  dailyHr: await measure(
    `Attendance, everyone on ${yesterday}`,
    `/tenant/attendance/daily?date=${yesterday}`,
    admin,
  ),
  dailyTeam: await measure(
    'Attendance, a manager’s team',
    `/tenant/attendance/daily?date=${yesterday}`,
    manager,
  ),
  summary: await measure(
    'Attendance summary, the month',
    `/tenant/attendance/summary?month=${today.slice(0, 7)}`,
    admin,
  ),
  calendar: await measure(
    'Leave calendar, the month',
    `/tenant/leave/calendar?from=${monthStart}&to=${today}`,
    admin,
  ),
  myToday: await measure('My attendance today (worker)', '/tenant/me/attendance/today', worker),
  approvals: await measure('Approvals waiting (count)', '/tenant/approvals/count', admin),
  inbox: await measure('Notifications, unread', '/tenant/notifications?unread=true', admin),
  checklist: await measure('Go-live checklist', '/tenant/setup-checklist', admin),
  access: await measure('Workspace access (every page)', '/tenant/access', admin),
};
console.log(JSON.stringify({ processSeconds: processed.ms / 1000, results }, null, 2));
