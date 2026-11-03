import type { TenantRole } from './catalog.js';
import type { Address } from './hr-schemas.js';
import type {
  BloodGroup,
  EmployeeStatus,
  EmploymentType,
  Gender,
  JobEvent,
  LocationKind,
  MaritalStatus,
  OrgUnitKind,
  PaymentMethod,
  Religion,
  WorkerCategory,
} from './hr.js';

export interface Ref {
  id: string;
  name: string;
}

export interface LegalEntityView extends Ref {
  countryCode?: string;
  legalName: string | null;
  code: string | null;
  registrationNo: string | null;
  tin: string | null;
  bin: string | null;
  address: Address | null;
  isActive: boolean;
  createdAt: string;
}

export interface LocationView extends Ref {
  countryCode?: string;
  timeZone?: string;
  legalEntityId: string;
  code: string;
  kind: LocationKind;
  address: Address | null;
  latitude: number | null;
  longitude: number | null;
  geofenceRadiusM: number | null;
  holidayCalendarId: string | null;
  weeklyOffDays: number[];
  isActive: boolean;
}

export interface OrgUnitView extends Ref {
  legalEntityId: string;
  parentId: string | null;
  kind: OrgUnitKind;
  code: string;
  nameBn: string | null;
  isActive: boolean;
}

export interface DesignationView extends Ref {
  code: string;
  nameBn: string | null;
  workerCategory: WorkerCategory;
  isActive: boolean;
}

export interface GradeView extends Ref {
  code: string;
  rank: number;
  isActive: boolean;
}

export interface CostCentreView extends Ref {
  code: string;
  isActive: boolean;
}

/** Everything the org screens and employee forms need, in one call. */
export interface OrgSnapshot {
  legalEntities: LegalEntityView[];
  locations: LocationView[];
  orgUnits: OrgUnitView[];
  designations: DesignationView[];
  grades: GradeView[];
  costCentres: CostCentreView[];
}

export interface JobAssignmentView {
  currency?: string;
  id: string;
  event: JobEvent;
  effectiveFrom: string;
  effectiveTo: string | null;
  legalEntity: Ref;
  location: Ref | null;
  orgUnit: Ref | null;
  designation: Ref | null;
  grade: Ref | null;
  costCentre: Ref | null;
  manager: { id: string; fullName: string; employeeCode: string } | null;
  employmentType: EmploymentType;
  workerCategory: WorkerCategory;
  reason: string | null;
  createdAt: string;
}

export interface EmployeeListItem {
  id: string;
  employeeCode: string;
  fullName: string;
  fullNameBn: string | null;
  status: EmployeeStatus;
  joinedOn: string;
  legalEntity: Ref | null;
  orgUnit: Ref | null;
  designation: Ref | null;
  location: Ref | null;
  employmentType: EmploymentType | null;
  isAdolescent: boolean | null;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface NomineeView {
  id: string;
  name: string;
  relation: string;
  sharePercent: number;
  dateOfBirth: string | null;
  phone: string | null;
}

export interface PaymentAccountView {
  id: string;
  method: PaymentMethod;
  provider: string | null;
  branchName: string | null;
  routingNumber: string | null;
  accountName: string | null;
  /** Only the last 4 digits ever leave the server. */
  accountNumberMasked: string | null;
  isPrimary: boolean;
  /** A fixed amount of each pay sent here; null on the primary account, which takes the rest. */
  splitAmount: string | null;
}

export interface EmployeeDetail {
  id: string;
  employeeCode: string;
  status: EmployeeStatus;
  fullName: string;
  fullNameBn: string | null;
  fatherName: string | null;
  motherName: string | null;
  spouseName: string | null;
  dateOfBirth: string | null;
  gender: Gender;
  religion: Religion | null;
  maritalStatus: MaritalStatus | null;
  bloodGroup: BloodGroup | null;
  nationality: string;
  mobilePhone: string | null;
  workEmail: string | null;
  personalEmail: string | null;
  presentAddress: Address | null;
  permanentAddress: Address | null;
  emergencyContact: { name: string; relation: string; phone: string } | null;
  /** Decrypted for HR roles and the employee themself. */
  identity: {
    nid: string | null;
    birthRegistration: string | null;
    passport: string | null;
    tin: string | null;
  } | null;
  joinedOn: string;
  probationEndsOn: string | null;
  confirmedOn: string | null;
  separatedOn: string | null;
  isAdolescent: boolean | null;
  currentJob: JobAssignmentView | null;
  nominees: NomineeView[];
  paymentAccounts: PaymentAccountView[];
  portalUser: {
    id: string;
    email: string | null;
    phone: string | null;
    role: TenantRole;
    disabled: boolean;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface HireResult {
  employee: EmployeeDetail;
  /** Present only when a portal login was created with a generated password. Shown once. */
  temporaryPassword?: string;
}
