import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/api_models.dart';
import '../auth/auth_controller.dart';

/// Today in the device's time zone, as UTC midnight like the API's calendar
/// dates. Tests override it so "this year" and "has it started" are fixed.
final todayProvider = Provider.autoDispose<DateTime>((ref) {
  final now = DateTime.now();
  return DateTime.utc(now.year, now.month, now.day);
});

/// The year the Leave screen shows balances, requests and holidays for:
/// this year or next. Back to this year each time the screen opens.
final leaveYearProvider =
    NotifierProvider.autoDispose<LeaveYearController, int>(
      LeaveYearController.new,
    );

class LeaveYearController extends Notifier<int> {
  @override
  int build() => ref.watch(todayProvider).year;

  void select(int year) => state = year;
}

/// The signed-in employee's balance per leave type for a year.
///
/// `null` means a 404: no employee record is linked to this login (usual
/// for tenant admins), as on the profile screen.
final leaveBalancesProvider = FutureProvider.autoDispose
    .family<List<LeaveBalance>?, int>((ref, year) {
      _requireSession(ref);
      return _nullIfNoEmployee(
        ref.read(authProvider.notifier).fetchMyLeaveBalances(year),
      );
    }, retry: _noRetry);

/// Every leave type, for the apply form. The form shows only active ones.
final leaveTypesProvider = FutureProvider.autoDispose<List<LeaveType>>((ref) {
  _requireSession(ref);
  return ref.read(authProvider.notifier).fetchLeaveTypes();
}, retry: _noRetry);

/// The signed-in employee's own requests for a year, newest first. `null`
/// for a 404 (no employee record).
final myLeaveRequestsProvider = FutureProvider.autoDispose
    .family<List<LeaveRequest>?, int>((ref, year) {
      _requireSession(ref);
      return _nullIfNoEmployee(
        ref.read(authProvider.notifier).fetchMyLeaveRequests(year: year),
      );
    }, retry: _noRetry);

/// The signed-in employee's holiday calendar for a year. `null` for a 404:
/// the workspace has no holiday calendar yet.
final myHolidaysProvider = FutureProvider.autoDispose.family<HolidayYear?, int>(
  (ref, year) {
    _requireSession(ref);
    return _nullIfNoEmployee(
      ref.read(authProvider.notifier).fetchMyHolidays(year),
    );
  },
  retry: _noRetry,
);

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
