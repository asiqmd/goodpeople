/// Hand-written models for the API contract the app uses.
///
/// `fromJson` throws [FormatException] when a required field is missing or
/// has the wrong type. Unknown enum values map to `unknown` instead of
/// failing, so a newer API does not break an older app.
library;

import 'dart:math' as math;
import 'dart:typed_data';

part 'account_models.dart';
part 'approval_models.dart';
part 'attendance_models.dart';
part 'leave_models.dart';
part 'lifecycle_models.dart';
part 'payroll_benefit_models.dart';
part 'payroll_models.dart';
part 'timesheet_models.dart';

typedef Json = Map<String, Object?>;

/// An enum value with its JSON spelling, for example `read_only`.
abstract interface class WireValue {
  String get wire;
}

/// A workspace role template. Every role but [employee] is staff, and staff
/// see everyone's records.
enum UserRole implements WireValue {
  tenantAdmin('tenant_admin'),
  hrAdmin('hr_admin'),
  hrOfficer('hr_officer'),
  attendanceOfficer('attendance_officer'),
  payrollOfficer('payroll_officer'),
  financeOfficer('finance_officer'),
  auditor('auditor'),
  employee('employee'),
  unknown('unknown');

  const UserRole(this.wire);
  @override
  final String wire;

  static UserRole fromWire(String value) => _byWire(values, value, unknown);

  /// Sees the HR side of the workspace: everyone's records and team views.
  bool get isStaff => this != employee && this != unknown;
}

enum BillingMode implements WireValue {
  paid('paid'),
  trial('trial'),
  complimentary('complimentary'),
  internal('internal'),
  partner('partner'),
  license('license'),
  unknown('unknown');

  const BillingMode(this.wire);
  @override
  final String wire;

  static BillingMode fromWire(String value) => _byWire(values, value, unknown);
}

enum TenantStatus implements WireValue {
  active('active'),
  readOnly('read_only'),
  suspended('suspended'),
  archived('archived'),
  unknown('unknown');

  const TenantStatus(this.wire);
  @override
  final String wire;

  static TenantStatus fromWire(String value) => _byWire(values, value, unknown);
}

enum PlanCode implements WireValue {
  starter('starter'),
  growth('growth'),
  business('business'),
  enterprise('enterprise'),
  unknown('unknown');

  const PlanCode(this.wire);
  @override
  final String wire;

  static PlanCode fromWire(String value) => _byWire(values, value, unknown);
}

enum AccessState implements WireValue {
  full('full'),
  readOnly('read_only'),
  suspended('suspended'),
  unknown('unknown');

  const AccessState(this.wire);
  @override
  final String wire;

  static AccessState fromWire(String value) => _byWire(values, value, unknown);
}

class AuthUser {
  const AuthUser({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
  });

  factory AuthUser.fromJson(Json json) => AuthUser(
    id: _read<String>(json, 'id'),
    name: _read<String>(json, 'name'),
    email: _read<String?>(json, 'email'),
    role: UserRole.fromWire(_read<String>(json, 'role')),
  );

  final String id;
  final String name;

  /// `null` for a worker who signs in with a code sent to their mobile.
  final String? email;
  final UserRole role;
}

/// The tenant as returned by `/auth/login`.
class TenantSummary {
  const TenantSummary({
    required this.id,
    required this.name,
    required this.slug,
  });

  factory TenantSummary.fromJson(Json json) => TenantSummary(
    id: _read<String>(json, 'id'),
    name: _read<String>(json, 'name'),
    slug: _read<String>(json, 'slug'),
  );

  final String id;
  final String name;
  final String slug;
}

/// Token pair from `/auth/login` and `/auth/refresh`.
class AuthTokens {
  const AuthTokens({
    required this.accessToken,
    required this.refreshToken,
    required this.expiresIn,
  });

  factory AuthTokens.fromJson(Json json) => AuthTokens(
    accessToken: _read<String>(json, 'accessToken'),
    refreshToken: _read<String>(json, 'refreshToken'),
    expiresIn: _read<int>(json, 'expiresIn'),
  );

  final String accessToken;

  /// Single use: `/auth/refresh` rotates it and the old one stops working.
  final String refreshToken;

  /// Access token lifetime in seconds.
  final int expiresIn;
}

/// What `POST /auth/login` answers: a session ([LoginResponse]), or a
/// [TwoStepChallenge] when the login needs a second step.
sealed class LoginOutcome {
  factory LoginOutcome.fromJson(Json json) {
    if (json['mfaRequired'] == true) {
      return TwoStepChallenge(mfaToken: _read<String>(json, 'mfaToken'));
    }
    if (json['mfaSetupRequired'] == true) {
      return TwoStepChallenge(
        mfaToken: _read<String>(json, 'mfaToken'),
        setupRequired: true,
      );
    }
    return LoginResponse.fromJson(json);
  }
}

/// The password was right, and the login needs a second step.
class TwoStepChallenge implements LoginOutcome {
  const TwoStepChallenge({required this.mfaToken, this.setupRequired = false});

  /// Short-lived proof of the password, sent with the code to
  /// `/auth/mfa/verify`. It is not an access token.
  final String mfaToken;

  /// The role must use two-step sign-in and this login has not set it up
  /// yet. The app does not enrol; that happens in the web app.
  final bool setupRequired;
}

/// A session: `POST /auth/login` (without a second step),
/// `/auth/mfa/verify` and `/auth/otp/verify` 200 response.
class LoginResponse implements LoginOutcome {
  const LoginResponse({
    required this.tokens,
    required this.user,
    required this.tenant,
  });

  factory LoginResponse.fromJson(Json json) => LoginResponse(
    tokens: AuthTokens.fromJson(json),
    user: AuthUser.fromJson(_read<Json>(json, 'user')),
    tenant: TenantSummary.fromJson(_read<Json>(json, 'tenant')),
  );

  final AuthTokens tokens;
  final AuthUser user;
  final TenantSummary tenant;
}

/// The tenant as returned by `/tenant/access`.
class TenantDetails {
  const TenantDetails({
    required this.id,
    required this.name,
    required this.slug,
    required this.billingMode,
    required this.status,
    required this.planCode,
  });

  factory TenantDetails.fromJson(Json json) => TenantDetails(
    id: _read<String>(json, 'id'),
    name: _read<String>(json, 'name'),
    slug: _read<String>(json, 'slug'),
    billingMode: BillingMode.fromWire(_read<String>(json, 'billingMode')),
    status: TenantStatus.fromWire(_read<String>(json, 'status')),
    planCode: PlanCode.fromWire(_read<String>(json, 'planCode')),
  );

  final String id;
  final String name;
  final String slug;
  final BillingMode billingMode;
  final TenantStatus status;
  final PlanCode planCode;
}

/// Plan limits. `null` means unlimited.
class AccessLimits {
  const AccessLimits({
    this.maxEmployees,
    this.maxLegalEntities,
    this.storageGb,
    this.smsCreditsMonthly,
  });

  factory AccessLimits.fromJson(Json json) => AccessLimits(
    maxEmployees: _read<int?>(json, 'max_employees'),
    maxLegalEntities: _read<int?>(json, 'max_legal_entities'),
    storageGb: _read<num?>(json, 'storage_gb'),
    smsCreditsMonthly: _read<int?>(json, 'sms_credits_monthly'),
  );

  final int? maxEmployees;
  final int? maxLegalEntities;
  final num? storageGb;
  final int? smsCreditsMonthly;
}

class TenantAccess {
  const TenantAccess({
    required this.accessState,
    required this.reason,
    required this.subscriptionChecked,
    required this.features,
    required this.limits,
  });

  factory TenantAccess.fromJson(Json json) => TenantAccess(
    accessState: AccessState.fromWire(_read<String>(json, 'accessState')),
    reason: _read<String>(json, 'reason'),
    subscriptionChecked: _read<bool>(json, 'subscriptionChecked'),
    features: {
      for (final feature in _read<List<Object?>>(json, 'features'))
        if (feature is String) feature,
    },
    limits: AccessLimits.fromJson(_read<Json>(json, 'limits')),
  );

  final AccessState accessState;
  final String reason;
  final bool subscriptionChecked;

  /// Feature keys enabled for this tenant, for example `core_hr`.
  final Set<String> features;
  final AccessLimits limits;

  bool hasFeature(String key) => features.contains(key);
}

/// `GET /tenant/access` 200 response.
class TenantAccessView {
  const TenantAccessView({required this.tenant, required this.access});

  factory TenantAccessView.fromJson(Json json) => TenantAccessView(
    tenant: TenantDetails.fromJson(_read<Json>(json, 'tenant')),
    access: TenantAccess.fromJson(_read<Json>(json, 'access')),
  );

  final TenantDetails tenant;
  final TenantAccess access;
}

// ── Core HR (Phase 1): `GET /tenant/me/employee` ────────────────────────────

enum EmployeeStatus implements WireValue {
  active('active'),
  separated('separated'),
  unknown('unknown');

  const EmployeeStatus(this.wire);
  @override
  final String wire;

  static EmployeeStatus fromWire(String value) =>
      _byWire(values, value, unknown);
}

enum Gender implements WireValue {
  male('male'),
  female('female'),
  thirdGender('third_gender'),
  unknown('unknown');

  const Gender(this.wire);
  @override
  final String wire;

  static Gender fromWire(String value) => _byWire(values, value, unknown);
}

enum Religion implements WireValue {
  islam('islam'),
  hinduism('hinduism'),
  buddhism('buddhism'),
  christianity('christianity'),
  other('other'),
  unknown('unknown');

  const Religion(this.wire);
  @override
  final String wire;

  static Religion fromWire(String value) => _byWire(values, value, unknown);
}

enum MaritalStatus implements WireValue {
  single('single'),
  married('married'),
  widowed('widowed'),
  divorced('divorced'),
  separated('separated'),
  unknown('unknown');

  const MaritalStatus(this.wire);
  @override
  final String wire;

  static MaritalStatus fromWire(String value) =>
      _byWire(values, value, unknown);
}

/// ABO group with Rh factor. [wire] is also the display text, for example
/// `AB+`.
enum BloodGroup implements WireValue {
  aPositive('A+'),
  aNegative('A-'),
  bPositive('B+'),
  bNegative('B-'),
  abPositive('AB+'),
  abNegative('AB-'),
  oPositive('O+'),
  oNegative('O-'),
  unknown('unknown');

  const BloodGroup(this.wire);
  @override
  final String wire;

  static BloodGroup fromWire(String value) => _byWire(values, value, unknown);
}

/// The eight administrative divisions of Bangladesh.
enum Division implements WireValue {
  barishal('barishal'),
  chattogram('chattogram'),
  dhaka('dhaka'),
  khulna('khulna'),
  mymensingh('mymensingh'),
  rajshahi('rajshahi'),
  rangpur('rangpur'),
  sylhet('sylhet'),
  unknown('unknown');

  const Division(this.wire);
  @override
  final String wire;

  static Division fromWire(String value) => _byWire(values, value, unknown);
}

/// What created a job assignment row.
enum JobEvent implements WireValue {
  hire('hire'),
  confirmation('confirmation'),
  transfer('transfer'),
  promotion('promotion'),
  increment('increment'),
  redesignation('redesignation'),
  change('change'),
  separation('separation'),
  unknown('unknown');

  const JobEvent(this.wire);
  @override
  final String wire;

  static JobEvent fromWire(String value) => _byWire(values, value, unknown);
}

/// The worker classes of Bangladesh Labour Act s.4, plus contractual.
enum EmploymentType implements WireValue {
  permanent('permanent'),
  probationer('probationer'),
  apprentice('apprentice'),
  badli('badli'),
  casual('casual'),
  temporary('temporary'),
  seasonal('seasonal'),
  contractual('contractual'),
  unknown('unknown');

  const EmploymentType(this.wire);
  @override
  final String wire;

  static EmploymentType fromWire(String value) =>
      _byWire(values, value, unknown);
}

/// A "worker" in the Labour Act sense, or officer and management staff.
enum WorkerCategory implements WireValue {
  worker('worker'),
  staff('staff'),
  unknown('unknown');

  const WorkerCategory(this.wire);
  @override
  final String wire;

  static WorkerCategory fromWire(String value) =>
      _byWire(values, value, unknown);
}

/// How salary is paid: bank transfer, mobile financial service, or cash.
enum PaymentMethod implements WireValue {
  bank('bank'),
  mfs('mfs'),
  cash('cash'),
  unknown('unknown');

  const PaymentMethod(this.wire);
  @override
  final String wire;

  static PaymentMethod fromWire(String value) =>
      _byWire(values, value, unknown);
}

/// An id and display name, for example a location or a designation.
///
/// Not called `Ref`, which would clash with Riverpod's `Ref`.
class EntityRef {
  const EntityRef({required this.id, required this.name});

  factory EntityRef.fromJson(Json json) => EntityRef(
    id: _read<String>(json, 'id'),
    name: _read<String>(json, 'name'),
  );

  final String id;
  final String name;
}

class ManagerRef {
  const ManagerRef({
    required this.id,
    required this.fullName,
    required this.employeeCode,
  });

  factory ManagerRef.fromJson(Json json) => ManagerRef(
    id: _read<String>(json, 'id'),
    fullName: _read<String>(json, 'fullName'),
    employeeCode: _read<String>(json, 'employeeCode'),
  );

  final String id;
  final String fullName;
  final String employeeCode;
}

/// A Bangladesh address. [district] is the district's English name.
class Address {
  const Address({
    required this.line,
    required this.district,
    required this.division,
    this.upazila,
    this.postcode,
  });

  factory Address.fromJson(Json json) => Address(
    line: _read<String>(json, 'line'),
    upazila: _read<String?>(json, 'upazila'),
    district: _read<String>(json, 'district'),
    division: Division.fromWire(_read<String>(json, 'division')),
    postcode: _read<String?>(json, 'postcode'),
  );

  final String line;
  final String? upazila;
  final String district;
  final Division division;
  final String? postcode;
}

class EmergencyContact {
  const EmergencyContact({
    required this.name,
    required this.relation,
    required this.phone,
  });

  factory EmergencyContact.fromJson(Json json) => EmergencyContact(
    name: _read<String>(json, 'name'),
    relation: _read<String>(json, 'relation'),
    phone: _read<String>(json, 'phone'),
  );

  final String name;
  final String relation;
  final String phone;
}

/// Identity document numbers. Each is `null` when not on file.
class IdentityDocuments {
  const IdentityDocuments({
    this.nid,
    this.birthRegistration,
    this.passport,
    this.tin,
  });

  factory IdentityDocuments.fromJson(Json json) => IdentityDocuments(
    nid: _read<String?>(json, 'nid'),
    birthRegistration: _read<String?>(json, 'birthRegistration'),
    passport: _read<String?>(json, 'passport'),
    tin: _read<String?>(json, 'tin'),
  );

  /// National ID card number.
  final String? nid;
  final String? birthRegistration;
  final String? passport;

  /// Bangladesh e-TIN.
  final String? tin;
}

/// One row of an employee's job history: where they work and as what.
class JobAssignment {
  const JobAssignment({
    required this.id,
    required this.event,
    required this.effectiveFrom,
    required this.legalEntity,
    required this.employmentType,
    required this.workerCategory,
    required this.createdAt,
    this.effectiveTo,
    this.location,
    this.orgUnit,
    this.designation,
    this.grade,
    this.costCentre,
    this.manager,
    this.reason,
  });

  factory JobAssignment.fromJson(Json json) => JobAssignment(
    id: _read<String>(json, 'id'),
    event: JobEvent.fromWire(_read<String>(json, 'event')),
    effectiveFrom: _readDate(json, 'effectiveFrom'),
    effectiveTo: _readOptionalDate(json, 'effectiveTo'),
    legalEntity: EntityRef.fromJson(_read<Json>(json, 'legalEntity')),
    location: _readOptional(json, 'location', EntityRef.fromJson),
    orgUnit: _readOptional(json, 'orgUnit', EntityRef.fromJson),
    designation: _readOptional(json, 'designation', EntityRef.fromJson),
    grade: _readOptional(json, 'grade', EntityRef.fromJson),
    costCentre: _readOptional(json, 'costCentre', EntityRef.fromJson),
    manager: _readOptional(json, 'manager', ManagerRef.fromJson),
    employmentType: EmploymentType.fromWire(
      _read<String>(json, 'employmentType'),
    ),
    workerCategory: WorkerCategory.fromWire(
      _read<String>(json, 'workerCategory'),
    ),
    reason: _read<String?>(json, 'reason'),
    createdAt: _readTimestamp(json, 'createdAt'),
  );

  final String id;
  final JobEvent event;
  final DateTime effectiveFrom;
  final DateTime? effectiveTo;
  final EntityRef legalEntity;
  final EntityRef? location;
  final EntityRef? orgUnit;
  final EntityRef? designation;
  final EntityRef? grade;
  final EntityRef? costCentre;
  final ManagerRef? manager;
  final EmploymentType employmentType;
  final WorkerCategory workerCategory;
  final String? reason;
  final DateTime createdAt;
}

class Nominee {
  const Nominee({
    required this.id,
    required this.name,
    required this.relation,
    required this.sharePercent,
    this.dateOfBirth,
    this.phone,
  });

  factory Nominee.fromJson(Json json) => Nominee(
    id: _read<String>(json, 'id'),
    name: _read<String>(json, 'name'),
    relation: _read<String>(json, 'relation'),
    sharePercent: _read<num>(json, 'sharePercent'),
    dateOfBirth: _readOptionalDate(json, 'dateOfBirth'),
    phone: _read<String?>(json, 'phone'),
  );

  final String id;
  final String name;

  /// Free text from HR, for example `Husband`.
  final String relation;
  final num sharePercent;
  final DateTime? dateOfBirth;
  final String? phone;
}

/// Where salary is paid. The server never sends the full account number.
class PaymentAccount {
  const PaymentAccount({
    required this.id,
    required this.method,
    required this.isPrimary,
    this.provider,
    this.branchName,
    this.routingNumber,
    this.accountName,
    this.accountNumberMasked,
  });

  factory PaymentAccount.fromJson(Json json) => PaymentAccount(
    id: _read<String>(json, 'id'),
    method: PaymentMethod.fromWire(_read<String>(json, 'method')),
    provider: _read<String?>(json, 'provider'),
    branchName: _read<String?>(json, 'branchName'),
    routingNumber: _read<String?>(json, 'routingNumber'),
    accountName: _read<String?>(json, 'accountName'),
    accountNumberMasked: _read<String?>(json, 'accountNumberMasked'),
    isPrimary: _read<bool>(json, 'isPrimary'),
  );

  final String id;
  final PaymentMethod method;

  /// MFS key such as `bkash`, or a bank name. `null` for cash.
  final String? provider;
  final String? branchName;
  final String? routingNumber;
  final String? accountName;

  /// Last four digits only, for example `•••• 0005`.
  final String? accountNumberMasked;
  final bool isPrimary;
}

/// The workspace login linked to an employee.
class PortalUser {
  const PortalUser({
    required this.id,
    required this.role,
    this.email,
    this.phone,
  });

  factory PortalUser.fromJson(Json json) => PortalUser(
    id: _read<String>(json, 'id'),
    email: _read<String?>(json, 'email'),
    // Missing before sign-in by mobile number.
    phone: _read<String?>(json, 'phone'),
    role: UserRole.fromWire(_read<String>(json, 'role')),
  );

  final String id;

  /// A login may have an email address, a mobile number or both.
  final String? email;
  final String? phone;
  final UserRole role;
}

/// `GET /tenant/me/employee` 200 response (the API's `EmployeeDetail`).
///
/// Calendar dates (`YYYY-MM-DD`) become UTC midnight [DateTime]s, so
/// formatting them never shifts the day.
class EmployeeDetail {
  const EmployeeDetail({
    required this.id,
    required this.employeeCode,
    required this.status,
    required this.fullName,
    required this.fatherName,
    required this.motherName,
    required this.dateOfBirth,
    required this.gender,
    required this.nationality,
    required this.mobilePhone,
    required this.presentAddress,
    required this.permanentAddress,
    required this.identity,
    required this.joinedOn,
    required this.isAdolescent,
    required this.nominees,
    required this.paymentAccounts,
    required this.createdAt,
    required this.updatedAt,
    this.fullNameBn,
    this.spouseName,
    this.religion,
    this.maritalStatus,
    this.bloodGroup,
    this.workEmail,
    this.personalEmail,
    this.emergencyContact,
    this.probationEndsOn,
    this.confirmedOn,
    this.separatedOn,
    this.currentJob,
    this.portalUser,
  });

  factory EmployeeDetail.fromJson(Json json) => EmployeeDetail(
    id: _read<String>(json, 'id'),
    employeeCode: _read<String>(json, 'employeeCode'),
    status: EmployeeStatus.fromWire(_read<String>(json, 'status')),
    fullName: _read<String>(json, 'fullName'),
    fullNameBn: _read<String?>(json, 'fullNameBn'),
    fatherName: _read<String>(json, 'fatherName'),
    motherName: _read<String>(json, 'motherName'),
    spouseName: _read<String?>(json, 'spouseName'),
    dateOfBirth: _readDate(json, 'dateOfBirth'),
    gender: Gender.fromWire(_read<String>(json, 'gender')),
    religion: _readOptionalWire(json, 'religion', Religion.fromWire),
    maritalStatus: _readOptionalWire(
      json,
      'maritalStatus',
      MaritalStatus.fromWire,
    ),
    bloodGroup: _readOptionalWire(json, 'bloodGroup', BloodGroup.fromWire),
    nationality: _read<String>(json, 'nationality'),
    mobilePhone: _read<String>(json, 'mobilePhone'),
    workEmail: _read<String?>(json, 'workEmail'),
    personalEmail: _read<String?>(json, 'personalEmail'),
    presentAddress: Address.fromJson(_read<Json>(json, 'presentAddress')),
    permanentAddress: Address.fromJson(_read<Json>(json, 'permanentAddress')),
    emergencyContact: _readOptional(
      json,
      'emergencyContact',
      EmergencyContact.fromJson,
    ),
    identity: IdentityDocuments.fromJson(_read<Json>(json, 'identity')),
    joinedOn: _readDate(json, 'joinedOn'),
    probationEndsOn: _readOptionalDate(json, 'probationEndsOn'),
    confirmedOn: _readOptionalDate(json, 'confirmedOn'),
    separatedOn: _readOptionalDate(json, 'separatedOn'),
    isAdolescent: _read<bool>(json, 'isAdolescent'),
    currentJob: _readOptional(json, 'currentJob', JobAssignment.fromJson),
    nominees: _readList(json, 'nominees', Nominee.fromJson),
    paymentAccounts: _readList(
      json,
      'paymentAccounts',
      PaymentAccount.fromJson,
    ),
    portalUser: _readOptional(json, 'portalUser', PortalUser.fromJson),
    createdAt: _readTimestamp(json, 'createdAt'),
    updatedAt: _readTimestamp(json, 'updatedAt'),
  );

  final String id;

  /// Human-facing code, for example `MG-0005`.
  final String employeeCode;
  final EmployeeStatus status;
  final String fullName;

  /// Name in Bangla script, when HR entered one.
  final String? fullNameBn;
  final String fatherName;
  final String motherName;
  final String? spouseName;
  final DateTime dateOfBirth;
  final Gender gender;
  final Religion? religion;
  final MaritalStatus? maritalStatus;
  final BloodGroup? bloodGroup;

  /// ISO 3166-1 alpha-2 code, for example `BD`.
  final String nationality;

  /// E.164, for example `+8801711000005`.
  final String mobilePhone;
  final String? workEmail;
  final String? personalEmail;
  final Address presentAddress;
  final Address permanentAddress;
  final EmergencyContact? emergencyContact;
  final IdentityDocuments identity;
  final DateTime joinedOn;
  final DateTime? probationEndsOn;
  final DateTime? confirmedOn;
  final DateTime? separatedOn;

  /// Aged 14 to 17: the Labour Act limits their hours and work.
  final bool isAdolescent;
  final JobAssignment? currentJob;
  final List<Nominee> nominees;
  final List<PaymentAccount> paymentAccounts;
  final PortalUser? portalUser;
  final DateTime createdAt;
  final DateTime updatedAt;
}

T _read<T>(Json json, String key) {
  final value = json[key];
  if (value is T) return value;
  throw FormatException(
    'Expected "$key" to be $T but got ${value?.runtimeType ?? 'null'}',
  );
}

T _byWire<T extends WireValue>(List<T> values, String wire, T fallback) =>
    values.firstWhere((value) => value.wire == wire, orElse: () => fallback);

T? _readOptional<T>(Json json, String key, T Function(Json json) parse) =>
    switch (_read<Json?>(json, key)) {
      final Json value => parse(value),
      null => null,
    };

T? _readOptionalWire<T extends WireValue>(
  Json json,
  String key,
  T Function(String wire) fromWire,
) => switch (_read<String?>(json, key)) {
  final String value => fromWire(value),
  null => null,
};

List<T> _readList<T>(Json json, String key, T Function(Json json) parse) => [
  for (final item in _read<List<Object?>>(json, key))
    if (item is Json)
      parse(item)
    else
      throw FormatException('Expected every "$key" item to be an object'),
];

final _calendarDate = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$');

/// A `YYYY-MM-DD` calendar date as UTC midnight.
DateTime _readDate(Json json, String key) {
  final text = _read<String>(json, key);
  final match = _calendarDate.firstMatch(text);
  if (match != null) {
    final year = int.parse(match[1]!);
    final month = int.parse(match[2]!);
    final day = int.parse(match[3]!);
    final date = DateTime.utc(year, month, day);
    // DateTime.utc rolls 2024-02-30 over to March; reject it instead.
    if (date.month == month && date.day == day) return date;
  }
  throw FormatException('Expected "$key" to be a YYYY-MM-DD date: $text');
}

DateTime? _readOptionalDate(Json json, String key) =>
    json[key] == null ? null : _readDate(json, key);

/// [date] as the API's `YYYY-MM-DD`. Only the year, month and day are used,
/// so a UTC-midnight calendar date round-trips unchanged.
String toWireDate(DateTime date) {
  String two(int value) => value.toString().padLeft(2, '0');
  return '${date.year.toString().padLeft(4, '0')}-${two(date.month)}-'
      '${two(date.day)}';
}

/// [instant] as the API's ISO 8601 timestamp, in UTC to the millisecond,
/// for example `2026-10-24T02:05:00.000Z`.
String toWireInstant(DateTime instant) => DateTime.fromMillisecondsSinceEpoch(
  instant.millisecondsSinceEpoch,
  isUtc: true,
).toIso8601String();

/// An ISO 8601 timestamp such as `2026-10-20T08:00:00.000Z`.
DateTime _readTimestamp(Json json, String key) {
  final text = _read<String>(json, key);
  return DateTime.tryParse(text) ??
      (throw FormatException('Expected "$key" to be a timestamp: $text'));
}

DateTime? _readOptionalTimestamp(Json json, String key) =>
    json[key] == null ? null : _readTimestamp(json, key);

List<String> _readStrings(Json json, String key) => [
  for (final item in _read<List<Object?>>(json, key))
    if (item is String)
      item
    else
      throw FormatException('Expected every "$key" item to be a string'),
];
