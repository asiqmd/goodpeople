import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, randomBytes, createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  signBundle,
  verifyBundle,
  preflight,
  qualify,
  qualificationChecksFor,
  sourceProvenance,
} from '../../../infra/enterprise/release.mjs';
const keys = generateKeyPairSync('ed25519'),
  privateKey = keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
describe('offline release signature and qualification gates', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'gp-release-check-'));
    for (const folder of ['images', 'sbom', 'licenses', 'runtime']) await mkdir(join(dir, folder));
    const images = [];
    for (const role of ['api', 'web', 'postgres', 'redis', 'caddy']) {
      const archive = `images/${role}.tar.gz`;
      await writeFile(join(dir, archive), 'fixture only: not an image');
      await writeFile(join(dir, 'sbom', role + '.cdx.json'), '{}');
      await writeFile(
        join(dir, 'licenses', role + '.txt'),
        'fixture only: not a distribution notice',
      );
      images.push({ role, id: 'sha256:' + randomBytes(32).toString('hex'), archive });
    }
    for (const path of ['compose.yml', 'environment.schema.json', 'runtime/node.tar.xz'])
      await writeFile(join(dir, path), 'fixture only');
    await writeFile(
      join(dir, 'release.json'),
      JSON.stringify({
        schema: 1,
        kind: 'good-people-enterprise-release',
        version: '5.3.0',
        status: 'candidate',
        platform: 'linux/amd64',
        licenseSchema: 1,
        schemaVersion: 58,
        images,
        workerImageId: images[0]!.id,
        requirements: { diskGiB: 0, memoryGiB: 0, cpus: 0 },
      }),
    );
    await signBundle(dir, privateKey);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
  it('requires the two Phase 6 operating reports from 6.5 onward', () => {
    const previous = qualificationChecksFor('6.4.0');
    expect(previous).not.toContain('phase6_workload_and_fairness');
    const current = [
      ...previous,
      'phase6_workload_and_fairness',
      'phase6_data_recovery_and_rollback',
    ];
    expect(qualificationChecksFor('6.5.0')).toEqual(current);
    expect(qualificationChecksFor('7.0.0')).toEqual(current);
  });
  it('verifies offline exact bytes using the out-of-band trusted public key and rejects a changed image archive', async () => {
    expect((await verifyBundle(dir, publicKey)).status).toBe('candidate');
    await writeFile(join(dir, 'images', 'api.tar.gz'), 'tampered');
    await expect(verifyBundle(dir, publicKey)).rejects.toThrow('checksum');
  });
  it('rejects the wrong signing key, unsigned added files and links', async () => {
    const other = generateKeyPairSync('ed25519');
    await expect(
      verifyBundle(dir, other.publicKey.export({ type: 'spki', format: 'pem' }).toString()),
    ).rejects.toThrow('signature');
    await writeFile(join(dir, 'unsigned.sh'), 'do not run');
    await expect(verifyBundle(dir, publicKey)).rejects.toThrow('unsigned');
    await rm(join(dir, 'unsigned.sh'));
    await symlink('/tmp', join(dir, 'link'));
    await expect(verifyBundle(dir, publicKey)).rejects.toThrow('symlinks');
  });
  it('holds candidates behind an explicit preflight gate and refuses invented same-host qualification', async () => {
    await expect(preflight(dir, publicKey, { checkDocker: false })).rejects.toThrow('Candidate');
    const evidence = await mkdtemp(join(tmpdir(), 'gp-empty-evidence-'));
    try {
      await writeFile(
        join(evidence, 'qualification.json'),
        JSON.stringify({
          schema: 1,
          version: '5.3.0',
          platform: 'linux/amd64',
          installHost: { os: 'darwin', id: 'same' },
          restoreHost: { os: 'darwin', id: 'same' },
        }),
      );
      await expect(qualify(dir, publicKey, privateKey, evidence)).rejects.toThrow(
        'Real clean Linux',
      );
      expect(JSON.parse(await readFile(join(dir, 'release.json'), 'utf8')).status).toBe(
        'candidate',
      );
    } finally {
      await rm(evidence, { recursive: true, force: true });
    }
  });
  it('requires M7 evidence after matching Linux/source checks, retaining the candidate on refusal', async () => {
    const manifest = JSON.parse(await readFile(join(dir, 'release.json'), 'utf8'));
    manifest.source = { commit: 'a'.repeat(40), treeSha256: 'b'.repeat(64), dirty: false };
    await writeFile(join(dir, 'release.json'), JSON.stringify(manifest));
    await signBundle(dir, privateKey);
    const evidence = await mkdtemp(join(tmpdir(), 'gp-m7-gate-'));
    try {
      await writeFile(
        join(evidence, 'qualification.json'),
        JSON.stringify({
          schema: 1,
          version: manifest.version,
          platform: manifest.platform,
          candidateManifestSha256: createHash('sha256')
            .update(await readFile(join(dir, 'release.json')))
            .digest('hex'),
          source: manifest.source,
          installHost: { os: 'linux', id: 'source-host' },
          restoreHost: { os: 'linux', id: 'other-host' },
          reviewedBy: 'Synthetic reviewer fixture only',
          agreedRtoMs: 1000,
          agreedRpoMs: 0,
          measuredServiceRtoMs: 500,
          measuredRpoMs: 0,
          imageIds: Object.fromEntries(
            manifest.images.map((x: { role: string; id: string }) => [x.role, x.id]),
          ),
        }),
      );
      await expect(qualify(dir, publicKey, privateKey, evidence)).rejects.toThrow('M7 assurance');
      expect((await verifyBundle(dir, publicKey)).status).toBe('candidate');
    } finally {
      await rm(evidence, { recursive: true, force: true });
    }
  });
  it('hashes real route/dotfile names deterministically and rejects source symlinks', async () => {
    const source = await mkdtemp(join(tmpdir(), 'gp-source-fixture-'));
    const git = (args: string[]) => execFileSync('git', ['-C', source, ...args], { stdio: 'pipe' });
    try {
      git(['init', '--quiet']);
      await mkdir(join(source, '[employee]', '(console)'), { recursive: true });
      await writeFile(join(source, '[employee]', '(console)', 'page.tsx'), 'synthetic route');
      await writeFile(join(source, '.gitignore'), 'ignored.tmp\n');
      await writeFile(join(source, 'space name.ts'), 'synthetic source');
      git(['add', '.']);
      git([
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.test',
        'commit',
        '--quiet',
        '-m',
        'Synthetic isolated provenance fixture',
      ]);
      const first = await sourceProvenance(source);
      expect(first.dirty).toBe(false);
      expect(await sourceProvenance(source)).toEqual(first);
      await writeFile(join(source, 'space name.ts'), 'changed source');
      const changed = await sourceProvenance(source);
      expect(changed.dirty).toBe(true);
      expect(changed.treeSha256).not.toBe(first.treeSha256);
      await symlink(join(source, 'space name.ts'), join(source, 'unsafe-link'));
      await expect(sourceProvenance(source)).rejects.toThrow('symlinks');
    } finally {
      await rm(source, { recursive: true, force: true });
    }
  });
});
