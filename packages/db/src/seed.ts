import {
  PLAN_CATALOG,
  todayIn,
  type BillingMode,
  type IndustryTemplate,
  type PlanCode,
} from '@gp/shared';
import { eq } from 'drizzle-orm';
import { scopeToTenant, type Database } from './client.js';
import { createFieldCipher } from './field-cipher.js';
import { hashPassword } from './passwords.js';
import { provisionCountryDefaults, provisionPayroll } from './provision.js';
import { seedGroupPayroll } from './seed-payroll.js';
import { seedGroupHr } from './seed-hr.js';
import { seedGroupAttendance } from './seed-attendance.js';
import { seedGroupLeave } from './seed-leave.js';
import {
  legalEntities,
  plans,
  platformAuditLog,
  platformUsers,
  subscriptions,
  tenants,
  tenantUsers,
} from './schema/index.js';

const DAY_MS = 24 * 60 * 60 * 1000;

interface SeedTenant {
  slug: string;
  name: string;
  industryTemplate: IndustryTemplate;
  billingMode: BillingMode;
  planCode: PlanCode;
  accessExpiresInDays?: number;
  reason: string;
  entities: string[];
  /** Paid tenants only: days from now until (negative: since) the period ended. */
  subscription?: { status: 'active' | 'past_due' | 'canceled'; periodEndInDays: number };
}

/** One tenant per billing situation, so every access state can be tried locally. */
export const SEED_TENANTS: SeedTenant[] = [
  {
    slug: 'my-group',
    name: 'My Group',
    industryTemplate: 'group',
    billingMode: 'internal',
    planCode: 'enterprise',
    reason: 'Our own organizations (internal adoption)',
    entities: ['My Group Textiles Ltd', 'My Group Foods Ltd'],
  },
  {
    slug: 'sponsored-ngo',
    name: 'Sponsored NGO',
    industryTemplate: 'ngo',
    billingMode: 'complimentary',
    planCode: 'enterprise',
    reason: 'Sponsored pilot assigned by the Super Admin',
    entities: ['Sponsored NGO Foundation'],
  },
  {
    slug: 'acme-garments',
    name: 'Acme Garments',
    industryTemplate: 'rmg',
    billingMode: 'paid',
    planCode: 'growth',
    reason: 'Paying customer whose last payment failed',
    entities: ['Acme Garments Ltd'],
    subscription: { status: 'past_due', periodEndInDays: -40 },
  },
  {
    slug: 'trial-co',
    name: 'Trial Co',
    industryTemplate: 'corporate',
    billingMode: 'trial',
    planCode: 'starter',
    accessExpiresInDays: 14,
    reason: 'Self-serve trial',
    entities: ['Trial Co Ltd'],
  },
];

export const seedAdminEmail = (slug: string) => `admin@${slug}.test`;

export interface SeedOptions {
  superAdminEmail: string;
  password: string;
  /** FIELD_ENCRYPTION_KEY, for the seeded employees' identity numbers. */
  fieldKey: string;
  now?: Date;
}

/** The plan catalogue, which Assign company needs. Idempotent: plans are upserted. */
export async function upsertPlanCatalog(db: Database): Promise<void> {
  for (const plan of PLAN_CATALOG) {
    await db
      .insert(plans)
      .values({ code: plan.code, name: plan.name, features: plan.features, limits: plan.limits })
      .onConflictDoUpdate({
        target: plans.code,
        set: { name: plan.name, features: plan.features, limits: plan.limits },
      });
  }
}

/** Idempotent: plans are upserted, users and tenants are only created when missing. */
export async function seed(db: Database, opts: SeedOptions) {
  const now = opts.now ?? new Date();
  const passwordHash = await hashPassword(opts.password);

  await upsertPlanCatalog(db);
  const planIds = new Map((await db.select().from(plans)).map((p) => [p.code, p.id]));

  await db
    .insert(platformUsers)
    .values({ email: opts.superAdminEmail, name: 'Super Admin', passwordHash, role: 'super_admin' })
    .onConflictDoNothing();
  const [superAdmin] = await db
    .select()
    .from(platformUsers)
    .where(eq(platformUsers.email, opts.superAdminEmail));

  const created: string[] = [];
  for (const t of SEED_TENANTS) {
    const [existing] = await db.select().from(tenants).where(eq(tenants.slug, t.slug));
    if (existing) continue;
    await db.transaction(async (tx) => {
      const [tenant] = await tx
        .insert(tenants)
        .values({
          slug: t.slug,
          name: t.name,
          industryTemplate: t.industryTemplate,
          billingMode: t.billingMode,
          planId: planIds.get(t.planCode)!,
          accessExpiresAt:
            t.accessExpiresInDays === undefined
              ? null
              : new Date(now.getTime() + t.accessExpiresInDays * DAY_MS),
          bypassReason: t.billingMode === 'paid' || t.billingMode === 'trial' ? null : t.reason,
          grantedBy: superAdmin!.id,
        })
        .returning();
      if (t.subscription) {
        await tx.insert(subscriptions).values({
          tenantId: tenant!.id,
          provider: 'manual',
          status: t.subscription.status,
          currentPeriodEnd: new Date(now.getTime() + t.subscription.periodEndInDays * DAY_MS),
        });
      }
      await tx.insert(platformAuditLog).values({
        actorId: superAdmin!.id,
        action: 'tenant.assign',
        tenantId: tenant!.id,
        reason: `Seed: ${t.reason}`,
        after: { billingMode: t.billingMode, planCode: t.planCode },
      });
      await scopeToTenant(tx, tenant!.id);
      await tx.insert(tenantUsers).values({
        tenantId: tenant!.id,
        email: seedAdminEmail(t.slug),
        name: `${t.name} Admin`,
        passwordHash,
        role: 'tenant_admin',
      });
      const entities = await tx
        .insert(legalEntities)
        .values(t.entities.map((name) => ({ tenantId: tenant!.id, name })))
        .returning({ id: legalEntities.id });
      await provisionCountryDefaults(tx, tenant!.id, {
        countryPack: 'BD',
        today: todayIn('Asia/Dhaka', now),
      });
      if (t.slug === 'my-group') {
        await seedGroupHr(tx, {
          tenantId: tenant!.id,
          textilesId: entities[0]!.id,
          foodsId: entities[1]!.id,
          cipher: createFieldCipher(opts.fieldKey),
          passwordHash,
        });
        await seedGroupLeave(tx, { tenantId: tenant!.id, passwordHash });
        await seedGroupAttendance(tx, { tenantId: tenant!.id });
      }
    });
    created.push(t.slug);
  }

  // Seeds added after a database was first seeded fill it in; each skips what exists.
  const [group] = await db.select().from(tenants).where(eq(tenants.slug, 'my-group'));
  if (group) {
    await db.transaction(async (tx) => {
      await scopeToTenant(tx, group.id);
      await provisionPayroll(tx, group.id);
      await seedGroupPayroll(tx, {
        tenantId: group.id,
        cipher: createFieldCipher(opts.fieldKey),
        passwordHash,
      });
    });
  }
  return { created };
}
