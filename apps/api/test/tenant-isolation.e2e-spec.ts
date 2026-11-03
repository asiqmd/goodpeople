import { createDb, legalEntities, RLS_TABLES, runAsTenant, tenants, type Database } from '@gp/db';
import type { INestApplication } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { api, bearer, bootApp, tenantLogin, testEnv } from './test-env.js';

/** Platform tables that reference a tenant but hold no tenant data, so they have no RLS. */
const PLATFORM_TABLES_WITH_TENANT_ID = [
  'auth_sessions',
  'coupon_redemptions',
  'entitlement_grants',
  // Server-managed installation/auth and routing metadata; never tenant HR/payroll rows.
  'enterprise_installations',
  'tenant_placements',
  'invoices',
  'merchant_ledger',
  'platform_audit_log',
  'signups',
  'subscriptions',
  'support_access_grants',
  'support_tickets',
];

describe('tenant isolation (row-level security)', () => {
  let app: INestApplication;
  let db: Database;
  let pool: ReturnType<typeof createDb>['pool'];
  let myGroupId: string;
  let ngoId: string;

  beforeAll(async () => {
    app = await bootApp();
    // The app role, exactly as the API connects: no BYPASSRLS.
    ({ db, pool } = createDb(testEnv().appUrl, { max: 2 }));
    const rows = await db.select().from(tenants);
    myGroupId = rows.find((t) => t.slug === 'my-group')!.id;
    ngoId = rows.find((t) => t.slug === 'sponsored-ngo')!.id;
  });
  afterAll(async () => {
    await pool.end();
    await app.close();
  });

  it('each workspace sees only its own legal entities', async () => {
    const group = await tenantLogin(app, 'my-group');
    const ngo = await tenantLogin(app, 'sponsored-ngo');
    const groupList = await api(app)
      .get('/tenant/legal-entities')
      .set(bearer(group.accessToken))
      .expect(200);
    const ngoList = await api(app)
      .get('/tenant/legal-entities')
      .set(bearer(ngo.accessToken))
      .expect(200);
    // Other tests add companies to My Group; none of them may show up for the NGO.
    const groupNames = groupList.body.map((e: { name: string }) => e.name);
    expect(groupNames).toEqual(
      expect.arrayContaining(['My Group Foods Ltd', 'My Group Textiles Ltd']),
    );
    expect(groupNames).not.toContain('Sponsored NGO Foundation');
    expect(ngoList.body.map((e: { name: string }) => e.name)).toEqual(['Sponsored NGO Foundation']);
  });

  it("returns 404 for another workspace's record, even with its real id", async () => {
    const group = await tenantLogin(app, 'my-group');
    const ngo = await tenantLogin(app, 'sponsored-ngo');
    const [ngoEntity] = (await api(app).get('/tenant/legal-entities').set(bearer(ngo.accessToken)))
      .body;
    await api(app)
      .get(`/tenant/legal-entities/${ngoEntity.id}`)
      .set(bearer(group.accessToken))
      .expect(404);
  });

  it('the app role sees no tenant rows without a tenant context', async () => {
    expect(await db.select().from(legalEntities)).toEqual([]);
  });

  it("the database refuses to write a row into another tenant from this tenant's context", async () => {
    await expect(
      runAsTenant(db, myGroupId, (tx) =>
        tx.insert(legalEntities).values({ tenantId: ngoId, name: 'Smuggled Ltd' }),
      ),
    ).rejects.toThrow();
    const visible = await runAsTenant(db, myGroupId, (tx) =>
      tx.select().from(legalEntities).where(eq(legalEntities.tenantId, ngoId)),
    );
    expect(visible).toEqual([]);
  });

  it('the app role cannot bypass row-level security', async () => {
    const { rows } = await pool.query(
      'select rolbypassrls, rolsuper from pg_roles where rolname = current_user',
    );
    expect(rows[0]).toEqual({ rolbypassrls: false, rolsuper: false });
  });

  it('every table with tenant data has forced row-level security', async () => {
    const result = await db.execute<{ table_name: string; rls: boolean; forced: boolean }>(sql`
      select c.table_name, cl.relrowsecurity as rls, cl.relforcerowsecurity as forced
      from information_schema.columns c
      join pg_class cl on cl.relname = c.table_name and cl.relkind = 'r'
      where c.table_schema = 'public' and c.column_name = 'tenant_id'
      order by c.table_name`);
    const tenantTables = result.rows.filter(
      (r) => !PLATFORM_TABLES_WITH_TENANT_ID.includes(r.table_name),
    );
    expect(tenantTables.map((r) => r.table_name).toSorted()).toEqual([...RLS_TABLES].toSorted());
    for (const table of tenantTables) expect(table).toMatchObject({ rls: true, forced: true });
  });

  it('the platform audit log is append-only', async () => {
    await expect(pool.query('delete from platform_audit_log')).rejects.toThrow(/append-only/);
    await expect(pool.query("update platform_audit_log set reason = 'edited'")).rejects.toThrow(
      /append-only/,
    );
  });
});
