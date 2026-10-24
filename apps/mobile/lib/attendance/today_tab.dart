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
import '../util/uuid.dart';
import 'attendance_providers.dart';
import 'attendance_widgets.dart';
import 'camera_service.dart';
import 'location_service.dart';
import 'offline_punch_queue.dart';

/// Today for the signed-in employee: the shift, how the day stands, the
/// punches so far, and a Punch in / Punch out button.
///
/// With a geofence (`geofenced`) a punch needs the phone's location; when
/// it cannot be read, the tab says why and sends nothing. With `anywhere`
/// the location is sent when it can be read, and the punch goes without it
/// otherwise. When the workspace asks for a selfie, the front camera opens
/// first; no photo, no punch.
///
/// A punch that cannot reach the server is kept on the phone and sent later
/// (see [offlinePunchQueueProvider]); the tab says how many are waiting, and
/// why any the API later refused were not recorded, offering a correction
/// for that day through [onCorrect].
class TodayTab extends ConsumerStatefulWidget {
  const TodayTab({super.key, this.onCorrect});

  /// Opens the correction form for a day (a UTC-midnight date).
  final ValueChanged<DateTime>? onCorrect;

  static const dayCardKey = ValueKey('attendance-today-day');
  static const punchButtonKey = ValueKey('attendance-punch');
  static const punchHintKey = ValueKey('attendance-punch-hint');
  static const selfieHintKey = ValueKey('attendance-selfie-hint');
  static const blockedKey = ValueKey('attendance-punch-blocked');
  static const punchErrorKey = ValueKey('attendance-punch-error');
  static const openSettingsKey = ValueKey('attendance-open-settings');
  static const punchesKey = ValueKey('attendance-today-punches');
  static const waitingKey = ValueKey('attendance-punches-waiting');
  static const sendNowKey = ValueKey('attendance-punches-send-now');

  static ValueKey<String> refusedKey(String clientId) =>
      ValueKey('attendance-punch-refused-$clientId');
  static ValueKey<String> refusedCorrectKey(String clientId) =>
      ValueKey('attendance-punch-refused-correct-$clientId');
  static ValueKey<String> refusedDismissKey(String clientId) =>
      ValueKey('attendance-punch-refused-dismiss-$clientId');

  static ValueKey<String> punchKey(String punchId) =>
      ValueKey('attendance-punch-$punchId');
  static ValueKey<String> punchPhotoKey(String punchId) =>
      ValueKey('attendance-punch-photo-$punchId');

  /// How long a punch waits for a location fix when the geofence needs it,
  /// and when it is only nice to have.
  static const requiredFixTime = Duration(seconds: 20);
  static const optionalFixTime = Duration(seconds: 8);

  @override
  ConsumerState<TodayTab> createState() => _TodayTabState();
}

class _TodayTabState extends ConsumerState<TodayTab> {
  bool _capturing = false;
  bool _locating = false;
  bool _punching = false;
  bool _sendingWaiting = false;

  /// Why the last punch failed: an [ApiException], a [LocationUnavailable],
  /// a [CameraUnavailable], a [SelfieNotSent] or anything else.
  Object? _error;

  /// The location sent with the failed punch, to say how far away it was.
  PunchLocation? _errorLocation;

  bool get _busy => _capturing || _locating || _punching;

  Future<void> _punch(MyAttendanceToday today) async {
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    // Still usable if the screen closes before the calls return.
    final container = ProviderScope.containerOf(context, listen: false);
    final selfPunch = today.selfPunch;
    setState(() {
      _capturing = selfPunch.requireSelfie;
      _error = null;
      _errorLocation = null;
    });

    // The photo comes first, so backing out of the camera stops the punch
    // before the location is even read.
    PunchSelfie? selfie;
    if (selfPunch.requireSelfie) {
      Object? problem;
      try {
        selfie = await container.read(cameraServiceProvider).takeSelfie();
        problem = switch (selfie) {
          null => const SelfieNotSent(SelfieProblem.skipped),
          PunchSelfie(isTooLarge: true) => const SelfieNotSent(
            SelfieProblem.tooLarge,
          ),
          _ => null,
        };
      } on CameraUnavailable catch (error) {
        problem = error;
      } on Object {
        problem = const CameraUnavailable(CameraProblem.failed);
      }
      if (!mounted) return;
      setState(() {
        _capturing = false;
        _error = problem;
      });
      if (problem != null) return;
    }
    setState(() => _locating = true);

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

    // Chosen before the first attempt, so a resend from the offline queue is
    // recognised even if this attempt reached the server.
    final clientId = uuidV4();
    final punchedAt = DateTime.now().toUtc();
    try {
      final after = await container
          .read(authProvider.notifier)
          .punch(location: location, selfie: selfie, clientId: clientId);
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
      // No answer: keep the punch and send it when the connection is back.
      if (error is ApiException && error.kind == ApiErrorKind.network) {
        if (container.read(authProvider) case SignedIn(:final user)) {
          await container
              .read(offlinePunchQueueProvider.notifier)
              .add(
                QueuedPunch(
                  clientId: clientId,
                  punchedAt: punchedAt,
                  userId: user.id,
                  timeZone: today.timeZone,
                  location: location,
                ),
                selfie: selfie,
              );
          messenger.showSnackBar(
            SnackBar(
              content: Text(
                l10n.punchSavedOffline(
                  formatInstantClock(l10n, punchedAt, today.timeZone),
                ),
              ),
            ),
          );
          return;
        }
      }
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
            'selfie_required',
          }.contains(error.code)) {
        container.invalidate(attendanceTodayProvider);
      }
    } finally {
      if (mounted) setState(() => _punching = false);
    }
  }

  Future<void> _sendWaiting() async {
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final queue = ref.read(offlinePunchQueueProvider.notifier);
    setState(() => _sendingWaiting = true);
    try {
      final sent = await queue.send();
      if (!mounted) return;
      final stillWaiting = switch (ref.read(authProvider)) {
        SignedIn(:final user) =>
          ref.read(offlinePunchQueueProvider).waitingFor(user.id).isNotEmpty,
        SignedOut() => false,
      };
      // One the API refused shows its own card instead.
      final text = sent > 0
          ? l10n.punchesSent(sent)
          : stillWaiting
          ? l10n.networkError
          : null;
      if (text != null) {
        messenger
          ..hideCurrentSnackBar()
          ..showSnackBar(SnackBar(content: Text(text)));
      }
    } finally {
      if (mounted) setState(() => _sendingWaiting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final today = ref.watch(attendanceTodayProvider);
    final userId = switch (ref.watch(authProvider)) {
      SignedIn(:final user) => user.id,
      SignedOut() => '',
    };
    final queue = ref.watch(offlinePunchQueueProvider);
    final waiting = queue.waitingFor(userId);
    final refused = queue.refusedFor(userId);

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
                for (final refusal in refused)
                  _RefusedPunchCard(
                    refusal: refusal,
                    timeZone: view.timeZone,
                    onCorrect: widget.onCorrect,
                  ),
                _punchPanel(context, view, waiting: _waitingOn(waiting, view)),
                if (waiting.isNotEmpty)
                  _WaitingPunches(
                    punches: waiting,
                    timeZone: view.timeZone,
                    sending: _sendingWaiting,
                    onSend: _sendWaiting,
                  ),
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

  /// How many of [waiting] were taken on the day [view] shows.
  static int _waitingOn(List<QueuedPunch> waiting, MyAttendanceToday view) {
    final day = view.day.date;
    return waiting.where((punch) {
      final local = wallClock(punch.punchedAt, punch.timeZone ?? view.timeZone);
      return local.year == day.year &&
          local.month == day.month &&
          local.day == day.day;
    }).length;
  }

  /// [waiting]: the day's punches on the phone, not sent yet. Each one turns
  /// the next direction round, as it will once it arrives.
  Widget _punchPanel(
    BuildContext context,
    MyAttendanceToday today, {
    required int waiting,
  }) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final selfPunch = today.selfPunch;
    final error = _error;
    final hintStyle = theme.textTheme.bodySmall?.copyWith(
      color: scheme.onSurfaceVariant,
    );
    // Only the system settings can fix these.
    final VoidCallback? openSettings = switch (error) {
      LocationUnavailable(:final problem)
          when problem == LocationProblem.servicesOff ||
              problem == LocationProblem.permissionDeniedForever =>
        () => ref.read(locationServiceProvider).openSettings(problem),
      CameraUnavailable(problem: CameraProblem.permissionDenied) =>
        () => ref.read(cameraServiceProvider).openSettings(),
      _ => null,
    };
    // Backing out of the camera is not a failure: say so quietly.
    final skipped =
        error is SelfieNotSent && error.problem == SelfieProblem.skipped;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 8,
      children: [
        if (selfPunch.canPunch) ...[
          _PunchButton(
            direction: waiting.isOdd
                ? switch (today.nextDirection) {
                    PunchDirection.punchOut => PunchDirection.punchIn,
                    _ => PunchDirection.punchOut,
                  }
                : today.nextDirection,
            label: _capturing
                ? l10n.punchTakingPhoto
                : _locating
                ? l10n.punchLocating
                : null,
            busy: _busy,
            onPressed: () => _punch(today),
          ),
          Text(
            selfPunch.needsLocation
                ? l10n.punchGeofencedHint
                : l10n.punchAnywhereHint,
            key: TodayTab.punchHintKey,
            textAlign: TextAlign.center,
            style: hintStyle,
          ),
          if (selfPunch.requireSelfie)
            Text(
              l10n.punchSelfieHint,
              key: TodayTab.selfieHintKey,
              textAlign: TextAlign.center,
              style: hintStyle,
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
            icon: switch (error) {
              LocationUnavailable() => Icons.location_off_outlined,
              CameraUnavailable() => Icons.no_photography_outlined,
              _ when skipped => Icons.photo_camera_outlined,
              _ => Icons.error_outline,
            },
            message: attendanceErrorText(
              l10n,
              error,
              location: _errorLocation,
              geofence: selfPunch.geofence,
            ),
            background: skipped
                ? scheme.surfaceContainerHigh
                : scheme.errorContainer,
            foreground: skipped ? scheme.onSurface : scheme.onErrorContainer,
          ),
          if (openSettings != null)
            Align(
              alignment: AlignmentDirectional.centerEnd,
              child: TextButton.icon(
                key: TodayTab.openSettingsKey,
                onPressed: openSettings,
                icon: const Icon(Icons.settings_outlined),
                label: Text(l10n.openSettings),
              ),
            ),
        ],
      ],
    );
  }
}

/// Punches kept on the phone until the connection is back, with a button
/// to try now.
class _WaitingPunches extends StatelessWidget {
  const _WaitingPunches({
    required this.punches,
    required this.timeZone,
    required this.sending,
    required this.onSend,
  });

  final List<QueuedPunch> punches;
  final String timeZone;
  final bool sending;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    final times = [
      for (final punch in punches)
        formatInstantClock(l10n, punch.punchedAt, punch.timeZone ?? timeZone),
    ];
    return Column(
      key: TodayTab.waitingKey,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        NoticeCard(
          icon: Icons.cloud_upload_outlined,
          title: l10n.punchesWaiting(punches.length),
          message: l10n.punchesWaitingBody(times.join(', ')),
          background: scheme.secondaryContainer,
          foreground: scheme.onSecondaryContainer,
        ),
        Align(
          alignment: AlignmentDirectional.centerEnd,
          child: TextButton.icon(
            key: TodayTab.sendNowKey,
            onPressed: sending ? null : onSend,
            icon: sending
                ? const SizedBox.square(
                    dimension: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.sync),
            label: Text(l10n.punchesSendNow),
          ),
        ),
      ],
    );
  }
}

/// A punch taken without a connection that the API refused when it was
/// sent: why, and a way to ask for a correction of that day instead.
class _RefusedPunchCard extends ConsumerWidget {
  const _RefusedPunchCard({
    required this.refusal,
    required this.timeZone,
    required this.onCorrect,
  });

  final RefusedPunch refusal;
  final String timeZone;
  final ValueChanged<DateTime>? onCorrect;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    final punch = refusal.punch;
    final zone = punch.timeZone ?? timeZone;
    final local = wallClock(punch.punchedAt, zone);
    final day = DateTime.utc(local.year, local.month, local.day);
    final onCorrect = this.onCorrect;
    return Column(
      key: TodayTab.refusedKey(punch.clientId),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        NoticeCard(
          icon: Icons.cloud_off_outlined,
          title: l10n.punchRefusedTitle(
            formatInstantClock(l10n, punch.punchedAt, zone),
            formatShortDate(l10n, day),
          ),
          message: attendanceErrorText(l10n, refusal.error),
          details: [l10n.punchRefusedHint],
          background: scheme.errorContainer,
          foreground: scheme.onErrorContainer,
        ),
        Wrap(
          alignment: WrapAlignment.end,
          children: [
            TextButton(
              key: TodayTab.refusedDismissKey(punch.clientId),
              onPressed: () => ref
                  .read(offlinePunchQueueProvider.notifier)
                  .dismiss(punch.clientId),
              child: Text(l10n.dismiss),
            ),
            if (onCorrect != null)
              TextButton.icon(
                key: TodayTab.refusedCorrectKey(punch.clientId),
                onPressed: () => onCorrect(day),
                icon: const Icon(Icons.edit_calendar_outlined),
                label: Text(l10n.correctionRequest),
              ),
          ],
        ),
      ],
    );
  }
}

class _PunchButton extends StatelessWidget {
  const _PunchButton({
    required this.direction,
    required this.busy,
    required this.onPressed,
    this.label,
  });

  final PunchDirection direction;
  final bool busy;
  final VoidCallback onPressed;

  /// What the punch is doing now, in place of Punch in / Punch out.
  final String? label;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final out = direction == PunchDirection.punchOut;
    final label = this.label ?? (out ? l10n.punchOut : l10n.punchIn);
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
            if (punch.selfieDocumentId != null)
              Padding(
                padding: const EdgeInsetsDirectional.only(end: 8),
                child: Icon(
                  Icons.photo_camera_outlined,
                  key: TodayTab.punchPhotoKey(punch.id),
                  size: 18,
                  color: scheme.onSurfaceVariant,
                  semanticLabel: l10n.punchWithPhoto,
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
