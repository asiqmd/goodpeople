/// Hand-written models for the Phase 0 API contract.
///
/// `fromJson` throws [FormatException] when a required field is missing or
/// has the wrong type. Unknown enum values map to `unknown` instead of
/// failing, so a newer API does not break an older app.
library;

typedef Json = Map<String, Object?>;

/// An enum value with its JSON spelling, for example `read_only`.
abstract interface class WireValue {
  String get wire;
}

enum UserRole implements WireValue {
  tenantAdmin('tenant_admin'),
  hrAdmin('hr_admin'),
  employee('employee'),
  unknown('unknown');

  const UserRole(this.wire);
  @override
  final String wire;

  static UserRole fromWire(String value) => _byWire(values, value, unknown);
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
    email: _read<String>(json, 'email'),
    role: UserRole.fromWire(_read<String>(json, 'role')),
  );

  final String id;
  final String name;
  final String email;
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

/// `POST /auth/login` 200 response.
class LoginResponse {
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

T _read<T>(Json json, String key) {
  final value = json[key];
  if (value is T) return value;
  throw FormatException(
    'Expected "$key" to be $T but got ${value?.runtimeType ?? 'null'}',
  );
}

T _byWire<T extends WireValue>(List<T> values, String wire, T fallback) =>
    values.firstWhere((value) => value.wire == wire, orElse: () => fallback);
