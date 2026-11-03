#!/usr/bin/env node
import { randomBytes, randomUUID, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  readFile,
  writeFile,
  readdir,
  lstat,
  stat,
  cp,
  rm,
  mkdtemp,
  open,
  chown,
  chmod,
} from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const hashFile = async (path) => {
  const h = createHash('sha256');
  for await (const part of createReadStream(path)) h.update(part);
  return h.digest('hex');
};
const safe = (name) =>
  typeof name === 'string' &&
  /^[a-zA-Z0-9][a-zA-Z0-9_./-]*$/.test(name) &&
  !name.split('/').some((p) => p === '..' || p === '.' || p === '');
const command = (bin, args, { env = {}, input } = {}) => {
  const r = spawnSync(bin, args, {
    env: { ...process.env, ...env },
    input,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 ** 2,
  });
  if (r.error || r.status !== 0)
    throw new Error(
      `${bin} failed (${r.error?.code ?? 'command_failed'})${process.env.GP_RECOVERY_DEBUG === 'on' ? ': ' + r.stderr : ''}`,
    );
  return r.stdout.trim();
};
const pgEnv = (url) => {
  const parsed = new URL(url),
    password = decodeURIComponent(parsed.password);
  parsed.password = '';
  return {
    PGDATABASE: parsed.href,
    PGPASSWORD: password,
    PGCONNECT_TIMEOUT: '10',
    PGOPTIONS: '-c timezone=UTC -c datestyle=ISO,YMD -c extra_float_digits=3',
  };
};
const pg = (url, bin, args = [], options = {}) =>
  command(bin, ['--dbname', pgEnv(url).PGDATABASE, ...args], {
    ...options,
    env: { ...pgEnv(url), ...options.env },
  });
const query = (url, sql) => pg(url, 'psql', ['-XAt', '-v', 'ON_ERROR_STOP=1', '-c', sql]);
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
async function envFile(path) {
  if ((await lstat(path)).mode & 0o077)
    throw new Error('Configuration and key files must have mode 0600');
  const raw = await readFile(path, 'utf8');
  return path.endsWith('.json') ? JSON.parse(raw) : parseEnv(raw);
}
async function keyFile(path) {
  if ((await lstat(path)).mode & 0o077) throw new Error('Backup key file must have mode 0600');
  const key = Buffer.from((await readFile(path, 'utf8')).trim(), 'base64');
  if (key.length !== 32) throw new Error('A separate 32-byte backup encryption key is required');
  return key;
}
const keyFingerprints = (config) => {
  const keys = JSON.parse(config.FIELD_ENCRYPTION_KEYS_JSON ?? '{}');
  return {
    legacy: sha(Buffer.from(config.FIELD_ENCRYPTION_KEY ?? '', 'base64')),
    retained: Object.fromEntries(
      Object.entries(keys)
        .toSorted(([a], [b]) => a.localeCompare(b))
        .map(([id, value]) => [id, sha(Buffer.from(value, 'base64'))]),
    ),
  };
};
async function documentInventory(root, prefix = '') {
  const result = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = prefix ? prefix + '/' + entry.name : entry.name;
    if (!safe(path) || entry.isSymbolicLink())
      throw new Error('Documents must have safe relative paths and no symlinks');
    if (entry.isDirectory()) result.push(...(await documentInventory(root, path)));
    else if (entry.isFile()) {
      const info = await stat(join(root, path));
      result.push({
        path,
        sha256: await hashFile(join(root, path)),
        bytes: info.size,
        uid: info.uid,
        gid: info.gid,
        mode: info.mode & 0o777,
      });
    } else throw new Error('Unsupported document object');
  }
  return result.toSorted((a, b) => a.path.localeCompare(b.path));
}
function dbInventory(url) {
  const script = `SELECT format('SELECT json_build_object(''schema'',%L,''table'',%L,''rows'',count(*)::text,''checksum'',md5(coalesce(string_agg(md5(row_to_json(t)::text),'''' ORDER BY md5(row_to_json(t)::text) COLLATE "C"),''''))) FROM %I.%I t;',schemaname,tablename,schemaname,tablename) FROM pg_tables WHERE schemaname IN ('public','drizzle') ORDER BY schemaname,tablename\n\\gexec\n`;
  return pg(url, 'psql', ['-XAt', '-v', 'ON_ERROR_STOP=1'], { input: script })
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
function requireConfig(config) {
  if (
    (config.STORAGE_DRIVER ?? 'local') !== 'local' ||
    !['self_hosted', 'dedicated'].includes(config.DEPLOYMENT_MODE) ||
    !/^[0-9a-f-]{36}$/.test(config.INSTALLATION_ID ?? '') ||
    !/^[0-9a-f-]{36}$/.test(config.INSTALLATION_TENANT_ID ?? '') ||
    Buffer.from(config.FIELD_ENCRYPTION_KEY ?? '', 'base64').length !== 32 ||
    !config.JWT_ACCESS_SECRET
  )
    throw new Error('Provide the bound installation configuration and encryption keys');
}
function requireDocumentReferences(url, objects) {
  const available = new Set(objects.map((object) => object.path));
  const columns = query(
    url,
    "select table_name||'.'||column_name from information_schema.columns where table_schema='public' and (column_name='storage_key' or column_name like '%\\_storage_key' escape '\\') order by table_name,column_name",
  )
    .split('\n')
    .filter(Boolean);
  for (const column of columns) {
    const [table, key] = column.split('.');
    const refs = query(
      url,
      `select distinct ${quote(key)} from public.${quote(table)} where ${quote(key)} is not null`,
    );
    for (const ref of refs.split('\n').filter(Boolean))
      if (!available.has(ref))
        throw new Error('Database references a missing document object; recovery point rejected');
  }
}
export async function snapshot({
  databaseUrl,
  documents,
  configFile,
  backupKeyFile,
  output,
  quiesced = false,
}) {
  if (!quiesced) throw new Error('Stop API and workers and explicitly attest --quiesced');
  const config = await envFile(configFile);
  requireConfig(config);
  const key = await keyFile(backupKeyFile);
  if (
    query(
      databaseUrl,
      'select rolsuper or rolbypassrls from pg_roles where rolname=current_user',
    ) !== 't'
  )
    throw new Error('Backup role must have BYPASSRLS');
  const appRole = decodeURIComponent(new URL(config.DATABASE_URL).username);
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(appRole)) throw new Error('Invalid application role');
  if (
    Number(
      query(
        databaseUrl,
        `select count(*) from pg_stat_activity where datname=current_database() and usename='${appRole}'`,
      ),
    )
  )
    throw new Error('Application connections remain; stop every API and worker');
  if (Number(query(databaseUrl, "select current_setting('server_version_num')::int")) < 170000)
    throw new Error('PostgreSQL 17 or later is required');
  const binding = JSON.parse(
    query(
      databaseUrl,
      `select row_to_json(i) from (select id,tenant_id,mode from enterprise_installations) i`,
    ),
  );
  if (
    binding.id !== config.INSTALLATION_ID ||
    binding.tenant_id !== config.INSTALLATION_TENANT_ID ||
    binding.mode !== config.DEPLOYMENT_MODE
  )
    throw new Error('Database/configuration installation mismatch');
  const parent = dirname(resolve(output)),
    stage = await mkdtemp(join(parent, '.gp-snapshot-'));
  await chmod(stage, 0o700);
  let published = false,
    outputCreated = false;
  try {
    const before = dbInventory(databaseUrl),
      objects = await documentInventory(documents);
    requireDocumentReferences(databaseUrl, objects);
    await cp(documents, join(stage, 'documents'), {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    pg(databaseUrl, 'pg_dump', [
      '--format=custom',
      '--no-password',
      '--file',
      join(stage, 'database.dump'),
    ]);
    const after = dbInventory(databaseUrl);
    if (
      JSON.stringify(before) !== JSON.stringify(after) ||
      JSON.stringify(objects) !== JSON.stringify(await documentInventory(documents))
    )
      throw new Error('Source changed while quiesced; recovery point rejected');
    const manifest = {
      schema: 1,
      kind: 'good-people-recovery',
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      installationId: binding.id,
      tenantId: binding.tenant_id,
      mode: binding.mode,
      release: config.RELEASE_VERSION,
      fieldKeys: keyFingerprints(config),
      signingKeyFingerprint: sha(config.JWT_ACCESS_SECRET),
      database: before,
      documents: objects,
      documentRoot: await stat(documents).then((s) => ({
        uid: s.uid,
        gid: s.gid,
        mode: s.mode & 0o777,
      })),
      dumpSha256: await hashFile(join(stage, 'database.dump')),
      rpoFromQuiescedBoundaryMs: 0,
    };
    await writeFile(join(stage, 'manifest.json'), JSON.stringify(manifest), { mode: 0o600 });
    const archive = join(stage, 'payload.tar');
    command('tar', ['-cf', archive, '-C', stage, 'manifest.json', 'database.dump', 'documents']);
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from('Good People recovery v1'));
    const handle = await open(output, 'wx', 0o600);
    outputCreated = true;
    await handle.write(Buffer.concat([Buffer.from('GPB1'), iv]));
    await handle.close();
    await pipeline(
      createReadStream(archive),
      cipher,
      createWriteStream(output, { flags: 'a', mode: 0o600 }),
    );
    const end = await open(output, 'a');
    await end.write(cipher.getAuthTag());
    await end.close();
    published = true;
    return {
      snapshotId: manifest.id,
      createdAt: manifest.createdAt,
      encrypted: true,
      documentObjects: objects.length,
      tableCount: before.length,
      rpoFromQuiescedBoundaryMs: 0,
    };
  } finally {
    await rm(stage, { recursive: true, force: true });
    if (outputCreated && !published) await rm(output, { force: true });
  }
}
export async function restore({
  adminUrl,
  ownerUrl,
  targetDatabase,
  documents,
  configFile,
  backupKeyFile,
  input,
  evidenceFile,
}) {
  const started = Date.now();
  if (!/^[a-z][a-z0-9_]{2,62}$/.test(targetDatabase))
    throw new Error('Use a new safe database name');
  if (Number(query(adminUrl, `select count(*) from pg_database where datname='${targetDatabase}'`)))
    throw new Error('Restore never overwrites an existing database');
  const config = await envFile(configFile);
  requireConfig(config);
  const key = await keyFile(backupKeyFile);
  const stage = await mkdtemp(join(dirname(resolve(input)), '.gp-restore-'));
  await chmod(stage, 0o700);
  let databaseCreated = false;
  try {
    const info = await stat(input);
    if (info.size < 32) throw new Error('Invalid recovery archive');
    const handle = await open(input, 'r'),
      header = Buffer.alloc(16),
      tag = Buffer.alloc(16);
    await handle.read(header, 0, 16, 0);
    await handle.read(tag, 0, 16, info.size - 16);
    await handle.close();
    if (header.subarray(0, 4).toString() !== 'GPB1')
      throw new Error('Unsupported recovery archive');
    const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(4));
    decipher.setAAD(Buffer.from('Good People recovery v1'));
    decipher.setAuthTag(tag);
    const archive = join(stage, 'payload.tar');
    await pipeline(
      createReadStream(input, { start: 16, end: info.size - 17 }),
      decipher,
      createWriteStream(archive, { mode: 0o600 }),
    );
    for (const path of command('tar', ['-tf', archive]).split('\n'))
      if (!safe(path.replace(/\/$/, ''))) throw new Error('Unsafe recovery archive path');
    for (const line of command('tar', ['-tvf', archive]).split('\n'))
      if (!['-', 'd'].includes(line[0]))
        throw new Error('Recovery archives cannot contain links or special files');
    command('tar', ['-xf', archive, '--no-same-owner', '-C', stage]);
    const manifest = JSON.parse(await readFile(join(stage, 'manifest.json'), 'utf8'));
    if (
      manifest.schema !== 1 ||
      manifest.kind !== 'good-people-recovery' ||
      manifest.installationId !== config.INSTALLATION_ID ||
      manifest.tenantId !== config.INSTALLATION_TENANT_ID ||
      manifest.mode !== config.DEPLOYMENT_MODE
    )
      throw new Error('Recovery installation mismatch');
    if (JSON.stringify(manifest.fieldKeys) !== JSON.stringify(keyFingerprints(config)))
      throw new Error('Matching historical field and file encryption keys are required');
    if (
      sha(config.JWT_ACCESS_SECRET) === manifest.signingKeyFingerprint ||
      config.JWT_PREVIOUS_ACCESS_SECRET
    )
      throw new Error('Recovery requires a fresh access signing key and no previous key');
    if ((await hashFile(join(stage, 'database.dump'))) !== manifest.dumpSha256)
      throw new Error('Database dump checksum mismatch');
    const restoredObjects = await documentInventory(join(stage, 'documents'));
    if (
      JSON.stringify(
        restoredObjects.map(({ path, sha256, bytes }) => ({ path, sha256, bytes })),
      ) !==
      JSON.stringify(manifest.documents.map(({ path, sha256, bytes }) => ({ path, sha256, bytes })))
    )
      throw new Error('Document checksums do not match');
    try {
      await lstat(documents);
      throw new Error('Restore requires a new documents directory');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (
      new URL(config.DATABASE_URL).pathname.slice(1) !== targetDatabase ||
      new URL(ownerUrl).pathname.slice(1) !== targetDatabase
    )
      throw new Error('Application and owner configuration must target the new recovery database');
    const owner = decodeURIComponent(new URL(ownerUrl ?? '').username);
    if (
      owner === decodeURIComponent(new URL(config.DATABASE_URL).username) ||
      !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(owner)
    )
      throw new Error('Prepare the separate owner/app/backup roles on the target host first');
    query(adminUrl, `create database ${quote(targetDatabase)} owner ${quote(owner)}`);
    databaseCreated = true;
    const target = new URL(adminUrl);
    target.pathname = '/' + targetDatabase;
    pg(target.href, 'pg_restore', [
      '--exit-on-error',
      '--no-password',
      '--dbname',
      pgEnv(target.href).PGDATABASE,
      join(stage, 'database.dump'),
    ]);
    if (JSON.stringify(dbInventory(target.href)) !== JSON.stringify(manifest.database))
      throw new Error('Restored row counts/checksums differ');
    await cp(join(stage, 'documents'), documents, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    await chmod(documents, manifest.documentRoot.mode);
    if (process.getuid?.() === 0) {
      const own = async (dir) => {
        await chown(dir, manifest.documentRoot.uid, manifest.documentRoot.gid);
        for (const entry of await readdir(dir, { withFileTypes: true }))
          if (entry.isDirectory()) await own(join(dir, entry.name));
      };
      await own(documents);
    }
    for (const object of manifest.documents) {
      const path = join(documents, object.path);
      await chmod(path, object.mode);
      if (process.getuid?.() === 0) await chown(path, object.uid, object.gid);
    }
    // Restoring old data cannot silently restore deprovisioned identities or revive external delivery.
    query(
      target.href,
      `begin; update enterprise_installations set recovery_pending=true where id='${manifest.installationId}';update auth_sessions set revoked_at=clock_timestamp(),family_revoked_at=clock_timestamp();update tenant_users set mfa_recovery_codes='{}',mfa_last_step=ceil(extract(epoch from clock_timestamp())/30)::int;update scim_credentials set revoked_at=clock_timestamp();update api_client_credentials set revoked_at=clock_timestamp();update api_clients set review_required=true;update webhook_subscriptions set enabled=false;update notification_deliveries set status='skipped',last_error='recovery_reconciliation_required' where status='queued';update job_leases set owner=null,lease_until=null,completed_slot=null;insert into installation_events(installation_id,action,code) values('${manifest.installationId}','recovery_frozen','reconciliation_required');commit;`,
    );
    const report = {
      schema: 1,
      installationId: manifest.installationId,
      tenantId: manifest.tenantId,
      sourceRelease: manifest.release,
      snapshotCreatedAt: manifest.createdAt,
      archiveSha256: await hashFile(input),
      snapshotId: manifest.id,
      restoredAt: new Date().toISOString(),
      restoreToMaintenanceMs: Date.now() - started,
      rpoFromQuiescedBoundaryMs: manifest.rpoFromQuiescedBoundaryMs,
      rowCountsAndChecksumsMatched: true,
      documentChecksumsMatched: true,
      fieldKeyFingerprintsMatched: true,
      reconciliationRequired: true,
      targetDatabase,
    };
    if (evidenceFile)
      await writeFile(evidenceFile, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    return report;
  } catch (error) {
    if (databaseCreated)
      throw new Error(
        'Recovery validation failed; new database remains isolated for operator inspection. ' +
          error.message,
        { cause: error },
      );
    throw error;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
async function main() {
  const [commandName, optionsFile] = process.argv.slice(2);
  const options = JSON.parse(await readFile(optionsFile, 'utf8'));
  const report =
    commandName === 'snapshot'
      ? await snapshot(options)
      : commandName === 'restore'
        ? await restore(options)
        : (() => {
            throw new Error('Use snapshot or restore with a private JSON options file');
          })();
  console.log(JSON.stringify(report));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
