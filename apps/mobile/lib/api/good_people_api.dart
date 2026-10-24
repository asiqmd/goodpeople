import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_config.dart';
import 'api_exception.dart';
import 'api_models.dart';

/// The Good People HTTP API, as far as the Phase 0 app needs it.
///
/// Hand-written on purpose: the app does not use the code from
/// `tool/gen_api.sh` in Phase 0. Every method throws [ApiException] on
/// failure. Tests replace this with a fake through [goodPeopleApiProvider].
abstract interface class GoodPeopleApi {
  /// `POST /auth/login`. [tenant] is the workspace slug.
  Future<LoginResponse> login({
    required String tenant,
    required String email,
    required String password,
  });

  /// `POST /auth/refresh`. The returned refresh token replaces the old one.
  Future<AuthTokens> refresh(String refreshToken);

  /// `GET /tenant/access` with `Authorization: Bearer <accessToken>`.
  Future<TenantAccessView> getTenantAccess(String accessToken);
}

/// [GoodPeopleApi] over HTTP with dio.
class DioGoodPeopleApi implements GoodPeopleApi {
  DioGoodPeopleApi(this._dio);

  factory DioGoodPeopleApi.forConfig(AppConfig config) => DioGoodPeopleApi(
    Dio(
      BaseOptions(
        baseUrl: config.apiBaseUrl,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 20),
        contentType: Headers.jsonContentType,
        responseType: ResponseType.json,
        headers: const {'Accept': 'application/json'},
      ),
    ),
  );

  final Dio _dio;

  @override
  Future<LoginResponse> login({
    required String tenant,
    required String email,
    required String password,
  }) => _call(
    () => _dio.post<Object?>(
      '/auth/login',
      data: {'tenant': tenant, 'email': email, 'password': password},
    ),
    LoginResponse.fromJson,
  );

  @override
  Future<AuthTokens> refresh(String refreshToken) => _call(
    () => _dio.post<Object?>(
      '/auth/refresh',
      data: {'refreshToken': refreshToken},
    ),
    AuthTokens.fromJson,
  );

  @override
  Future<TenantAccessView> getTenantAccess(String accessToken) => _call(
    () => _dio.get<Object?>(
      '/tenant/access',
      options: Options(headers: {'Authorization': 'Bearer $accessToken'}),
    ),
    TenantAccessView.fromJson,
  );

  void close() => _dio.close(force: true);

  Future<T> _call<T>(
    Future<Response<Object?>> Function() send,
    T Function(Json json) parse,
  ) async {
    final Response<Object?> response;
    try {
      response = await send();
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }

    final data = response.data;
    try {
      if (data is Json) return parse(data);
      throw const FormatException('Expected a JSON object');
    } on FormatException catch (error) {
      throw ApiException(
        kind: ApiErrorKind.badResponse,
        statusCode: response.statusCode,
        message: error.message,
      );
    }
  }
}

final goodPeopleApiProvider = Provider<GoodPeopleApi>((ref) {
  final api = DioGoodPeopleApi.forConfig(ref.watch(appConfigProvider));
  ref.onDispose(api.close);
  return api;
});
