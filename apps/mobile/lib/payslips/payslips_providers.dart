import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_models.dart';
import '../auth/auth_controller.dart';

/// The signed-in employee's published payslips, newest first. Empty for a
/// login with no employee record (usual for tenant admins).
final myPayslipsProvider = FutureProvider.autoDispose<List<PayslipSummary>>(
  (ref) {
    // Rebuilds when the session changes, and fails once it has ended, like
    // [tenantAccessProvider].
    if (ref.watch(authProvider) is! SignedIn) {
      throw const SessionExpiredException();
    }
    return ref.read(authProvider.notifier).fetchMyPayslips();
  },
  // Retries go through the refresh logic in AuthController, not Riverpod's
  // backoff.
  retry: (retryCount, error) => null,
);
