import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_models.dart';
import '../attendance/attendance_widgets.dart';
import '../auth/auth_controller.dart';
import '../l10n/app_localizations.dart';
import '../leave/leave_providers.dart';
import '../leave/leave_widgets.dart';
import '../ui/format.dart';
import '../ui/language_menu.dart';
import '../ui/load_error_view.dart';
import 'team_providers.dart';

/// Today for the people the signed-in user looks after: how each one's day
/// stands, and who is on leave this week.
///
/// The API decides who is in it: a manager's reports and unit, or everyone
/// for HR. The status chips filter the list.
class TeamScreen extends ConsumerStatefulWidget {
  const TeamScreen({super.key});

  static const leaveSectionKey = ValueKey('team-leave');
  static const emptyKey = ValueKey('team-empty');

  static ValueKey<String> rowKey(String employeeId) =>
      ValueKey('team-row-$employeeId');
  static ValueKey<String> filterKey(AttendanceStatus? status) =>
      ValueKey('team-filter-${status?.wire ?? 'all'}');
  static ValueKey<String> leaveKey(String requestId) =>
      ValueKey('team-leave-$requestId');

  static Route<void> route() =>
      MaterialPageRoute(builder: (context) => const TeamScreen());

  @override
  ConsumerState<TeamScreen> createState() => _TeamScreenState();
}

class _TeamScreenState extends ConsumerState<TeamScreen> {
  /// Only people with this status; everyone when `null`.
  AttendanceStatus? _filter;

  /// The order of the status chips: what a manager looks for first.
  static const _statusOrder = [
    AttendanceStatus.present,
    AttendanceStatus.pending,
    AttendanceStatus.absent,
    AttendanceStatus.missingPunch,
    AttendanceStatus.halfDay,
    AttendanceStatus.onLeave,
    AttendanceStatus.off,
    AttendanceStatus.unknown,
  ];

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final today = ref.watch(todayProvider);
    final day = ref.watch(teamDayProvider(today));
    final showLeave =
        ref.watch(tenantAccessProvider).value?.access.hasFeature('leave') ??
        false;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.teamTitle),
        actions: const [LanguageMenuButton()],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () => Future.wait([
            awaitRefresh(ref.refresh(teamDayProvider(today).future)),
            if (showLeave)
              awaitRefresh(ref.refresh(teamLeaveProvider(today).future)),
          ]),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: [
              Text(
                formatDayHeading(l10n, today),
                style: Theme.of(context).textTheme.titleMedium,
              ),
              const SizedBox(height: 12),
              switch (day) {
                AsyncData(value: final TeamDay view) => _dayView(view),
                AsyncData() => LeaveEmptyState(
                  key: TeamScreen.emptyKey,
                  icon: Icons.badge_outlined,
                  title: l10n.leaveNoEmployeeTitle,
                  message: l10n.teamNoEmployeeBody,
                ),
                AsyncError(:final error)
                    when !day.isLoading && error is! SessionExpiredException =>
                  LoadErrorView(
                    title: l10n.teamLoadFailed,
                    error: error,
                    onRetry: () => ref.invalidate(teamDayProvider(today)),
                  ),
                _ => const LeaveLoading(),
              },
              if (showLeave) ...[
                const SizedBox(height: 24),
                _LeaveSection(from: today),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _dayView(TeamDay view) {
    final l10n = AppLocalizations.of(context);
    final filter = _filter;
    final rows = [
      for (final row in view.rows)
        if (filter == null || row.day.status == filter) row,
    ];
    final statuses = [
      for (final status in _statusOrder)
        if ((view.counts[status] ?? 0) > 0) status,
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 12,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            ChoiceChip(
              key: TeamScreen.filterKey(null),
              label: Text(
                '${l10n.teamAll} · ${formatNumber(l10n, view.rows.length)}',
              ),
              selected: filter == null,
              onSelected: (_) => setState(() => _filter = null),
            ),
            for (final status in statuses)
              ChoiceChip(
                key: TeamScreen.filterKey(status),
                label: Text(
                  '${l10n.attendanceStatusName(status.wire)} · '
                  '${formatNumber(l10n, view.counts[status]!)}',
                ),
                selected: filter == status,
                onSelected: (selected) =>
                    setState(() => _filter = selected ? status : null),
              ),
          ],
        ),
        if (rows.isEmpty)
          LeaveEmptyState(
            key: TeamScreen.emptyKey,
            icon: Icons.groups_outlined,
            message: l10n.teamEmpty,
          )
        else
          Card.outlined(
            margin: EdgeInsets.zero,
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: [
                for (final (index, row) in rows.indexed) ...[
                  if (index > 0) const Divider(height: 1),
                  _TeamRow(key: TeamScreen.rowKey(row.employee.id), row: row),
                ],
              ],
            ),
          ),
      ],
    );
  }
}

/// One person: name and code, first in to last out, and the day's status.
class _TeamRow extends StatelessWidget {
  const _TeamRow({super.key, required this.row});

  final TeamDayRow row;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final day = row.day;
    final details = [
      row.employee.employeeCode,
      ?dayPunchesText(l10n, day, row.timeZone),
      if (day.lateMinutes > 0)
        l10n.attendanceLateBy(formatMinutes(l10n, day.lateMinutes)),
    ];

    return MergeSemantics(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    localizedName(
                      l10n,
                      row.employee.fullName,
                      row.employee.fullNameBn,
                    ),
                    style: theme.textTheme.titleSmall,
                  ),
                  Text(
                    details.join(' · '),
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            AttendanceStatusPill(status: day.status),
          ],
        ),
      ),
    );
  }
}

/// Who is on leave from [from] for [teamLeaveDays], pending requests
/// included.
class _LeaveSection extends ConsumerWidget {
  const _LeaveSection({required this.from});

  final DateTime from;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final calendar = ref.watch(teamLeaveProvider(from));

    return Column(
      key: TeamScreen.leaveSectionKey,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 8,
      children: [
        Semantics(
          header: true,
          child: Text(l10n.teamOnLeave, style: theme.textTheme.titleMedium),
        ),
        switch (calendar) {
          AsyncData(value: LeaveCalendar(:final entries))
              when entries.isEmpty =>
            Text(
              l10n.teamNoLeave,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          AsyncData(value: LeaveCalendar(:final entries)) => Card.outlined(
            margin: EdgeInsets.zero,
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: [
                for (final (index, entry) in entries.indexed) ...[
                  if (index > 0) const Divider(height: 1),
                  _LeaveRow(entry: entry),
                ],
              ],
            ),
          ),
          // No employee record: the day above already says so.
          AsyncData() => const SizedBox.shrink(),
          AsyncError(:final error)
              when !calendar.isLoading && error is! SessionExpiredException =>
            LoadErrorView(
              title: l10n.teamLeaveLoadFailed,
              error: error,
              onRetry: () => ref.invalidate(teamLeaveProvider(from)),
            ),
          _ => const LeaveLoading(),
        },
      ],
    );
  }
}

class _LeaveRow extends StatelessWidget {
  const _LeaveRow({required this.entry});

  final LeaveCalendarEntry entry;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final type = entry.leaveType;

    return MergeSemantics(
      child: Padding(
        key: TeamScreen.leaveKey(entry.requestId),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    entry.employee.fullName,
                    style: theme.textTheme.titleSmall,
                  ),
                  Text(
                    '${localizedName(l10n, type.name, type.nameBn)} · '
                    '${formatDateRange(l10n, entry.startDate, entry.endDate)}',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            LeavePill.status(context, entry.status),
          ],
        ),
      ),
    );
  }
}
