import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:good_people/api/api_exception.dart';
import 'package:good_people/api/api_models.dart';
import 'package:good_people/api/good_people_api.dart';
import 'package:good_people/app.dart';
import 'package:good_people/attendance/camera_service.dart';
import 'package:good_people/attendance/location_service.dart';
import 'package:good_people/attendance/offline_punch_queue.dart';
import 'package:good_people/documents/file_opener.dart';
import 'package:good_people/notifications/push_service.dart';

import 'attendance_fixtures.dart';
import 'leave_fixtures.dart';
import 'lifecycle_fixtures.dart';

export 'attendance_fixtures.dart';
export 'leave_fixtures.dart';
export 'lifecycle_fixtures.dart';

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

/// The current job inside [employeeJson], exactly as the API contract shapes
/// it.
Map<String, Object?> jobJson() => {
  'id': '3c9a1f52-7e4b-4d2a-9b61-1f0e8d7c6b51',
  'event': 'hire',
  'effectiveFrom': '2020-03-01',
  'effectiveTo': null,
  'legalEntity': {
    'id': 'a1b2c3d4-0000-4000-8000-000000000001',
    'name': 'My Group Textiles Ltd',
  },
  'location': {
    'id': 'a1b2c3d4-0000-4000-8000-000000000002',
    'name': 'Gazipur Factory',
  },
  'orgUnit': {'id': 'a1b2c3d4-0000-4000-8000-000000000003', 'name': 'Line 1'},
  'designation': {
    'id': 'a1b2c3d4-0000-4000-8000-000000000004',
    'name': 'Senior Sewing Operator',
  },
  'grade': {
    'id': 'a1b2c3d4-0000-4000-8000-000000000005',
    'name': 'Worker grade 3',
  },
  'costCentre': {
    'id': 'a1b2c3d4-0000-4000-8000-000000000006',
    'name': 'Production',
  },
  'manager': {
    'id': 'a1b2c3d4-0000-4000-8000-000000000007',
    'fullName': 'Shirin Akter',
    'employeeCode': 'MG-0004',
  },
  'employmentType': 'permanent',
  'workerCategory': 'worker',
  'reason': 'Joined',
  'createdAt': '2026-10-20T08:00:00.000Z',
};

/// `GET /tenant/me/employee` 200 body for the seeded worker MG-0005, exactly
/// as the API contract shapes it. The bank account is extra, so the tests
/// see a non-primary account with a branch and routing number.
Map<String, Object?> employeeJson({bool isAdolescent = false}) => {
  'id': '9e8d7c6b-5a49-4382-9170-6f5e4d3c2b1a',
  'employeeCode': 'MG-0005',
  'status': 'active',
  'fullName': 'Rahima Khatun',
  'fullNameBn': 'রহিমা খাতুন',
  'fatherName': 'Abul Kashem',
  'motherName': 'Monowara Begum',
  'spouseName': null,
  'dateOfBirth': '1996-04-08',
  'gender': 'female',
  'religion': 'islam',
  'maritalStatus': 'married',
  'bloodGroup': 'B+',
  'nationality': 'BD',
  'mobilePhone': '+8801711000005',
  'workEmail': null,
  'personalEmail': null,
  'presentAddress': {
    'line': 'Konabari Industrial Area',
    'upazila': 'Gazipur Sadar',
    'district': 'Gazipur',
    'division': 'dhaka',
  },
  'permanentAddress': {
    'line': 'Village Char Kalibari',
    'district': 'Mymensingh',
    'division': 'mymensingh',
    'postcode': '2200',
  },
  'emergencyContact': {
    'name': 'Jamal Uddin',
    'relation': 'Husband',
    'phone': '+8801811000005',
  },
  'identity': {
    'nid': '1996000005',
    'birthRegistration': null,
    'passport': null,
    'tin': null,
  },
  'joinedOn': '2020-03-01',
  'probationEndsOn': null,
  'confirmedOn': '2020-06-01',
  'separatedOn': null,
  'isAdolescent': isAdolescent,
  'currentJob': jobJson(),
  'nominees': [
    {
      'id': '5b4a3928-1706-4f5e-8d4c-3b2a19081726',
      'name': 'Jamal Uddin',
      'relation': 'Husband',
      'sharePercent': 100,
      'dateOfBirth': null,
      'phone': null,
    },
  ],
  'paymentAccounts': [
    {
      'id': '6c5b4a39-2817-4f60-9e5d-4c3b2a190817',
      'method': 'mfs',
      'provider': 'bkash',
      'branchName': null,
      'routingNumber': null,
      'accountName': 'Rahima Khatun',
      'accountNumberMasked': '•••• 0005',
      'isPrimary': true,
    },
    {
      'id': '7d6c5b4a-3928-4f71-8f6e-5d4c3b2a1908',
      'method': 'bank',
      'provider': 'Dutch-Bangla Bank',
      'branchName': 'Konabari Branch',
      'routingNumber': '090330468',
      'accountName': 'Rahima Khatun',
      'accountNumberMasked': '•••• 4321',
      'isPrimary': false,
    },
  ],
  'portalUser': {
    'id': '8e7d6c5b-4a39-4f82-9a7f-6e5d4c3b2a19',
    'email': 'rahima@my-group.test',
    'role': 'employee',
  },
  'createdAt': '2026-10-20T08:00:00.000Z',
  'updatedAt': '2026-10-21T09:30:00.000Z',
};

/// What `/tenant/me/employee` answers for a login with no employee record.
const noEmployeeRecord = ApiException(
  kind: ApiErrorKind.server,
  statusCode: 404,
  message: 'No employee record is linked to your login',
);

const tenantSuspended = ApiException(
  kind: ApiErrorKind.server,
  statusCode: 403,
  message: 'This workspace is suspended',
);

const wrongPassword = ApiException(
  kind: ApiErrorKind.server,
  statusCode: 401,
  message: 'Wrong workspace, email or password',
);

/// What the API answers for a wrong or used sign-in code.
const wrongCode = ApiException(
  kind: ApiErrorKind.server,
  statusCode: 401,
  message: 'Wrong or expired code',
);

/// What dio reports when the phone has no connection.
const noConnection = ApiException(
  kind: ApiErrorKind.network,
  message: 'The connection errored',
);

/// The session `/auth/otp/verify` answers for a worker who signs in with
/// their mobile number: no email.
const phoneLoginJson = <String, Object?>{
  'accessToken': 'access-otp',
  'refreshToken': 'refresh-otp',
  'expiresIn': 900,
  'user': {
    'id': '8e7d6c5b-4a39-4f82-9a7f-6e5d4c3b2a19',
    'name': 'Rahima Khatun',
    'email': null,
    'role': 'employee',
  },
  'tenant': {
    'id': '0b6f2d4a-8c1e-4f7b-a3d9-6e5c4b3a2f10',
    'name': 'Acme Garments Ltd',
    'slug': 'acme',
  },
};

/// `GET /account` 200 body, as the API contract shapes it.
Map<String, Object?> accountJson({
  String? email = 'rahima@acme.test',
  String? phone = '+8801711000005',
  String role = 'tenant_admin',
  bool hasPassword = true,
  bool mfaEnabled = false,
}) => {
  'kind': 'tenant',
  'id': '5f0c6c1e-2b7a-4c55-9d3e-0a8f3b1d2c01',
  'name': 'Rahima Akter',
  'email': email,
  'phone': phone,
  'role': role,
  'language': 'en',
  'hasPassword': hasPassword,
  'mfaEnabled': mfaEnabled,
  'mfaRequired': false,
  'recoveryCodesLeft': mfaEnabled ? 8 : 0,
  'permissions': <String>[],
};

/// One `NotificationView`, as the API contract shapes it.
Map<String, Object?> notificationJson({
  required String id,
  String event = 'approval.requested',
  String title = 'Leave request from Karim Uddin',
  String body = 'Casual leave, Oct 29 – Oct 30. Open approvals to decide.',
  String? link = '/workspace/approvals',
  String? readAt,
  String createdAt = '2026-10-24T03:00:00.000Z',
}) => {
  'id': id,
  'event': event,
  'title': title,
  'body': body,
  'link': link,
  'readAt': readAt,
  'createdAt': createdAt,
};

/// `GET /tenant/notifications` 200 body for [items]; unread counted.
Map<String, Object?> inboxJson([List<Map<String, Object?>> items = const []]) =>
    {
      'unread': items.where((item) => item['readAt'] == null).length,
      'items': items,
    };

/// One row of `GET /tenant/attendance/daily`.
Map<String, Object?> teamRowJson({
  required String id,
  required String name,
  required String code,
  required String date,
  String status = 'present',
  String? firstIn = '07:55',
  int lateMinutes = 0,
}) => {
  'employee': {
    'id': id,
    'employeeCode': code,
    'fullName': name,
    'fullNameBn': null,
  },
  'timeZone': 'Asia/Dhaka',
  'day': dayJson(
    date: date,
    status: status,
    firstIn: firstIn,
    late: lateMinutes,
  ),
};

/// `GET /tenant/attendance/daily` 200 body with [rows], counted by status.
Map<String, Object?> teamDayJson(String date, List<Map<String, Object?>> rows) {
  final counts = <String, int>{};
  for (final row in rows) {
    final status = (row['day']! as Map<String, Object?>)['status']! as String;
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return {'date': date, 'counts': counts, 'rows': rows};
}

/// `GET /tenant/leave/calendar` 200 body with [entries].
Map<String, Object?> leaveCalendarJson(
  String from,
  String to, [
  List<Map<String, Object?>> entries = const [],
]) => {'from': from, 'to': to, 'holidays': <Object?>[], 'entries': entries};

/// In-memory [GoodPeopleApi] that records calls.
class FakeGoodPeopleApi implements GoodPeopleApi {
  /// A session, or a [TwoStepChallenge].
  LoginOutcome loginResponse = LoginResponse.fromJson(loginJson);

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

  /// Returned (or thrown, for exceptions) by successive [fetchMyEmployee]
  /// calls; [employee] once it is empty.
  final employeeResults = <Object>[];
  EmployeeDetail employee = EmployeeDetail.fromJson(employeeJson());

  final logins = <({String tenant, String email, String password})>[];
  final refreshTokens = <String>[];
  final accessTokens = <String>[];

  /// Access tokens sent to [fetchMyEmployee].
  final employeeTokens = <String>[];

  @override
  Future<LoginOutcome> login({
    required String tenant,
    required String email,
    required String password,
  }) async {
    logins.add((tenant: tenant, email: email, password: password));
    await loginGate?.future;
    if (loginError case final error?) throw error;
    return loginResponse;
  }

  // ── Sign-in by code and two-step sign-in ──────────────────────────────────

  /// The session [verifyMfa] and [verifyOtp] answer.
  LoginResponse codeSession = LoginResponse.fromJson(phoneLoginJson);

  /// Thrown, one per call, by [verifyMfa] before it answers.
  final mfaErrors = <Exception>[];
  final mfaCodes = <({String mfaToken, String code})>[];

  /// Thrown, one per call, by [requestOtp] before it answers.
  final otpRequestErrors = <Exception>[];
  final otpRequests = <({String tenant, String phone})>[];

  /// Thrown, one per call, by [verifyOtp] before it answers.
  final otpErrors = <Exception>[];
  final otpCodes = <({String tenant, String phone, String code})>[];

  @override
  Future<LoginResponse> verifyMfa({
    required String mfaToken,
    required String code,
  }) async {
    mfaCodes.add((mfaToken: mfaToken, code: code));
    if (mfaErrors.isNotEmpty) throw mfaErrors.removeAt(0);
    return codeSession;
  }

  @override
  Future<OtpRequestResult> requestOtp({
    required String tenant,
    required String phone,
  }) async {
    otpRequests.add((tenant: tenant, phone: phone));
    if (otpRequestErrors.isNotEmpty) throw otpRequestErrors.removeAt(0);
    return const OtpRequestResult(expiresInSeconds: 300);
  }

  @override
  Future<LoginResponse> verifyOtp({
    required String tenant,
    required String phone,
    required String code,
  }) async {
    otpCodes.add((tenant: tenant, phone: phone, code: code));
    if (otpErrors.isNotEmpty) throw otpErrors.removeAt(0);
    return codeSession;
  }

  // ── Account ───────────────────────────────────────────────────────────────

  Json account = accountJson();

  /// Thrown by [changePassword] instead of changing it, while set.
  Exception? passwordError;
  final passwordChanges =
      <({String current, String next, String? keepRefreshToken})>[];
  final languages = <UserLanguage>[];
  final registeredDevices = <({DevicePlatform platform, String token})>[];

  /// Each push token removed, with the access token it was removed with.
  final removedDevices = <({String accessToken, String token})>[];

  @override
  Future<AccountView> fetchAccount(String accessToken) async =>
      AccountView.fromJson(account);

  @override
  Future<void> changePassword(
    String accessToken, {
    required String currentPassword,
    required String newPassword,
    String? keepRefreshToken,
  }) async {
    passwordChanges.add((
      current: currentPassword,
      next: newPassword,
      keepRefreshToken: keepRefreshToken,
    ));
    if (passwordError case final error?) throw error;
  }

  @override
  Future<AccountView> updatePreferences(
    String accessToken, {
    required UserLanguage language,
  }) async {
    languages.add(language);
    account = {...account, 'language': language.wire};
    return AccountView.fromJson(account);
  }

  @override
  Future<void> registerDevice(
    String accessToken, {
    required DevicePlatform platform,
    required String token,
  }) async => registeredDevices.add((platform: platform, token: token));

  @override
  Future<void> removeDevice(String accessToken, String token) async =>
      removedDevices.add((accessToken: accessToken, token: token));

  // ── Notifications ─────────────────────────────────────────────────────────

  /// Answered by [fetchNotifications]; reading changes it.
  Json inbox = inboxJson();
  var inboxCalls = 0;
  final readNotificationIds = <String>[];
  var readAllCalls = 0;

  @override
  Future<NotificationInbox> fetchNotifications(
    String accessToken, {
    bool unreadOnly = false,
  }) async {
    inboxCalls++;
    return NotificationInbox.fromJson(inbox);
  }

  @override
  Future<void> markNotificationRead(String accessToken, String id) async {
    readNotificationIds.add(id);
    inbox = inboxJson([
      for (final item in inbox['items']! as List<Object?>)
        if ((item! as Json)['id'] == id)
          {...item as Json, 'readAt': '2026-10-24T09:00:00.000Z'}
        else
          item as Json,
    ]);
  }

  @override
  Future<void> markAllNotificationsRead(String accessToken) async {
    readAllCalls++;
    inbox = inboxJson([
      for (final item in inbox['items']! as List<Object?>)
        {...item! as Json, 'readAt': '2026-10-24T09:00:00.000Z'},
    ]);
  }

  // ── Teams ─────────────────────────────────────────────────────────────────

  /// Answers [fetchTeamDay] for a `YYYY-MM-DD` date: nobody, by default.
  Json Function(String date) teamDay = (date) => teamDayJson(date, []);
  final teamDayDates = <String>[];

  /// Answers [fetchLeaveCalendar] for `YYYY-MM-DD` dates: nobody away.
  Json Function(String from, String to) leaveCalendar = leaveCalendarJson;
  final leaveCalendarQueries = <({String from, String to})>[];

  @override
  Future<TeamDay> fetchTeamDay(
    String accessToken, {
    required DateTime date,
  }) async {
    teamDayDates.add(toWireDate(date));
    return TeamDay.fromJson(teamDay(toWireDate(date)));
  }

  @override
  Future<LeaveCalendar> fetchLeaveCalendar(
    String accessToken, {
    required DateTime from,
    required DateTime to,
  }) async {
    final query = (from: toWireDate(from), to: toWireDate(to));
    leaveCalendarQueries.add(query);
    return LeaveCalendar.fromJson(leaveCalendar(query.from, query.to));
  }

  @override
  Future<void> logout(String refreshToken) async => loggedOut.add(refreshToken);

  /// Refresh tokens whose sessions were ended with [logout].
  final loggedOut = <String>[];

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

  @override
  Future<EmployeeDetail> fetchMyEmployee(String accessToken) async {
    employeeTokens.add(accessToken);
    final next = employeeResults.isEmpty
        ? employee
        : employeeResults.removeAt(0);
    return switch (next) {
      final EmployeeDetail detail => detail,
      final Object error => throw error,
    };
  }

  // ── Leave ─────────────────────────────────────────────────────────────────

  /// Thrown, one per call, by [fetchMyLeaveBalances] before it answers
  /// [balances] for the year.
  final balanceErrors = <Exception>[];
  List<Json> Function(int year) balances = balancesJson;

  /// Years asked of [fetchMyLeaveBalances], and the tokens sent.
  final balanceYears = <int>[];
  final balanceTokens = <String>[];

  List<Json> leaveTypes = leaveTypesJson();
  var leaveTypeCalls = 0;

  /// Answers [previewLeave]. Each preview body is recorded in [previews].
  LeavePreview Function(LeaveDraft draft) previewFor = (draft) =>
      const LeavePreview(days: 1, excluded: [], problems: []);
  final previews = <Json>[];

  /// Thrown by [applyForLeave] instead of creating the request.
  Exception? applyError;

  /// Each request body sent to [applyForLeave].
  final applications = <Json>[];

  /// The user's own requests, as JSON so cancelling can change them.
  List<Json> myRequests = myRequestsJson();
  final requestYears = <int?>[];

  /// Thrown by [cancelLeaveRequest] instead of cancelling.
  Exception? cancelError;
  final cancelledIds = <String>[];

  /// The approval inbox, as JSON. Deciding an item removes it.
  List<Json> approvals = [];
  var approvalCalls = 0;
  final decisions =
      <({String stepId, ApprovalDecision decision, String? comment})>[];

  Json Function(int year) holidays = holidayYearJson;

  /// Thrown by [fetchMyHolidays] instead of answering, while set.
  Exception? holidaysError;
  final holidayYears = <int>[];

  @override
  Future<List<LeaveBalance>> fetchMyLeaveBalances(
    String accessToken, {
    required int year,
  }) async {
    balanceTokens.add(accessToken);
    balanceYears.add(year);
    if (balanceErrors.isNotEmpty) throw balanceErrors.removeAt(0);
    return [for (final json in balances(year)) LeaveBalance.fromJson(json)];
  }

  @override
  Future<List<LeaveType>> fetchLeaveTypes(String accessToken) async {
    leaveTypeCalls++;
    return [for (final json in leaveTypes) LeaveType.fromJson(json)];
  }

  @override
  Future<LeavePreview> previewLeave(
    String accessToken,
    LeaveDraft draft,
  ) async {
    previews.add(draft.toPreviewJson());
    return previewFor(draft);
  }

  @override
  Future<LeaveRequest> applyForLeave(
    String accessToken,
    LeaveDraft draft, {
    required String reason,
  }) async {
    final body = draft.toRequestJson(reason: reason);
    applications.add(body);
    if (applyError case final error?) throw error;
    final json = leaveRequestJson(
      id: 'b0000000-0000-4000-8000-0000000000ff',
      type: leaveTypes.firstWhere((type) => type['id'] == draft.leaveTypeId),
      startDate: body['startDate']! as String,
      endDate: body['endDate']! as String,
      halfDay: body['halfDay'] as String?,
      days: previewFor(draft).days,
      reason: reason,
      createdAt: '2026-10-24T09:00:00.000Z',
    );
    myRequests = [json, ...myRequests];
    return LeaveRequest.fromJson(json);
  }

  @override
  Future<List<LeaveRequest>> fetchMyLeaveRequests(
    String accessToken, {
    int? year,
  }) async {
    requestYears.add(year);
    return [
      for (final json in myRequests)
        if (year == null || (json['startDate']! as String).startsWith('$year'))
          LeaveRequest.fromJson(json),
    ];
  }

  @override
  Future<LeaveRequest> cancelLeaveRequest(
    String accessToken,
    String requestId,
  ) async {
    cancelledIds.add(requestId);
    if (cancelError case final error?) throw error;
    final index = myRequests.indexWhere((json) => json['id'] == requestId);
    final cancelled = {
      ...myRequests[index],
      'status': 'cancelled',
      'steps': [
        for (final step in myRequests[index]['steps']! as List<Object?>)
          {...step! as Json, 'status': 'cancelled'},
      ],
    };
    myRequests = [...myRequests]..[index] = cancelled;
    return LeaveRequest.fromJson(cancelled);
  }

  @override
  Future<List<ApprovalItem>> fetchApprovals(String accessToken) async {
    approvalCalls++;
    return [for (final json in approvals) ApprovalItem.fromJson(json)];
  }

  @override
  Future<void> decideApproval(
    String accessToken,
    String stepId,
    ApprovalDecision decision, {
    String? comment,
  }) async {
    decisions.add((stepId: stepId, decision: decision, comment: comment));
    final item = approvals.firstWhere((json) => json['stepId'] == stepId);
    approvals = [...approvals]..remove(item);
  }

  @override
  Future<HolidayYear> fetchMyHolidays(
    String accessToken, {
    required int year,
  }) async {
    holidayYears.add(year);
    if (holidaysError case final error?) throw error;
    return HolidayYear.fromJson(holidays(year));
  }

  // ── Attendance ────────────────────────────────────────────────────────────

  /// Answered by [fetchMyAttendanceToday]; a punch replaces it.
  Json attendanceToday = attendanceTodayJson();

  /// Thrown, one per call, by [fetchMyAttendanceToday] before it answers.
  final attendanceTodayErrors = <Exception>[];
  var attendanceTodayCalls = 0;

  /// Thrown, one per call, by [punch] instead of punching.
  final punchErrors = <Exception>[];

  /// Each body sent to [punch], refused ones included: the JSON body, or
  /// the form's fields when a selfie came with it.
  final punchBodies = <Json>[];

  /// Client ids already recorded: a resend answers today again without a
  /// second punch, as the API does.
  final recordedClientIds = <String>{};

  /// The selfie sent with each punch, `null` for a JSON punch.
  final punchSelfies = <PunchSelfie?>[];

  /// Turns [attendanceToday] and a punch body into the answer, which then
  /// becomes [attendanceToday].
  Json Function(Json today, Json body, {bool withSelfie}) afterPunch =
      punchedJson;

  /// Answers [fetchMyAttendance] for `YYYY-MM-DD` dates.
  Json Function(String from, String to) attendanceRange = attendanceRangeJson;
  final attendanceQueries = <({String from, String to})>[];

  /// The user's corrections, as JSON so asking and cancelling can change
  /// them.
  List<Json> regularizations = myRegularizationsJson();
  var regularizationCalls = 0;

  /// Thrown by [requestRegularization] instead of creating one.
  Exception? regularizationError;

  /// Each body sent to [requestRegularization].
  final regularizationBodies = <Json>[];

  /// Thrown by [cancelRegularization] instead of cancelling.
  Exception? cancelRegularizationError;
  final cancelledRegularizationIds = <String>[];

  @override
  Future<MyAttendanceToday> fetchMyAttendanceToday(String accessToken) async {
    attendanceTodayCalls++;
    if (attendanceTodayErrors.isNotEmpty) {
      throw attendanceTodayErrors.removeAt(0);
    }
    return MyAttendanceToday.fromJson(attendanceToday);
  }

  @override
  Future<MyAttendanceToday> punch(
    String accessToken, {
    PunchLocation? location,
    PunchSelfie? selfie,
    String? clientId,
    DateTime? punchedAt,
  }) async {
    final body = selfie == null
        ? selfPunchBody(location, clientId: clientId, punchedAt: punchedAt)
        : selfPunchFields(location, clientId: clientId, punchedAt: punchedAt);
    punchBodies.add(body);
    punchSelfies.add(selfie);
    if (punchErrors.isNotEmpty) throw punchErrors.removeAt(0);
    if (clientId != null && !recordedClientIds.add(clientId)) {
      return MyAttendanceToday.fromJson(attendanceToday);
    }
    attendanceToday = afterPunch(
      attendanceToday,
      body,
      withSelfie: selfie != null,
    );
    return MyAttendanceToday.fromJson(attendanceToday);
  }

  @override
  Future<AttendanceRange> fetchMyAttendance(
    String accessToken, {
    required DateTime from,
    required DateTime to,
  }) async {
    final query = (from: toWireDate(from), to: toWireDate(to));
    attendanceQueries.add(query);
    return AttendanceRange.fromJson(attendanceRange(query.from, query.to));
  }

  @override
  Future<List<Regularization>> fetchMyRegularizations(
    String accessToken,
  ) async {
    regularizationCalls++;
    return [for (final json in regularizations) Regularization.fromJson(json)];
  }

  @override
  Future<Regularization> requestRegularization(
    String accessToken,
    RegularizationDraft draft,
  ) async {
    final body = draft.toJson();
    regularizationBodies.add(body);
    if (regularizationError case final error?) throw error;
    final json = regularizationJson(
      id: 'ad000000-0000-4000-8000-0000000000ff',
      date: body['date']! as String,
      kind: body['kind']! as String,
      inTime: body['inTime'] as String?,
      outTime: body['outTime'] as String?,
      reason: body['reason']! as String,
      createdAt: '2026-10-24T09:00:00.000Z',
    );
    regularizations = [json, ...regularizations];
    return Regularization.fromJson(json);
  }

  @override
  Future<Regularization> cancelRegularization(
    String accessToken,
    String regularizationId,
  ) async {
    cancelledRegularizationIds.add(regularizationId);
    if (cancelRegularizationError case final error?) throw error;
    final index = regularizations.indexWhere(
      (json) => json['id'] == regularizationId,
    );
    final cancelled = {
      ...regularizations[index],
      'status': 'cancelled',
      'steps': [
        for (final step in regularizations[index]['steps']! as List<Object?>)
          {...step! as Json, 'status': 'cancelled'},
      ],
    };
    regularizations = [...regularizations]..[index] = cancelled;
    return Regularization.fromJson(cancelled);
  }

  // ── Documents and lifecycle ───────────────────────────────────────────────

  /// Answered by [fetchMyDocuments].
  List<Json> documents = myDocumentsJson();

  /// Thrown, one per call, by [fetchMyDocuments] before it answers.
  final documentsErrors = <Exception>[];
  var documentsCalls = 0;

  /// Answered by [downloadDocument], by document id.
  Map<String, FileDownload> files = documentFiles();

  /// Thrown, one per call, by [downloadDocument] instead of answering.
  final downloadErrors = <Exception>[];
  final downloadedIds = <String>[];

  /// Answered by [fetchMyServiceBook]; each language asked is recorded.
  FileDownload Function(LetterLanguage language) serviceBook = (language) =>
      FileDownload(
        bytes: pdfBytes,
        contentType: 'application/pdf',
        fileName: 'service-book-MG-0005-${language.wire}.pdf',
      );
  final serviceBookLanguages = <LetterLanguage>[];

  /// The user's separations, as JSON so resigning and cancelling can change
  /// them.
  List<Json> separations = [];
  var separationCalls = 0;

  /// Thrown by [resign] instead of resigning.
  Exception? resignError;

  /// Each body sent to [resign].
  final resignations = <Json>[];

  /// Thrown by [cancelSeparation] instead of cancelling.
  Exception? cancelSeparationError;
  final cancelledSeparationIds = <String>[];

  @override
  Future<List<EmployeeDocument>> fetchMyDocuments(String accessToken) async {
    documentsCalls++;
    if (documentsErrors.isNotEmpty) throw documentsErrors.removeAt(0);
    return [for (final json in documents) EmployeeDocument.fromJson(json)];
  }

  @override
  Future<FileDownload> downloadDocument(
    String accessToken,
    String documentId,
  ) async {
    downloadedIds.add(documentId);
    if (downloadErrors.isNotEmpty) throw downloadErrors.removeAt(0);
    return files[documentId] ??
        (throw const ApiException(
          kind: ApiErrorKind.server,
          statusCode: 404,
          message: 'Document not found',
        ));
  }

  @override
  Future<FileDownload> fetchMyServiceBook(
    String accessToken, {
    required LetterLanguage language,
  }) async {
    serviceBookLanguages.add(language);
    return serviceBook(language);
  }

  @override
  Future<List<Separation>> fetchMySeparations(String accessToken) async {
    separationCalls++;
    return [for (final json in separations) Separation.fromJson(json)];
  }

  @override
  Future<Separation> resign(String accessToken, ResignationDraft draft) async {
    final body = draft.toJson();
    resignations.add(body);
    if (resignError case final error?) throw error;
    final json = separationJson(
      id: 'db000000-0000-4000-8000-0000000000ff',
      // Notice is given today.
      noticeDate: toWireDate(leaveToday),
      lastWorkingDay: body['lastWorkingDay']! as String,
      reason: body['reason']! as String,
    );
    separations = [json, ...separations];
    return Separation.fromJson(json);
  }

  @override
  Future<Separation> cancelSeparation(
    String accessToken,
    String separationId,
  ) async {
    cancelledSeparationIds.add(separationId);
    if (cancelSeparationError case final error?) throw error;
    final index = separations.indexWhere((json) => json['id'] == separationId);
    final cancelled = {
      ...separations[index],
      'status': 'cancelled',
      'steps': [
        for (final step in separations[index]['steps']! as List<Object?>)
          {...step! as Json, 'status': 'cancelled'},
      ],
    };
    separations = [...separations]..[index] = cancelled;
    return Separation.fromJson(cancelled);
  }
}

/// A [CameraService] with no camera: answers [result] and records calls.
class FakeCameraService implements CameraService {
  /// Returned by [takeSelfie] (a [PunchSelfie], or `null` for backing out),
  /// or thrown when it is an exception.
  Object? result = PunchSelfie(bytes: tinyPng);

  var calls = 0;
  var openedSettings = 0;

  @override
  Future<PunchSelfie?> takeSelfie() async {
    calls++;
    return switch (result) {
      final PunchSelfie selfie => selfie,
      null => null,
      final Object error => throw error,
    };
  }

  @override
  Future<bool> openSettings() async {
    openedSettings++;
    return true;
  }
}

/// A [FileOpener] with no other app: records what it was asked to open.
class FakeFileOpener implements FileOpener {
  /// Thrown by [open] instead of opening, while set.
  Exception? error;

  final opened = <({Uint8List bytes, String fileName, String contentType})>[];
  var clears = 0;

  @override
  Future<void> open(
    Uint8List bytes, {
    required String fileName,
    required String contentType,
  }) async {
    if (error case final error?) throw error;
    opened.add((bytes: bytes, fileName: fileName, contentType: contentType));
  }

  @override
  Future<void> clear() async => clears++;
}

/// A [LocationService] with no GPS: answers [result] and records calls.
class FakeLocationService implements LocationService {
  /// Returned by [currentLocation], or thrown when it is an exception.
  Object result = atTheFactory;

  /// The time limit of each [currentLocation] call.
  final timeLimits = <Duration>[];
  final openedSettings = <LocationProblem>[];

  @override
  Future<PunchLocation> currentLocation({required Duration timeLimit}) async {
    timeLimits.add(timeLimit);
    return switch (result) {
      final PunchLocation location => location,
      final Object error => throw error,
    };
  }

  @override
  Future<bool> openSettings(LocationProblem problem) async {
    openedSettings.add(problem);
    return true;
  }
}

/// A [PunchQueueStore] in memory, which can also fail like a full disk.
class MemoryPunchQueueStore implements PunchQueueStore {
  PunchQueue saved = const PunchQueue();
  final photos = <String, Uint8List>{};
  var saves = 0;

  @override
  Future<PunchQueue> load() async => saved;

  @override
  Future<void> save(PunchQueue queue) async {
    saves++;
    // Through JSON, as the file store keeps it.
    saved = PunchQueue.fromJson(
      jsonDecode(jsonEncode(queue.toJson())) as Map<String, Object?>,
    );
  }

  @override
  Future<String> writePhoto(String clientId, Uint8List bytes) async {
    final name = 'selfie-$clientId.jpg';
    photos[name] = bytes;
    return name;
  }

  @override
  Future<Uint8List?> readPhoto(String name) async => photos[name];

  @override
  Future<void> deletePhoto(String name) async => photos.remove(name);
}

/// A [PushService] that tests drive: a token, and messages to deliver.
class FakePushService implements PushService {
  FakePushService({this.token = 'fcm-token-0123456789'});

  /// Returned by [register]; `null` as if the user said no.
  String? token;
  var registrations = 0;
  PushMessage? launchedBy;

  final tokens = StreamController<String>.broadcast();
  final foreground = StreamController<PushMessage>.broadcast();
  final opened = StreamController<PushMessage>.broadcast();

  @override
  DevicePlatform? get platform => DevicePlatform.android;

  @override
  Future<String?> register() async {
    registrations++;
    return token;
  }

  @override
  Stream<String> get tokenRefreshes => tokens.stream;

  @override
  Stream<PushMessage> get foregroundMessages => foreground.stream;

  @override
  Stream<PushMessage> get openedMessages => opened.stream;

  @override
  Future<PushMessage?> initialMessage() async => launchedBy;
}

/// The real app with [api] in place of the HTTP client, a punch queue in
/// memory and no push.
Widget appWith(
  FakeGoodPeopleApi api, {
  PunchQueueStore? punchQueue,
  PushService push = const NoPushService(),
}) => ProviderScope(
  overrides: [
    goodPeopleApiProvider.overrideWithValue(api),
    punchQueueStoreProvider.overrideWithValue(
      punchQueue ?? MemoryPunchQueueStore(),
    ),
    pushServiceProvider.overrideWithValue(push),
  ],
  child: const GoodPeopleApp(),
);
