import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/api_models.dart';
import '../api/good_people_api.dart';
import '../api/token_store.dart';

sealed class AuthState {
  const AuthState();
}

final class SignedOut extends AuthState {
  const SignedOut({this.sessionExpired = false});

  /// True when the app signed the user out because the session could not be
  /// refreshed, so the login screen can say why.
  final bool sessionExpired;
}

final class SignedIn extends AuthState {
  const SignedIn({required this.user, required this.tenant});

  final AuthUser user;
  final TenantSummary tenant;
}

/// Thrown when a call needs a session and the user had to be signed out.
class SessionExpiredException implements Exception {
  const SessionExpiredException();

  @override
  String toString() => 'SessionExpiredException';
}

final authProvider = NotifierProvider<AuthController, AuthState>(
  AuthController.new,
);

/// Goes up after every call the server answered with success, so work that
/// waits for a connection (the offline punch queue) knows it is back.
final apiContactProvider = NotifierProvider<ApiContactCounter, int>(
  ApiContactCounter.new,
);

class ApiContactCounter extends Notifier<int> {
  @override
  int build() => 0;

  void bump() => state++;
}

class AuthController extends Notifier<AuthState> {
  GoodPeopleApi get _api => ref.read(goodPeopleApiProvider);
  TokenStore get _tokens => ref.read(tokenStoreProvider);

  /// The refresh in flight. Calls that get a 401 together share it: a
  /// refresh token works only once, so a second refresh would fail.
  Future<AuthTokens>? _refreshing;

  /// This phone's push token as registered for the session, removed again
  /// on sign-out.
  String? _deviceToken;

  @override
  AuthState build() => const SignedOut();

  /// Signs in with a password and stores the tokens. Returns `null` once
  /// signed in, or the [TwoStepChallenge] when the login needs a second
  /// step (see [completeTwoStep]). Throws [ApiException] on failure.
  Future<TwoStepChallenge?> signIn({
    required String workspace,
    required String email,
    required String password,
  }) async {
    final outcome = await _api.login(
      tenant: _slug(workspace),
      email: email.trim(),
      password: password,
    );
    switch (outcome) {
      case LoginResponse():
        await _start(outcome);
        return null;
      case TwoStepChallenge():
        return outcome;
    }
  }

  /// Finishes a password sign-in with a code from the authenticator app or
  /// a recovery code. A wrong or expired one is a 401 [ApiException].
  Future<void> completeTwoStep(TwoStepChallenge challenge, String code) async {
    await _start(
      await _api.verifyMfa(mfaToken: challenge.mfaToken, code: code.trim()),
    );
  }

  /// Asks for a sign-in code by SMS to [phone]. The answer is the same
  /// whether or not the number has a login.
  Future<OtpRequestResult> requestSignInCode({
    required String workspace,
    required String phone,
  }) => _api.requestOtp(tenant: _slug(workspace), phone: phone);

  /// Signs in with the code texted to [phone]. A wrong or expired code is a
  /// 401 [ApiException].
  Future<void> signInWithCode({
    required String workspace,
    required String phone,
    required String code,
  }) async {
    await _start(
      await _api.verifyOtp(tenant: _slug(workspace), phone: phone, code: code),
    );
  }

  static String _slug(String workspace) => workspace.trim().toLowerCase();

  Future<void> _start(LoginResponse session) async {
    await _tokens.write(session.tokens);
    _deviceToken = null;
    state = SignedIn(user: session.user, tenant: session.tenant);
  }

  Future<void> signOut({bool sessionExpired = false}) async {
    final tokens = await _tokens.read();
    final device = _deviceToken;
    _deviceToken = null;
    await _tokens.clear();
    state = SignedOut(sessionExpired: sessionExpired);
    // After the screen has changed, so no connection does not hold it up.
    // An ended session cannot remove the device; the next login on the
    // phone takes it over.
    if (tokens != null && !sessionExpired) {
      unawaited(_endSession(tokens, device));
    }
  }

  /// Forgets this phone's push token, then ends the session on the server so
  /// its refresh token stops working. Best effort: failures are ignored.
  Future<void> _endSession(AuthTokens tokens, String? device) async {
    // Forgetting the device may refresh the session; the newest token is ended.
    final last = device == null ? tokens : await _forgetDevice(tokens, device);
    try {
      await _api.logout(last.refreshToken);
    } on Object {
      // The session ends by itself when its refresh token expires.
    }
  }

  /// `POST /account/devices/remove` for a session that has just ended,
  /// refreshing it once if needed. Best effort: failures are ignored.
  /// Returns the session's tokens after any refresh.
  Future<AuthTokens> _forgetDevice(AuthTokens tokens, String device) async {
    var current = tokens;
    try {
      try {
        await _api.removeDevice(current.accessToken, device);
      } on ApiException catch (error) {
        if (!error.isUnauthorized) rethrow;
        current = await _api.refresh(tokens.refreshToken);
        await _api.removeDevice(current.accessToken, device);
      }
    } on Object {
      // The phone keeps getting this login's notifications until another
      // login registers it.
    }
    return current;
  }

  /// Loads `/tenant/access` for the signed-in user, refreshing the session
  /// once if needed (see [_withSession]).
  Future<TenantAccessView> fetchTenantAccess() =>
      _withSession(_api.getTenantAccess);

  /// Loads `/tenant/me/employee` for the signed-in user, refreshing the
  /// session once if needed (see [_withSession]). A 404 (no employee record
  /// linked to this login) is thrown like any other [ApiException].
  Future<EmployeeDetail> fetchMyEmployee() =>
      _withSession(_api.fetchMyEmployee);

  // ── Account and notifications ─────────────────────────────────────────────

  Future<AccountView> fetchAccount() => _withSession(_api.fetchAccount);

  /// Changes the password. The other sessions of the login end; this one
  /// stays signed in.
  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) => _withSession(
    (token) async => _api.changePassword(
      token,
      currentPassword: currentPassword,
      newPassword: newPassword,
      keepRefreshToken: (await _tokens.read())?.refreshToken,
    ),
  );

  /// The language notifications are written in.
  Future<AccountView> updateLanguage(UserLanguage language) => _withSession(
    (token) => _api.updatePreferences(token, language: language),
  );

  /// Registers this phone's push token for the signed-in login. Signing out
  /// removes it again.
  Future<void> registerDevice(DevicePlatform platform, String token) async {
    final session = state;
    await _withSession(
      (access) => _api.registerDevice(access, platform: platform, token: token),
    );
    if (identical(state, session)) _deviceToken = token;
  }

  Future<NotificationInbox> fetchNotifications() =>
      _withSession(_api.fetchNotifications);

  Future<void> markNotificationRead(String id) =>
      _withSession((token) => _api.markNotificationRead(token, id));

  Future<void> markAllNotificationsRead() =>
      _withSession(_api.markAllNotificationsRead);

  // ── Leave ─────────────────────────────────────────────────────────────────
  // Each call refreshes the session once if needed (see [_withSession]). A
  // 401 means the server did not act, so retrying a POST is safe.

  Future<List<LeaveBalance>> fetchMyLeaveBalances(int year) =>
      _withSession((token) => _api.fetchMyLeaveBalances(token, year: year));

  Future<List<LeaveType>> fetchLeaveTypes() =>
      _withSession(_api.fetchLeaveTypes);

  Future<LeavePreview> previewLeave(LeaveDraft draft) =>
      _withSession((token) => _api.previewLeave(token, draft));

  Future<LeaveRequest> applyForLeave(
    LeaveDraft draft, {
    required String reason,
  }) =>
      _withSession((token) => _api.applyForLeave(token, draft, reason: reason));

  Future<List<LeaveRequest>> fetchMyLeaveRequests({int? year}) =>
      _withSession((token) => _api.fetchMyLeaveRequests(token, year: year));

  Future<LeaveRequest> cancelLeaveRequest(String requestId) =>
      _withSession((token) => _api.cancelLeaveRequest(token, requestId));

  Future<List<ApprovalItem>> fetchApprovals() =>
      _withSession(_api.fetchApprovals);

  Future<void> decideApproval(
    String stepId,
    ApprovalDecision decision, {
    String? comment,
  }) => _withSession(
    (token) => _api.decideApproval(token, stepId, decision, comment: comment),
  );

  Future<HolidayYear> fetchMyHolidays(int year) =>
      _withSession((token) => _api.fetchMyHolidays(token, year: year));

  // ── Attendance ────────────────────────────────────────────────────────────
  // Same refresh-once rule as leave. A 401 on a punch means the server did
  // not record it, so retrying cannot punch twice.

  Future<MyAttendanceToday> fetchMyAttendanceToday() =>
      _withSession(_api.fetchMyAttendanceToday);

  Future<MyAttendanceToday> punch({
    PunchLocation? location,
    PunchSelfie? selfie,
    String? clientId,
    DateTime? punchedAt,
  }) => _withSession(
    (token) => _api.punch(
      token,
      location: location,
      selfie: selfie,
      clientId: clientId,
      punchedAt: punchedAt,
    ),
  );

  Future<AttendanceRange> fetchMyAttendance({
    required DateTime from,
    required DateTime to,
  }) => _withSession(
    (token) => _api.fetchMyAttendance(token, from: from, to: to),
  );

  Future<List<Regularization>> fetchMyRegularizations() =>
      _withSession(_api.fetchMyRegularizations);

  Future<Regularization> requestRegularization(RegularizationDraft draft) =>
      _withSession((token) => _api.requestRegularization(token, draft));

  Future<Regularization> cancelRegularization(String regularizationId) =>
      _withSession(
        (token) => _api.cancelRegularization(token, regularizationId),
      );

  // ── Teams ─────────────────────────────────────────────────────────────────

  Future<TeamDay> fetchTeamDay(DateTime date) =>
      _withSession((token) => _api.fetchTeamDay(token, date: date));

  Future<LeaveCalendar> fetchLeaveCalendar({
    required DateTime from,
    required DateTime to,
  }) => _withSession(
    (token) => _api.fetchLeaveCalendar(token, from: from, to: to),
  );

  // ── Documents and lifecycle ───────────────────────────────────────────────
  // Same refresh-once rule. A 401 on a resignation means it was not saved.

  Future<List<EmployeeDocument>> fetchMyDocuments() =>
      _withSession(_api.fetchMyDocuments);

  Future<FileDownload> downloadDocument(String documentId) =>
      _withSession((token) => _api.downloadDocument(token, documentId));

  Future<FileDownload> fetchMyServiceBook(LetterLanguage language) =>
      _withSession(
        (token) => _api.fetchMyServiceBook(token, language: language),
      );

  Future<List<Separation>> fetchMySeparations() =>
      _withSession(_api.fetchMySeparations);

  Future<Separation> resign(ResignationDraft draft) =>
      _withSession((token) => _api.resign(token, draft));

  Future<Separation> cancelSeparation(String separationId) =>
      _withSession((token) => _api.cancelSeparation(token, separationId));

  /// Runs [call] with the stored access token.
  ///
  /// On a 401 it calls `/auth/refresh` once and retries with the new access
  /// token. If the refresh is rejected, or the retry is still a 401, the user
  /// is signed out (back to login) and [SessionExpiredException] is thrown.
  /// A network failure during the refresh is rethrown instead, so the user
  /// can retry without signing in again.
  ///
  /// Each call that goes through bumps [apiContactProvider].
  Future<T> _withSession<T>(Future<T> Function(String accessToken) call) async {
    final session = state;
    final tokens = await _tokens.read();
    if (tokens == null) return _expire();

    try {
      final result = await call(tokens.accessToken);
      _reached();
      return result;
    } on ApiException catch (error) {
      if (!error.isUnauthorized) rethrow;
    }
    // Signed out, or signed in as someone else, while the call ran: it must
    // not be retried with the new session.
    if (!identical(state, session)) throw const SessionExpiredException();

    final AuthTokens refreshed;
    try {
      refreshed = await _refreshAfter(tokens);
    } on ApiException catch (error) {
      if (error.kind == ApiErrorKind.network) rethrow;
      return _expire();
    }

    try {
      final result = await call(refreshed.accessToken);
      _reached();
      return result;
    } on ApiException catch (error) {
      if (error.isUnauthorized) return _expire();
      rethrow;
    }
  }

  /// Tokens to retry with after [stale] got a 401: the ones another call has
  /// already refreshed to, or a refresh shared by every call that needs one.
  Future<AuthTokens> _refreshAfter(AuthTokens stale) async {
    if (_refreshing case final refreshing?) return refreshing;
    final current = await _tokens.read();
    if (current != null && current.accessToken != stale.accessToken) {
      return current;
    }
    return _refreshing ??= () async {
      try {
        final refreshed = await _api.refresh(stale.refreshToken);
        await _tokens.write(refreshed);
        return refreshed;
      } finally {
        _refreshing = null;
      }
    }();
  }

  void _reached() => ref.read(apiContactProvider.notifier).bump();

  /// Signs out, unless that has already happened (calls that fail together
  /// end the session once), and throws [SessionExpiredException].
  Future<Never> _expire() async {
    if (state is SignedIn) await signOut(sessionExpired: true);
    throw const SessionExpiredException();
  }
}

/// The signed-in tenant's plan, features and access state.
final tenantAccessProvider = FutureProvider.autoDispose<TenantAccessView>(
  (ref) {
    if (ref.watch(authProvider) is! SignedIn) {
      throw const SessionExpiredException();
    }
    return ref.read(authProvider.notifier).fetchTenantAccess();
  },
  // Retries go through the refresh logic above, not Riverpod's backoff.
  retry: (retryCount, error) => null,
);
