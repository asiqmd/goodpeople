import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/api_models.dart';
import '../auth/auth_controller.dart';

/// The signed-in user's own employee record, from `/tenant/me/employee`.
///
/// `null` means the API answered 404: no employee record is linked to this
/// login. Tenant admins usually have none, so the profile screen shows an
/// empty state for it instead of an error. A 401 goes through the same
/// refresh-once flow as [tenantAccessProvider].
final myEmployeeProvider = FutureProvider.autoDispose<EmployeeDetail?>(
  (ref) async {
    if (ref.watch(authProvider) is! SignedIn) {
      throw const SessionExpiredException();
    }
    try {
      return await ref.read(authProvider.notifier).fetchMyEmployee();
    } on ApiException catch (error) {
      if (error.statusCode == 404) return null;
      rethrow;
    }
  },
  // Retries go through the refresh logic in AuthController, not Riverpod's
  // backoff.
  retry: (retryCount, error) => null,
);
