import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_models.dart';
import '../auth/auth_controller.dart';

/// Approval steps waiting for the signed-in user: leave requests,
/// attendance corrections and resignations. Usually empty for workers; the
/// Leave and Attendance screens show their Approvals tab only when it is
/// not.
final approvalsProvider = FutureProvider.autoDispose<List<ApprovalItem>>(
  (ref) {
    if (ref.watch(authProvider) is! SignedIn) {
      throw const SessionExpiredException();
    }
    return ref.read(authProvider.notifier).fetchApprovals();
  },
  // Retries go through the refresh logic in AuthController, not Riverpod's
  // backoff.
  retry: (retryCount, error) => null,
);
