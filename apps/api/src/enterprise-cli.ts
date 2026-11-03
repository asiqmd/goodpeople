import { constants } from 'node:fs';
import { readFile, writeFile, open } from 'node:fs/promises';
import { randomUUID, randomBytes, createHash, createPrivateKey } from 'node:crypto';
import {
  createDb,
  runMigrations,
  preflightInstallationUpgrade,
  bootstrapInstallation,
  adoptInstallation,
  installationReadinessReceipt,
  verifyEnterpriseLicense,
  importInstallationLicense,
  enterpriseInstallations,
  installationInvitations,
  installationEvents,
  tenantUsers,
  loadRootEnv,
} from '@gp/db';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { loadConfig } from './config.js';
loadRootEnv();
const [command, file, arg] = process.argv.slice(2);
if (command === 'new-installation') {
  const output = { installationId: randomUUID(), tenantId: randomUUID() };
  console.log(JSON.stringify(output));
} else if (command === 'validate-config') {
  const config = loadConfig();
  if (config.DEPLOYMENT_MODE === 'managed') throw new Error('Choose self_hosted or dedicated');
  const envelope = (await readFile(file!, 'utf8')).trim();
  const claims = verifyEnterpriseLicense(envelope, config.LICENSE_PUBLIC_KEYS_JSON, {
    installationId: config.INSTALLATION_ID!,
    tenantId: config.INSTALLATION_TENANT_ID!,
  });
  console.log(
    JSON.stringify({
      valid: true,
      installationId: claims.installation_id,
      licenseId: claims.license_id,
      expiresAt: claims.expires_at,
    }),
  );
} else {
  const config = loadConfig();
  if (config.DEPLOYMENT_MODE === 'managed')
    throw new Error('This command requires an installed deployment');
  const owner = process.env.DATABASE_OWNER_URL;
  if (!owner) throw new Error('Use the separate owner environment for operator commands');
  const { db, pool } = createDb(owner, { max: 2, tenantId: config.INSTALLATION_TENANT_ID });
  const binding = {
    installationId: config.INSTALLATION_ID!,
    tenantId: config.INSTALLATION_TENANT_ID!,
    keys: config.LICENSE_PUBLIC_KEYS_JSON,
  };
  try {
    if (command === 'migrate') {
      await runMigrations(owner, {
        beforeUpgrade: async ({ pending, schemaVersion }) => {
          const [current] = await db
            .select()
            .from(enterpriseInstallations)
            .where(eq(enterpriseInstallations.id, binding.installationId));
          if (!pending && current?.release === config.RELEASE_VERSION) return;
          const path = process.env.GP_UPGRADE_BUNDLE_DIR,
            publicKey = process.env.GP_RELEASE_VERIFY_PUBLIC_KEY_FILE,
            point = process.env.GP_UPGRADE_RECOVERY_ARCHIVE,
            report = process.env.GP_UPGRADE_RECOVERY_REPORT;
          if (!path || !publicKey || !point || !report)
            throw new Error(
              'Provide the verified bundle, trusted release key and independently restored/decrypted recovery point',
            );
          const digest = createHash('sha256');
          const { createReadStream } = await import('node:fs');
          for await (const chunk of createReadStream(point)) digest.update(chunk);
          return preflightInstallationUpgrade(db, binding, {
            manifest: await readFile(path + '/release.json'),
            checksums: await readFile(path + '/SHA256SUMS'),
            signature: await readFile(path + '/release.sig'),
            trustedReleasePublicKey: await readFile(publicKey, 'utf8'),
            recovery: JSON.parse(await readFile(report, 'utf8')),
            archiveSha256: digest.digest('hex'),
            appRole: decodeURIComponent(new URL(config.DATABASE_URL).username),
            targetRelease: config.RELEASE_VERSION,
            expectedSchemaVersion: schemaVersion,
            acceptCandidate: process.env.GP_ACCEPT_CANDIDATE === 'on',
          });
        },
      });
      const rows = await db
        .select()
        .from(enterpriseInstallations)
        .where(eq(enterpriseInstallations.id, binding.installationId));
      if (rows[0] && rows[0].release !== config.RELEASE_VERSION)
        await db.transaction(async (tx) => {
          await tx
            .update(enterpriseInstallations)
            .set({ release: config.RELEASE_VERSION })
            .where(eq(enterpriseInstallations.id, binding.installationId));
          await tx.insert(installationEvents).values({
            installationId: binding.installationId,
            action: 'upgrade_applied',
            code: config.RELEASE_VERSION,
          });
        });
      console.log(JSON.stringify({ migrated: true, release: config.RELEASE_VERSION }));
    } else if (command === 'bootstrap') {
      const input = JSON.parse(await readFile(file!, 'utf8'));
      const envelope = (await readFile(input.licenseFile, 'utf8')).trim();
      const result = await bootstrapInstallation(db, {
        ...binding,
        mode: config.DEPLOYMENT_MODE,
        release: config.RELEASE_VERSION,
        name: input.name,
        slug: input.slug,
        adminName: input.adminName,
        adminEmail: input.adminEmail,
        envelope,
      });
      console.log(
        JSON.stringify({
          ...result,
          workspace: input.slug,
          email: input.adminEmail,
          mfaRequired: true,
        }),
      );
    } else if (command === 'adopt-existing') {
      const input = JSON.parse(await readFile(file!, 'utf8'));
      const result = await adoptInstallation(db, {
        ...binding,
        mode: config.DEPLOYMENT_MODE,
        release: config.RELEASE_VERSION,
        envelope: (await readFile(input.licenseFile, 'utf8')).trim(),
        reason: input.reason,
        appRole: decodeURIComponent(new URL(config.DATABASE_URL).username),
      });
      console.log(JSON.stringify(result));
    } else if (command === 'import-license') {
      const envelope = (await readFile(file!, 'utf8')).trim();
      const result = await db.transaction((tx) =>
        importInstallationLicense(tx, binding, envelope, null),
      );
      if (!result.accepted) throw new Error('License rejected: ' + result.code);
      console.log(JSON.stringify({ accepted: true }));
    } else if (command === 'reissue-invitation') {
      const input = JSON.parse(await readFile(file!, 'utf8'));
      const result = await db.transaction(async (tx) => {
        await tx
          .select()
          .from(enterpriseInstallations)
          .where(eq(enterpriseInstallations.id, binding.installationId))
          .for('update');
        await tx.execute(sql`select set_config('app.tenant_id',${binding.tenantId},true)`);
        const users = await tx.select({ id: tenantUsers.id }).from(tenantUsers).limit(1);
        if (users.length)
          throw new Error('Reissue is unavailable after a local administrator has been activated');
        if (!input.adminName || !/^\S+@\S+\.\S+$/.test(input.adminEmail))
          throw new Error('A named administrator is required');
        await tx
          .update(installationInvitations)
          .set({ claimedAt: new Date() })
          .where(
            and(
              eq(installationInvitations.installationId, binding.installationId),
              isNull(installationInvitations.claimedAt),
            ),
          );
        const token = `gpinit.v1.${binding.installationId}.${randomBytes(32).toString('base64url')}`;
        await tx.insert(installationInvitations).values({
          installationId: binding.installationId,
          name: input.adminName,
          email: input.adminEmail.toLowerCase(),
          tokenHash: createHash('sha256').update(token).digest('hex'),
          expiresAt: new Date(Date.now() + 86400000),
        });
        await tx.insert(installationEvents).values({
          installationId: binding.installationId,
          action: 'bootstrap_invitation_reissued',
        });
        return { token, expiresInSeconds: 86400 };
      });
      console.log(JSON.stringify(result));
    } else if (command === 'readiness-receipt') {
      const request = JSON.parse(await readFile(file!, 'utf8'));
      const keyFile = process.env.INSTALLATION_PROOF_PRIVATE_KEY_FILE;
      if (!keyFile) throw new Error('Use the private installation proof key with mode 0600');
      const handle = await open(
        keyFile,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      let key: ReturnType<typeof createPrivateKey>;
      try {
        const info = await handle.stat();
        if (!info.isFile() || info.mode & 0o077)
          throw new Error('Use the private installation proof key with mode 0600');
        key = createPrivateKey(await handle.readFile());
      } finally {
        await handle.close();
      }
      if (key.asymmetricKeyType !== 'ed25519')
        throw new Error('Use an Ed25519 installation proof key');
      const receipt = await installationReadinessReceipt(db, binding, {
        challenge: request.challenge,
        apiOrigin: config.API_ORIGIN,
        webOrigin: config.WEB_ORIGIN,
        release: config.RELEASE_VERSION,
        privateKey: key,
      });
      await writeFile(arg!, receipt, { mode: 0o600, flag: 'wx' });
      console.log(JSON.stringify({ receiptFile: arg }));
    } else
      throw new Error(
        'Use new-installation, validate-config, bootstrap, reissue-invitation, import-license or readiness-receipt',
      );
  } finally {
    await pool.end();
  }
}
