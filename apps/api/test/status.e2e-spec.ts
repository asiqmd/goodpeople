import { readdir } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import {
  backupRuns,
  createDb,
  hashPassword,
  platformAuditLog,
  platformUsers,
  statusChecks,
  statusDays,
  statusIncidents,
  type Database,
} from '@gp/db';
import {
  addDays,
  STATUS_HISTORY_DAYS,
  todayIn,
  worstState,
  type IncidentView,
  type OperationsView,
  type PlatformRole,
  type PublicStatus,
  type StatusComponent,
} from '@gp/shared';
import { Logger, type INestApplication } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { OperationsService } from '../src/modules/status/operations.service.js';
import { StatusChecks } from '../src/modules/status/status-checks.service.js';
import { StatusProbes } from '../src/modules/status/status-probes.js';
import { StatusService } from '../src/modules/status/status.service.js';
import {
  api,
  bearer,
  bootApp,
  platformToken,
  tenantLogin,
  testEnv,
  testStorageDir,
  uniqueSlug,
} from './test-env.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms);

/** Every key anywhere in a JSON value. */
const keysOf = (value: unknown): string[] =>
  value && typeof value === 'object'
    ? Object.entries(value).flatMap(([k, v]) => [
        ...(Array.isArray(value) ? [] : [k]),
        ...keysOf(v),
      ])
    : [];

const component = (p: PublicStatus, key: StatusComponent) =>
  p.components.find((c) => c.key === key)!;

// Each test posts its own incidents on a component no other test touches, and the page's
// cache is cleared before each read, so the tests pass in any order.
describe('status page', () => {
  let app: INestApplication;
  let db: Database;
  let pool: ReturnType<typeof createDb>['pool'];
  let web: Server;
  let platform: string;
  let status: StatusService;
  let checks: StatusChecks;
  let probes: StatusProbes;
  let operations: OperationsService;
  const stamp = Date.now().toString(36);

  beforeAll(async () => {
    // The web check fetches this stand-in rather than the development server.
    web = createServer((_, res) => res.writeHead(200).end('ok'));
    await new Promise<void>((resolve) => web.listen(0, '127.0.0.1', resolve));
    const { port } = web.address() as AddressInfo;
    app = await bootApp({
      STATUS_WEB_URL: `http://127.0.0.1:${port}/login`,
      // Only its presence is checked, so any file that exists stands in for Chromium.
      CHROME_PATH: process.execPath,
    });
    ({ db, pool } = createDb(testEnv().ownerUrl, { max: 2 }));
    platform = await platformToken(app);
    status = app.get(StatusService);
    checks = app.get(StatusChecks);
    probes = app.get(StatusProbes);
    operations = app.get(OperationsService);
  });

  afterEach(() => vi.restoreAllMocks());

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await new Promise((resolve) => web?.close(resolve));
  });

  const page = async () => {
    status.clearCache();
    return (await api(app).get('/status').expect(200)).body as PublicStatus;
  };
  const post = (body: Record<string, unknown>, token = platform) =>
    api(app).post('/platform/status/incidents').set(bearer(token)).send(body);
  const update = (id: string, body: Record<string, unknown>) =>
    api(app).post(`/platform/status/incidents/${id}/updates`).set(bearer(platform)).send(body);
  const operationsView = async () =>
    (await api(app).get('/platform/operations').set(bearer(platform)).expect(200))
      .body as OperationsView;
  const incident = (over: Record<string, unknown> = {}) => ({
    kind: 'incident',
    titleEn: `Card payments failing ${stamp}`,
    titleBn: `কার্ডে পেমেন্ট হচ্ছে না ${stamp}`,
    impact: 'major_outage',
    components: ['payments'],
    status: 'investigating',
    bodyEn: 'Card payments are failing. We are looking into it.',
    bodyBn: 'কার্ডে পেমেন্ট হচ্ছে না। আমরা খতিয়ে দেখছি।',
    ...over,
  });
  const words = { bodyEn: 'An update.', bodyBn: 'একটি হালনাগাদ।' };
  const label = (name: string) => `${stamp}-${name}`;

  /** Platform staff with this role, signed in. */
  async function staff(role: PlatformRole) {
    const email = `${uniqueSlug(role.replace('_', '-'))}@goodpeople.test`;
    await db.insert(platformUsers).values({
      email,
      name: `Status ${role}`,
      passwordHash: await hashPassword(testEnv().password),
      role,
    });
    return platformToken(app, email);
  }

  it('sets the state of what an incident affects, and resolving returns it to operational', async () => {
    const created = (await post(incident()).expect(201)).body as IncidentView;
    expect(created).toMatchObject({
      kind: 'incident',
      impact: 'major_outage',
      status: 'investigating',
      components: ['payments'],
      resolvedAt: null,
    });
    expect(created.updates).toHaveLength(1);

    let now = await page();
    expect(component(now, 'payments').state).toBe('major_outage');
    expect(now.overall).toBe('major_outage');
    expect(now.active.find((i) => i.id === created.id)).toMatchObject({
      titleBn: `কার্ডে পেমেন্ট হচ্ছে না ${stamp}`,
      updates: [{ bodyBn: 'কার্ডে পেমেন্ট হচ্ছে না। আমরা খতিয়ে দেখছি।' }],
    });

    // Better as it goes.
    await update(created.id, { status: 'identified', impact: 'degraded', ...words }).expect(201);
    now = await page();
    expect(component(now, 'payments').state).toBe('degraded');

    const resolved = (await update(created.id, { status: 'resolved', ...words }).expect(201))
      .body as IncidentView;
    expect(resolved.resolvedAt).not.toBeNull();
    expect(resolved.updates.map((u) => u.status)).toEqual([
      'resolved',
      'identified',
      'investigating',
    ]);

    now = await page();
    expect(component(now, 'payments').state).toBe('operational');
    expect(now.overall).toBe(worstState(now.components.map((c) => c.state)));
    expect(now.active.some((i) => i.id === created.id)).toBe(false);
    expect(now.recent.find((i) => i.id === created.id)?.updates[0]?.status).toBe('resolved');
    // Today's bar still shows it.
    expect(component(now, 'payments').days.at(-1)!.worst).toBe('degraded');

    const audit = await db
      .select({ action: platformAuditLog.action })
      .from(platformAuditLog)
      .where(sql`${platformAuditLog.after}->>'id' = ${created.id}`);
    expect(audit.map((a) => a.action).toSorted()).toEqual([
      'status.incident.create',
      'status.incident.update',
      'status.incident.update',
    ]);
  });

  it('shows maintenance as upcoming before its window and as maintenance inside it', async () => {
    const startsAt = new Date(Date.now() + 2 * HOUR);
    const endsAt = new Date(Date.now() + 4 * HOUR);
    const created = (
      await post({
        kind: 'maintenance',
        titleEn: `Attendance upgrade ${stamp}`,
        titleBn: `হাজিরা হালনাগাদ ${stamp}`,
        components: ['attendance'],
        status: 'scheduled',
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        bodyEn: 'Punches are queued on the devices and sent afterwards.',
        bodyBn: 'পাঞ্চগুলো ডিভাইসে জমা থাকবে, পরে পাঠানো হবে।',
      }).expect(201)
    ).body as IncidentView;
    expect(created).toMatchObject({ impact: 'maintenance', endsAt: endsAt.toISOString() });

    let now = await page();
    expect(component(now, 'attendance').state).toBe('operational');
    expect(now.active.find((i) => i.id === created.id)).toMatchObject({ status: 'scheduled' });

    const inside = await status.build(new Date(startsAt.getTime() + HOUR));
    expect(component(inside, 'attendance').state).toBe('maintenance');
    expect(inside.active.some((i) => i.id === created.id)).toBe(true);
    const after = await status.build(new Date(endsAt.getTime() + HOUR));
    expect(component(after, 'attendance').state).toBe('operational');
    expect(after.recent.some((i) => i.id === created.id)).toBe(true);

    // Started early, then completed.
    await update(created.id, { status: 'in_progress', ...words }).expect(201);
    now = await page();
    expect(component(now, 'attendance').state).toBe('maintenance');
    const done = (await update(created.id, { status: 'completed', ...words }).expect(201))
      .body as IncidentView;
    expect(done.resolvedAt).not.toBeNull();
    now = await page();
    expect(component(now, 'attendance').state).toBe('operational');
    expect(now.recent.some((i) => i.id === created.id)).toBe(true);
  });

  it('needs both languages, a status for the kind and a window that ends after it starts', async () => {
    const noBangla = await post(incident({ titleBn: ' ' })).expect(400);
    expect(noBangla.body.issues.map((i: { path: string }) => i.path)).toContain('titleBn');
    const noEnglish = await post(incident({ bodyEn: undefined })).expect(400);
    expect(noEnglish.body.issues.map((i: { path: string }) => i.path)).toContain('bodyEn');

    const created = (await post(incident({ impact: 'degraded' })).expect(201)).body as IncidentView;
    const updateNoBangla = await update(created.id, { status: 'monitoring', bodyEn: 'Watching.' });
    expect(updateNoBangla.status).toBe(400);
    expect(updateNoBangla.body.issues.map((i: { path: string }) => i.path)).toContain('bodyBn');
    const wrongKind = await update(created.id, { status: 'completed', ...words }).expect(400);
    expect(wrongKind.body.code).toBe('status_kind_mismatch');
    await update(created.id, { status: 'resolved', ...words }).expect(201);

    const backwards = await post({
      kind: 'maintenance',
      titleEn: 'Backwards',
      titleBn: 'উল্টো',
      components: ['web'],
      status: 'scheduled',
      startsAt: new Date(Date.now() + 2 * HOUR).toISOString(),
      endsAt: new Date(Date.now() + HOUR).toISOString(),
      ...words,
    }).expect(400);
    expect(backwards.body.code).toBe('maintenance_window');
  });

  it('serves the page from a cache', async () => {
    status.clearCache();
    const first = (await api(app).get('/status').expect(200)).body as PublicStatus;
    const second = (await api(app).get('/status').expect(200)).body as PublicStatus;
    expect(second.generatedAt).toBe(first.generatedAt);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect((await page()).generatedAt).not.toBe(first.generatedAt);
  });

  it('records each check with its day, and skips what has no check here', async () => {
    const today = todayIn('Asia/Dhaka');
    const counts = async () =>
      new Map(
        (await db.select().from(statusDays).where(eq(statusDays.day, today))).map((d) => [
          d.component,
          d.checks,
        ]),
      );
    const before = await counts();
    const now = new Date();
    const ran = await checks.runChecks(now);
    // Background jobs are off in tests: nothing sweeps, so those are not checked. Payments
    // have no check of their own.
    expect(ran.map((r) => r.component).toSorted()).toEqual(['api', 'documents', 'web']);
    expect(ran.every((r) => r.ok)).toBe(true);

    const stored = await db.select().from(statusChecks).where(eq(statusChecks.checkedAt, now));
    expect(stored.map((c) => c.component).toSorted()).toEqual(['api', 'documents', 'web']);
    expect(stored.every((c) => typeof c.latencyMs === 'number' && c.detail === null)).toBe(true);
    const after = await counts();
    for (const key of ['api', 'documents', 'web'] as const) {
      expect(after.get(key)).toBe((before.get(key) ?? 0) + 1);
    }
    expect(after.get('payments')).toBeUndefined();
    expect(component(await page(), 'payments').uptime).toBeNull();
    // The probe's file is gone again.
    expect(await readdir(join(testStorageDir, 'status', 'probe'))).toEqual([]);
  });

  it('degrades a failing component, then breaks it, and tells only staff why', async () => {
    vi.spyOn(probes, 'web').mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.7:3000'));
    await checks.runChecks();
    let now = await page();
    expect(component(now, 'web').state).toBe('degraded');
    await checks.runChecks();
    await checks.runChecks();
    now = await page();
    expect(component(now, 'web').state).toBe('partial_outage');
    expect(component(now, 'web').days.at(-1)!.uptime).toBeLessThan(1);
    expect(JSON.stringify(now)).not.toContain('ECONNREFUSED');
    expect(keysOf(now)).not.toContain('detail');

    vi.spyOn(probes, 'chromium').mockReturnValue(false);
    await checks.runChecks();
    const ops = await operationsView();
    expect(ops.checks.find((c) => c.component === 'web')).toMatchObject({
      ok: false,
      detail: expect.stringContaining('ECONNREFUSED'),
    });
    expect(ops.checks.find((c) => c.component === 'documents')).toMatchObject({
      ok: false,
      detail: 'pdf_unavailable',
    });
    expect(ops.backgroundJobs).toBe(false);

    vi.restoreAllMocks();
    await checks.runChecks();
    now = await page();
    expect(component(now, 'web').state).toBe('operational');
    expect(component(now, 'documents').state).toBe('operational');
  });

  it('gives each day its uptime and worst incident, and the period its uptime', async () => {
    const today = todayIn('Asia/Dhaka');
    const [tenDays, fiveDays, threeDays] = [10, 5, 3].map((n) => addDays(today, -n)) as [
      string,
      string,
      string,
    ];
    await db.insert(statusDays).values([
      { component: 'notifications', day: tenDays, checks: 1440, failures: 144 },
      { component: 'notifications', day: fiveDays, checks: 100, failures: 0 },
    ]);
    const [past] = await db
      .insert(statusIncidents)
      .values({
        kind: 'incident',
        titleEn: `Late emails ${stamp}`,
        titleBn: `দেরিতে ইমেইল ${stamp}`,
        impact: 'partial_outage',
        status: 'resolved',
        components: ['notifications'],
        startsAt: new Date(`${threeDays}T10:00:00+06:00`),
        resolvedAt: new Date(`${threeDays}T12:00:00+06:00`),
      })
      .returning();

    const now = await page();
    const notifications = component(now, 'notifications');
    expect(notifications.days).toHaveLength(STATUS_HISTORY_DAYS);
    expect(notifications.days[0]!.date).toBe(addDays(today, 1 - STATUS_HISTORY_DAYS));
    expect(notifications.days.at(-1)!.date).toBe(today);
    const day = (date: string) => notifications.days.find((d) => d.date === date)!;
    expect(day(tenDays).uptime).toBeCloseTo(0.9);
    expect(day(fiveDays).uptime).toBe(1);
    expect(day(addDays(today, -4)).uptime).toBeNull();
    expect(day(threeDays).worst).toBe('partial_outage');
    expect(day(addDays(today, -2)).worst).toBe('operational');
    expect(notifications.uptime).toBeCloseTo((1296 + 100) / 1540);
    expect(notifications.state).toBe('operational');
    expect(now.recent.some((i) => i.id === past!.id)).toBe(true);
  });

  it('prunes checks after a week and days older than the history', async () => {
    const today = todayIn('Asia/Dhaka');
    const firstDay = addDays(today, 1 - STATUS_HISTORY_DAYS);
    const tooOld = addDays(firstDay, -1);
    const [old] = await db
      .insert(statusChecks)
      .values({ component: 'attendance', checkedAt: ago(8 * DAY), ok: true })
      .returning();
    await db.insert(statusDays).values([
      { component: 'attendance', day: tooOld, checks: 1, failures: 0 },
      { component: 'attendance', day: firstDay, checks: 1, failures: 0 },
    ]);
    await checks.prune();
    expect(await db.select().from(statusChecks).where(eq(statusChecks.id, old!.id))).toEqual([]);
    const days = await db
      .select({ day: statusDays.day })
      .from(statusDays)
      .where(eq(statusDays.component, 'attendance'));
    expect(days.map((d) => d.day)).toContain(firstDay);
    expect(days.map((d) => d.day)).not.toContain(tooOld);
  });

  it('keeps the console to operations and support staff', async () => {
    const { accessToken } = await tenantLogin(app, 'my-group');
    for (const path of ['/platform/status/incidents', '/platform/operations']) {
      const res = await api(app).get(path).set(bearer(accessToken)).expect(403);
      expect(res.body.code).toBe('platform_only');
    }
    expect((await post(incident(), accessToken).expect(403)).body.code).toBe('platform_only');

    const finance = await staff('finance');
    const refused = await api(app).get('/platform/operations').set(bearer(finance)).expect(403);
    expect(refused.body.code).toBe('platform_role');

    const support = await staff('support');
    await api(app).get('/platform/operations').set(bearer(support)).expect(200);
    const ops = await staff('platform_ops');
    const created = (await post(incident({ impact: 'degraded' }), ops).expect(201))
      .body as IncidentView;
    const listed = (
      await api(app).get('/platform/status/incidents').set(bearer(support)).expect(200)
    ).body as IncidentView[];
    expect(listed.find((i) => i.id === created.id)?.updates).toHaveLength(1);
    await update(created.id, { status: 'resolved', ...words }).expect(201);
  });

  it('is ready with local storage, and says which part is not, without paths', async () => {
    operations.clearCache();
    const ready = await api(app).get('/ready').expect(200);
    expect(ready.body).toEqual({
      status: 'ready',
      checks: { database: 'ok', documents: 'ok', chromium: 'ok' },
    });

    vi.spyOn(probes, 'chromium').mockReturnValue(false);
    vi.spyOn(probes, 'fileStore').mockRejectedValue(
      new Error(`EACCES: permission denied, open '${testStorageDir}/status/probe/x'`),
    );
    operations.clearCache();
    const down = await api(app).get('/ready').expect(503);
    expect(down.body).toEqual({
      status: 'not_ready',
      checks: { database: 'ok', documents: 'failed', chromium: 'failed' },
    });
    expect(JSON.stringify(down.body)).not.toContain(testStorageDir);
    expect((await api(app).get('/health').expect(200)).body).toMatchObject({ status: 'ok' });
  });

  it('shows recorded backups and drills, and flags them when they are overdue', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await db.insert(backupRuns).values([
      {
        kind: 'backup',
        ok: true,
        label: label('old'),
        host: 'backup-host',
        startedAt: ago(31 * HOUR),
        finishedAt: ago(30 * HOUR),
        sizeBytes: 52_428_800,
        detail: { tenants: 4, documentFiles: 120 },
      },
      {
        kind: 'verify',
        ok: true,
        label: label('old'),
        startedAt: ago(40 * DAY),
        finishedAt: ago(40 * DAY),
      },
      {
        kind: 'backup',
        ok: false,
        label: label('failed'),
        startedAt: ago(2 * HOUR),
        finishedAt: ago(2 * HOUR),
        detail: { failedStep: 'documents', exitCode: 1 },
      },
    ]);
    let ops = await operationsView();
    expect(ops.backups).toMatchObject({ staleBackup: true, staleDrill: true });
    expect(ops.backups.lastBackupAt).toBe(
      (
        await db
          .select({ at: backupRuns.finishedAt })
          .from(backupRuns)
          .where(and(eq(backupRuns.label, label('old')), eq(backupRuns.kind, 'backup')))
      )[0]!.at.toISOString(),
    );
    expect(ops.backups.runs.find((r) => r.label === label('failed'))).toMatchObject({
      kind: 'backup',
      ok: false,
      detail: { failedStep: 'documents' },
    });
    expect(
      ops.backups.runs.find((r) => r.label === label('old') && r.kind === 'backup'),
    ).toMatchObject({ sizeBytes: 52_428_800, host: 'backup-host' });
    expect(await checks.watchBackups()).toBe(true);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('No successful backup'));

    await db.insert(backupRuns).values([
      {
        kind: 'backup',
        ok: true,
        label: label('fresh'),
        startedAt: ago(HOUR + 60_000),
        finishedAt: ago(HOUR),
      },
      {
        kind: 'verify',
        ok: true,
        label: label('fresh'),
        startedAt: ago(2 * DAY),
        finishedAt: ago(2 * DAY),
      },
    ]);
    ops = await operationsView();
    expect(ops.backups).toMatchObject({ staleBackup: false, staleDrill: false });
    expect(ops.backups.runs[0]).toMatchObject({ kind: 'backup', label: label('fresh') });
    expect(await checks.watchBackups()).toBe(false);
  });
});
