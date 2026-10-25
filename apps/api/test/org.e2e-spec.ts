import { SEED_EMPLOYEE_EMAIL } from '@gp/db';
import type { OrgSnapshot } from '@gp/shared';
import type { INestApplication } from '@nestjs/common';
import { api, bearer, bootApp, tenantLogin, testEnv, uniqueSlug } from './test-env.js';

describe('org structure', () => {
  let app: INestApplication;
  let hr: string;
  let org: OrgSnapshot;

  beforeAll(async () => {
    app = await bootApp();
    hr = (await tenantLogin(app, 'my-group')).accessToken;
    org = (await api(app).get('/tenant/org').set(bearer(hr)).expect(200)).body;
  });
  afterAll(() => app.close());

  const textiles = () => org.legalEntities.find((e) => e.code === 'MGT')!;
  const foods = () => org.legalEntities.find((e) => e.code === 'MGF')!;
  const unit = (code: string) => org.orgUnits.find((u) => u.code === code)!;

  it('returns the whole org in one call for HR', () => {
    // The seeded companies and sites; other tests may add their own.
    expect(org.legalEntities.map((e) => e.name)).toEqual(
      expect.arrayContaining(['My Group Foods Ltd', 'My Group Textiles Ltd']),
    );
    expect(org.locations.map((l) => l.code)).toEqual(expect.arrayContaining(['GZP', 'HO', 'NRJ']));
    expect(unit('MGT-L1').parentId).toBe(unit('MGT-SEW').id);
    expect(org.designations.length).toBeGreaterThanOrEqual(9);
    expect(org.grades[0]!.rank).toBeLessThan(org.grades.at(-1)!.rank);
  });

  it('lets employees read legal entities but not the org admin screens', async () => {
    const login = await api(app)
      .post('/auth/login')
      .send({ tenant: 'my-group', email: SEED_EMPLOYEE_EMAIL, password: testEnv().password })
      .expect(200);
    const token = login.body.accessToken;
    await api(app).get('/tenant/legal-entities').set(bearer(token)).expect(200);
    const res = await api(app).get('/tenant/org').set(bearer(token)).expect(403);
    expect(res.body.code).toBe('role_not_allowed');
    await api(app)
      .post('/tenant/designations')
      .set(bearer(token))
      .send({ code: 'X', name: 'Not allowed', workerCategory: 'staff' })
      .expect(403);
  });

  it('creates org units under a parent of the same legal entity only', async () => {
    const ok = await api(app)
      .post('/tenant/org-units')
      .set(bearer(hr))
      .send({
        legalEntityId: textiles().id,
        parentId: unit('MGT-SEW').id,
        kind: 'line',
        code: 'MGT-L3',
        name: 'Line 3',
      })
      .expect(201);
    expect(ok.body.parentId).toBe(unit('MGT-SEW').id);

    const wrongEntity = await api(app)
      .post('/tenant/org-units')
      .set(bearer(hr))
      .send({
        legalEntityId: foods().id,
        parentId: unit('MGT-SEW').id,
        kind: 'line',
        code: 'MGF-L1',
        name: 'Line 1',
      })
      .expect(400);
    expect(wrongEntity.body.message).toBe('The parent belongs to another legal entity');
  });

  it('refuses to move an org unit under its own descendant', async () => {
    const res = await api(app)
      .patch(`/tenant/org-units/${unit('MGT-PROD').id}`)
      .set(bearer(hr))
      .send({ parentId: unit('MGT-L1').id })
      .expect(400);
    expect(res.body.message).toBe('An org unit cannot sit under itself');
  });

  it('rejects a duplicate code with a clear message', async () => {
    const res = await api(app)
      .post('/tenant/designations')
      .set(bearer(hr))
      .send({ code: 'SO', name: 'Another sewing operator', workerCategory: 'worker' })
      .expect(409);
    expect(res.body.message).toBe('This code is already in use');
  });

  it("rejects a reference to another workspace's record, even with its real id", async () => {
    const ngo = (await tenantLogin(app, 'sponsored-ngo')).accessToken;
    const res = await api(app)
      .post('/tenant/locations')
      .set(bearer(ngo))
      .send({
        legalEntityId: textiles().id,
        code: uniqueSlug('loc'),
        name: 'Smuggled office',
        kind: 'branch',
      })
      .expect(400);
    expect(res.body.code).toBe('invalid_reference');
  });

  it('updates and deactivates master data', async () => {
    const grade = org.grades.find((g) => g.code === 'W5')!;
    const res = await api(app)
      .patch(`/tenant/grades/${grade.id}`)
      .set(bearer(hr))
      .send({ name: 'Worker grade 5 (legacy)', isActive: false })
      .expect(200);
    expect(res.body).toMatchObject({ name: 'Worker grade 5 (legacy)', isActive: false });
  });
});
