import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  createDb,
  ensureDatabases,
  runMigrations,
  withDatabase,
  databaseName,
  runAsTenant,
  tenants,
  employees,
} from '@gp/db';
import { sql } from 'drizzle-orm';
import { testEnv } from './test-env.js';
describe('serialized populated-schema upgrade and interrupted migration recovery', () => {
  let dir: string,
    name: string,
    ownerUrl: string,
    owner: ReturnType<typeof createDb> | undefined,
    admin: ReturnType<typeof createDb> | undefined;
  afterAll(async () => {
    await owner?.pool.end();
    if (admin) {
      await admin.pool.end();
      const cleanup = createDb(testEnv().adminUrl!);
      try {
        if (name)
          await cleanup.db.execute(sql.raw(`drop database if exists "${name}" with(force)`));
      } finally {
        await cleanup.pool.end();
      }
    }
    if (dir) await rm(dir, { recursive: true, force: true });
  });
  it('preserves existing tenants and encrypted people across 0055→current, serializes owners, rolls back an interrupted upgrade and refuses downgrade', async () => {
    const env = testEnv();
    if (!env.adminUrl) throw new Error('DATABASE_ADMIN_URL required');
    name = databaseName(env.ownerUrl) + '_m3u_' + randomUUID().slice(0, 8);
    ownerUrl = withDatabase(env.ownerUrl, name);
    await ensureDatabases({
      adminUrl: env.adminUrl,
      ownerUrl,
      appUrl: withDatabase(env.appUrl, name),
      databases: [name],
    });
    admin = createDb(withDatabase(env.adminUrl, name));
    owner = createDb(ownerUrl);
    dir = await mkdtemp(join(tmpdir(), 'gp-upgrade-'));
    const root = resolve('../../packages/db/migrations'),
      journal = JSON.parse(await readFile(join(root, 'meta/_journal.json'), 'utf8'));
    await mkdir(join(dir, 'meta'));
    for (const entry of journal.entries)
      await copyFile(join(root, entry.tag + '.sql'), join(dir, entry.tag + '.sql'));
    await writeFile(
      join(dir, 'meta/_journal.json'),
      JSON.stringify({
        ...journal,
        entries: journal.entries.filter((entry: { idx: number }) => entry.idx <= 55),
      }),
    );
    await runMigrations(ownerUrl, { migrationsFolder: dir });
    const fixtureTenant = randomUUID(),
      fixtureCompany = randomUUID();
    await owner.db.execute(
      sql`insert into plans(code,name,features,limits) values('enterprise','Upgrade fixture','{}','{}') on conflict do nothing`,
    );
    await owner.db.execute(
      sql`insert into tenants(id,name,slug,industry_template,billing_mode,plan_id) select ${fixtureTenant}::uuid,'Upgrade fixture',${'up-' + name},'corporate','internal',id from plans where code='enterprise'`,
    );
    await runAsTenant(owner.db, fixtureTenant, async (tx) => {
      await tx.execute(
        sql`insert into legal_entities(id,tenant_id,name,code) values(${fixtureCompany}::uuid,${fixtureTenant}::uuid,'Existing employer','OLD')`,
      );
      await tx.execute(
        sql`insert into employees(tenant_id,employee_code,full_name,father_name,mother_name,date_of_birth,gender,mobile_phone,present_address,permanent_address,joined_on,nid_enc) values(${fixtureTenant}::uuid,'OLD-1','Existing person','Existing father','Existing mother','1990-01-01','female','01812345678','{}','{}','2020-01-01','original-synthetic-ciphertext')`,
      );
    });
    const beforeTenants = await owner.db.select().from(tenants),
      before = await Promise.all(
        beforeTenants.map((t) =>
          runAsTenant(owner!.db, t.id, (tx) =>
            tx.select({ id: employees.id, nidEnc: employees.nidEnc }).from(employees),
          ),
        ),
      );
    expect(before.flat().length).toBeGreaterThan(0);
    await Promise.all([runMigrations(ownerUrl), runMigrations(ownerUrl)]);
    const after = await Promise.all(
      beforeTenants.map((t) =>
        runAsTenant(owner!.db, t.id, (tx) =>
          tx.select({ id: employees.id, nidEnc: employees.nidEnc }).from(employees),
        ),
      ),
    );
    expect(after.map((rows) => rows.toSorted((a, b) => a.id.localeCompare(b.id)))).toEqual(
      before.map((rows) => rows.toSorted((a, b) => a.id.localeCompare(b.id))),
    );
    await writeFile(
      join(dir, 'meta/_journal.json'),
      JSON.stringify({
        ...journal,
        entries: [
          ...journal.entries,
          {
            idx: journal.entries.at(-1).idx + 1,
            version: '7',
            when: journal.entries.at(-1).when + 1,
            tag: '9999_interruption_rehearsal',
            breakpoints: true,
          },
        ],
      }),
    );
    await writeFile(
      join(dir, '9999_interruption_rehearsal.sql'),
      'CREATE TABLE gp_interruption_probe(id integer);\n--> statement-breakpoint\nSELECT pg_sleep(30) AS gp_interruption_marker;',
    );
    const pending = runMigrations(ownerUrl, { migrationsFolder: dir }).then(
      () => ({ error: null }),
      (error) => ({ error }),
    );
    let interrupted = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const result = await admin.db.execute(
        sql`select pg_terminate_backend(pid) killed from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and query like '%AS gp_interruption_marker%' and state='active'`,
      );
      if (result.rows.length) {
        interrupted = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(interrupted).toBe(true);
    expect((await pending).error).not.toBeNull();
    expect(
      (await admin.db.execute(sql`select to_regclass('public.gp_interruption_probe') present`))
        .rows[0]!.present,
    ).toBeNull();
    await writeFile(
      join(dir, '9999_interruption_rehearsal.sql'),
      'CREATE TABLE gp_interruption_probe(id integer);',
    );
    await runMigrations(ownerUrl, { migrationsFolder: dir });
    expect(
      (await admin.db.execute(sql`select to_regclass('public.gp_interruption_probe') present`))
        .rows[0]!.present,
    ).toBe('gp_interruption_probe');
    await expect(runMigrations(ownerUrl)).rejects.toThrow('history does not match');
  }, 30000);
});
