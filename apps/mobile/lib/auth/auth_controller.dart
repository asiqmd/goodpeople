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

class AuthController extends Notifier<AuthState> {
  GoodPeopleApi get _api => ref.read(goodPeopleApiProvider);
  TokenStore get _tokens => ref.read(tokenStoreProvider);

  @override
  AuthState build() => const SignedOut();

  /// Signs in and stores the tokens. Throws [ApiException] on failure.
  Future<void> signIn({
    required String workspace,
    required String email,
    required String password,
  }) async {
    final response = await _api.login(
      tenant: workspace.trim().toLowerCase(),
      email: email.trim(),
      password: password,
    );
    await _tokens.write(response.tokens);
    state = SignedIn(user: response.user, tenant: response.tenant);
  }

  Future<void> signOut({bool sessionExpired = false}) async {
    await _tokens.clear();
    state = SignedOut(sessionExpired: sessionExpired);
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
  }) => _withSession(
    (token) => _api.punch(token, location: location, selfie: selfie),
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
  Future<T> _withSession<T>(Future<T> Function(String accessToken) call) async {
    final tokens = await _tokens.read();
    if (tokens == null) return _expire();

    try {
      return await call(tokens.accessToken);
    } on ApiException catch (error) {
      if (!error.isUnauthorized) rethrow;
    }

    final AuthTokens refreshed;
    try {
      refreshed = await _api.refresh(tokens.refreshToken);
    } on ApiException catch (error) {
      if (error.kind == ApiErrorKind.network) rethrow;
      return _expire();
    }
    await _tokens.write(refreshed);

    try {
      return await call(refreshed.accessToken);
    } on ApiException catch (error) {
      if (error.isUnauthorized) return _expire();
      rethrow;
    }
  }

  Future<Never> _expire() async {
    await signOut(sessionExpired: true);
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
