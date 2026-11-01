import 'dart:typed_data';

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
  /// `POST /auth/login`. [tenant] is the workspace slug. A login with
  /// two-step sign-in answers a [TwoStepChallenge] instead of a session.
  /// Too many wrong passwords get a 429 with code `too_many_attempts`.
  Future<LoginOutcome> login({
    required String tenant,
    required String email,
    required String password,
  });

  /// `POST /auth/mfa/verify`: the second step, with a 6-digit code from an
  /// authenticator app or a recovery code such as `k7qm-2xpd`. A wrong or
  /// expired code gets a 401.
  Future<LoginResponse> verifyMfa({
    required String mfaToken,
    required String code,
  });

  /// `POST /auth/otp/request`: texts a sign-in code to an employee's
  /// mobile [phone], for example `01712345678`. The API answers the same
  /// for a number with no login, and sends nothing then.
  Future<OtpRequestResult> requestOtp({
    required String tenant,
    required String phone,
  });

  /// `POST /auth/otp/verify`. A wrong or expired code gets a 401
  /// ("Wrong or expired code"); a code works once.
  Future<LoginResponse> verifyOtp({
    required String tenant,
    required String phone,
    required String code,
  });

  /// `POST /auth/refresh`. The returned refresh token replaces the old one.
  Future<AuthTokens> refresh(String refreshToken);

  /// `POST /auth/logout`: ends the session on the server.
  Future<void> logout(String refreshToken);

  // ── Account ───────────────────────────────────────────────────────────────

  /// `GET /account`: the signed-in login.
  Future<AccountView> fetchAccount(String accessToken);

  /// `POST /account/password` (204). Every other session of the login ends;
  /// the one holding [keepRefreshToken] stays signed in. A wrong current
  /// password gets a 400.
  Future<void> changePassword(
    String accessToken, {
    required String currentPassword,
    required String newPassword,
    String? keepRefreshToken,
  });

  /// `PATCH /account/preferences`: the language notifications are written
  /// in.
  Future<AccountView> updatePreferences(
    String accessToken, {
    required UserLanguage language,
  });

  /// `POST /account/devices` (204): this phone's push token, so the login's
  /// notifications reach it.
  Future<void> registerDevice(
    String accessToken, {
    required DevicePlatform platform,
    required String token,
  });

  /// `POST /account/devices/remove` (204), on sign-out.
  Future<void> removeDevice(String accessToken, String token);

  // ── Notifications ─────────────────────────────────────────────────────────

  /// `GET /tenant/notifications`, only unread ones with [unreadOnly].
  Future<NotificationInbox> fetchNotifications(
    String accessToken, {
    bool unreadOnly = false,
  });

  /// `POST /tenant/notifications/{id}/read` (204). Someone else's
  /// notification gets a 404.
  Future<void> markNotificationRead(String accessToken, String id);

  /// `POST /tenant/notifications/read-all` (204).
  Future<void> markAllNotificationsRead(String accessToken);

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
  /// the punch. Refusals by `code`: `outside_geofence`, `location_required`,
  /// `no_geofence` and `selfie_required` (400), `self_punch_disabled` and
  /// `separated` (403), `too_soon` (409).
  ///
  /// With a [selfie] the punch goes as a multipart form, the photo in the
  /// `selfie` field; without one, as JSON. A photo over 2 MB gets a 413, one
  /// that is not an image a 415 with code `unsupported_file`.
  ///
  /// [clientId] (a UUID v4) lets the API recognise a resend: one it has
  /// already recorded answers 201 again without counting twice. A punch
  /// from the offline queue also sends [punchedAt]; the API refuses one
  /// older than 72 hours with 400 `offline_punch_too_old`, and one in the
  /// future with `future_punch`.
  Future<MyAttendanceToday> punch(
    String accessToken, {
    PunchLocation? location,
    PunchSelfie? selfie,
    String? clientId,
    DateTime? punchedAt,
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

  // ── Teams ─────────────────────────────────────────────────────────────────
  // Scoped by the API: HR sees everyone, anyone else themselves, their
  // reports and their unit. A login with no employee record and no HR role
  // gets a 404.

  /// `GET /tenant/attendance/daily?date=`: everyone's day.
  Future<TeamDay> fetchTeamDay(String accessToken, {required DateTime date});

  /// `GET /tenant/leave/calendar?from=&to=`: pending and approved leave, at
  /// most 62 days at a time.
  Future<LeaveCalendar> fetchLeaveCalendar(
    String accessToken, {
    required DateTime from,
    required DateTime to,
  });

  // ── Documents and lifecycle ───────────────────────────────────────────────
  // Part of `core_hr`. The `/tenant/me/...` calls answer 404 for a login with
  // no employee record, like [fetchMyEmployee].

  /// `GET /tenant/me/documents`: what HR shared with the employee, newest
  /// first.
  Future<List<EmployeeDocument>> fetchMyDocuments(String accessToken);

  /// `GET /tenant/documents/{id}/file`: the file itself. A document no
  /// longer shared gets a 403, a removed one a 404.
  Future<FileDownload> downloadDocument(String accessToken, String documentId);

  /// `GET /tenant/me/service-book?language=`: the employee's service book
  /// (Labour Act s.6) as a PDF.
  Future<FileDownload> fetchMyServiceBook(
    String accessToken, {
    required LetterLanguage language,
  });

  /// `GET /tenant/me/separations`: the employee's resignations and any
  /// separation HR recorded, newest first.
  Future<List<Separation>> fetchMySeparations(String accessToken);

  /// `POST /tenant/me/resignation`, giving notice today. Refusals by `code`:
  /// `past_last_day` (400), `separation_open` and `separated` (409).
  Future<Separation> resign(String accessToken, ResignationDraft draft);

  /// `POST /tenant/separations/{id}/cancel`. An employee can withdraw only
  /// a pending resignation: a 403 otherwise, or a 409 with code `not_open`
  /// once it is decided.
  Future<Separation> cancelSeparation(String accessToken, String separationId);

  // ── Payroll ───────────────────────────────────────────────────────────────
  // Needs the workspace's `payroll` feature: a 403 with code
  // `feature_not_in_plan` without it.

  /// `GET /tenant/me/payslips`: the employee's published payslips, newest
  /// first. Empty for a login with no employee record.
  Future<List<PayslipSummary>> fetchMyPayslips(String accessToken);

  /// `GET /tenant/me/payslips/{itemId}?language=`: one payslip as a PDF.
  /// One that is not the user's, or not published, gets a 404.
  Future<FileDownload> fetchMyPayslipPdf(
    String accessToken,
    String itemId, {
    required LetterLanguage language,
  });

  /// `GET /tenant/me/tax?fiscalYear=`: the employee's salary and tax for an
  /// income year such as `2026-27`; the current one when [fiscalYear] is
  /// `null`. A login with no employee record gets a 404.
  Future<TaxYearView> fetchMyTaxYear(String accessToken, {String? fiscalYear});

  /// `PUT /tenant/me/tax/declaration?fiscalYear=`: the whole investment
  /// declaration, kept as a draft or sent to payroll. Once payroll has
  /// verified it, a 409 with code `declaration_verified`; an amount that is
  /// not like `12500` or `12500.50`, a 400 with the problems in `issues`.
  Future<TaxDeclaration> saveMyTaxDeclaration(
    String accessToken,
    TaxDeclarationDraft draft, {
    required String fiscalYear,
  });

  /// `GET /tenant/me/tax/certificate?fiscalYear=&language=`: the year's
  /// salary and tax deduction certificate as a PDF.
  Future<FileDownload> fetchMyTaxCertificate(
    String accessToken, {
    required String fiscalYear,
    required LetterLanguage language,
  });

  /// `GET /tenant/me/pf`: the employee's provident fund statement, or
  /// `null` when they are not a member (or have no employee record).
  Future<PfStatement?> fetchMyProvidentFund(String accessToken);

  /// `GET /tenant/me/loans`: the employee's salary advances and loans.
  /// Empty for a login with no employee record.
  Future<List<LoanView>> fetchMyLoans(String accessToken);

  // ── Timesheets ────────────────────────────────────────────────────────────
  // Needs the workspace's `projects` feature. A login with no employee
  // record gets a 404. A month already submitted or approved refuses
  // changes with 409 `timesheet_locked`.

  /// `GET /tenant/timesheets/me?month=`: the month's days, the projects the
  /// person may charge, their entries and totals.
  Future<Timesheet> fetchMyTimesheet(
    String accessToken, {
    required DateTime month,
  });

  /// `PUT /tenant/timesheets/me/entries`: saves the entries it can, in
  /// order, and names every other with its reason. An entry whose clientId
  /// was saved before counts as accepted and changes nothing.
  Future<TimesheetSaveResult> saveTimesheetEntries(
    String accessToken, {
    required DateTime month,
    required List<TimesheetEntryDraft> entries,
  });

  /// `POST /tenant/timesheets/me/prefill`: fills days with attendance and
  /// no entries, split by the person's planned shares.
  Future<TimesheetPrefillResult> prefillTimesheet(
    String accessToken, {
    required DateTime month,
  });

  /// `POST /tenant/timesheets/me/submit` with the declaration: the person
  /// certifies the hours are the work they actually did. Refusals by
  /// `code`: `timesheet_empty` and `month_not_started` (400),
  /// `timesheet_locked` (409).
  Future<Timesheet> submitTimesheet(
    String accessToken, {
    required DateTime month,
  });

  // ── Recruitment ───────────────────────────────────────────────────────────
  // Needs the workspace's `recruitment` feature: a 403 without it.

  /// `GET /tenant/recruitment/me`: how many interviews need the login.
  Future<RecruitmentMe> fetchRecruitmentMe(String accessToken);

  /// `GET /tenant/interviews`: the login's interviews, to come and past.
  /// Empty for a login with no employee record.
  Future<MyInterviews> fetchMyInterviews(String accessToken);

  /// `GET /tenant/interviews/{id}`. An interview the login is not on gets a
  /// 404.
  Future<MyInterviewDetail> fetchMyInterview(
    String accessToken,
    String interviewId,
  );

  /// `PUT /tenant/interviews/{id}/scorecard`, answered with the interview
  /// as it now is, with the other interviewers' scorecards. Refusals by
  /// `code`: `scorecard_criteria` (400: not every criterion rated, or the
  /// criteria changed), `application_closed` and `interview_cancelled`
  /// (409).
  Future<MyInterviewDetail> submitScorecard(
    String accessToken,
    String interviewId,
    ScorecardDraft draft,
  );

  /// `GET /tenant/recruitment/applications/{id}/cv`: the candidate's CV, a
  /// PDF or a Word file, for those interviewing them too. A 404 when there
  /// is none (or it was erased).
  Future<FileDownload> downloadApplicationCv(
    String accessToken,
    String applicationId,
  );

  // ── Performance ───────────────────────────────────────────────────────────
  // Needs the workspace's `performance` feature: a 403 without it. A goal,
  // review or peer request the login may not see gets a 404. Refusals carry
  // a `code` in the [ApiException].

  /// `GET /tenant/performance/me`: what waits for the login, their goals in
  /// numbers and their reviews.
  Future<PerformanceMe> fetchPerformanceMe(String accessToken);

  /// `GET /tenant/performance/goals/mine`. Empty for a login with no
  /// employee record.
  Future<MyGoals> fetchMyGoals(String accessToken);

  /// `GET /tenant/performance/goals/team`: the goals of everyone below the
  /// login, by person.
  Future<TeamGoals> fetchTeamGoals(String accessToken);

  /// `GET /tenant/performance/goals/{id}`.
  Future<GoalDetail> fetchGoal(String accessToken, String goalId);

  /// `POST /tenant/performance/goals/{id}/checkins`, answered with the goal
  /// as it now is. Refusals: `goal_checkin_empty` (400),
  /// `goal_value_from_records` (400, a KPI from the records), `goal_closed`
  /// and `goal_cycle_closed` (409).
  Future<GoalDetail> checkinGoal(
    String accessToken,
    String goalId,
    GoalCheckinDraft draft,
  );

  /// `POST /tenant/performance/goals/submit`: the login's drafts for a
  /// cycle (`null`: outside any cycle) sent to their manager to agree.
  /// Refusals: `no_draft_goals`, `goal_cycle_closed` (409).
  Future<GoalSubmitResult> submitGoals(String accessToken, String? cycleId);

  /// `POST /tenant/performance/goals/{id}/agree`, answered with the goal.
  /// Refusals (409): `goal_not_draft`, `goal_weight_required`,
  /// `goal_weights_over`, `goal_weights_total` (a person's agreed goals for
  /// a cycle weigh 100% together), `goal_cycle_closed`.
  Future<GoalDetail> agreeGoal(String accessToken, String goalId);

  /// `POST /tenant/performance/goals/agree`: every draft of one person for a
  /// cycle (`null`: outside any cycle) agreed at once; refused as
  /// [agreeGoal] is.
  Future<void> agreeAllGoals(
    String accessToken, {
    required String employeeId,
    required String? cycleId,
  });

  /// `GET /tenant/performance/reviews/{id}`.
  Future<ReviewDetail> fetchReview(String accessToken, String reviewId);

  /// `PUT /tenant/performance/reviews/{id}/self`, answered with the review.
  /// Refusals: `ratings_missing` (400, submitting without every goal and
  /// competency rated), `review_step_closed` (409).
  Future<ReviewDetail> saveSelfReview(
    String accessToken,
    String reviewId,
    SelfReviewDraft draft,
  );

  /// `POST /tenant/performance/reviews/{id}/acknowledge`, answered with the
  /// review. Refusals (409): `already_acknowledged`, `review_not_released`.
  Future<ReviewDetail> acknowledgeReview(
    String accessToken,
    String reviewId,
    AcknowledgementDraft draft,
  );

  /// `GET /tenant/performance/peers`: feedback the login is asked for, and
  /// peers waiting for their approval.
  Future<PeerInbox> fetchPeerInbox(String accessToken);

  /// `GET /tenant/performance/peers/{id}`: one request for the login's
  /// feedback.
  Future<PeerRequest> fetchPeerRequest(String accessToken, String peerId);

  /// `PUT /tenant/performance/peers/{id}`, answered with the request.
  /// Refusals (409): `peer_answered`, `peer_step_closed`.
  Future<PeerRequest> answerPeerRequest(
    String accessToken,
    String peerId,
    PeerAnswerDraft draft,
  );

  /// `POST /tenant/performance/peers/{id}/decision`: the manager approves a
  /// named peer, who is then asked, or declines them. Refusals (409):
  /// `peer_decided`, `peer_step_closed`.
  Future<void> decidePeer(
    String accessToken,
    String peerId, {
    required bool approve,
  });
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
  Future<LoginOutcome> login({
    required String tenant,
    required String email,
    required String password,
  }) => _call(
    () => _dio.post<Object?>(
      '/auth/login',
      data: {'tenant': tenant, 'email': email, 'password': password},
    ),
    LoginOutcome.fromJson,
  );

  @override
  Future<LoginResponse> verifyMfa({
    required String mfaToken,
    required String code,
  }) => _call(
    () => _dio.post<Object?>(
      '/auth/mfa/verify',
      data: {'mfaToken': mfaToken, 'code': code},
    ),
    LoginResponse.fromJson,
  );

  @override
  Future<OtpRequestResult> requestOtp({
    required String tenant,
    required String phone,
  }) => _call(
    () => _dio.post<Object?>(
      '/auth/otp/request',
      data: {'tenant': tenant, 'phone': phone},
    ),
    OtpRequestResult.fromJson,
  );

  @override
  Future<LoginResponse> verifyOtp({
    required String tenant,
    required String phone,
    required String code,
  }) => _call(
    () => _dio.post<Object?>(
      '/auth/otp/verify',
      data: {'tenant': tenant, 'phone': phone, 'code': code},
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
  Future<void> logout(String refreshToken) => _send(
    () => _dio.post<Object?>(
      '/auth/logout',
      data: {'refreshToken': refreshToken},
    ),
    (_) {},
  );

  @override
  Future<AccountView> fetchAccount(String accessToken) => _call(
    () => _dio.get<Object?>('/account', options: _bearer(accessToken)),
    AccountView.fromJson,
  );

  @override
  Future<void> changePassword(
    String accessToken, {
    required String currentPassword,
    required String newPassword,
    String? keepRefreshToken,
  }) => _send(
    () => _dio.post<Object?>(
      '/account/password',
      data: {
        'currentPassword': currentPassword,
        'newPassword': newPassword,
        'keepRefreshToken': ?keepRefreshToken,
      },
      options: _bearer(accessToken),
    ),
    (_) {},
  );

  @override
  Future<AccountView> updatePreferences(
    String accessToken, {
    required UserLanguage language,
  }) => _call(
    () => _dio.patch<Object?>(
      '/account/preferences',
      data: {'language': language.wire},
      options: _bearer(accessToken),
    ),
    AccountView.fromJson,
  );

  @override
  Future<void> registerDevice(
    String accessToken, {
    required DevicePlatform platform,
    required String token,
  }) => _send(
    () => _dio.post<Object?>(
      '/account/devices',
      data: {'platform': platform.wire, 'token': token},
      options: _bearer(accessToken),
    ),
    (_) {},
  );

  @override
  Future<void> removeDevice(String accessToken, String token) => _send(
    () => _dio.post<Object?>(
      '/account/devices/remove',
      data: {'token': token},
      options: _bearer(accessToken),
    ),
    (_) {},
  );

  @override
  Future<NotificationInbox> fetchNotifications(
    String accessToken, {
    bool unreadOnly = false,
  }) => _call(
    () => _dio.get<Object?>(
      '/tenant/notifications',
      queryParameters: {if (unreadOnly) 'unread': 'true'},
      options: _bearer(accessToken),
    ),
    NotificationInbox.fromJson,
  );

  @override
  Future<void> markNotificationRead(String accessToken, String id) => _send(
    () => _dio.post<Object?>(
      '/tenant/notifications/${Uri.encodeComponent(id)}/read',
      options: _bearer(accessToken),
    ),
    (_) {},
  );

  @override
  Future<void> markAllNotificationsRead(String accessToken) => _send(
    () => _dio.post<Object?>(
      '/tenant/notifications/read-all',
      options: _bearer(accessToken),
    ),
    (_) {},
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
    PunchSelfie? selfie,
    String? clientId,
    DateTime? punchedAt,
  }) => _call(
    () => _dio.post<Object?>(
      '/tenant/me/attendance/punch',
      // Built per call: a FormData can be sent only once, and a refreshed
      // session sends the punch again.
      data: selfie == null
          ? selfPunchBody(location, clientId: clientId, punchedAt: punchedAt)
          : FormData.fromMap({
              ...selfPunchFields(
                location,
                clientId: clientId,
                punchedAt: punchedAt,
              ),
              'selfie': MultipartFile.fromBytes(
                selfie.bytes,
                filename: selfie.fileName,
                contentType: DioMediaType('image', 'jpeg'),
              ),
            }),
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

  @override
  Future<TeamDay> fetchTeamDay(String accessToken, {required DateTime date}) =>
      _call(
        () => _dio.get<Object?>(
          '/tenant/attendance/daily',
          queryParameters: {'date': toWireDate(date)},
          options: _bearer(accessToken),
        ),
        TeamDay.fromJson,
      );

  @override
  Future<LeaveCalendar> fetchLeaveCalendar(
    String accessToken, {
    required DateTime from,
    required DateTime to,
  }) => _call(
    () => _dio.get<Object?>(
      '/tenant/leave/calendar',
      queryParameters: {'from': toWireDate(from), 'to': toWireDate(to)},
      options: _bearer(accessToken),
    ),
    LeaveCalendar.fromJson,
  );

  @override
  Future<List<EmployeeDocument>> fetchMyDocuments(String accessToken) =>
      _callList(
        () => _dio.get<Object?>(
          '/tenant/me/documents',
          options: _bearer(accessToken),
        ),
        EmployeeDocument.fromJson,
      );

  @override
  Future<FileDownload> downloadDocument(
    String accessToken,
    String documentId,
  ) => _download(
    () => _dio.get<List<int>>(
      '/tenant/documents/${Uri.encodeComponent(documentId)}/file',
      options: _fileOptions(accessToken),
    ),
  );

  @override
  Future<FileDownload> fetchMyServiceBook(
    String accessToken, {
    required LetterLanguage language,
  }) => _download(
    () => _dio.get<List<int>>(
      '/tenant/me/service-book',
      queryParameters: {'language': language.wire},
      options: _fileOptions(accessToken),
    ),
  );

  @override
  Future<List<Separation>> fetchMySeparations(String accessToken) => _callList(
    () => _dio.get<Object?>(
      '/tenant/me/separations',
      options: _bearer(accessToken),
    ),
    Separation.fromJson,
  );

  @override
  Future<Separation> resign(String accessToken, ResignationDraft draft) =>
      _call(
        () => _dio.post<Object?>(
          '/tenant/me/resignation',
          data: draft.toJson(),
          options: _bearer(accessToken),
        ),
        Separation.fromJson,
      );

  @override
  Future<Separation> cancelSeparation(
    String accessToken,
    String separationId,
  ) => _call(
    () => _dio.post<Object?>(
      '/tenant/separations/${Uri.encodeComponent(separationId)}/cancel',
      options: _bearer(accessToken),
    ),
    Separation.fromJson,
  );

  @override
  Future<List<PayslipSummary>> fetchMyPayslips(String accessToken) => _callList(
    () =>
        _dio.get<Object?>('/tenant/me/payslips', options: _bearer(accessToken)),
    PayslipSummary.fromJson,
  );

  @override
  Future<FileDownload> fetchMyPayslipPdf(
    String accessToken,
    String itemId, {
    required LetterLanguage language,
  }) => _download(
    () => _dio.get<List<int>>(
      '/tenant/me/payslips/${Uri.encodeComponent(itemId)}',
      queryParameters: {'language': language.wire},
      options: _fileOptions(accessToken),
    ),
  );

  @override
  Future<TaxYearView> fetchMyTaxYear(
    String accessToken, {
    String? fiscalYear,
  }) => _call(
    () => _dio.get<Object?>(
      '/tenant/me/tax',
      queryParameters: {'fiscalYear': ?fiscalYear},
      options: _bearer(accessToken),
    ),
    TaxYearView.fromJson,
  );

  @override
  Future<TaxDeclaration> saveMyTaxDeclaration(
    String accessToken,
    TaxDeclarationDraft draft, {
    required String fiscalYear,
  }) => _call(
    () => _dio.put<Object?>(
      '/tenant/me/tax/declaration',
      queryParameters: {'fiscalYear': fiscalYear},
      data: draft.toJson(),
      options: _bearer(accessToken),
    ),
    TaxDeclaration.fromJson,
  );

  @override
  Future<FileDownload> fetchMyTaxCertificate(
    String accessToken, {
    required String fiscalYear,
    required LetterLanguage language,
  }) => _download(
    () => _dio.get<List<int>>(
      '/tenant/me/tax/certificate',
      queryParameters: {'fiscalYear': fiscalYear, 'language': language.wire},
      options: _fileOptions(accessToken),
    ),
  );

  @override
  Future<PfStatement?> fetchMyProvidentFund(String accessToken) => _send(
    () => _dio.get<Object?>('/tenant/me/pf', options: _bearer(accessToken)),
    (data) => switch (data) {
      // A JSON `null`, or the empty body the API sends for one.
      null => null,
      final String text when text.trim().isEmpty || text.trim() == 'null' =>
        null,
      final Json json => PfStatement.fromJson(json),
      _ => throw const FormatException('Expected a JSON object or null'),
    },
  );

  @override
  Future<List<LoanView>> fetchMyLoans(String accessToken) => _callList(
    () => _dio.get<Object?>('/tenant/me/loans', options: _bearer(accessToken)),
    LoanView.fromJson,
  );

  @override
  Future<Timesheet> fetchMyTimesheet(
    String accessToken, {
    required DateTime month,
  }) => _call(
    () => _dio.get<Object?>(
      '/tenant/timesheets/me',
      queryParameters: {'month': toWireMonth(month)},
      options: _bearer(accessToken),
    ),
    Timesheet.fromJson,
  );

  @override
  Future<TimesheetSaveResult> saveTimesheetEntries(
    String accessToken, {
    required DateTime month,
    required List<TimesheetEntryDraft> entries,
  }) => _call(
    () => _dio.put<Object?>(
      '/tenant/timesheets/me/entries',
      data: {
        'month': toWireMonth(month),
        'entries': [for (final entry in entries) entry.toJson()],
      },
      options: _bearer(accessToken),
    ),
    TimesheetSaveResult.fromJson,
  );

  @override
  Future<TimesheetPrefillResult> prefillTimesheet(
    String accessToken, {
    required DateTime month,
  }) => _call(
    () => _dio.post<Object?>(
      '/tenant/timesheets/me/prefill',
      data: {'month': toWireMonth(month)},
      options: _bearer(accessToken),
    ),
    TimesheetPrefillResult.fromJson,
  );

  @override
  Future<Timesheet> submitTimesheet(
    String accessToken, {
    required DateTime month,
  }) => _call(
    () => _dio.post<Object?>(
      '/tenant/timesheets/me/submit',
      data: {'month': toWireMonth(month), 'declaration': true},
      options: _bearer(accessToken),
    ),
    Timesheet.fromJson,
  );

  @override
  Future<RecruitmentMe> fetchRecruitmentMe(String accessToken) => _call(
    () => _dio.get<Object?>(
      '/tenant/recruitment/me',
      options: _bearer(accessToken),
    ),
    RecruitmentMe.fromJson,
  );

  @override
  Future<MyInterviews> fetchMyInterviews(String accessToken) => _call(
    () =>
        _dio.get<Object?>('/tenant/interviews', options: _bearer(accessToken)),
    MyInterviews.fromJson,
  );

  @override
  Future<MyInterviewDetail> fetchMyInterview(
    String accessToken,
    String interviewId,
  ) => _call(
    () => _dio.get<Object?>(
      '/tenant/interviews/${Uri.encodeComponent(interviewId)}',
      options: _bearer(accessToken),
    ),
    MyInterviewDetail.fromJson,
  );

  @override
  Future<MyInterviewDetail> submitScorecard(
    String accessToken,
    String interviewId,
    ScorecardDraft draft,
  ) => _call(
    () => _dio.put<Object?>(
      '/tenant/interviews/${Uri.encodeComponent(interviewId)}/scorecard',
      data: draft.toJson(),
      options: _bearer(accessToken),
    ),
    MyInterviewDetail.fromJson,
  );

  @override
  Future<FileDownload> downloadApplicationCv(
    String accessToken,
    String applicationId,
  ) => _download(
    () => _dio.get<List<int>>(
      '/tenant/recruitment/applications/'
      '${Uri.encodeComponent(applicationId)}/cv',
      options: _fileOptions(accessToken),
    ),
  );

  static const _performance = '/tenant/performance';

  @override
  Future<PerformanceMe> fetchPerformanceMe(String accessToken) => _call(
    () => _dio.get<Object?>('$_performance/me', options: _bearer(accessToken)),
    PerformanceMe.fromJson,
  );

  @override
  Future<MyGoals> fetchMyGoals(String accessToken) => _call(
    () => _dio.get<Object?>(
      '$_performance/goals/mine',
      options: _bearer(accessToken),
    ),
    MyGoals.fromJson,
  );

  @override
  Future<TeamGoals> fetchTeamGoals(String accessToken) => _call(
    () => _dio.get<Object?>(
      '$_performance/goals/team',
      options: _bearer(accessToken),
    ),
    TeamGoals.fromJson,
  );

  @override
  Future<GoalDetail> fetchGoal(String accessToken, String goalId) => _call(
    () => _dio.get<Object?>(
      '$_performance/goals/${Uri.encodeComponent(goalId)}',
      options: _bearer(accessToken),
    ),
    GoalDetail.fromJson,
  );

  @override
  Future<GoalDetail> checkinGoal(
    String accessToken,
    String goalId,
    GoalCheckinDraft draft,
  ) => _call(
    () => _dio.post<Object?>(
      '$_performance/goals/${Uri.encodeComponent(goalId)}/checkins',
      data: draft.toJson(),
      options: _bearer(accessToken),
    ),
    GoalDetail.fromJson,
  );

  @override
  Future<GoalSubmitResult> submitGoals(String accessToken, String? cycleId) =>
      _call(
        () => _dio.post<Object?>(
          '$_performance/goals/submit',
          data: {'cycleId': cycleId},
          options: _bearer(accessToken),
        ),
        GoalSubmitResult.fromJson,
      );

  @override
  Future<GoalDetail> agreeGoal(String accessToken, String goalId) => _call(
    () => _dio.post<Object?>(
      '$_performance/goals/${Uri.encodeComponent(goalId)}/agree',
      options: _bearer(accessToken),
    ),
    GoalDetail.fromJson,
  );

  @override
  Future<void> agreeAllGoals(
    String accessToken, {
    required String employeeId,
    required String? cycleId,
  }) => _send(
    () => _dio.post<Object?>(
      '$_performance/goals/agree',
      data: {'employeeId': employeeId, 'cycleId': cycleId},
      options: _bearer(accessToken),
    ),
    (_) {},
  );

  @override
  Future<ReviewDetail> fetchReview(String accessToken, String reviewId) =>
      _call(
        () => _dio.get<Object?>(
          '$_performance/reviews/${Uri.encodeComponent(reviewId)}',
          options: _bearer(accessToken),
        ),
        ReviewDetail.fromJson,
      );

  @override
  Future<ReviewDetail> saveSelfReview(
    String accessToken,
    String reviewId,
    SelfReviewDraft draft,
  ) => _call(
    () => _dio.put<Object?>(
      '$_performance/reviews/${Uri.encodeComponent(reviewId)}/self',
      data: draft.toJson(),
      options: _bearer(accessToken),
    ),
    ReviewDetail.fromJson,
  );

  @override
  Future<ReviewDetail> acknowledgeReview(
    String accessToken,
    String reviewId,
    AcknowledgementDraft draft,
  ) => _call(
    () => _dio.post<Object?>(
      '$_performance/reviews/${Uri.encodeComponent(reviewId)}/acknowledge',
      data: draft.toJson(),
      options: _bearer(accessToken),
    ),
    ReviewDetail.fromJson,
  );

  @override
  Future<PeerInbox> fetchPeerInbox(String accessToken) => _call(
    () =>
        _dio.get<Object?>('$_performance/peers', options: _bearer(accessToken)),
    PeerInbox.fromJson,
  );

  @override
  Future<PeerRequest> fetchPeerRequest(String accessToken, String peerId) =>
      _call(
        () => _dio.get<Object?>(
          '$_performance/peers/${Uri.encodeComponent(peerId)}',
          options: _bearer(accessToken),
        ),
        PeerRequest.fromJson,
      );

  @override
  Future<PeerRequest> answerPeerRequest(
    String accessToken,
    String peerId,
    PeerAnswerDraft draft,
  ) => _call(
    () => _dio.put<Object?>(
      '$_performance/peers/${Uri.encodeComponent(peerId)}',
      data: draft.toJson(),
      options: _bearer(accessToken),
    ),
    PeerRequest.fromJson,
  );

  @override
  Future<void> decidePeer(
    String accessToken,
    String peerId, {
    required bool approve,
  }) => _send(
    () => _dio.post<Object?>(
      '$_performance/peers/${Uri.encodeComponent(peerId)}/decision',
      data: {'approve': approve},
      options: _bearer(accessToken),
    ),
    (_) {},
  );

  void close() => _dio.close(force: true);

  static Options _bearer(String accessToken) =>
      Options(headers: {'Authorization': 'Bearer $accessToken'});

  /// A file download: the body as bytes, whatever its type. The service
  /// book, payslips and tax certificates are rendered on request, so they
  /// get longer than a JSON call.
  static Options _fileOptions(String accessToken) => Options(
    headers: {'Authorization': 'Bearer $accessToken', 'Accept': '*/*'},
    responseType: ResponseType.bytes,
    receiveTimeout: const Duration(seconds: 60),
  );

  /// A call whose 2xx body is a file.
  Future<FileDownload> _download(
    Future<Response<List<int>>> Function() send,
  ) async {
    final Response<List<int>> response;
    try {
      response = await send();
    } on DioException catch (error) {
      throw ApiException.fromDio(error);
    }
    final data = response.data;
    if (data == null) {
      throw ApiException(
        kind: ApiErrorKind.badResponse,
        statusCode: response.statusCode,
        message: 'Expected a file',
      );
    }
    final type = response.headers.value(Headers.contentTypeHeader);
    return FileDownload(
      bytes: data is Uint8List ? data : Uint8List.fromList(data),
      contentType: switch (type?.split(';').first.trim().toLowerCase()) {
        final String media when media.isNotEmpty => media,
        _ => 'application/octet-stream',
      },
      fileName: fileNameFromDisposition(
        response.headers.value('content-disposition'),
      ),
    );
  }

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
