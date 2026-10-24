import 'package:flutter/material.dart';

import '../api/api_exception.dart';
import '../api/api_models.dart';
import '../l10n/app_localizations.dart';
import '../leave/leave_widgets.dart';
import '../ui/error_text.dart';
import '../ui/format.dart';
import '../ui/theme.dart';
import 'location_service.dart';

/// The zone the approvals inbox shows a day's punches in. Inbox items carry
/// no time zone; Good People's work locations are in Bangladesh.
const inboxTimeZone = 'Asia/Dhaka';

/// A shift's name, in Bangla when HR entered one.
String shiftName(AppLocalizations l10n, ShiftRef shift) =>
    localizedName(l10n, shift.name, shift.nameBn);

/// `8:00 AM – 5:00 PM`.
String shiftTimesText(AppLocalizations l10n, ShiftRef shift) =>
    '${clockText(l10n, shift.startTime)} – ${clockText(l10n, shift.endTime)}';

/// [time] in the UI language, for example `8:05 AM`.
String clockText(AppLocalizations l10n, ClockTime time) =>
    formatClock(l10n, time.hour, time.minute);

/// The times a missed-punch correction asks for: `In 8:05 AM · Out 5:40 PM`,
/// either one alone, or `null` when it has none (on-duty days).
String? correctionTimesText(AppLocalizations l10n, Regularization request) {
  final parts = [
    if (request.inTime case final time?)
      l10n.correctionInAt(clockText(l10n, time)),
    if (request.outTime case final time?)
      l10n.correctionOutAt(clockText(l10n, time)),
  ];
  return parts.isEmpty ? null : parts.join(' · ');
}

/// First in to last out, for example `7:55 AM – 5:10 PM`, `7:55 AM – …` for
/// a day with only an in-punch, or `null` with no punches.
String? dayPunchesText(AppLocalizations l10n, AttendanceDay day, String? zone) {
  final (firstIn, lastOut) = (day.firstIn, day.lastOut);
  if (firstIn == null) return null;
  final start = formatInstantClock(l10n, firstIn, zone);
  return lastOut == null
      ? '$start – …'
      : '$start – ${formatInstantClock(l10n, lastOut, zone)}';
}

/// User-facing text for an attendance error: a localized message for the
/// API's refusal codes, else what [describeError] says (the API's own
/// message for other server errors).
///
/// For `outside_geofence` the distance is worked out from [location] and
/// [geofence], the same way the API does, when both are known.
String attendanceErrorText(
  AppLocalizations l10n,
  Object error, {
  PunchLocation? location,
  Geofence? geofence,
}) {
  if (error is LocationUnavailable) {
    return locationProblemText(l10n, error.problem);
  }
  if (error is ApiException && error.kind == ApiErrorKind.server) {
    switch (error.code) {
      case 'outside_geofence':
        if (location != null && geofence != null) {
          return l10n.punchErrorOutsideGeofence(
            formatNumber(l10n, geofence.distanceTo(location).round()),
            formatNumber(l10n, geofence.radiusM.round()),
          );
        }
        return l10n.punchErrorOutsideArea;
      case 'location_required':
        return l10n.punchErrorLocationRequired;
      case 'no_geofence':
        return l10n.punchBlockedNoGeofence;
      case 'self_punch_disabled':
        return l10n.punchBlockedDisabled;
      case 'too_soon':
        return l10n.punchErrorTooSoon;
      case 'separated':
        return l10n.punchErrorSeparated;
      case 'future_day':
        return l10n.correctionErrorFutureDay;
      case 'outside_window':
        return l10n.correctionErrorOutsideWindow;
      case 'not_tracked':
        return l10n.correctionErrorNotTracked;
      case 'wrong_day':
        return l10n.correctionErrorWrongDay;
      case 'future_punch':
        return l10n.correctionErrorFuturePunch;
      case 'already_pending':
        return l10n.correctionErrorAlreadyPending;
      case 'not_pending':
        return l10n.correctionErrorNotPending;
    }
  }
  return describeError(l10n, error);
}

String locationProblemText(AppLocalizations l10n, LocationProblem problem) =>
    switch (problem) {
      LocationProblem.servicesOff => l10n.locationServicesOff,
      LocationProblem.permissionDenied => l10n.locationPermissionDenied,
      LocationProblem.permissionDeniedForever => l10n.locationPermissionBlocked,
      LocationProblem.timeout => l10n.locationTimeout,
      LocationProblem.failed => l10n.locationFailed,
    };

/// The pill for a day's [status].
class AttendanceStatusPill extends StatelessWidget {
  const AttendanceStatusPill({super.key, required this.status});

  final AttendanceStatus status;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    final warning = StatusColors.of(context);
    final (background, foreground) = switch (status) {
      AttendanceStatus.present => (
        scheme.primaryContainer,
        scheme.onPrimaryContainer,
      ),
      AttendanceStatus.halfDay || AttendanceStatus.missingPunch => (
        warning.warningContainer,
        warning.onWarningContainer,
      ),
      AttendanceStatus.absent => (
        scheme.errorContainer,
        scheme.onErrorContainer,
      ),
      AttendanceStatus.onLeave => (
        scheme.secondaryContainer,
        scheme.onSecondaryContainer,
      ),
      AttendanceStatus.off ||
      AttendanceStatus.pending ||
      AttendanceStatus.unknown => (
        scheme.surfaceContainerHighest,
        scheme.onSurfaceVariant,
      ),
    };
    return LeavePill(
      label: l10n.attendanceStatusName(status.wire),
      background: background,
      foreground: foreground,
    );
  }
}

/// The pill for a correction's [status]: the same colours and words as a
/// leave request's.
class RegularizationStatusPill extends StatelessWidget {
  const RegularizationStatusPill({super.key, required this.status});

  final RegularizationStatus status;

  @override
  Widget build(BuildContext context) =>
      LeavePill.status(context, LeaveRequestStatus.fromWire(status.wire));
}

/// Small marks on a day: late, left early, overtime, corrected and so on.
/// Renders nothing when there are none.
class DayBadges extends StatelessWidget {
  const DayBadges({super.key, required this.day});

  final AttendanceDay day;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    final warning = StatusColors.of(context);
    final badges = <Widget>[
      if (day.lateMinutes > 0 || day.flags.contains(AttendanceFlag.late))
        LeavePill(
          label: day.lateMinutes > 0
              ? l10n.attendanceLateBy(formatMinutes(l10n, day.lateMinutes))
              : l10n.attendanceFlagName(AttendanceFlag.late.wire),
          background: warning.warningContainer,
          foreground: warning.onWarningContainer,
        ),
      if (day.earlyOutMinutes > 0 ||
          day.flags.contains(AttendanceFlag.earlyOut))
        LeavePill(
          label: day.earlyOutMinutes > 0
              ? l10n.attendanceEarlyOutBy(
                  formatMinutes(l10n, day.earlyOutMinutes),
                )
              : l10n.attendanceFlagName(AttendanceFlag.earlyOut.wire),
          background: warning.warningContainer,
          foreground: warning.onWarningContainer,
        ),
      if (day.overtimeMinutes > 0)
        LeavePill(
          label: l10n.attendanceOvertimeBy(
            formatMinutes(l10n, day.overtimeMinutes),
          ),
          background: scheme.tertiaryContainer,
          foreground: scheme.onTertiaryContainer,
        ),
      for (final flag in [
        AttendanceFlag.overDailyLimit,
        AttendanceFlag.outsideGeofence,
      ])
        if (day.flags.contains(flag))
          LeavePill(
            label: l10n.attendanceFlagName(flag.wire),
            background: scheme.errorContainer,
            foreground: scheme.onErrorContainer,
          ),
      for (final flag in [AttendanceFlag.onDuty, AttendanceFlag.regularized])
        if (day.flags.contains(flag))
          LeavePill(
            label: l10n.attendanceFlagName(flag.wire),
            background: scheme.secondaryContainer,
            foreground: scheme.onSecondaryContainer,
          ),
      if (day.regularization case final correction?
          when correction.status == RegularizationStatus.pending)
        LeavePill(
          label: l10n.attendanceCorrectionStatus(
            l10n.leaveStatusName(correction.status.wire),
          ),
          background: warning.warningContainer,
          foreground: warning.onWarningContainer,
        ),
    ];
    if (badges.isEmpty) return const SizedBox.shrink();
    return Wrap(spacing: 6, runSpacing: 6, children: badges);
  }
}
