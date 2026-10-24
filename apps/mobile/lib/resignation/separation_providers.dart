import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/api_models.dart';
import '../auth/auth_controller.dart';

/// The signed-in employee's resignations, and any separation HR recorded,
/// newest first.
///
/// `null` means a 404: no employee record is linked to this login (usual
/// for tenant admins), as on the profile screen.
final mySeparationsProvider = FutureProvider.autoDispose<List<Separation>?>((
  ref,
) {
  _requireSession(ref);
  return _nullIfNoEmployee(
    ref.read(authProvider.notifier).fetchMySeparations(),
  );
}, retry: _noRetry);

/// Rebuilds when the session changes, and fails once it has ended, like
/// [tenantAccessProvider].
void _requireSession(Ref ref) {
  if (ref.watch(authProvider) is! SignedIn) {
    throw const SessionExpiredException();
  }
}

Future<T?> _nullIfNoEmployee<T>(Future<T> call) async {
  try {
    return await call;
  } on ApiException catch (error) {
    if (error.statusCode == 404) return null;
    rethrow;
  }
}

/// Retries go through the refresh logic in AuthController, not Riverpod's
/// backoff.
Duration? _noRetry(int retryCount, Object error) => null;
