import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_models.dart';
import '../auth/auth_controller.dart';
import '../l10n/app_localizations.dart';
import '../leave/leave_providers.dart';
import '../leave/leave_widgets.dart';
import '../ui/format.dart';
import '../ui/load_error_view.dart';
import 'attendance_providers.dart';
import 'attendance_widgets.dart';

/// This month so far: the totals, then each day, newest first. Weekly offs
/// and holidays are muted. Tapping a day opens the correction form for it.
class MonthTab extends ConsumerWidget {
  const MonthTab({super.key, required this.onCorrect});

  /// Opens the correction form for a day.
  final ValueChanged<AttendanceDay> onCorrect;

  static const totalsKey = ValueKey('attendance-month-totals');

  static ValueKey<String> dayKey(DateTime date) =>
      ValueKey('attendance-day-${toWireDate(date)}');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final today = ref.watch(todayProvider);
    final period = monthSoFar(today);
    final range = ref.watch(myAttendanceProvider(period));

    return RefreshIndicator(
      onRefresh: () =>
          awaitRefresh(ref.refresh(myAttendanceProvider(period).future)),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          switch (range) {
            AsyncData(value: final AttendanceRange view) => _Month(
              view: view,
              month: period.from,
              today: today,
              onCorrect: onCorrect,
            ),
            AsyncData() => LeaveEmptyState(
              icon: Icons.badge_outlined,
              title: l10n.leaveNoEmployeeTitle,
              message: l10n.attendanceNoEmployeeBody,
            ),
            AsyncError(:final error)
                when !range.isLoading && error is! SessionExpiredException =>
              LoadErrorView(
                title: l10n.attendanceLoadFailed,
                error: error,
                onRetry: () => ref.invalidate(myAttendanceProvider(period)),
              ),
            _ => const LeaveLoading(),
          },
        ],
      ),
    );
  }
}

class _Month extends StatelessWidget {
  const _Month({
    required this.view,
    required this.month,
    required this.today,
    required this.onCorrect,
  });

  final AttendanceRange view;
  final DateTime month;
  final DateTime today;
  final ValueChanged<AttendanceDay> onCorrect;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final days = [
      for (final day in view.days.reversed)
        if (!day.date.isAfter(today)) day,
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 12,
      children: [
        Semantics(
          header: true,
          child: Text(
            formatMonth(l10n, month),
            style: theme.textTheme.titleMedium,
          ),
        ),
        _Totals(totals: view.totals),
        if (days.isEmpty)
          LeaveEmptyState(
            icon: Icons.event_note_outlined,
            message: l10n.attendanceMonthEmpty,
          )
        else
          Card.outlined(
            margin: EdgeInsets.zero,
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: [
                for (final (index, day) in days.indexed) ...[
                  if (index > 0) const Divider(height: 1),
                  _DayRow(
                    key: MonthTab.dayKey(day.date),
                    day: day,
                    timeZone: view.timeZone,
                    onTap: () => onCorrect(day),
                  ),
                ],
              ],
            ),
          ),
      ],
    );
  }
}

class _Totals extends StatelessWidget {
  const _Totals({required this.totals});

  final AttendanceTotals totals;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    String count(int value) => formatNumber(l10n, value);

    return Card.filled(
      key: MonthTab.totalsKey,
      margin: EdgeInsets.zero,
      color: scheme.surfaceContainerLow,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Wrap(
          spacing: 24,
          runSpacing: 12,
          children: [
            for (final (status, value) in [
              (AttendanceStatus.present, totals.present),
              (AttendanceStatus.halfDay, totals.halfDay),
              (AttendanceStatus.absent, totals.absent),
              (AttendanceStatus.onLeave, totals.onLeave),
              (AttendanceStatus.missingPunch, totals.missingPunch),
            ])
              LeaveFact(
                label: l10n.attendanceStatusName(status.wire),
                value: count(value),
              ),
            LeaveFact(
              label: l10n.attendanceFlagName(AttendanceFlag.late.wire),
              value: count(totals.late),
            ),
            LeaveFact(
              label: l10n.attendanceWorked,
              value: formatMinutes(l10n, totals.workedMinutes),
            ),
            LeaveFact(
              label: l10n.attendanceOvertime,
              value: formatMinutes(l10n, totals.overtimeMinutes),
            ),
          ],
        ),
      ),
    );
  }
}

class _DayRow extends StatelessWidget {
  const _DayRow({
    super.key,
    required this.day,
    required this.timeZone,
    required this.onTap,
  });

  final AttendanceDay day;
  final String timeZone;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final muted = day.isOffDay;
    final secondary = theme.textTheme.bodySmall?.copyWith(
      color: scheme.onSurfaceVariant,
    );
    final punches = dayPunchesText(l10n, day, timeZone);
    final hours = [
      ?punches,
      if (day.workedMinutes > 0) formatMinutes(l10n, day.workedMinutes),
    ].join(' · ');
    final offDayText = switch (day.dayType) {
      DayType.holiday => switch (day.holidayName) {
        final name? when name.isNotEmpty => name,
        _ => l10n.dayTypeName(day.dayType.wire),
      },
      DayType.weeklyOff => l10n.dayTypeName(day.dayType.wire),
      _ => null,
    };

    return Semantics(
      button: true,
      hint: l10n.attendanceCorrectDay,
      child: Ink(
        color: muted ? scheme.surfaceContainerLow : null,
        child: InkWell(
          onTap: onTap,
          child: MergeSemantics(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 88,
                    child: Text(
                      formatWeekdayDate(l10n, day.date),
                      style: theme.textTheme.titleSmall?.copyWith(
                        color: muted ? scheme.onSurfaceVariant : null,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      spacing: 4,
                      children: [
                        AttendanceStatusPill(status: day.status),
                        if (offDayText != null)
                          Text(offDayText, style: secondary),
                        if (day.leave case final leave?)
                          Text(
                            l10n.attendanceLeaveCode(leave.code),
                            style: secondary,
                          ),
                        if (hours.isNotEmpty)
                          Text(
                            hours,
                            style: theme.textTheme.bodyMedium?.copyWith(
                              color: muted ? scheme.onSurfaceVariant : null,
                            ),
                          ),
                        DayBadges(day: day),
                      ],
                    ),
                  ),
                  Icon(Icons.edit_calendar_outlined, color: scheme.outline),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
