import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/api_models.dart';
import '../auth/auth_controller.dart';
import '../l10n/app_localizations.dart';
import '../leave/leave_providers.dart';
import '../leave/leave_widgets.dart';
import '../ui/error_text.dart';
import '../ui/format.dart';
import '../ui/language_menu.dart';
import '../ui/load_error_view.dart';
import '../ui/notice_card.dart';
import '../ui/theme.dart';
import '../util/uuid.dart';
import 'offline_timesheet_queue.dart';
import 'timesheet_providers.dart';

/// A localized message for a timesheet refusal's `code`, or the general
/// text for an error from the API layer.
String timesheetErrorText(AppLocalizations l10n, Object error) =>
    switch (error is ApiException ? error.code : null) {
      'timesheet_locked' => l10n.timesheetErrorLocked,
      'timesheet_empty' => l10n.timesheetErrorEmpty,
      'month_not_started' => l10n.timesheetErrorMonthNotStarted,
      'date_outside_month' => l10n.timesheetErrorOutsideMonth,
      'project_unknown' => l10n.timesheetErrorProjectUnknown,
      'project_inactive' => l10n.timesheetErrorProjectClosed,
      'project_other_company' => l10n.timesheetErrorOtherCompany,
      'project_outside_period' => l10n.timesheetErrorOutsidePeriod,
      'day_over_24_hours' => l10n.timesheetErrorDayOver24,
      'client_id_taken' => l10n.timesheetErrorClientIdTaken,
      _ => describeError(l10n, error),
    };

/// Hours as typed, Bangla digits included, as the API's text: `7.5`, or
/// `null` when they are not 0 to 24 with at most two decimals. Empty is 0.
String? parseHours(String text) {
  final ascii = text.trim().replaceAllMapped(
    RegExp('[০-৯]'),
    (m) => '${'০১২৩৪৫৬৭৮৯'.indexOf(m[0]!)}',
  );
  if (ascii.isEmpty) return '0';
  if (!RegExp(r'^\d{1,2}(\.\d{0,2})?$').hasMatch(ascii)) return null;
  final value = double.parse(ascii);
  if (value > 24) return null;
  return _plain(value);
}

/// `7.50` → `7.5`, `8.00` → `8`.
String _plain(num value) {
  final text = value.toStringAsFixed(2);
  return text.replaceFirst(RegExp(r'\.?0+$'), '');
}

/// The cell a value stands for: a day and a project, '' for other work.
String _cell(DateTime date, String? projectId) =>
    '${toWireDate(date)}|${projectId ?? ''}';

/// The signed-in employee's timesheet for a month: each day with the hours
/// on each project, typed even without a connection.
///
/// Typed hours wait in [offlineTimesheetQueueProvider] and go to the API in
/// one batch when there is a connection; until then they show as not sent.
/// Hours the API refuses show with the reason. Filling from attendance and
/// submitting with the declaration need a connection.
class TimesheetScreen extends ConsumerStatefulWidget {
  const TimesheetScreen({super.key, this.month});

  /// The month shown first; this month when `null`.
  final DateTime? month;

  static Route<void> route({DateTime? month}) =>
      MaterialPageRoute(builder: (context) => TimesheetScreen(month: month));

  static const previousKey = ValueKey('timesheet-previous');
  static const nextKey = ValueKey('timesheet-next');
  static const prefillKey = ValueKey('timesheet-prefill');
  static const submitKey = ValueKey('timesheet-submit');
  static const declarationKey = ValueKey('timesheet-declaration');
  static const confirmSubmitKey = ValueKey('timesheet-confirm-submit');
  static const sendNowKey = ValueKey('timesheet-send-now');
  static const offlineKey = ValueKey('timesheet-offline');
  static const saveDayKey = ValueKey('timesheet-save-day');
  static const addProjectKey = ValueKey('timesheet-add-project');
  static const dayErrorKey = ValueKey('timesheet-day-error');

  static ValueKey<String> dayKey(DateTime date) =>
      ValueKey('timesheet-day-${toWireDate(date)}');
  static ValueKey<String> fieldKey(String? projectId) =>
      ValueKey('timesheet-field-${projectId ?? 'other'}');
  static ValueKey<String> refusedKey(String clientId) =>
      ValueKey('timesheet-refused-$clientId');
  static ValueKey<String> dismissKey(String clientId) =>
      ValueKey('timesheet-refused-dismiss-$clientId');

  @override
  ConsumerState<TimesheetScreen> createState() => _TimesheetScreenState();
}

class _TimesheetScreenState extends ConsumerState<TimesheetScreen> {
  late DateTime _month = monthOf(widget.month ?? ref.read(todayProvider));
  var _busy = false;

  String? get _userId => switch (ref.read(authProvider)) {
    SignedIn(:final user) => user.id,
    SignedOut() => null,
  };

  void _show(String text) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(text)));

  /// Runs an online action, saying what went wrong if it fails.
  Future<void> _online(Future<String?> Function() action) async {
    final l10n = AppLocalizations.of(context);
    setState(() => _busy = true);
    try {
      final done = await action();
      if (done != null && mounted) _show(done);
    } on SessionExpiredException {
      // AuthGate is already showing the login screen.
    } on Object catch (error) {
      if (mounted) _show(timesheetErrorText(l10n, error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Keeps the changed cells of a day to send, and tries to send them now.
  Future<void> _saveDay(DateTime date, Map<String?, String> changed) async {
    final l10n = AppLocalizations.of(context);
    final userId = _userId;
    if (userId == null || changed.isEmpty) return;
    final queue = ref.read(offlineTimesheetQueueProvider.notifier);
    await queue.edit([
      for (final MapEntry(key: projectId, value: hours) in changed.entries)
        QueuedTimesheetEntry(
          // Chosen now, so a resend of this edit is recognised.
          clientId: uuidV4(),
          userId: userId,
          date: date,
          projectId: projectId,
          hours: hours,
        ),
    ]);
    await queue.send();
    if (!mounted) return;
    if (ref.read(offlineTimesheetQueueProvider).waitingFor(userId).isNotEmpty) {
      _show(l10n.timesheetSavedOffline);
    }
  }

  Future<void> _sendNow() async {
    final l10n = AppLocalizations.of(context);
    setState(() => _busy = true);
    try {
      final sent = await ref
          .read(offlineTimesheetQueueProvider.notifier)
          .send();
      if (!mounted) return;
      final stillWaiting = ref
          .read(offlineTimesheetQueueProvider)
          .waitingFor(_userId ?? '')
          .isNotEmpty;
      if (sent > 0) {
        _show(l10n.timesheetSent(sent));
      } else if (stillWaiting) {
        _show(l10n.networkError);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _prefill() => _online(() async {
    final l10n = AppLocalizations.of(context);
    final result = await ref
        .read(authProvider.notifier)
        .prefillTimesheet(_month);
    ref.invalidate(myTimesheetProvider(_month));
    return l10n.timesheetPrefilled(result.days);
  });

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context);
    final queue = ref.read(offlineTimesheetQueueProvider.notifier);
    // What was typed must reach the API before the month is certified.
    bool waiting() => ref
        .read(offlineTimesheetQueueProvider)
        .waitingFor(_userId ?? '', _month)
        .isNotEmpty;
    if (waiting()) {
      await queue.send();
      if (!mounted) return;
      if (waiting()) {
        _show(l10n.timesheetSendFirst);
        return;
      }
    }
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => const _DeclarationDialog(),
    );
    if (confirmed != true || !mounted) return;
    await _online(() async {
      await ref.read(authProvider.notifier).submitTimesheet(_month);
      ref.invalidate(myTimesheetProvider(_month));
      return l10n.timesheetSubmitted;
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final thisMonth = monthOf(ref.watch(todayProvider));
    final month = ref.watch(myTimesheetProvider(_month));

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.timesheetTitle),
        actions: const [LanguageMenuButton()],
      ),
      body: RefreshIndicator(
        onRefresh: () =>
            awaitRefresh(ref.refresh(myTimesheetProvider(_month).future)),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            Row(
              children: [
                IconButton(
                  key: TimesheetScreen.previousKey,
                  tooltip: l10n.timesheetPreviousMonth,
                  onPressed: () => setState(
                    () => _month = DateTime.utc(_month.year, _month.month - 1),
                  ),
                  icon: const Icon(Icons.chevron_left),
                ),
                Expanded(
                  child: Text(
                    formatMonth(l10n, _month),
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                IconButton(
                  key: TimesheetScreen.nextKey,
                  tooltip: l10n.timesheetNextMonth,
                  onPressed: _month.isBefore(thisMonth)
                      ? () => setState(
                          () => _month = DateTime.utc(
                            _month.year,
                            _month.month + 1,
                          ),
                        )
                      : null,
                  icon: const Icon(Icons.chevron_right),
                ),
              ],
            ),
            const SizedBox(height: 8),
            switch (month) {
              AsyncData(value: final TimesheetMonth value) => _Month(
                month: value,
                busy: _busy,
                onEditDay: _editDay,
                onSendNow: _sendNow,
                onPrefill: _prefill,
                onSubmit: _submit,
              ),
              AsyncData() => LeaveEmptyState(
                icon: Icons.badge_outlined,
                title: l10n.leaveNoEmployeeTitle,
                message: l10n.timesheetNoEmployeeBody,
              ),
              AsyncError(:final error)
                  when !month.isLoading && error is! SessionExpiredException =>
                LoadErrorView(
                  title: l10n.timesheetLoadFailed,
                  error: error,
                  onRetry: () => ref.invalidate(myTimesheetProvider(_month)),
                ),
              _ => const LeaveLoading(),
            },
          ],
        ),
      ),
    );
  }

  Future<void> _editDay(
    TimesheetDay day,
    List<TimesheetProjectRef?> columns,
    List<TimesheetProject> addable,
    Map<String?, String> values,
  ) async {
    final changed = await showModalBottomSheet<Map<String?, String>>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => _DayEditor(
        day: day,
        columns: columns,
        addable: addable,
        values: values,
      ),
    );
    if (changed != null && mounted) await _saveDay(day.date, changed);
  }
}

class _Month extends ConsumerWidget {
  const _Month({
    required this.month,
    required this.busy,
    required this.onEditDay,
    required this.onSendNow,
    required this.onPrefill,
    required this.onSubmit,
  });

  final TimesheetMonth month;
  final bool busy;
  final void Function(
    TimesheetDay day,
    List<TimesheetProjectRef?> columns,
    List<TimesheetProject> addable,
    Map<String?, String> values,
  )
  onEditDay;
  final VoidCallback onSendNow;
  final VoidCallback onPrefill;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    final colors = StatusColors.of(context);
    final sheet = month.sheet;
    final userId = switch (ref.watch(authProvider)) {
      SignedIn(:final user) => user.id,
      SignedOut() => '',
    };
    final queue = ref.watch(offlineTimesheetQueueProvider);
    final waiting = queue.waitingFor(userId, sheet.month);
    final refused = queue.refusedFor(userId);

    // What the API has, with what is typed and not yet sent on top.
    final saved = {
      for (final entry in sheet.entries)
        _cell(entry.date, entry.projectId): entry.hours,
    };
    final unsent = {
      for (final entry in waiting)
        _cell(entry.date, entry.projectId): entry.hours,
    };
    String? valueOf(DateTime date, String? projectId) {
      final cell = _cell(date, projectId);
      final value = unsent[cell] ?? saved[cell];
      return value == null || (double.tryParse(value) ?? 0) == 0 ? null : value;
    }

    // Allocated projects and those with hours; others are added per day.
    bool shown(TimesheetProject project) =>
        project.plannedPercent != null ||
        sheet.entries.any((e) => e.projectId == project.id) ||
        waiting.any((e) => e.projectId == project.id);
    final columns = <TimesheetProjectRef?>[
      ...sheet.projects.where(shown),
      null,
    ];
    final addable = [
      for (final project in sheet.projects)
        if (project.chargeable && !shown(project)) project,
    ];
    final language = Localizations.localeOf(context).languageCode;
    String nameOf(String? projectId) =>
        switch (sheet.projects.where((p) => p.id == projectId).firstOrNull) {
          final TimesheetProject project => project.code,
          null => l10n.timesheetOtherWork,
        };
    String hours(String value) =>
        formatNumber(l10n, double.tryParse(value) ?? 0);
    double? valueAt(DateTime date, String? projectId) =>
        switch (valueOf(date, projectId)) {
          final String value => double.parse(value),
          null => null,
        };

    final notice = switch (sheet.status) {
      TimesheetStatus.submitted => (
        l10n.timesheetSubmittedNotice(
          formatShortDate(l10n, (sheet.submittedAt ?? sheet.month).toLocal()),
        ),
        colors.warningContainer,
        colors.onWarningContainer,
        Icons.hourglass_top,
      ),
      TimesheetStatus.approved => (
        l10n.timesheetApprovedNotice(
          sheet.decidedBy?.fullName ?? '',
          formatShortDate(l10n, (sheet.decidedAt ?? sheet.month).toLocal()),
        ),
        scheme.primaryContainer,
        scheme.onPrimaryContainer,
        Icons.verified_outlined,
      ),
      TimesheetStatus.rejected => (
        l10n.timesheetRejectedNotice,
        scheme.errorContainer,
        scheme.onErrorContainer,
        Icons.undo,
      ),
      _ when sheet.note != null => (
        l10n.timesheetReopenedNotice(sheet.note!),
        colors.warningContainer,
        colors.onWarningContainer,
        Icons.lock_open,
      ),
      _ when sheet.needed => (
        l10n.timesheetDue,
        scheme.secondaryContainer,
        scheme.onSecondaryContainer,
        Icons.schedule,
      ),
      _ => null,
    };
    final rejection = sheet.steps
        .where((s) => s.status == ApprovalStatus.rejected)
        .firstOrNull;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Align(
          child: Chip(label: Text(l10n.timesheetStatus(sheet.status.wire))),
        ),
        if (month.offline) ...[
          const SizedBox(height: 8),
          NoticeCard(
            key: TimesheetScreen.offlineKey,
            icon: Icons.cloud_off_outlined,
            message: l10n.timesheetOffline,
            background: colors.warningContainer,
            foreground: colors.onWarningContainer,
          ),
        ],
        if (notice case (
          final message,
          final background,
          final foreground,
          final icon,
        )) ...[
          const SizedBox(height: 8),
          NoticeCard(
            icon: icon,
            message: message,
            details: [?rejection?.comment],
            background: background,
            foreground: foreground,
          ),
        ],
        if (waiting.isNotEmpty) ...[
          const SizedBox(height: 8),
          Card.outlined(
            margin: EdgeInsets.zero,
            child: ListTile(
              leading: const Icon(Icons.cloud_upload_outlined),
              title: Text(l10n.timesheetWaiting(waiting.length)),
              trailing: TextButton(
                key: TimesheetScreen.sendNowKey,
                onPressed: busy ? null : onSendNow,
                child: Text(l10n.timesheetSendNow),
              ),
            ),
          ),
        ],
        for (final refusal in refused) ...[
          const SizedBox(height: 8),
          Column(
            key: TimesheetScreen.refusedKey(refusal.entry.clientId),
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              NoticeCard(
                icon: Icons.error_outline,
                title: l10n.timesheetRefusedTitle(
                  nameOf(refusal.entry.projectId),
                  formatShortDate(l10n, refusal.entry.date),
                ),
                message: timesheetErrorText(l10n, refusal.error),
                background: scheme.errorContainer,
                foreground: scheme.onErrorContainer,
              ),
              Align(
                alignment: AlignmentDirectional.centerEnd,
                child: TextButton(
                  key: TimesheetScreen.dismissKey(refusal.entry.clientId),
                  onPressed: () => ref
                      .read(offlineTimesheetQueueProvider.notifier)
                      .dismiss(refusal.entry.clientId),
                  child: Text(l10n.dismiss),
                ),
              ),
            ],
          ),
        ],
        const SizedBox(height: 8),
        Card.outlined(
          margin: EdgeInsets.zero,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  l10n.timesheetTotal(hours(sheet.totalHours)),
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                for (final total in sheet.totals)
                  Text(
                    '${total.project?.nameIn(language) ?? l10n.timesheetOtherWork}: '
                    '${l10n.timesheetShare(hours(total.hours), hours(total.percent))}'
                    '${total.plannedPercent == null ? '' : ' (${l10n.timesheetPlanned(hours(total.plannedPercent!))})'}',
                  ),
              ],
            ),
          ),
        ),
        if (sheet.editable && !month.offline) ...[
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            alignment: WrapAlignment.end,
            children: [
              OutlinedButton.icon(
                key: TimesheetScreen.prefillKey,
                onPressed: busy ? null : onPrefill,
                icon: const Icon(Icons.auto_fix_high_outlined),
                label: Text(l10n.timesheetPrefill),
              ),
              FilledButton.icon(
                key: TimesheetScreen.submitKey,
                onPressed: busy ? null : onSubmit,
                icon: const Icon(Icons.send_outlined),
                label: Text(l10n.timesheetSubmit),
              ),
            ],
          ),
        ],
        if (columns.length == 1 && addable.isEmpty) ...[
          const SizedBox(height: 8),
          Text(l10n.timesheetNoProjects),
        ],
        const SizedBox(height: 8),
        for (final day in sheet.days)
          _DayCard(
            key: TimesheetScreen.dayKey(day.date),
            day: day,
            lines: [
              for (final column in columns)
                if (valueAt(day.date, column?.id) case final value?)
                  (
                    label: column?.code ?? l10n.timesheetOtherWork,
                    hours: value,
                    unsent: unsent.containsKey(_cell(day.date, column?.id)),
                  ),
            ],
            onTap: sheet.editable
                ? () => onEditDay(day, columns, addable, {
                    for (final column in columns)
                      column?.id: valueOf(day.date, column?.id) ?? '',
                  })
                : null,
          ),
      ],
    );
  }
}

class _DayCard extends StatelessWidget {
  const _DayCard({
    super.key,
    required this.day,
    required this.lines,
    required this.onTap,
  });

  final TimesheetDay day;
  final List<({String label, double hours, bool unsent})> lines;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final language = Localizations.localeOf(context).languageCode;
    final marks = [
      ?day.holiday,
      if (day.weekend) l10n.timesheetWeekend,
      if (day.offDay && !day.weekend && day.holiday == null)
        l10n.timesheetOffDay,
      if (day.leave case final leave?)
        l10n.timesheetLeave(
          language == 'bn' && leave.nameBn != null ? leave.nameBn! : leave.name,
        ),
      if (day.workedHours case final worked?)
        l10n.timesheetWorked(formatNumber(l10n, double.parse(worked))),
    ];
    return Card.outlined(
      margin: const EdgeInsets.only(bottom: 8),
      color: day.offDay || day.leave != null
          ? scheme.surfaceContainerHighest
          : null,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      formatWeekdayDate(l10n, day.date),
                      style: theme.textTheme.titleSmall,
                    ),
                  ),
                  Text(
                    lines.isEmpty
                        ? l10n.timesheetNoHours
                        : l10n.timesheetHours(
                            formatNumber(
                              l10n,
                              lines.fold<double>(0, (sum, l) => sum + l.hours),
                            ),
                          ),
                    style: theme.textTheme.titleSmall,
                  ),
                ],
              ),
              if (marks.isNotEmpty)
                Text(
                  marks.join(' · '),
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
                ),
              for (final line in lines)
                Row(
                  children: [
                    Expanded(child: Text(line.label)),
                    if (line.unsent)
                      Padding(
                        padding: const EdgeInsetsDirectional.only(end: 6),
                        child: Icon(
                          Icons.cloud_upload_outlined,
                          size: 16,
                          semanticLabel: l10n.timesheetUnsent,
                        ),
                      ),
                    Text(l10n.timesheetHours(formatNumber(l10n, line.hours))),
                  ],
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The hours of one day, a field per project and one for other work.
/// Pops the changed cells with their hours (`0` to remove one).
class _DayEditor extends StatefulWidget {
  const _DayEditor({
    required this.day,
    required this.columns,
    required this.addable,
    required this.values,
  });

  final TimesheetDay day;
  final List<TimesheetProjectRef?> columns;

  /// Projects the person may charge that have no field yet.
  final List<TimesheetProject> addable;
  final Map<String?, String> values;

  @override
  State<_DayEditor> createState() => _DayEditorState();
}

class _DayEditorState extends State<_DayEditor> {
  late final _columns = [...widget.columns];
  late final _fields = {
    for (final column in widget.columns)
      column?.id: TextEditingController(
        text: switch (widget.values[column?.id]) {
          final String value when value.isNotEmpty => _plain(
            double.parse(value),
          ),
          _ => '',
        },
      ),
  };
  String? _error;

  /// Adds a field for [project], before the one for other work.
  void _add(TimesheetProject project) => setState(() {
    _columns.insert(_columns.length - 1, project);
    _fields[project.id] = TextEditingController();
  });

  @override
  void dispose() {
    for (final field in _fields.values) {
      field.dispose();
    }
    super.dispose();
  }

  void _save() {
    final l10n = AppLocalizations.of(context);
    final parsed = <String?, String>{};
    for (final MapEntry(key: projectId, value: field) in _fields.entries) {
      final hours = parseHours(field.text);
      if (hours == null) {
        setState(() => _error = l10n.timesheetHoursInvalid);
        return;
      }
      parsed[projectId] = hours;
    }
    final total = parsed.values.fold<double>(0, (s, h) => s + double.parse(h));
    if (total > 24) {
      setState(() => _error = l10n.timesheetDayTooLong);
      return;
    }
    Navigator.of(context).pop({
      for (final MapEntry(key: projectId, value: hours) in parsed.entries)
        if (double.parse(hours) !=
            (double.tryParse(widget.values[projectId] ?? '') ?? 0))
          projectId: hours,
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final language = Localizations.localeOf(context).languageCode;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        16,
        0,
        16,
        16 + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              l10n.timesheetEditDay(formatWeekdayDate(l10n, widget.day.date)),
              style: theme.textTheme.titleLarge,
            ),
            if (widget.day.workedHours case final worked?)
              Text(
                l10n.timesheetWorked(formatNumber(l10n, double.parse(worked))),
              ),
            const SizedBox(height: 8),
            for (final column in _columns)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: TextField(
                  key: TimesheetScreen.fieldKey(column?.id),
                  controller: _fields[column?.id],
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  decoration: InputDecoration(
                    labelText: column == null
                        ? l10n.timesheetOtherWork
                        : '${column.code} · ${column.nameIn(language)}',
                    helperText: switch (column) {
                      TimesheetProject(:final plannedPercent?) =>
                        l10n.timesheetPlanned(
                          formatNumber(l10n, double.parse(plannedPercent)),
                        ),
                      _ => null,
                    },
                    suffixText: l10n.timesheetHoursUnit,
                    border: const OutlineInputBorder(),
                  ),
                ),
              ),
            if (widget.addable.where((p) => !_columns.contains(p)).toList()
                case final addable when addable.isNotEmpty)
              Align(
                alignment: AlignmentDirectional.centerStart,
                child: PopupMenuButton<TimesheetProject>(
                  key: TimesheetScreen.addProjectKey,
                  onSelected: _add,
                  itemBuilder: (context) => [
                    for (final project in addable)
                      PopupMenuItem(
                        value: project,
                        child: Text(
                          '${project.code} · ${project.nameIn(language)}',
                        ),
                      ),
                  ],
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Text.rich(
                      TextSpan(
                        children: [
                          const WidgetSpan(
                            child: Icon(Icons.add, size: 18),
                            alignment: PlaceholderAlignment.middle,
                          ),
                          TextSpan(text: ' ${l10n.timesheetAddProject}'),
                        ],
                      ),
                      style: TextStyle(color: theme.colorScheme.primary),
                    ),
                  ),
                ),
              ),
            if (_error case final error?) ...[
              const SizedBox(height: 8),
              Text(
                error,
                key: TimesheetScreen.dayErrorKey,
                style: TextStyle(color: theme.colorScheme.error),
              ),
            ],
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: Text(l10n.timesheetCancel),
                ),
                const SizedBox(width: 8),
                FilledButton(
                  key: TimesheetScreen.saveDayKey,
                  onPressed: _save,
                  child: Text(l10n.timesheetSaveDay),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// The declaration the employee makes on submitting, with a box to tick.
class _DeclarationDialog extends StatefulWidget {
  const _DeclarationDialog();

  @override
  State<_DeclarationDialog> createState() => _DeclarationDialogState();
}

class _DeclarationDialogState extends State<_DeclarationDialog> {
  var _agreed = false;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return AlertDialog(
      title: Text(l10n.timesheetSubmitTitle),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l10n.timesheetDeclaration),
          const SizedBox(height: 8),
          CheckboxListTile(
            key: TimesheetScreen.declarationKey,
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: _agreed,
            onChanged: (value) => setState(() => _agreed = value ?? false),
            title: Text(l10n.timesheetDeclarationConfirm),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: Text(l10n.timesheetCancel),
        ),
        FilledButton(
          key: TimesheetScreen.confirmSubmitKey,
          onPressed: _agreed ? () => Navigator.of(context).pop(true) : null,
          child: Text(l10n.timesheetSubmit),
        ),
      ],
    );
  }
}
