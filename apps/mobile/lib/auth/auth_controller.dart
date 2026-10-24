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
