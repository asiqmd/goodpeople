import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/api_models.dart';
import '../auth/auth_controller.dart';
import 'offline_timesheet_queue.dart';

/// A month's timesheet, and whether it is the copy kept on the phone because
/// the API could not be reached.
typedef TimesheetMonth = ({Timesheet sheet, bool offline});

/// The signed-in employee's timesheet for a month (UTC midnight on its first
/// day). `null` for a 404: no employee record is linked to this login.
///
/// Each answer is kept on the phone, so without a connection the last copy
/// opens instead, marked offline, and hours can still be typed.
final myTimesheetProvider = FutureProvider.autoDispose
    .family<TimesheetMonth?, DateTime>((ref, month) async {
      final userId = switch (ref.watch(authProvider)) {
        SignedIn(:final user) => user.id,
        SignedOut() => throw const SessionExpiredException(),
      };
      final store = ref.read(timesheetQueueStoreProvider);
      final key = toWireMonth(month);
      try {
        final sheet = await ref
            .read(authProvider.notifier)
            .fetchMyTimesheet(month);
        unawaited(
          store
              .saveMonth(userId, key, sheet.toJson())
              .catchError((Object _) {}),
        );
        return (sheet: sheet, offline: false);
      } on ApiException catch (error) {
        if (error.statusCode == 404) return null;
        if (error.kind == ApiErrorKind.network) {
          final kept = await store.loadMonth(userId, key);
          if (kept != null) {
            return (sheet: Timesheet.fromJson(kept), offline: true);
          }
        }
        rethrow;
      }
    }, retry: (retryCount, error) => null);

/// The first day of [date]'s month, UTC midnight.
DateTime monthOf(DateTime date) => DateTime.utc(date.year, date.month);
