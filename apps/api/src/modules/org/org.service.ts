import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  costCentres,
  designations,
  grades,
  legalEntities,
  locations,
  orgUnits,
  type Tx,
} from '@gp/db';
import type {
  CostCentreInput,
  CostCentreView,
  DesignationInput,
  DesignationView,
  GradeInput,
  GradeView,
  LegalEntityInput,
  LegalEntityUpdate,
  LegalEntityView,
  LocationInput,
  LocationUpdate,
  LocationView,
  OrgSnapshot,
  OrgUnitInput,
  OrgUnitUpdate,
  OrgUnitView,
  TenantWithAccess,
} from '@gp/shared';
import { asc, count, eq } from 'drizzle-orm';
import type { AuthUser } from '../../common/auth-user.js';
import { forbidden } from '../../common/errors.js';
import { currentTenantId } from '../../common/request-context.js';
import { TenantDb } from '../../db/db.module.js';
import { TenantAuditService } from '../audit/tenant-audit.service.js';

type Row<T extends { $inferSelect: unknown }> = T['$inferSelect'];

export const toLegalEntityView = (r: Row<typeof legalEntities>): LegalEntityView => ({
  id: r.id,
  name: r.name,
  legalName: r.legalName,
  code: r.code,
  registrationNo: r.registrationNo,
  tin: r.tin,
  bin: r.bin,
  address: r.address,
  isActive: r.isActive,
  createdAt: r.createdAt.toISOString(),
});

const toLocationView = (r: Row<typeof locations>): LocationView => ({
  id: r.id,
  name: r.name,
  legalEntityId: r.legalEntityId,
  code: r.code,
  kind: r.kind,
  address: r.address,
  latitude: r.latitude,
  longitude: r.longitude,
  geofenceRadiusM: r.geofenceRadiusM,
  holidayCalendarId: r.holidayCalendarId,
  weeklyOffDays: r.weeklyOffDays,
  isActive: r.isActive,
});

const toOrgUnitView = (r: Row<typeof orgUnits>): OrgUnitView => ({
  id: r.id,
  name: r.name,
  legalEntityId: r.legalEntityId,
  parentId: r.parentId,
  kind: r.kind,
  code: r.code,
  nameBn: r.nameBn,
  isActive: r.isActive,
});

const toDesignationView = (r: Row<typeof designations>): DesignationView => ({
  id: r.id,
  name: r.name,
  code: r.code,
  nameBn: r.nameBn,
  workerCategory: r.workerCategory,
  isActive: r.isActive,
});

const toGradeView = (r: Row<typeof grades>): GradeView => ({
  id: r.id,
  name: r.name,
  code: r.code,
  rank: r.rank,
  isActive: r.isActive,
});

const toCostCentreView = (r: Row<typeof costCentres>): CostCentreView => ({
  id: r.id,
  name: r.name,
  code: r.code,
  isActive: r.isActive,
});

/**
 * Org structure inside a workspace. Queries carry no tenant filter: TenantDb scopes them by
 * row-level security, and composite foreign keys reject references across workspaces.
 */
@Injectable()
export class OrgService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: TenantAuditService,
  ) {}

  snapshot(): Promise<OrgSnapshot> {
    return this.tenantDb.run(async (tx) => ({
      legalEntities: (
        await tx.select().from(legalEntities).orderBy(asc(legalEntities.createdAt))
      ).map(toLegalEntityView),
      locations: (await tx.select().from(locations).orderBy(asc(locations.name))).map(
        toLocationView,
      ),
      orgUnits: (await tx.select().from(orgUnits).orderBy(asc(orgUnits.name))).map(toOrgUnitView),
      designations: (await tx.select().from(designations).orderBy(asc(designations.name))).map(
        toDesignationView,
      ),
      grades: (await tx.select().from(grades).orderBy(asc(grades.rank))).map(toGradeView),
      costCentres: (await tx.select().from(costCentres).orderBy(asc(costCentres.code))).map(
        toCostCentreView,
      ),
    }));
  }

  // ── Legal entities ──────────────────────────────────────────────────────────

  listLegalEntities(): Promise<LegalEntityView[]> {
    return this.tenantDb.run(async (tx) =>
      (await tx.select().from(legalEntities).orderBy(asc(legalEntities.createdAt))).map(
        toLegalEntityView,
      ),
    );
  }

  async getLegalEntity(id: string): Promise<LegalEntityView> {
    const [row] = await this.tenantDb.run((tx) =>
      tx.select().from(legalEntities).where(eq(legalEntities.id, id)),
    );
    if (!row) throw new NotFoundException('Legal entity not found');
    return toLegalEntityView(row);
  }

  async createLegalEntity(
    actor: AuthUser,
    tenant: TenantWithAccess,
    input: LegalEntityInput,
  ): Promise<LegalEntityView> {
    const limit = tenant.access.limits.max_legal_entities;
    return this.tenantDb.run(async (tx) => {
      const [{ value: existing } = { value: 0 }] = await tx
        .select({ value: count() })
        .from(legalEntities);
      if (limit !== null && existing >= limit) {
        throw forbidden(
          'limit_reached',
          `Your plan allows ${limit} legal entit${limit === 1 ? 'y' : 'ies'}`,
        );
      }
      const [row] = await tx
        .insert(legalEntities)
        .values({ tenantId: currentTenantId(), ...input })
        .returning();
      await this.record(tx, actor, 'org.legal_entity.create', 'legal_entity', row!.id, input);
      return toLegalEntityView(row!);
    });
  }

  updateLegalEntity(
    actor: AuthUser,
    id: string,
    input: LegalEntityUpdate,
  ): Promise<LegalEntityView> {
    return this.tenantDb.run(async (tx) => {
      const [row] = await tx
        .update(legalEntities)
        .set(input)
        .where(eq(legalEntities.id, id))
        .returning();
      if (!row) throw new NotFoundException('Legal entity not found');
      await this.record(tx, actor, 'org.legal_entity.update', 'legal_entity', id, input);
      return toLegalEntityView(row);
    });
  }

  // ── Locations ───────────────────────────────────────────────────────────────

  createLocation(actor: AuthUser, input: LocationInput): Promise<LocationView> {
    return this.tenantDb.run(async (tx) => {
      const [row] = await tx
        .insert(locations)
        .values({ tenantId: currentTenantId(), ...input })
        .returning();
      await this.record(tx, actor, 'org.location.create', 'location', row!.id, input);
      return toLocationView(row!);
    });
  }

  updateLocation(actor: AuthUser, id: string, input: LocationUpdate): Promise<LocationView> {
    return this.tenantDb.run(async (tx) => {
      const [row] = await tx.update(locations).set(input).where(eq(locations.id, id)).returning();
      if (!row) throw new NotFoundException('Location not found');
      await this.record(tx, actor, 'org.location.update', 'location', id, input);
      return toLocationView(row);
    });
  }

  // ── Org units ───────────────────────────────────────────────────────────────

  createOrgUnit(actor: AuthUser, input: OrgUnitInput): Promise<OrgUnitView> {
    return this.tenantDb.run(async (tx) => {
      if (input.parentId) await this.checkParent(tx, input.legalEntityId, input.parentId, null);
      const [row] = await tx
        .insert(orgUnits)
        .values({ tenantId: currentTenantId(), ...input })
        .returning();
      await this.record(tx, actor, 'org.org_unit.create', 'org_unit', row!.id, input);
      return toOrgUnitView(row!);
    });
  }

  updateOrgUnit(actor: AuthUser, id: string, input: OrgUnitUpdate): Promise<OrgUnitView> {
    return this.tenantDb.run(async (tx) => {
      const [current] = await tx.select().from(orgUnits).where(eq(orgUnits.id, id));
      if (!current) throw new NotFoundException('Org unit not found');
      if (input.parentId) await this.checkParent(tx, current.legalEntityId, input.parentId, id);
      const [row] = await tx.update(orgUnits).set(input).where(eq(orgUnits.id, id)).returning();
      await this.record(tx, actor, 'org.org_unit.update', 'org_unit', id, input);
      return toOrgUnitView(row!);
    });
  }

  /** A parent must exist, belong to the same legal entity and not be the unit or its descendant. */
  private async checkParent(
    tx: Tx,
    legalEntityId: string,
    parentId: string,
    selfId: string | null,
  ) {
    const all = await tx
      .select({
        id: orgUnits.id,
        parentId: orgUnits.parentId,
        legalEntityId: orgUnits.legalEntityId,
      })
      .from(orgUnits);
    const parent = all.find((u) => u.id === parentId);
    if (!parent) throw new BadRequestException('Parent org unit not found');
    if (parent.legalEntityId !== legalEntityId) {
      throw new BadRequestException('The parent belongs to another legal entity');
    }
    for (
      let at: string | null = parentId;
      at;
      at = all.find((u) => u.id === at)?.parentId ?? null
    ) {
      if (at === selfId) throw new BadRequestException('An org unit cannot sit under itself');
    }
  }

  // ── Designations, grades, cost centres ──────────────────────────────────────

  createDesignation(actor: AuthUser, input: DesignationInput): Promise<DesignationView> {
    return this.tenantDb.run(async (tx) => {
      const [row] = await tx
        .insert(designations)
        .values({ tenantId: currentTenantId(), ...input })
        .returning();
      await this.record(tx, actor, 'org.designation.create', 'designation', row!.id, input);
      return toDesignationView(row!);
    });
  }

  updateDesignation(
    actor: AuthUser,
    id: string,
    input: Partial<DesignationInput> & { isActive?: boolean },
  ): Promise<DesignationView> {
    return this.tenantDb.run(async (tx) => {
      const [row] = await tx
        .update(designations)
        .set(input)
        .where(eq(designations.id, id))
        .returning();
      if (!row) throw new NotFoundException('Designation not found');
      await this.record(tx, actor, 'org.designation.update', 'designation', id, input);
      return toDesignationView(row);
    });
  }

  createGrade(actor: AuthUser, input: GradeInput): Promise<GradeView> {
    return this.tenantDb.run(async (tx) => {
      const [row] = await tx
        .insert(grades)
        .values({ tenantId: currentTenantId(), ...input })
        .returning();
      await this.record(tx, actor, 'org.grade.create', 'grade', row!.id, input);
      return toGradeView(row!);
    });
  }

  updateGrade(
    actor: AuthUser,
    id: string,
    input: Partial<GradeInput> & { isActive?: boolean },
  ): Promise<GradeView> {
    return this.tenantDb.run(async (tx) => {
      const [row] = await tx.update(grades).set(input).where(eq(grades.id, id)).returning();
      if (!row) throw new NotFoundException('Grade not found');
      await this.record(tx, actor, 'org.grade.update', 'grade', id, input);
      return toGradeView(row);
    });
  }

  createCostCentre(actor: AuthUser, input: CostCentreInput): Promise<CostCentreView> {
    return this.tenantDb.run(async (tx) => {
      const [row] = await tx
        .insert(costCentres)
        .values({ tenantId: currentTenantId(), ...input })
        .returning();
      await this.record(tx, actor, 'org.cost_centre.create', 'cost_centre', row!.id, input);
      return toCostCentreView(row!);
    });
  }

  updateCostCentre(
    actor: AuthUser,
    id: string,
    input: Partial<CostCentreInput> & { isActive?: boolean },
  ): Promise<CostCentreView> {
    return this.tenantDb.run(async (tx) => {
      const [row] = await tx
        .update(costCentres)
        .set(input)
        .where(eq(costCentres.id, id))
        .returning();
      if (!row) throw new NotFoundException('Cost centre not found');
      await this.record(tx, actor, 'org.cost_centre.update', 'cost_centre', id, input);
      return toCostCentreView(row);
    });
  }

  private record(
    tx: Tx,
    actor: AuthUser,
    action: string,
    entityType: string,
    entityId: string,
    after: unknown,
  ) {
    return this.audit.record(tx, { actorUserId: actor.id, action, entityType, entityId, after });
  }
}
