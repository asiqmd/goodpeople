#!/usr/bin/env node
import { validateAssuranceReadiness } from './assurance-policy.mjs';
import { createHash, createPublicKey, createPrivateKey, sign, verify } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, writeFile, mkdir, readdir, lstat, copyFile, statfs, rm } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { cpus, totalmem } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
export const digest = async (path) => {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
};
const safe = (path) =>
  typeof path === 'string' &&
  /^[a-zA-Z0-9][a-zA-Z0-9_./-]*$/.test(path) &&
  !path.split('/').some((part) => part === '..' || part === '.' || part === '') &&
  !path.startsWith('/');
const run = (binary, args, options = {}) => {
  const result = spawnSync(binary, args, {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0)
    throw new Error(`${binary} failed: ${result.error?.code ?? 'command_failed'}`);
  return result.stdout.trim();
};
async function files(dir, prefix = '') {
  const result = [];
  for (const entry of await readdir(join(dir, prefix), { withFileTypes: true })) {
    const path = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isSymbolicLink()) throw new Error('Bundle symlinks are forbidden');
    if (entry.isDirectory()) {
      result.push(...(await files(dir, path)));
    } else if (entry.isFile()) result.push(path);
    else throw new Error('Unsupported bundle entry');
  }
  return result;
}
export async function signBundle(dir, privateKey) {
  const names = (await files(dir))
    .filter((path) => !['SHA256SUMS', 'release.sig'].includes(path))
    .toSorted();
  const sums = (
    await Promise.all(names.map(async (path) => `${await digest(join(dir, path))}  ${path}\n`))
  ).join('');
  await writeFile(join(dir, 'SHA256SUMS'), sums);
  const key = createPrivateKey(privateKey);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('An Ed25519 release key is required');
  await writeFile(join(dir, 'release.sig'), sign(null, Buffer.from(sums), key));
}
export async function verifyBundle(dir, publicKey) {
  const sums = await readFile(join(dir, 'SHA256SUMS'));
  if (sums.length > 2_000_000) throw new Error('Release index exceeds limit');
  const key = createPublicKey(publicKey);
  if (
    key.asymmetricKeyType !== 'ed25519' ||
    !verify(null, sums, key, await readFile(join(dir, 'release.sig')))
  )
    throw new Error('Release signature is invalid');
  const expected = new Set(['SHA256SUMS', 'release.sig']);
  for (const line of sums.toString('utf8').trimEnd().split('\n')) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!match || !safe(match[2]) || expected.has(match[2]))
      throw new Error('Invalid or duplicate release path');
    expected.add(match[2]);
    const target = join(dir, match[2]);
    const info = await lstat(target);
    if (!info.isFile() || info.isSymbolicLink() || (await digest(target)) !== match[1])
      throw new Error('Release checksum mismatch');
  }
  for (const name of await files(dir))
    if (!expected.has(name)) throw new Error('Unexpected unsigned bundle file');
  const manifest = JSON.parse(await readFile(join(dir, 'release.json'), 'utf8'));
  if (
    manifest.schema !== 1 ||
    manifest.kind !== 'good-people-enterprise-release' ||
    !/^\d+\.\d+\.\d+$/.test(manifest.version) ||
    !['candidate', 'qualified'].includes(manifest.status) ||
    !['linux/amd64', 'linux/arm64'].includes(manifest.platform) ||
    manifest.licenseSchema !== 1 ||
    !Number.isInteger(manifest.schemaVersion) ||
    manifest.schemaVersion < 58
  )
    throw new Error('Unsupported release contract');
  const roles = new Set();
  for (const image of manifest.images ?? []) {
    if (
      !['api', 'web', 'postgres', 'redis', 'caddy'].includes(image.role) ||
      roles.has(image.role) ||
      !/^sha256:[a-f0-9]{64}$/.test(image.id) ||
      !safe(image.archive) ||
      !expected.has(image.archive) ||
      !expected.has(`sbom/${image.role}.cdx.json`) ||
      !expected.has(`licenses/${image.role}.txt`)
    )
      throw new Error('Incomplete image provenance');
    roles.add(image.role);
  }
  if (
    roles.size !== 5 ||
    !expected.has('compose.yml') ||
    !expected.has('environment.schema.json') ||
    !expected.has('runtime/node.tar.xz')
  )
    throw new Error('Incomplete offline release');
  if (manifest.workerImageId !== manifest.images.find((image) => image.role === 'api').id)
    throw new Error('Worker must use the exact API image');
  if (
    manifest.status === 'qualified' &&
    (!manifest.source ||
      manifest.source.dirty !== false ||
      !expected.has('qualification/qualification.json') ||
      qualificationChecksFor(manifest.version).some(
        (name) => !expected.has('qualification/' + name + '.json'),
      ))
  )
    throw new Error('Qualified releases require signed reviewed drill records');
  if (manifest.status === 'qualified') {
    if (!expected.has('qualification/assurance-readiness.json'))
      throw new Error('M7 assurance readiness evidence is required');
    validateAssuranceReadiness(
      JSON.parse(await readFile(join(dir, 'qualification/assurance-readiness.json'), 'utf8')),
      manifest,
      new Date(manifest.qualification?.observedAt),
    );
  }
  return manifest;
}
export async function pack(spec, out, keyPath) {
  if (
    !/^\d+\.\d+\.\d+$/.test(spec.version) ||
    !['linux/amd64', 'linux/arm64'].includes(spec.platform)
  )
    throw new Error('Use a versioned Linux target');
  if ((await lstat(keyPath)).mode & 0o077)
    throw new Error('Release private key must have mode 0600');
  const info = await statfs(dirname(resolve(out)));
  if (Number(info.bavail) * Number(info.bsize) < 30 * 1024 ** 3)
    throw new Error('Release packaging requires at least 30 GiB free');
  run('docker', ['info', '--format', '{{.ServerVersion}}']);
  run('syft', ['version']);
  await mkdir(out, { recursive: false });
  try {
    await mkdir(join(out, 'images'));
    await mkdir(join(out, 'sbom'));
    await mkdir(join(out, 'licenses'));
    await mkdir(join(out, 'tools'));
    await mkdir(join(out, 'runtime'));
    if (
      !/^[a-f0-9]{40}$/.test(spec.source?.commit ?? '') ||
      !/^[a-f0-9]{64}$/.test(spec.source?.treeSha256 ?? '') ||
      typeof spec.source?.dirty !== 'boolean'
    )
      throw new Error('Record the exact build source provenance');
    const images = [];
    for (const role of ['api', 'web', 'postgres', 'redis', 'caddy']) {
      const ref = spec.images?.[role];
      if (
        typeof ref !== 'string' ||
        !/^[a-zA-Z0-9][a-zA-Z0-9:/._@-]+$/.test(ref) ||
        /:latest(?:@|$)/.test(ref) ||
        (!['api', 'web'].includes(role) && !/@sha256:[a-f0-9]{64}$/.test(ref))
      )
        throw new Error('All dependency images need immutable digests; latest is forbidden');
      const metadata = JSON.parse(run('docker', ['image', 'inspect', ref]))[0];
      if (metadata.Os + '/' + metadata.Architecture !== spec.platform)
        throw new Error('Image platform mismatch');
      if (
        ['api', 'web'].includes(role) &&
        (!metadata.Config.User || /^0(?::|$)|^root(?::|$)/.test(metadata.Config.User))
      )
        throw new Error('Application images must be non-root');
      if (['api', 'web'].includes(role)) {
        const labels = metadata.Config.Labels ?? {};
        if (
          labels['org.opencontainers.image.version'] !== spec.version ||
          labels['org.opencontainers.image.revision'] !== spec.source.commit ||
          labels['org.goodpeople.source-tree-sha256'] !== spec.source.treeSha256 ||
          labels['org.goodpeople.source-dirty'] !== String(spec.source.dirty)
        )
          throw new Error('Image labels do not match declared release source');
      }
      const archive = `images/${role}.tar.gz`;
      const save = spawn('docker', ['image', 'save', ref], { stdio: ['ignore', 'pipe', 'pipe'] });
      save.stderr.resume();
      const done = new Promise((resolveDone, reject) => {
        save.once('error', reject);
        save.once('exit', (code) =>
          code === 0 ? resolveDone() : reject(new Error('Image export failed')),
        );
      });
      await Promise.all([
        pipeline(save.stdout, createGzip(), createWriteStream(join(out, archive), { mode: 0o600 })),
        done,
      ]);
      run('syft', [
        `docker:${ref}`,
        '-o',
        `cyclonedx-json=${join(out, 'sbom', role + '.cdx.json')}`,
      ]);
      // Preserve the notices actually shipped in the image, including OS and Node dependencies.
      const notice = run('docker', [
        'run',
        '--rm',
        '--network',
        'none',
        '--entrypoint',
        'sh',
        ref,
        '-c',
        "find /usr/share/doc /usr/local/lib/node_modules /app/node_modules -type f \\( -iname '*license*' -o -iname '*copyright*' -o -iname '*notice*' \\) -exec sh -c 'for f do printf \"\\n--- %s ---\\n\" \"$f\"; cat \"$f\"; done' sh {} + 2>/dev/null || true",
      ]);
      await writeFile(join(out, 'licenses', role + '.txt'), notice);
      images.push({ role, reference: ref, id: metadata.Id, archive });
    }
    const here = dirname(fileURLToPath(import.meta.url));
    for (const file of [
      'compose.yml',
      'Caddyfile',
      'environment.schema.json',
      'enterprise.env.example',
      'README.md',
      'responsibilities.md',
      'config-examples.md',
      'redis.conf.example',
    ])
      await copyFile(join(here, file), join(out, file));
    for (const file of ['release.mjs', 'recovery.mjs', 'assurance-policy.mjs'])
      await copyFile(join(here, file), join(out, 'tools', file));
    if (
      !/^24\.\d+\.\d+$/.test(spec.nodeRuntimeVersion ?? '') ||
      !/^[a-f0-9]{64}$/.test(spec.nodeRuntimeSha256 ?? '') ||
      (await digest(spec.nodeRuntimeArchive)) !== spec.nodeRuntimeSha256
    )
      throw new Error('Supply the independently verified Node 24 runtime checksum');
    await copyFile(spec.nodeRuntimeArchive, join(out, 'runtime/node.tar.xz'));
    const runtimeRoot =
      'node-v' +
      spec.nodeRuntimeVersion +
      '-linux-' +
      (spec.platform === 'linux/amd64' ? 'x64' : 'arm64');
    await writeFile(
      join(out, 'licenses/node-runtime.txt'),
      run('tar', ['-xOf', spec.nodeRuntimeArchive, runtimeRoot + '/LICENSE']),
    );
    const journal = JSON.parse(
      await readFile(
        new URL('../../packages/db/migrations/meta/_journal.json', import.meta.url),
        'utf8',
      ),
    );
    await mkdir(join(out, 'migrations'));
    for (const entry of journal.entries)
      await copyFile(
        new URL('../../packages/db/migrations/' + entry.tag + '.sql', import.meta.url),
        join(out, 'migrations', entry.tag + '.sql'),
      );
    const manifest = {
      schema: 1,
      kind: 'good-people-enterprise-release',
      source: spec.source,
      version: spec.version,
      status: 'candidate',
      platform: spec.platform,
      licenseSchema: 1,
      schemaVersion: Number(journal.entries.at(-1).tag.split('_')[0]),
      upgradeFrom: spec.upgradeFrom ?? [],
      createdAt: new Date().toISOString(),
      images,
      workerImageId: images.find((image) => image.role === 'api').id,
      requirements: {
        diskGiB: 30,
        memoryGiB: 8,
        cpus: 4,
        nodeMajor: 24,
        dockerEngineMin: 28,
        composeMajorMin: 2,
      },
      qualification:
        'Clean Linux install, offline expiry/renewal, upgrade interruption and cross-host recovery evidence are required before qualification.',
    };
    await writeFile(join(out, 'release.json'), JSON.stringify(manifest, null, 2) + '\n');
    await writeFile(
      join(out, 'images.env'),
      images.map((image) => `GP_${image.role.toUpperCase()}_IMAGE_ID=${image.id}`).join('\n') +
        '\n',
    );
    await signBundle(out, await readFile(keyPath));
    return manifest;
  } catch (error) {
    await rm(out, { recursive: true, force: true });
    throw error;
  }
}
export const QUALIFICATION_CHECKS = [
  'clean_offline_install',
  'no_default_secrets',
  'local_admin_mfa',
  'two_recovery_admins',
  'offline_hr_payroll_sso_exports',
  'license_expiry',
  'license_renewal',
  'invalid_license',
  'rls_force_role_boundaries',
  'preflight_rejects',
  'migration_lock_race',
  'populated_upgrade',
  'interrupted_upgrade',
  'cross_host_restore',
  'historical_keys_decrypt',
  'restored_sessions_rejected',
  'machine_secrets_reconciled',
  'worker_jobs_not_duplicated',
  'fresh_dedicated_pilot',
];
export function qualificationChecksFor(version) {
  const [major, minor] = version.split('.').map(Number);
  if (major < 6 || (major === 6 && minor < 5)) return QUALIFICATION_CHECKS;
  return [
    ...QUALIFICATION_CHECKS,
    'phase6_workload_and_fairness',
    'phase6_data_recovery_and_rollback',
  ];
}
export async function qualify(dir, publicKey, privateKey, evidenceDir) {
  const challenge = Buffer.from('Good People qualification key match');
  if (
    !verify(
      null,
      challenge,
      createPublicKey(publicKey),
      sign(null, challenge, createPrivateKey(privateKey)),
    )
  )
    throw new Error('Qualification signing key does not match the trusted release key');
  const manifest = await verifyBundle(dir, publicKey);
  if (manifest.status !== 'candidate') throw new Error('Only a candidate can be qualified');
  const evidence = JSON.parse(await readFile(join(evidenceDir, 'qualification.json'), 'utf8'));
  if (
    evidence.schema !== 1 ||
    evidence.version !== manifest.version ||
    evidence.platform !== manifest.platform ||
    evidence.candidateManifestSha256 !== (await digest(join(dir, 'release.json'))) ||
    evidence.source?.dirty !== false ||
    JSON.stringify(evidence.source) !== JSON.stringify(manifest.source) ||
    !/^[a-f0-9]{40}$/.test(evidence.source?.commit ?? '') ||
    !/^[a-f0-9]{64}$/.test(evidence.source?.treeSha256 ?? '') ||
    evidence.installHost?.os !== 'linux' ||
    evidence.restoreHost?.os !== 'linux' ||
    !evidence.installHost?.id ||
    !evidence.restoreHost?.id ||
    evidence.installHost.id === evidence.restoreHost.id ||
    !evidence.reviewedBy ||
    !Number.isFinite(evidence.agreedRtoMs) ||
    !Number.isFinite(evidence.agreedRpoMs) ||
    evidence.agreedRtoMs <= 0 ||
    evidence.agreedRpoMs < 0 ||
    !Number.isFinite(evidence.measuredServiceRtoMs) ||
    !Number.isFinite(evidence.measuredRpoMs) ||
    evidence.measuredServiceRtoMs < 0 ||
    evidence.measuredRpoMs < 0 ||
    evidence.measuredServiceRtoMs > evidence.agreedRtoMs ||
    evidence.measuredRpoMs > evidence.agreedRpoMs
  )
    throw new Error(
      'Real clean Linux and distinct-host recovery evidence with agreed RTO/RPO and reviewed clean source is required',
    );
  for (const image of manifest.images)
    if (evidence.imageIds?.[image.role] !== image.id)
      throw new Error('Qualification must cover the exact packaged image IDs');
  let assurance;
  try {
    assurance = JSON.parse(await readFile(join(evidenceDir, 'assurance-readiness.json'), 'utf8'));
  } catch {
    throw new Error('M7 assurance readiness evidence is required');
  }
  const assuranceReview = validateAssuranceReadiness(assurance, manifest);
  const reports = [];
  for (const name of qualificationChecksFor(manifest.version)) {
    const check = evidence.checks?.[name];
    if (
      check?.outcome !== 'passed' ||
      !safe(check.report) ||
      !/^[a-f0-9]{64}$/.test(check.sha256) ||
      (await digest(join(evidenceDir, check.report))) !== check.sha256
    )
      throw new Error('Missing verified qualification report: ' + name);
    const report = JSON.parse(await readFile(join(evidenceDir, check.report), 'utf8'));
    if (
      report.check !== name ||
      report.outcome !== 'passed' ||
      report.version !== manifest.version ||
      report.platform !== manifest.platform ||
      !report.observedAt
    )
      throw new Error('Report is not a matching observed drill: ' + name);
    reports.push({ name, file: check.report, sha256: check.sha256, report });
  }
  // These are vendor-reviewed records, not proof against a dishonest host owner. Never invent passing reports.
  await mkdir(join(dir, 'qualification'), { recursive: false });
  for (const entry of reports)
    await writeFile(
      join(dir, 'qualification', entry.name + '.json'),
      JSON.stringify(entry.report, null, 2) + '\n',
    );
  await copyFile(
    join(evidenceDir, 'qualification.json'),
    join(dir, 'qualification', 'qualification.json'),
  );
  await copyFile(
    join(evidenceDir, 'assurance-readiness.json'),
    join(dir, 'qualification/assurance-readiness.json'),
  );
  manifest.assuranceReview = assuranceReview;
  manifest.status = 'qualified';
  manifest.source = evidence.source;
  manifest.qualification = {
    reviewedBy: evidence.reviewedBy,
    observedAt: new Date().toISOString(),
    measuredServiceRtoMs: evidence.measuredServiceRtoMs,
    measuredRpoMs: evidence.measuredRpoMs,
  };
  await writeFile(join(dir, 'release.json'), JSON.stringify(manifest, null, 2) + '\n');
  await signBundle(dir, privateKey);
  await verifyBundle(dir, publicKey);
  return manifest;
}
export async function preflight(dir, key, { acceptCandidate = false, checkDocker = true } = {}) {
  const manifest = await verifyBundle(dir, key);
  if (manifest.status !== 'qualified' && !acceptCandidate)
    throw new Error('Candidate bundle has not passed clean-host qualification');
  const disk = await statfs(dir);
  if (
    Number(disk.bavail) * Number(disk.bsize) < manifest.requirements.diskGiB * 1024 ** 3 ||
    totalmem() < manifest.requirements.memoryGiB * 1024 ** 3 ||
    cpus().length < manifest.requirements.cpus
  )
    throw new Error('Host does not meet release resource requirements');
  if (checkDocker) {
    const engine = run('docker', ['version', '--format', '{{.Server.Version}}']);
    const compose = run('docker', ['compose', 'version', '--short']);
    if (Number(engine.split('.')[0]) < 28 || Number(compose.replace(/^v/, '').split('.')[0]) < 2)
      throw new Error('Docker/Compose version is below the supported candidate baseline');
  }
  return manifest;
}
export async function sourceProvenance(root) {
  const names = run('git', [
    '-C',
    root,
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '-z',
  ])
    .split('\0')
    .filter(Boolean)
    .toSorted();
  const hash = createHash('sha256');
  for (const name of names) {
    // Repository filenames may contain dotfiles, spaces and Next.js route punctuation.
    // Bundle-member names use the stricter `safe` contract above.
    if (
      name.startsWith('/') ||
      /[\\\x00-\x1f\x7f]/.test(name) ||
      name.split('/').some((p) => !p || p === '.' || p === '..' || p === '.git')
    )
      throw new Error('Source paths must be relative and safe');
    let entry = root;
    for (const part of name.split('/')) {
      entry = join(entry, part);
      if ((await lstat(entry)).isSymbolicLink()) throw new Error('Source symlinks are forbidden');
    }
    if (!(await lstat(entry)).isFile()) throw new Error('Source paths must be regular files');
    hash.update(name + '\0' + (await digest(join(root, name))) + '\n');
  }
  return {
    commit: run('git', ['-C', root, 'rev-parse', 'HEAD']),
    treeSha256: hash.digest('hex'),
    dirty: run('git', ['-C', root, 'status', '--porcelain']).length > 0,
  };
}
async function main() {
  const [command, dir, arg] = process.argv.slice(2);
  if (command === 'source') {
    console.log(JSON.stringify(await sourceProvenance(resolve(dir))));
    return;
  }
  if (command === 'pack') {
    const spec = JSON.parse(await readFile(dir, 'utf8'));
    await pack(spec, arg, process.env.GP_RELEASE_PRIVATE_KEY_FILE);
    console.log(
      'Signed candidate bundle created. It remains unqualified until real host drills are recorded.',
    );
    return;
  }
  if (command === 'qualify') {
    await qualify(
      dir,
      await readFile(arg),
      await readFile(process.env.GP_RELEASE_PRIVATE_KEY_FILE),
      process.env.GP_QUALIFICATION_EVIDENCE_DIR,
    );
    console.log(
      'Reviewed qualification records signed; vendor remains responsible for their truth.',
    );
    return;
  }
  const key = await readFile(arg);
  const manifest =
    command === 'verify'
      ? await verifyBundle(dir, key)
      : await preflight(dir, key, { acceptCandidate: process.argv.includes('--accept-candidate') });
  if (command === 'load') {
    for (const image of manifest.images)
      run('docker', ['image', 'load', '--input', join(dir, image.archive)]);
    for (const image of manifest.images) {
      const loaded = JSON.parse(run('docker', ['image', 'inspect', image.id]))[0];
      if (loaded.Id !== image.id) throw new Error('Loaded image digest mismatch');
    }
  } else if (!['verify', 'preflight'].includes(command))
    throw new Error('Use pack, verify, preflight, load or qualify');
  console.log(
    JSON.stringify({
      verified: true,
      version: manifest.version,
      status: manifest.status,
      images: manifest.images.map((image) => ({ role: image.role, id: image.id })),
    }),
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
