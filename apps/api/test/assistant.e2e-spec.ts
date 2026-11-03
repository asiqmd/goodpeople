import { createDb, entitlementGrants, tenants } from '@gp/db';
import { ASSISTANT_ACTOR_LIMIT } from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { api, bearer, bootApp, tenantLogin, testEnv } from './test-env.js';

describe('workspace assistant admission', () => {
  let app: INestApplication;
  let owner: ReturnType<typeof createDb>;

  beforeAll(async () => {
    app = await bootApp();
    owner = createDb(testEnv().ownerUrl);
  });

  afterAll(async () => {
    await app?.close();
    await owner?.pool.end();
  });

  it('requires opt-in and the current tenant session, including for read-only use', async () => {
    const [group] = await owner.db.select().from(tenants).where(eq(tenants.slug, 'my-group'));
    const groupLogin = await tenantLogin(app, 'my-group');
    const ngoLogin = await tenantLogin(app, 'sponsored-ngo');
    const auth = bearer(groupLogin.accessToken);
    await api(app).get('/tenant/assistant').expect(401);
    await api(app).get('/tenant/assistant').set(auth).expect(403);
    const [grant] = await owner.db
      .insert(entitlementGrants)
      .values({
        tenantId: group!.id,
        kind: 'feature',
        key: 'workspace_assistant',
        reason: 'M3 admission test',
      })
      .returning({ id: entitlementGrants.id });
    try {
      const { body } = await api(app)
        .get('/tenant/assistant')
        .set(auth)
        .expect(200)
        .expect('Cache-Control', 'private, no-store');
      expect(body).toMatchObject({ tenantId: group!.id, actorId: expect.any(String) });
      await api(app).get('/tenant/assistant').set(bearer(ngoLogin.accessToken)).expect(403);
      await api(app)
        .post('/tenant/assistant/read')
        .set(auth)
        .send({ question: 'private data fixture' })
        .expect(400);
      await owner.db.update(tenants).set({ status: 'read_only' }).where(eq(tenants.id, group!.id));
      for (let i = 0; i < ASSISTANT_ACTOR_LIMIT; i++)
        await api(app).post('/tenant/assistant/read').set(auth).send({}).expect(200, body);
      await api(app).post('/tenant/assistant/read').set(auth).send({}).expect(429);
      await owner.db.update(tenants).set({ status: 'suspended' }).where(eq(tenants.id, group!.id));
      await api(app).get('/tenant/assistant').set(auth).expect(403);
    } finally {
      await owner.db
        .update(tenants)
        .set({ status: group!.status })
        .where(eq(tenants.id, group!.id));
      await owner.db.delete(entitlementGrants).where(eq(entitlementGrants.id, grant!.id));
    }
    await api(app).get('/tenant/assistant').set(auth).expect(403);
  });
});
