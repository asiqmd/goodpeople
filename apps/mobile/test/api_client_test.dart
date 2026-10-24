import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:good_people/api/api_exception.dart';
import 'package:good_people/api/api_models.dart';
import 'package:good_people/api/good_people_api.dart';

import 'support/fake_api.dart';

/// Answers every request with [status] and [body] and records the request.
class _StubAdapter implements HttpClientAdapter {
  _StubAdapter(this.status, this.body);

  final int status;
  final Object? body;
  final requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return ResponseBody.fromString(
      jsonEncode(body),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  (DioGoodPeopleApi, _StubAdapter) client(int status, Object? body) {
    final adapter = _StubAdapter(status, body);
    final dio = Dio(BaseOptions(baseUrl: 'http://localhost:4000'))
      ..httpClientAdapter = adapter;
    return (DioGoodPeopleApi(dio), adapter);
  }

  test('login posts the contract body and parses the response', () async {
    final (api, adapter) = client(200, loginJson);

    final response = await api.login(
      tenant: 'acme',
      email: 'rahima@acme.test',
      password: 'secret',
    );

    final request = adapter.requests.single;
    expect(request.method, 'POST');
    expect(request.uri.toString(), 'http://localhost:4000/auth/login');
    expect(request.data, {
      'tenant': 'acme',
      'email': 'rahima@acme.test',
      'password': 'secret',
    });
    expect(response.tokens.accessToken, 'access-1');
    expect(response.tokens.expiresIn, 900);
    expect(response.user.role, UserRole.tenantAdmin);
    expect(response.tenant.slug, 'acme');
  });

  test('tenant access sends the bearer token and allows null limits', () async {
    final (api, adapter) = client(200, accessJson(accessState: 'read_only'));

    final view = await api.getTenantAccess('access-1');

    expect(adapter.requests.single.uri.path, '/tenant/access');
    expect(adapter.requests.single.headers['Authorization'], 'Bearer access-1');
    expect(view.access.accessState, AccessState.readOnly);
    expect(view.tenant.billingMode, BillingMode.trial);
    expect(view.tenant.planCode, PlanCode.growth);
    expect(view.access.limits.maxEmployees, 50);
    expect(view.access.limits.smsCreditsMonthly, isNull);
    expect(view.access.hasFeature('payroll'), isTrue);
  });

  test('error bodies become ApiException with message and issues', () async {
    final (api, _) = client(400, {
      'statusCode': 400,
      'error': 'Bad Request',
      'message': 'Validation failed',
      'issues': [
        {'path': 'email', 'message': 'Invalid email'},
      ],
    });

    await expectLater(
      api.login(tenant: 'acme', email: 'nope', password: 'x'),
      throwsA(
        isA<ApiException>()
            .having((e) => e.statusCode, 'statusCode', 400)
            .having((e) => e.message, 'message', 'Validation failed')
            .having((e) => e.issues.single.path, 'issue path', 'email'),
      ),
    );
  });

  test('a 401 is reported as unauthorized with the API message', () async {
    final (api, _) = client(401, {
      'statusCode': 401,
      'error': 'Unauthorized',
      'message': 'Wrong workspace, email or password',
    });

    await expectLater(
      api.login(tenant: 'acme', email: 'a@acme.test', password: 'x'),
      throwsA(
        isA<ApiException>()
            .having((e) => e.isUnauthorized, 'isUnauthorized', isTrue)
            .having(
              (e) => e.message,
              'message',
              'Wrong workspace, email or password',
            ),
      ),
    );
  });

  test('a body that breaks the contract is a badResponse error', () async {
    final (api, _) = client(200, {'accessToken': 'only-this'});

    await expectLater(
      api.refresh('refresh-1'),
      throwsA(
        isA<ApiException>().having(
          (e) => e.kind,
          'kind',
          ApiErrorKind.badResponse,
        ),
      ),
    );
  });
}
