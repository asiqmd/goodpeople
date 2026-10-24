import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_config.dart';
import 'api_exception.dart';
import 'api_models.dart';

/// The Good People HTTP API, as far as the app needs it.
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

  /// `GET /tenant/me/employee`: the signed-in user's own employee record.
  ///
  /// A login with no linked employee record (usual for tenant admins) gets a
  /// 404 [ApiException].
  Future<EmployeeDetail> fetchMyEmployee(String accessToken);

  // ── Leave ─────────────────────────────────────────────────────────────────
  // The `/tenant/me/leave/...` calls answer 404 for a login with no employee
  // record, like [fetchMyEmployee].

  /// `GET /tenant/me/leave/balances?year=`: one balance per leave type.
  Future<List<LeaveBalance>> fetchMyLeaveBalances(
    String accessToken, {
    required int year,
  });

  /// `GET /tenant/leave/types`: every type, for the apply form.
  Future<List<LeaveType>> fetchLeaveTypes(String accessToken);

  /// `POST /tenant/me/leave/preview`: the day count and any problems,
  /// without creating anything.
  Future<LeavePreview> previewLeave(String accessToken, LeaveDraft draft);

  /// `POST /tenant/me/leave/requests`. A request the rules refuse gets a
  /// 400 [ApiException] with code `leave_not_allowed` and the problems in
  /// its message.
  Future<LeaveRequest> applyForLeave(
    String accessToken,
    LeaveDraft draft, {
    required String reason,
  });

  /// `GET /tenant/me/leave/requests?year=`, newest first. Every year when
  /// [year] is `null`.
  Future<List<LeaveRequest>> fetchMyLeaveRequests(
    String accessToken, {
    int? year,
  });

  /// `POST /tenant/leave/requests/{id}/cancel`. A request that can no longer
  /// be cancelled gets a 409 [ApiException].
  Future<LeaveRequest> cancelLeaveRequest(String accessToken, String requestId);

  /// `GET /tenant/approvals`: steps waiting for the signed-in user, leave
  /// requests and attendance corrections alike.
  Future<List<ApprovalItem>> fetchApprovals(String accessToken);

  /// `POST /tenant/approvals/{stepId}/approve` or `/reject`, with an optional
  /// comment. A step that is not this user's, or no longer open, gets a 403
  /// or 409 [ApiException].
  ///
  /// The API answers with the decided leave request or correction; the app
  /// reloads the inbox instead of reading it, so any 2xx body is accepted.
  Future<void> decideApproval(
    String accessToken,
    String stepId,
    ApprovalDecision decision, {
    String? comment,
  });

  /// `GET /tenant/me/holidays?year=`: the employee's holiday calendar. A
  /// workspace with no calendar yet gets a 404 [ApiException].
  Future<HolidayYear> fetchMyHolidays(String accessToken, {required int year});

  // ── Attendance ────────────────────────────────────────────────────────────
  // Needs the workspace's `attendance` feature. The `/tenant/me/attendance`
  // calls answer 404 for a login with no employee record, like
  // [fetchMyEmployee]. Refusals carry a `code` in the [ApiException].

  /// `GET /tenant/me/attendance/today`: today's day, its punches, and
  /// whether the user can punch from the app.
  Future<MyAttendanceToday> fetchMyAttendanceToday(String accessToken);

  /// `POST /tenant/me/attendance/punch` from the mobile app, with the
  /// phone's [location] when there is one. Answers with today as it is after
  /// the punch. Refusals by `code`: `outside_geofence`, `location_required`
  /// and `no_geofence` (400), `self_punch_disabled` and `separated` (403),
  /// `too_soon` (409).
  Future<MyAttendanceToday> punch(
    String accessToken, {
    PunchLocation? location,
  });

  /// `GET /tenant/me/attendance?from=&to=`: the employee's days, at most 62
  /// at a time, with totals.
  Future<AttendanceRange> fetchMyAttendance(
    String accessToken, {
    required DateTime from,
    required DateTime to,
  });

  /// `GET /tenant/me/attendance/regularizations`: the user's corrections,
  /// newest day first.
  Future<List<Regularization>> fetchMyRegularizations(String accessToken);

  /// `POST /tenant/me/attendance/regularizations`. Refusals by `code`:
  /// `future_day`, `outside_window`, `not_tracked`, `wrong_day` and
  /// `future_punch` (400), `already_pending` (409).
  Future<Regularization> requestRegularization(
    String accessToken,
    RegularizationDraft draft,
  );

  /// `POST /tenant/attendance/regularizations/{id}/cancel`. A correction
  /// that is no longer pending gets a 409 with code `not_pending`.
  Future<Regularization> cancelRegularization(
    String accessToken,
    String regularizationId,
  );
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
    () => _dio.get<Object?>('/tenant/access', options: _bearer(accessToken)),
    TenantAccessView.fromJson,
  );

  @override
  Future<EmployeeDetail> fetchMyEmployee(String accessToken) => _call(
    () =>
        _dio.get<Object?>('/tenant/me/employee', options: _bearer(accessToken)),
    EmployeeDetail.fromJson,
  );

  @override
  Future<List<LeaveBalance>> fetchMyLeaveBalances(
    String accessToken, {
    required int year,
  }) => _callList(
    () => _dio.get<Object?>(
      '/tenant/me/leave/balances',
      queryParameters: {'year': year},
      options: _bearer(accessToken),
    ),
    LeaveBalance.fromJson,
  );

  @override
  Future<List<LeaveType>> fetchLeaveTypes(String accessToken) => _callList(
    () =>
        _dio.get<Object?>('/tenant/leave/types', options: _bearer(accessToken)),
    LeaveType.fromJson,
  );

  @override
  Future<LeavePreview> previewLeave(String accessToken, LeaveDraft draft) =>
      _call(
        () => _dio.post<Object?>(
          '/tenant/me/leave/preview',
          data: draft.toPreviewJson(),
          options: _bearer(accessToken),
        ),
        LeavePreview.fromJson,
      );

  @override
  Future<LeaveRequest> applyForLeave(
    String accessToken,
    LeaveDraft draft, {
    required String reason,
  }) => _call(
    () => _dio.post<Object?>(
      '/tenant/me/leave/requests',
      data: draft.toRequestJson(reason: reason),
      options: _bearer(accessToken),
    ),
    LeaveRequest.fromJson,
  );

  @override
  Future<List<LeaveRequest>> fetchMyLeaveRequests(
    String accessToken, {
    int? year,
  }) => _callList(
    () => _dio.get<Object?>(
      '/tenant/me/leave/requests',
      queryParameters: {'year': ?year},
      options: _bearer(accessToken),
    ),
    LeaveRequest.fromJson,
  );

  @override
  Future<LeaveRequest> cancelLeaveRequest(
    String accessToken,
    String requestId,
  ) => _call(
    () => _dio.post<Object?>(
      '/tenant/leave/requests/${Uri.encodeComponent(requestId)}/cancel',
      options: _bearer(accessToken),
    ),
    LeaveRequest.fromJson,
  );

  @override
  Future<List<ApprovalItem>> fetchApprovals(String accessToken) => _callList(
    () => _dio.get<Object?>('/tenant/approvals', options: _bearer(accessToken)),
    ApprovalItem.fromJson,
  );

  @override
  Future<void> decideApproval(
    String accessToken,
    String stepId,
    ApprovalDecision decision, {
    String? comment,
  }) => _send(
    () => _dio.post<Object?>(
      '/tenant/approvals/${Uri.encodeComponent(stepId)}/'
      '${decision.pathSegment}',
      data: {'comment': ?comment},
      options: _bearer(accessToken),
    ),
    (_) {},
  );

  @override
  Future<HolidayYear> fetchMyHolidays(
    String accessToken, {
    required int year,
  }) => _call(
    () => _dio.get<Object?>(
      '/tenant/me/holidays',
      queryParameters: {'year': year},
      options: _bearer(accessToken),
    ),
    HolidayYear.fromJson,
  );

  @override
  Future<MyAttendanceToday> fetchMyAttendanceToday(String accessToken) => _call(
    () => _dio.get<Object?>(
      '/tenant/me/attendance/today',
      options: _bearer(accessToken),
    ),
    MyAttendanceToday.fromJson,
  );

  @override
  Future<MyAttendanceToday> punch(
    String accessToken, {
    PunchLocation? location,
  }) => _call(
    () => _dio.post<Object?>(
      '/tenant/me/attendance/punch',
      data: selfPunchBody(location),
      options: _bearer(accessToken),
    ),
    MyAttendanceToday.fromJson,
  );

  @override
  Future<AttendanceRange> fetchMyAttendance(
    String accessToken, {
    required DateTime from,
    required DateTime to,
  }) => _call(
    () => _dio.get<Object?>(
      '/tenant/me/attendance',
      queryParameters: {'from': toWireDate(from), 'to': toWireDate(to)},
      options: _bearer(accessToken),
    ),
    AttendanceRange.fromJson,
  );

  @override
  Future<List<Regularization>> fetchMyRegularizations(String accessToken) =>
      _callList(
        () => _dio.get<Object?>(
          '/tenant/me/attendance/regularizations',
          options: _bearer(accessToken),
        ),
        Regularization.fromJson,
      );

  @override
  Future<Regularization> requestRegularization(
    String accessToken,
    RegularizationDraft draft,
  ) => _call(
    () => _dio.post<Object?>(
      '/tenant/me/attendance/regularizations',
      data: draft.toJson(),
      options: _bearer(accessToken),
    ),
    Regularization.fromJson,
  );

  @override
  Future<Regularization> cancelRegularization(
    String accessToken,
    String regularizationId,
  ) => _call(
    () => _dio.post<Object?>(
      '/tenant/attendance/regularizations/'
      '${Uri.encodeComponent(regularizationId)}/cancel',
      options: _bearer(accessToken),
    ),
    Regularization.fromJson,
  );

  void close() => _dio.close(force: true);

  static Options _bearer(String accessToken) =>
      Options(headers: {'Authorization': 'Bearer $accessToken'});

  /// A call whose 2xx body is a JSON object.
  Future<T> _call<T>(
    Future<Response<Object?>> Function() send,
    T Function(Json json) parse,
  ) => _send(send, (data) {
    if (data is Json) return parse(data);
    throw const FormatException('Expected a JSON object');
  });

  /// A call whose 2xx body is a JSON array of objects.
  Future<List<T>> _callList<T>(
    Future<Response<Object?>> Function() send,
    T Function(Json json) parse,
  ) => _send(send, (data) {
    if (data is! List<Object?>) {
      throw const FormatException('Expected a JSON array');
    }
    return [
      for (final item in data)
        if (item is Json)
          parse(item)
        else
          throw const FormatException('Expected every item to be an object'),
    ];
  });

  Future<T> _send<T>(
    Future<Response<Object?>> Function() send,
    T Function(Object? data) parse,
  ) async {
    final Response<Object?> response;
    try {
      response = await send();
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }

    try {
      return parse(response.data);
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
