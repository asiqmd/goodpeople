import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/api_models.dart';
import '../auth/auth_controller.dart';
import '../leave/leave_providers.dart';

/// Everyone's attendance on a day that the signed-in user may see: HR
/// everyone, anyone else themselves, their reports and their unit.
///
/// `null` means a 404: no employee record is linked to this login, and it
/// is not HR.
final teamDayProvider = FutureProvider.autoDispose.family<TeamDay?, DateTime>((
  ref,
  date,
) {
  _requireSession(ref);
  return _nullIfNoEmployee(ref.read(authProvider.notifier).fetchTeamDay(date));
}, retry: _noRetry);

/// How many days of leave the Team screen looks ahead, today included.
const teamLeaveDays = 7;

/// Pending and approved leave of the same people, for [teamLeaveDays] from
/// a day. `null` for a 404, as [teamDayProvider].
final teamLeaveProvider = FutureProvider.autoDispose
    .family<LeaveCalendar?, DateTime>((ref, from) {
      _requireSession(ref);
      return _nullIfNoEmployee(
        ref
            .read(authProvider.notifier)
            .fetchLeaveCalendar(
              from: from,
              to: from.add(const Duration(days: teamLeaveDays - 1)),
            ),
      );
    }, retry: _noRetry);

/// Whether the home screen offers the Team screen.
///
/// Only with attendance in the plan. Staff roles see everyone, so they
/// always have a team. Anyone else has one when today's team view has
/// someone besides themselves: the API always includes the person, so a
/// worker on their own would get a screen with just them.
final hasTeamProvider = Provider.autoDispose<bool>((ref) {
  final session = ref.watch(authProvider);
  if (session is! SignedIn) return false;
  final access = ref.watch(tenantAccessProvider).value;
  if (access == null || !access.access.hasFeature('attendance')) return false;
  if (session.user.role.isStaff) return true;
  final today = ref.watch(todayProvider);
  return switch (ref.watch(teamDayProvider(today))) {
    AsyncData(value: final TeamDay day) => day.rows.length > 1,
    _ => false,
  };
});

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
