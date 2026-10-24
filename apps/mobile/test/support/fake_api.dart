import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:good_people/api/api_exception.dart';
import 'package:good_people/api/api_models.dart';
import 'package:good_people/api/good_people_api.dart';
import 'package:good_people/app.dart';
import 'package:good_people/attendance/location_service.dart';

import 'attendance_fixtures.dart';
import 'leave_fixtures.dart';

export 'attendance_fixtures.dart';
export 'leave_fixtures.dart';

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

  /// Each body sent to [punch], refused ones included.
  final punchBodies = <Json>[];

  /// Turns [attendanceToday] and a punch body into the answer, which then
  /// becomes [attendanceToday].
  Json Function(Json today, Json body) afterPunch = punchedJson;

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
  }) async {
    final body = selfPunchBody(location);
    punchBodies.add(body);
    if (punchErrors.isNotEmpty) throw punchErrors.removeAt(0);
    attendanceToday = afterPunch(attendanceToday, body);
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

/// The real app with [api] in place of the HTTP client.
Widget appWith(FakeGoodPeopleApi api) => ProviderScope(
  overrides: [goodPeopleApiProvider.overrideWithValue(api)],
  child: const GoodPeopleApp(),
);
