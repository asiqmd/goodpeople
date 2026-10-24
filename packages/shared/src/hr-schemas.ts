import { z } from 'zod';
import {
  BD_ADULT_AGE,
  BD_BIN,
  BD_BIRTH_REGISTRATION,
  BD_DIVISION_CODES,
  BD_MIN_WORKING_AGE,
  BD_MOBILE,
  BD_NID,
  BD_PASSPORT,
  BD_ROUTING_NUMBER,
  BD_TIN,
  isDistrictInDivision,
  normalizeBdMobile,
} from './bd.js';
import { ageOn } from './dates.js';
import {
  BLOOD_GROUPS,
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  GENDERS,
  JOB_CHANGE_EVENTS,
  LOCATION_KINDS,
  MARITAL_STATUSES,
  MFS_PROVIDERS,
  ORG_UNIT_KINDS,
  RELIGIONS,
  WORKER_CATEGORIES,
} from './hr.js';
import { TENANT_ROLES } from './catalog.js';

const isoDate = z.iso.date();
const id = z.uuid();
const name = z.string().trim().min(2).max(160);
const optionalText = (max: number) => z.string().trim().max(max).optional();
const code = z
  .string()
  .trim()
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9_.-]{0,31}$/,
    'Use up to 32 letters, digits, dot, dash or underscore',
  );

export const bdMobileSchema = z
  .string()
  .trim()
  .regex(BD_MOBILE, 'Use a Bangladesh mobile number, e.g. 01712345678')
  .transform(normalizeBdMobile);

export const addressSchema = z
  .object({
    line: z.string().trim().min(2).max(200),
    upazila: optionalText(80),
    district: z.string().trim().min(2).max(80),
    division: z.enum(BD_DIVISION_CODES),
    postcode: z
      .string()
      .regex(/^\d{4}$/, 'A postcode has 4 digits')
      .optional(),
  })
  .refine((a) => isDistrictInDivision(a.division, a.district), {
    message: 'This district is not in the selected division',
    path: ['district'],
  });
export type Address = z.infer<typeof addressSchema>;

// ── Org structure ────────────────────────────────────────────────────────────

export const legalEntityInputSchema = z.object({
  name,
  legalName: optionalText(200),
  code: code.optional(),
  registrationNo: optionalText(60),
  tin: z.string().regex(BD_TIN, 'A Bangladesh e-TIN has 12 digits').optional(),
  bin: z.string().regex(BD_BIN, 'A BIN has 9 or 13 digits').optional(),
  address: addressSchema.optional(),
});
export const legalEntityUpdateSchema = legalEntityInputSchema
  .partial()
  .extend({ isActive: z.boolean().optional() });
export type LegalEntityInput = z.infer<typeof legalEntityInputSchema>;
export type LegalEntityUpdate = z.infer<typeof legalEntityUpdateSchema>;

export const locationInputSchema = z.object({
  legalEntityId: id,
  code,
  name,
  kind: z.enum(LOCATION_KINDS),
  address: addressSchema.optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  /** Radius for geo-fenced mobile punches (M3). */
  geofenceRadiusM: z.number().int().min(20).max(5000).optional(),
});
export const locationUpdateSchema = locationInputSchema
  .omit({ legalEntityId: true })
  .partial()
  .extend({
    isActive: z.boolean().optional(),
    /** null: the workspace default calendar. */
    holidayCalendarId: id.nullable().optional(),
    /** 0 = Sunday … 6 = Saturday. */
    weeklyOffDays: z
      .array(z.number().int().min(0).max(6))
      .max(3)
      .refine((d) => new Set(d).size === d.length, 'Each day can appear once')
      .optional(),
  });
export type LocationInput = z.infer<typeof locationInputSchema>;
export type LocationUpdate = z.infer<typeof locationUpdateSchema>;

export const orgUnitInputSchema = z.object({
  legalEntityId: id,
  parentId: id.optional(),
  kind: z.enum(ORG_UNIT_KINDS),
  code,
  name,
  nameBn: optionalText(160),
});
export const orgUnitUpdateSchema = z
  .object({
    parentId: id.nullable(),
    code,
    name,
    nameBn: optionalText(160),
    isActive: z.boolean(),
  })
  .partial();
export type OrgUnitInput = z.infer<typeof orgUnitInputSchema>;
export type OrgUnitUpdate = z.infer<typeof orgUnitUpdateSchema>;

export const designationInputSchema = z.object({
  code,
  name,
  nameBn: optionalText(160),
  workerCategory: z.enum(WORKER_CATEGORIES),
});
export const gradeInputSchema = z.object({
  code,
  name,
  /** Higher rank = more senior. Wage-board grades attach in Phase 2. */
  rank: z.number().int().min(0).max(1000),
});
export const costCentreInputSchema = z.object({ code, name });
const withActive = <T extends z.ZodObject>(schema: T) =>
  schema.partial().extend({ isActive: z.boolean().optional() });
export const designationUpdateSchema = withActive(designationInputSchema);
export const gradeUpdateSchema = withActive(gradeInputSchema);
export const costCentreUpdateSchema = withActive(costCentreInputSchema);
export type DesignationInput = z.infer<typeof designationInputSchema>;
export type GradeInput = z.infer<typeof gradeInputSchema>;
export type CostCentreInput = z.infer<typeof costCentreInputSchema>;

// ── Employees ────────────────────────────────────────────────────────────────

export const identitySchema = z.object({
  nid: z.string().trim().regex(BD_NID, 'An NID has 10, 13 or 17 digits').nullable().optional(),
  birthRegistration: z
    .string()
    .trim()
    .regex(BD_BIRTH_REGISTRATION, 'A birth registration number has 17 digits')
    .nullable()
    .optional(),
  passport: z
    .string()
    .trim()
    .toUpperCase()
    .regex(BD_PASSPORT, 'Use a Bangladesh passport number, e.g. A12345678')
    .nullable()
    .optional(),
  tin: z.string().trim().regex(BD_TIN, 'A Bangladesh e-TIN has 12 digits').nullable().optional(),
});
export type IdentityInput = z.infer<typeof identitySchema>;

export const emergencyContactSchema = z.object({
  name,
  relation: z.string().trim().min(2).max(40),
  phone: bdMobileSchema,
});

const personalFields = {
  fullName: name,
  fullNameBn: optionalText(160),
  fatherName: name,
  motherName: name,
  spouseName: optionalText(160),
  dateOfBirth: isoDate,
  gender: z.enum(GENDERS),
  religion: z.enum(RELIGIONS).optional(),
  maritalStatus: z.enum(MARITAL_STATUSES).optional(),
  bloodGroup: z.enum(BLOOD_GROUPS).optional(),
  nationality: z.string().length(2).toUpperCase().default('BD'),
  mobilePhone: bdMobileSchema,
  workEmail: z.email().optional(),
  personalEmail: z.email().optional(),
  presentAddress: addressSchema,
  permanentAddress: addressSchema,
  emergencyContact: emergencyContactSchema.optional(),
  identity: identitySchema,
};

export const jobInputSchema = z.object({
  legalEntityId: id,
  locationId: id.optional(),
  orgUnitId: id.optional(),
  designationId: id.optional(),
  gradeId: id.optional(),
  costCentreId: id.optional(),
  managerId: id.optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  workerCategory: z.enum(WORKER_CATEGORIES),
});
export type JobInput = z.infer<typeof jobInputSchema>;

export const hireEmployeeSchema = z
  .object({
    ...personalFields,
    employeeCode: code,
    joinedOn: isoDate,
    probationEndsOn: isoDate.optional(),
    job: jobInputSchema,
    /** Creates a workspace login linked to this employee. */
    portalAccess: z
      .object({
        email: z.email(),
        role: z.enum(TENANT_ROLES).default('employee'),
        password: z.string().min(10).optional(),
      })
      .optional(),
  })
  .superRefine((e, ctx) => {
    const { nid, birthRegistration, passport } = e.identity;
    if (!nid && !birthRegistration && !passport) {
      ctx.addIssue({
        code: 'custom',
        message: 'Give an NID, birth registration or passport number',
        path: ['identity', 'nid'],
      });
    }
    if (ageOn(e.dateOfBirth, e.joinedOn) < BD_MIN_WORKING_AGE) {
      ctx.addIssue({
        code: 'custom',
        message: `Must be at least ${BD_MIN_WORKING_AGE} on the joining date (Labour Act s.34)`,
        path: ['dateOfBirth'],
      });
    }
    if (e.probationEndsOn && e.probationEndsOn <= e.joinedOn) {
      ctx.addIssue({
        code: 'custom',
        message: 'Probation must end after the joining date',
        path: ['probationEndsOn'],
      });
    }
  });
export type HireEmployeeInput = z.infer<typeof hireEmployeeSchema>;

/** Personal details only; job changes go through the job-change endpoint. */
export const updateEmployeeSchema = z
  .object({
    ...personalFields,
    identity: identitySchema,
    probationEndsOn: isoDate.nullable(),
  })
  .partial();
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

export const jobChangeSchema = z
  .object({
    event: z.enum(JOB_CHANGE_EVENTS),
    effectiveFrom: isoDate,
    reason: z.string().trim().min(3).max(500),
    changes: jobInputSchema.partial().extend({
      locationId: id.nullable().optional(),
      orgUnitId: id.nullable().optional(),
      designationId: id.nullable().optional(),
      gradeId: id.nullable().optional(),
      costCentreId: id.nullable().optional(),
      managerId: id.nullable().optional(),
    }),
  })
  .superRefine((c, ctx) => {
    const changed = (keys: (keyof typeof c.changes)[]) =>
      keys.some((k) => c.changes[k] !== undefined);
    if (c.event === 'transfer' && !changed(['legalEntityId', 'locationId', 'orgUnitId'])) {
      ctx.addIssue({
        code: 'custom',
        message: 'A transfer changes the legal entity, location or org unit',
        path: ['changes'],
      });
    }
    if (c.event === 'promotion' && !changed(['designationId', 'gradeId'])) {
      ctx.addIssue({
        code: 'custom',
        message: 'A promotion changes the designation or grade',
        path: ['changes'],
      });
    }
    if (c.event !== 'confirmation' && Object.keys(c.changes).length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Nothing to change', path: ['changes'] });
    }
  });
export type JobChangeInput = z.infer<typeof jobChangeSchema>;

export const nomineesSchema = z
  .array(
    z.object({
      name,
      relation: z.string().trim().min(2).max(40),
      sharePercent: z.number().int().min(1).max(100),
      dateOfBirth: isoDate.optional(),
      phone: bdMobileSchema.optional(),
    }),
  )
  .max(10)
  .refine((list) => list.length === 0 || list.reduce((sum, n) => sum + n.sharePercent, 0) === 100, {
    message: 'Nominee shares must add up to 100%',
  });
export type NomineesInput = z.infer<typeof nomineesSchema>;

export const paymentAccountsSchema = z
  .array(
    z
      .object({
        /** An existing account: leave accountNumber out to keep its stored (encrypted) number. */
        id: z.uuid().optional(),
        method: z.enum(['bank', 'mfs', 'cash']),
        /** Bank name, or the MFS provider (bkash, nagad, rocket, upay). */
        provider: z.string().trim().max(80).optional(),
        branchName: optionalText(120),
        routingNumber: z
          .string()
          .regex(BD_ROUTING_NUMBER, 'A routing number has 9 digits')
          .optional(),
        accountName: optionalText(160),
        accountNumber: z.string().trim().max(34).optional(),
        isPrimary: z.boolean(),
      })
      .superRefine((a, ctx) => {
        if (a.method === 'bank') {
          if (!a.provider)
            ctx.addIssue({ code: 'custom', message: 'Bank name is required', path: ['provider'] });
          if (!a.routingNumber)
            ctx.addIssue({
              code: 'custom',
              message: 'Routing number is required',
              path: ['routingNumber'],
            });
          if (a.accountNumber ? !/^\d{6,20}$/.test(a.accountNumber) : !a.id)
            ctx.addIssue({ code: 'custom', message: 'Use 6–20 digits', path: ['accountNumber'] });
        }
        if (a.method === 'mfs') {
          if (!(MFS_PROVIDERS as readonly string[]).includes(a.provider ?? ''))
            ctx.addIssue({
              code: 'custom',
              message: 'Choose bKash, Nagad, Rocket or Upay',
              path: ['provider'],
            });
          if (a.accountNumber ? !BD_MOBILE.test(a.accountNumber) : !a.id)
            ctx.addIssue({
              code: 'custom',
              message: 'Use the wallet mobile number',
              path: ['accountNumber'],
            });
        }
      }),
  )
  .max(5)
  .refine((list) => list.length === 0 || list.filter((a) => a.isPrimary).length === 1, {
    message: 'Mark exactly one account as primary',
  });
export type PaymentAccountsInput = z.infer<typeof paymentAccountsSchema>;

export const employeeListQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  legalEntityId: id.optional(),
  locationId: id.optional(),
  orgUnitId: id.optional(),
  status: z.enum(EMPLOYEE_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>;

/** Adolescent workers (14–17) have restricted hours under the Labour Act. */
export const isAdolescentOn = (dateOfBirth: string, on: string) =>
  ageOn(dateOfBirth, on) < BD_ADULT_AGE;
