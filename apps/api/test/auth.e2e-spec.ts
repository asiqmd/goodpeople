import type { INestApplication } from '@nestjs/common';
import { api, bearer, bootApp, tenantLogin, testEnv } from './test-env.js';

describe('auth', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await bootApp();
  });
  afterAll(() => app.close());

  it('reports health without a token', async () => {
    await api(app).get('/health').expect(200, { status: 'ok', db: 'up' });
  });

  it('rejects requests without a token', async () => {
    await api(app).get('/tenant/access').expect(401);
    await api(app).get('/platform/tenants').expect(401);
  });

  it('signs in a platform user, and rejects a wrong password', async () => {
    const { superAdminEmail, password } = testEnv();
    const ok = await api(app)
      .post('/platform/auth/login')
      .send({ email: superAdminEmail, password });
    expect(ok.status).toBe(200);
    expect(ok.body.user.role).toBe('super_admin');
    await api(app)
      .post('/platform/auth/login')
      .send({ email: superAdminEmail, password: 'not-the-password' })
      .expect(401);
  });

  it('signs in a workspace user and gives the same error for a wrong workspace or password', async () => {
    const session = await api(app)
      .post('/auth/login')
      .send({ tenant: 'my-group', email: 'admin@my-group.test', password: testEnv().password })
      .expect(200);
    expect(session.body.tenant.slug).toBe('my-group');
    expect(session.body.expiresIn).toBe(900);

    const wrongWorkspace = await api(app)
      .post('/auth/login')
      .send({
        tenant: 'no-such-workspace',
        email: 'admin@my-group.test',
        password: testEnv().password,
      })
      .expect(401);
    const wrongPassword = await api(app)
      .post('/auth/login')
      .send({ tenant: 'my-group', email: 'admin@my-group.test', password: 'nope-nope-nope' })
      .expect(401);
    expect(wrongWorkspace.body.message).toBe(wrongPassword.body.message);
  });

  it('validates the body with the shared schema', async () => {
    const res = await api(app)
      .post('/auth/login')
      .send({ tenant: 'my-group', email: 'not-an-email', password: 'x' })
      .expect(400);
    expect(res.body.issues).toEqual([expect.objectContaining({ path: 'email' })]);
  });

  it('rotates refresh tokens and signs out everywhere when an old one is reused', async () => {
    const first = await tenantLogin(app, 'my-group');
    const rotated = await api(app)
      .post('/auth/refresh')
      .send({ refreshToken: first.refreshToken })
      .expect(200);
    expect(rotated.body.refreshToken).not.toBe(first.refreshToken);
    await api(app).get('/tenant/access').set(bearer(rotated.body.accessToken)).expect(200);

    // Replaying the first token is treated as theft: it fails and revokes the new one too.
    await api(app).post('/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401);
    await api(app)
      .post('/auth/refresh')
      .send({ refreshToken: rotated.body.refreshToken })
      .expect(401);
  });

  it('revokes the refresh token on logout', async () => {
    const session = await tenantLogin(app, 'my-group');
    await api(app).post('/auth/logout').send({ refreshToken: session.refreshToken }).expect(204);
    await api(app).post('/auth/refresh').send({ refreshToken: session.refreshToken }).expect(401);
  });
});
