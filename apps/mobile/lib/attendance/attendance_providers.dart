import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/api_models.dart';
import '../auth/auth_controller.dart';

/// The signed-in employee's day: shift, punches and whether they can punch
/// from the app.
///
/// `null` means a 404: no employee record is linked to this login (usual
/// for tenant admins), as on the profile screen. A punch answers with the
/// whole day, which [AttendanceTodayController.show] puts in place without
/// another call.
final attendanceTodayProvider =
    AsyncNotifierProvider.autoDispose<
      AttendanceTodayController,
      MyAttendanceToday?
    >(AttendanceTodayController.new, retry: _noRetry);

class AttendanceTodayController extends AsyncNotifier<MyAttendanceToday?> {
  @override
  Future<MyAttendanceToday?> build() {
    _requireSession(ref);
    return _nullIfNoEmployee(
      ref.read(authProvider.notifier).fetchMyAttendanceToday(),
    );
  }

  /// Shows [today], for example the day a punch answered with.
  void show(MyAttendanceToday today) => state = AsyncData(today);
}

/// A range of days to load, at most 62 days long.
typedef AttendancePeriod = ({DateTime from, DateTime to});

/// The month that [today] is in, up to [today]: what the "This month" tab
/// shows. Later days would only be projections.
AttendancePeriod monthSoFar(DateTime today) =>
    (from: DateTime.utc(today.year, today.month), to: today);

/// The signed-in employee's days and totals for a period. `null` for a 404
/// (no employee record).
final myAttendanceProvider = FutureProvider.autoDispose
    .family<AttendanceRange?, AttendancePeriod>((ref, period) {
      _requireSession(ref);
      return _nullIfNoEmployee(
        ref
            .read(authProvider.notifier)
            .fetchMyAttendance(from: period.from, to: period.to),
      );
    }, retry: _noRetry);

/// The signed-in employee's corrections, newest day first. `null` for a 404
/// (no employee record).
final myRegularizationsProvider =
    FutureProvider.autoDispose<List<Regularization>?>((ref) {
      _requireSession(ref);
      return _nullIfNoEmployee(
        ref.read(authProvider.notifier).fetchMyRegularizations(),
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
