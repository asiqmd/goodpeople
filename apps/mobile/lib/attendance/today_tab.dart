import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/api_models.dart';
import '../auth/auth_controller.dart';
import '../l10n/app_localizations.dart';
import '../leave/leave_widgets.dart';
import '../ui/format.dart';
import '../ui/load_error_view.dart';
import '../ui/notice_card.dart';
import 'attendance_providers.dart';
import 'attendance_widgets.dart';
import 'location_service.dart';

/// Today for the signed-in employee: the shift, how the day stands, the
/// punches so far, and a Punch in / Punch out button.
///
/// With a geofence (`geofenced`) a punch needs the phone's location; when
/// it cannot be read, the tab says why and sends nothing. With `anywhere`
/// the location is sent when it can be read, and the punch goes without it
/// otherwise.
class TodayTab extends ConsumerStatefulWidget {
  const TodayTab({super.key});

  static const dayCardKey = ValueKey('attendance-today-day');
  static const punchButtonKey = ValueKey('attendance-punch');
  static const punchHintKey = ValueKey('attendance-punch-hint');
  static const blockedKey = ValueKey('attendance-punch-blocked');
  static const punchErrorKey = ValueKey('attendance-punch-error');
  static const openSettingsKey = ValueKey('attendance-open-settings');
  static const punchesKey = ValueKey('attendance-today-punches');

  static ValueKey<String> punchKey(String punchId) =>
      ValueKey('attendance-punch-$punchId');

  /// How long a punch waits for a location fix when the geofence needs it,
  /// and when it is only nice to have.
  static const requiredFixTime = Duration(seconds: 20);
  static const optionalFixTime = Duration(seconds: 8);

  @override
  ConsumerState<TodayTab> createState() => _TodayTabState();
}

class _TodayTabState extends ConsumerState<TodayTab> {
  bool _locating = false;
  bool _punching = false;

  /// Why the last punch failed: an [ApiException], a [LocationUnavailable]
  /// or anything else.
  Object? _error;

  /// The location sent with the failed punch, to say how far away it was.
  PunchLocation? _errorLocation;

  bool get _busy => _locating || _punching;

  Future<void> _punch(MyAttendanceToday today) async {
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    // Still usable if the screen closes before the calls return.
    final container = ProviderScope.containerOf(context, listen: false);
    final selfPunch = today.selfPunch;
    setState(() {
      _locating = true;
      _error = null;
      _errorLocation = null;
    });

    PunchLocation? location;
    try {
      location = await container
          .read(locationServiceProvider)
          .currentLocation(
            timeLimit: selfPunch.needsLocation
                ? TodayTab.requiredFixTime
                : TodayTab.optionalFixTime,
          );
    } on LocationUnavailable catch (problem) {
      if (selfPunch.needsLocation) {
        if (mounted) {
          setState(() {
            _locating = false;
            _error = problem;
          });
        }
        return;
      }
      // `anywhere`: punch without coordinates.
    }
    if (!mounted) return;
    setState(() {
      _locating = false;
      _punching = true;
    });

    try {
      final after = await container
          .read(authProvider.notifier)
          .punch(location: location);
      // Once the screen has closed the day is not needed; showing it would
      // only load it again.
      if (mounted) container.read(attendanceTodayProvider.notifier).show(after);
      container.invalidate(myAttendanceProvider);
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            today.nextDirection == PunchDirection.punchOut
                ? l10n.punchedOut
                : l10n.punchedIn,
          ),
        ),
      );
    } on SessionExpiredException {
      // AuthGate is already showing the login screen.
    } on Object catch (error) {
      if (mounted) {
        setState(() {
          _error = error;
          _errorLocation = location;
        });
      }
      // The workspace's settings changed since the day was loaded: reload
      // it, so the tab shows what is possible now.
      if (error is ApiException &&
          const {
            'self_punch_disabled',
            'no_geofence',
            'location_required',
          }.contains(error.code)) {
        container.invalidate(attendanceTodayProvider);
      }
    } finally {
      if (mounted) setState(() => _punching = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final today = ref.watch(attendanceTodayProvider);

    return RefreshIndicator(
      onRefresh: () =>
          awaitRefresh(ref.refresh(attendanceTodayProvider.future)),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          switch (today) {
            AsyncData(value: final MyAttendanceToday view) => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 16,
              children: [
                _DayCard(view: view),
                _punchPanel(context, view),
                _PunchList(view: view),
              ],
            ),
            AsyncData() => LeaveEmptyState(
              icon: Icons.badge_outlined,
              title: l10n.leaveNoEmployeeTitle,
              message: l10n.attendanceNoEmployeeBody,
            ),
            AsyncError(:final error)
                when !today.isLoading && error is! SessionExpiredException =>
              LoadErrorView(
                title: l10n.attendanceLoadFailed,
                error: error,
                onRetry: () => ref.invalidate(attendanceTodayProvider),
              ),
            _ => const LeaveLoading(),
          },
        ],
      ),
    );
  }

  Widget _punchPanel(BuildContext context, MyAttendanceToday today) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final selfPunch = today.selfPunch;
    final error = _error;
    final problem = switch (error) {
      LocationUnavailable(:final problem)
          when problem == LocationProblem.servicesOff ||
              problem == LocationProblem.permissionDeniedForever =>
        problem,
      _ => null,
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 8,
      children: [
        if (selfPunch.canPunch) ...[
          _PunchButton(
            direction: today.nextDirection,
            locating: _locating,
            busy: _busy,
            onPressed: () => _punch(today),
          ),
          Text(
            selfPunch.needsLocation
                ? l10n.punchGeofencedHint
                : l10n.punchAnywhereHint,
            key: TodayTab.punchHintKey,
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall?.copyWith(
              color: scheme.onSurfaceVariant,
            ),
          ),
        ] else
          NoticeCard(
            key: TodayTab.blockedKey,
            icon: Icons.block,
            message: switch (selfPunch.blockedReason) {
              SelfPunchBlock.disabled => l10n.punchBlockedDisabled,
              SelfPunchBlock.noGeofence => l10n.punchBlockedNoGeofence,
              _ when selfPunch.mode == SelfPunchMode.off =>
                l10n.punchBlockedDisabled,
              _ => l10n.punchBlockedOther,
            },
            background: scheme.surfaceContainerHigh,
            foreground: scheme.onSurface,
          ),
        if (error != null) ...[
          NoticeCard(
            key: TodayTab.punchErrorKey,
            icon: error is LocationUnavailable
                ? Icons.location_off_outlined
                : Icons.error_outline,
            message: attendanceErrorText(
              l10n,
              error,
              location: _errorLocation,
              geofence: selfPunch.geofence,
            ),
            background: scheme.errorContainer,
            foreground: scheme.onErrorContainer,
          ),
          if (problem != null)
            Align(
              alignment: AlignmentDirectional.centerEnd,
              child: TextButton.icon(
                key: TodayTab.openSettingsKey,
                onPressed: () =>
                    ref.read(locationServiceProvider).openSettings(problem),
                icon: const Icon(Icons.settings_outlined),
                label: Text(l10n.openSettings),
              ),
            ),
        ],
      ],
    );
  }
}

class _PunchButton extends StatelessWidget {
  const _PunchButton({
    required this.direction,
    required this.locating,
    required this.busy,
    required this.onPressed,
  });

  final PunchDirection direction;
  final bool locating;
  final bool busy;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final out = direction == PunchDirection.punchOut;
    final label = locating
        ? l10n.punchLocating
        : (out ? l10n.punchOut : l10n.punchIn);
    return FilledButton.icon(
      key: TodayTab.punchButtonKey,
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(64),
        textStyle: Theme.of(context).textTheme.titleMedium,
      ),
      onPressed: busy ? null : onPressed,
      icon: busy
          ? const SizedBox.square(
              dimension: 20,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : Icon(out ? Icons.logout : Icons.login),
      label: Text(label),
    );
  }
}

/// The shift, the status and the hours so far.
class _DayCard extends StatelessWidget {
  const _DayCard({required this.view});

  final MyAttendanceToday view;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final day = view.day;
    final shift = day.shift;
    final secondary = theme.textTheme.bodyMedium?.copyWith(
      color: scheme.onSurfaceVariant,
    );
    String clock(DateTime? at) =>
        at == null ? '—' : formatInstantClock(l10n, at, view.timeZone);

    return Card.outlined(
      key: TodayTab.dayCardKey,
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: 8,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        formatDayHeading(l10n, day.date),
                        style: theme.textTheme.labelLarge?.copyWith(
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                      Text(
                        shift == null
                            ? l10n.attendanceNoShift
                            : shiftName(l10n, shift),
                        style: theme.textTheme.titleMedium,
                      ),
                      if (shift != null)
                        Text(
                          shiftTimesText(l10n, shift),
                          style: theme.textTheme.bodyMedium,
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                AttendanceStatusPill(status: day.status),
              ],
            ),
            if (day.dayType == DayType.holiday)
              Text(switch (day.holidayName) {
                final name? when name.isNotEmpty => l10n.attendanceHolidayNamed(
                  name,
                ),
                _ => l10n.dayTypeName(day.dayType.wire),
              }, style: secondary)
            else if (day.dayType == DayType.weeklyOff)
              Text(l10n.dayTypeName(day.dayType.wire), style: secondary),
            if (day.leave case final leave?)
              Text(l10n.attendanceLeaveCode(leave.code), style: secondary),
            Wrap(
              spacing: 32,
              runSpacing: 8,
              children: [
                LeaveFact(
                  label: l10n.attendanceFirstIn,
                  value: clock(day.firstIn),
                ),
                LeaveFact(
                  label: l10n.attendanceLastOut,
                  value: clock(day.lastOut),
                ),
                LeaveFact(
                  label: l10n.attendanceWorked,
                  value: formatMinutes(l10n, day.workedMinutes),
                ),
              ],
            ),
            DayBadges(day: day),
          ],
        ),
      ),
    );
  }
}

/// Today's punches, oldest first, with where each came from.
class _PunchList extends StatelessWidget {
  const _PunchList({required this.view});

  final MyAttendanceToday view;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    return Column(
      key: TodayTab.punchesKey,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 8,
      children: [
        Semantics(
          header: true,
          child: Text(l10n.todaysPunches, style: theme.textTheme.titleMedium),
        ),
        if (view.punches.isEmpty)
          Text(
            l10n.noPunchesYet,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          )
        else
          Card.outlined(
            margin: EdgeInsets.zero,
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: [
                for (final (index, punch) in view.punches.indexed) ...[
                  if (index > 0) const Divider(height: 1),
                  _PunchRow(
                    key: TodayTab.punchKey(punch.id),
                    punch: punch,
                    timeZone: view.timeZone,
                  ),
                ],
              ],
            ),
          ),
      ],
    );
  }
}

IconData punchSourceIcon(PunchSource source) => switch (source) {
  PunchSource.device => Icons.fingerprint,
  PunchSource.web => Icons.language,
  PunchSource.mobile => Icons.smartphone,
  PunchSource.manual => Icons.edit_note,
  PunchSource.regularization => Icons.fact_check_outlined,
  PunchSource.unknown => Icons.radio_button_unchecked,
};

class _PunchRow extends StatelessWidget {
  const _PunchRow({super.key, required this.punch, required this.timeZone});

  final Punch punch;
  final String timeZone;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final muted = punch.voided;
    final source = [
      l10n.punchSourceName(punch.source.wire),
      if (punch.device case final device?) device.name,
    ].join(' · ');

    return MergeSemantics(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Icon(
              punchSourceIcon(punch.source),
              color: muted ? scheme.outline : scheme.primary,
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${formatInstantClock(l10n, punch.punchedAt, timeZone)} · '
                    '${l10n.punchDirectionName(punch.direction.wire)}',
                    style: theme.textTheme.titleSmall?.copyWith(
                      decoration: muted ? TextDecoration.lineThrough : null,
                      color: muted ? scheme.onSurfaceVariant : null,
                    ),
                  ),
                  Text(
                    source,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                  if (punch.note case final note? when note.isNotEmpty)
                    Text(
                      note,
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                ],
              ),
            ),
            if (punch.voided)
              LeavePill(
                label: l10n.punchVoided,
                background: scheme.surfaceContainerHighest,
                foreground: scheme.onSurfaceVariant,
              )
            else if (punch.insideGeofence == false)
              LeavePill(
                label: l10n.attendanceFlagName(
                  AttendanceFlag.outsideGeofence.wire,
                ),
                background: scheme.errorContainer,
                foreground: scheme.onErrorContainer,
              ),
          ],
        ),
      ),
    );
  }
}
