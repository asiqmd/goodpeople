import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:good_people/api/api_exception.dart';
import 'package:good_people/api/api_models.dart';
import 'package:good_people/api/good_people_api.dart';
import 'package:good_people/app.dart';

/// `POST /auth/login` 200 body, exactly as the API contract shapes it.
const loginJson = <String, Object?>{
  'accessToken': 'access-1',
  'refreshToken': 'refresh-1',
  'expiresIn': 900,
  'user': {
    'id': '5f0c6c1e-2b7a-4c55-9d3e-0a8f3b1d2c01',
    'name': 'Rahima Akter',
    'email': 'rahima@acme.test',
    'role': 'tenant_admin',
  },
  'tenant': {
    'id': '0b6f2d4a-8c1e-4f7b-a3d9-6e5c4b3a2f10',
    'name': 'Acme Garments Ltd',
    'slug': 'acme',
  },
};

/// `GET /tenant/access` 200 body, exactly as the API contract shapes it.
Map<String, Object?> accessJson({
  String accessState = 'full',
  String status = 'active',
  List<String> features = const ['core_hr', 'leave', 'attendance', 'payroll'],
}) => {
  'tenant': {
    'id': '0b6f2d4a-8c1e-4f7b-a3d9-6e5c4b3a2f10',
    'name': 'Acme Garments Ltd',
    'slug': 'acme',
    'billingMode': 'trial',
    'status': status,
    'planCode': 'growth',
  },
  'access': {
    'accessState': accessState,
    'reason': 'test fixture',
    'subscriptionChecked': true,
    'features': features,
    'limits': {
      'max_employees': 50,
      'max_legal_entities': 1,
      'storage_gb': 5,
      'sms_credits_monthly': null,
    },
  },
};

final readOnlyWithoutPayroll = TenantAccessView.fromJson(
  accessJson(
    accessState: 'read_only',
    status: 'read_only',
    features: const ['core_hr', 'leave', 'attendance'],
  ),
);

const wrongPassword = ApiException(
  kind: ApiErrorKind.server,
  statusCode: 401,
  message: 'Wrong workspace, email or password',
);

/// In-memory [GoodPeopleApi] that records calls.
class FakeGoodPeopleApi implements GoodPeopleApi {
  LoginResponse loginResponse = LoginResponse.fromJson(loginJson);

  /// Thrown by [login] instead of returning [loginResponse].
  Exception? loginError;

  /// While set, [login] waits for it, so tests can see the loading state.
  Completer<void>? loginGate;

  /// Returned (or thrown, for exceptions) by successive [getTenantAccess]
  /// calls; [accessView] once it is empty.
  final accessResults = <Object>[];
  TenantAccessView accessView = TenantAccessView.fromJson(accessJson());

  /// Returned or thrown by [refresh].
  Object refreshResult = const AuthTokens(
    accessToken: 'access-2',
    refreshToken: 'refresh-2',
    expiresIn: 900,
  );

  final logins = <({String tenant, String email, String password})>[];
  final refreshTokens = <String>[];
  final accessTokens = <String>[];

  @override
  Future<LoginResponse> login({
    required String tenant,
    required String email,
    required String password,
  }) async {
    logins.add((tenant: tenant, email: email, password: password));
    await loginGate?.future;
    if (loginError case final error?) throw error;
    return loginResponse;
  }

  @override
  Future<AuthTokens> refresh(String refreshToken) async {
    refreshTokens.add(refreshToken);
    return switch (refreshResult) {
      final AuthTokens tokens => tokens,
      final Object error => throw error,
    };
  }

  @override
  Future<TenantAccessView> getTenantAccess(String accessToken) async {
    accessTokens.add(accessToken);
    final next = accessResults.isEmpty ? accessView : accessResults.removeAt(0);
    return switch (next) {
      final TenantAccessView view => view,
      final Object error => throw error,
    };
  }
}

/// The real app with [api] in place of the HTTP client.
Widget appWith(FakeGoodPeopleApi api) => ProviderScope(
  overrides: [goodPeopleApiProvider.overrideWithValue(api)],
  child: const GoodPeopleApp(),
);
