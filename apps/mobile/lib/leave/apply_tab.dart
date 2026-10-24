import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/api_models.dart';
import '../auth/auth_controller.dart';
import '../l10n/app_localizations.dart';
import '../profile/my_employee_provider.dart';
import '../ui/error_text.dart';
import '../ui/format.dart';
import '../ui/load_error_view.dart';
import '../ui/notice_card.dart';
import 'leave_providers.dart';
import 'leave_widgets.dart';

/// The active leave types an employee of [gender] can take. Types limited to
/// one gender (maternity) are hidden from the others; with no known gender,
/// every active type shows.
List<LeaveType> applicableLeaveTypes(List<LeaveType> types, Gender? gender) => [
  for (final type in types)
    if (type.isActive &&
        (type.gender == null ||
            gender == null ||
            gender == Gender.unknown ||
            type.gender == gender))
      type,
];

/// The form to ask for leave, with a live preview from the API.
///
/// Every change to the type, dates or half day asks
/// `POST /tenant/me/leave/preview` again; Send is enabled only when the
/// latest preview has no problems.
class ApplyTab extends ConsumerStatefulWidget {
  const ApplyTab({super.key, required this.onShowRequests});

  /// Switches the Leave screen to My requests.
  final VoidCallback onShowRequests;

  static const typeFieldKey = ValueKey('leave-apply-type');
  static const startFieldKey = ValueKey('leave-apply-start');
  static const endFieldKey = ValueKey('leave-apply-end');
  static const dayPartKey = ValueKey('leave-apply-day-part');
  static const reasonFieldKey = ValueKey('leave-apply-reason');
  static const previewKey = ValueKey('leave-apply-preview');
  static const problemsKey = ValueKey('leave-apply-problems');
  static const submitKey = ValueKey('leave-apply-submit');
  static const submittedKey = ValueKey('leave-apply-submitted');
  static const showRequestsKey = ValueKey('leave-apply-show-requests');
  static const applyAgainKey = ValueKey('leave-apply-again');

  @override
  ConsumerState<ApplyTab> createState() => _ApplyTabState();
}

enum _DayPart { full, firstHalf, secondHalf }

class _ApplyTabState extends ConsumerState<ApplyTab> {
  final _formKey = GlobalKey<FormState>();
  final _reason = TextEditingController();

  LeaveType? _type;
  DateTime? _start;
  DateTime? _end;
  _DayPart _dayPart = _DayPart.full;

  LeavePreview? _preview;
  Object? _previewError;
  bool _previewing = false;

  /// Only the newest preview call may update the form.
  int _previewSeq = 0;

  bool _submitting = false;
  Object? _submitError;

  /// From a 400 `leave_not_allowed` answer to Send.
  List<String> _submitProblems = const [];
  LeaveRequest? _submitted;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  bool get _halfDayPossible {
    final type = _type;
    return type != null &&
        type.allowHalfDay &&
        _start != null &&
        _start == _end;
  }

  /// What to preview and send, once a type and both dates are chosen.
  LeaveDraft? get _draft {
    final (type, start, end) = (_type, _start, _end);
    if (type == null || start == null || end == null) return null;
    return LeaveDraft(
      leaveTypeId: type.id,
      startDate: start,
      endDate: end,
      halfDay: _halfDayPossible
          ? switch (_dayPart) {
              _DayPart.full => null,
              _DayPart.firstHalf => HalfDay.firstHalf,
              _DayPart.secondHalf => HalfDay.secondHalf,
            }
          : null,
    );
  }

  bool get _canSubmit =>
      _draft != null &&
      !_previewing &&
      !_submitting &&
      _previewError == null &&
      _submitProblems.isEmpty &&
      (_preview?.canSubmit ?? false);

  Future<void> _refreshPreview() async {
    final draft = _draft;
    final seq = ++_previewSeq;
    setState(() {
      _previewing = draft != null;
      _previewError = null;
      _submitError = null;
      _submitProblems = const [];
      if (draft == null) _preview = null;
    });
    if (draft == null) return;

    try {
      final preview = await ref.read(authProvider.notifier).previewLeave(draft);
      if (!mounted || seq != _previewSeq) return;
      setState(() {
        _preview = preview;
        _previewing = false;
      });
    } on SessionExpiredException {
      // AuthGate is already showing the login screen.
    } on Object catch (error) {
      if (!mounted || seq != _previewSeq) return;
      setState(() {
        _preview = null;
        _previewError = error;
        _previewing = false;
      });
    }
  }

  void _selectType(LeaveType type) {
    setState(() {
      _type = type;
      if (!type.allowHalfDay) _dayPart = _DayPart.full;
    });
    _refreshPreview();
  }

  Future<void> _pickStart() async {
    final today = ref.read(todayProvider);
    final picked = await showDatePicker(
      context: context,
      initialDate: _local(_start ?? today),
      firstDate: DateTime(today.year),
      lastDate: DateTime(today.year + 1, 12, 31),
    );
    if (picked == null || !mounted) return;
    final start = DateTime.utc(picked.year, picked.month, picked.day);
    setState(() {
      _start = start;
      // Leave cannot end before it starts or cross 31 December.
      final end = _end;
      if (end == null || end.isBefore(start) || end.year != start.year) {
        _end = start;
      }
      if (_end != start) _dayPart = _DayPart.full;
    });
    _refreshPreview();
  }

  Future<void> _pickEnd() async {
    final start = _start;
    if (start == null) return;
    final picked = await showDatePicker(
      context: context,
      initialDate: _local(_end ?? start),
      firstDate: _local(start),
      lastDate: DateTime(start.year, 12, 31),
    );
    if (picked == null || !mounted) return;
    setState(() {
      _end = DateTime.utc(picked.year, picked.month, picked.day);
      if (_end != start) _dayPart = _DayPart.full;
    });
    _refreshPreview();
  }

  Future<void> _submit() async {
    final draft = _draft;
    if (draft == null || !(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _submitting = true;
      _submitError = null;
      _submitProblems = const [];
    });
    try {
      final request = await ref
          .read(authProvider.notifier)
          .applyForLeave(draft, reason: _reason.text.trim());
      if (!mounted) return;
      ref
        ..invalidate(leaveBalancesProvider)
        ..invalidate(myLeaveRequestsProvider);
      setState(() {
        _submitting = false;
        _submitted = request;
      });
    } on SessionExpiredException {
      // AuthGate is already showing the login screen.
    } on Object catch (error) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        if (error is ApiException && error.code == 'leave_not_allowed') {
          _submitProblems = [error.message];
        } else {
          _submitError = error;
        }
      });
    }
  }

  void _reset() {
    _previewSeq++;
    _reason.clear();
    setState(() {
      _type = null;
      _start = null;
      _end = null;
      _dayPart = _DayPart.full;
      _preview = null;
      _previewError = null;
      _previewing = false;
      _submitError = null;
      _submitProblems = const [];
      _submitted = null;
    });
  }

  static DateTime _local(DateTime date) =>
      DateTime(date.year, date.month, date.day);

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    if (_submitted case final request?) {
      return _Submitted(
        request: request,
        onShowRequests: () {
          _reset();
          widget.onShowRequests();
        },
        onApplyAgain: _reset,
      );
    }

    final types = ref.watch(leaveTypesProvider);
    final employee = ref.watch(myEmployeeProvider);
    return switch ((types, employee)) {
      (_, AsyncData(value: null)) => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          LeaveEmptyState(
            icon: Icons.badge_outlined,
            title: l10n.leaveNoEmployeeTitle,
            message: l10n.leaveNoEmployeeBody,
          ),
        ],
      ),
      (AsyncData(value: final list), AsyncData(:final value)) => _form(
        context,
        applicableLeaveTypes(list, value?.gender),
      ),
      // Without the profile the gender is unknown, so every type shows.
      (AsyncData(value: final list), AsyncError(:final error))
          when !employee.isLoading && error is! SessionExpiredException =>
        _form(context, applicableLeaveTypes(list, null)),
      (AsyncError(:final error), _)
          when !types.isLoading && error is! SessionExpiredException =>
        LoadErrorView(
          title: l10n.leaveLoadFailed,
          error: error,
          onRetry: () => ref.invalidate(leaveTypesProvider),
        ),
      _ => const Center(child: CircularProgressIndicator()),
    };
  }

  Widget _form(BuildContext context, List<LeaveType> types) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final type = _type;
    final draft = _draft;

    return Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (types.isEmpty)
            LeaveEmptyState(
              icon: Icons.event_busy_outlined,
              message: l10n.leaveNoTypes,
            )
          else
            DropdownButtonFormField<String>(
              key: ApplyTab.typeFieldKey,
              initialValue: type?.id,
              isExpanded: true,
              decoration: InputDecoration(labelText: l10n.leaveTypeLabel),
              items: [
                for (final option in types)
                  DropdownMenuItem(
                    value: option.id,
                    child: Text(
                      leaveTypeName(l10n, option),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
              ],
              onChanged: (id) {
                final option = types.where((t) => t.id == id).firstOrNull;
                if (option != null) _selectType(option);
              },
            ),
          if (type != null) ...[
            if (type.requiresDocumentAfterDays case final days?)
              _Hint(
                icon: Icons.description_outlined,
                text: l10n.leaveDocumentHint(days),
              ),
            if (type.countsOffDays)
              _Hint(
                icon: Icons.info_outline,
                text: l10n.leaveCountsOffDaysHint,
              ),
          ],
          const SizedBox(height: 16),
          _DateField(
            key: ApplyTab.startFieldKey,
            label: l10n.leaveStartDate,
            date: _start,
            onTap: _pickStart,
          ),
          const SizedBox(height: 12),
          _DateField(
            key: ApplyTab.endFieldKey,
            label: l10n.leaveEndDate,
            date: _end,
            onTap: _start == null ? null : _pickEnd,
          ),
          if (_halfDayPossible) ...[
            const SizedBox(height: 12),
            SegmentedButton<_DayPart>(
              key: ApplyTab.dayPartKey,
              showSelectedIcon: false,
              segments: [
                ButtonSegment(
                  value: _DayPart.full,
                  label: Text(l10n.leaveFullDay),
                ),
                ButtonSegment(
                  value: _DayPart.firstHalf,
                  label: Text(l10n.halfDayName(HalfDay.firstHalf.wire)),
                ),
                ButtonSegment(
                  value: _DayPart.secondHalf,
                  label: Text(l10n.halfDayName(HalfDay.secondHalf.wire)),
                ),
              ],
              selected: {_dayPart},
              onSelectionChanged: (parts) {
                setState(() => _dayPart = parts.single);
                _refreshPreview();
              },
            ),
          ],
          const SizedBox(height: 16),
          TextFormField(
            key: ApplyTab.reasonFieldKey,
            controller: _reason,
            minLines: 2,
            maxLines: 4,
            maxLength: 500,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(
              labelText: l10n.leaveReason,
              alignLabelWithHint: true,
            ),
            buildCounter:
                (
                  context, {
                  required currentLength,
                  required isFocused,
                  maxLength,
                }) => Text(
                  '${formatNumber(l10n, currentLength)}/'
                  '${formatNumber(l10n, maxLength ?? 500)}',
                  style: theme.textTheme.bodySmall,
                ),
            validator: (value) => (value ?? '').trim().length < 3
                ? l10n.leaveReasonTooShort
                : null,
          ),
          const SizedBox(height: 8),
          _PreviewPanel(
            key: ApplyTab.previewKey,
            ready: draft != null,
            loading: _previewing,
            preview: _preview,
            error: _previewError,
            onRetry: _refreshPreview,
          ),
          if (_submitProblems.isNotEmpty) ...[
            const SizedBox(height: 12),
            NoticeCard(
              key: ApplyTab.problemsKey,
              icon: Icons.error_outline,
              message: l10n.leaveProblemsTitle,
              details: _submitProblems,
              background: scheme.errorContainer,
              foreground: scheme.onErrorContainer,
            ),
          ],
          if (_submitError case final error?) ...[
            const SizedBox(height: 12),
            NoticeCard(
              icon: Icons.error_outline,
              message: describeError(l10n, error),
              background: scheme.errorContainer,
              foreground: scheme.onErrorContainer,
            ),
          ],
          const SizedBox(height: 16),
          FilledButton(
            key: ApplyTab.submitKey,
            onPressed: _canSubmit ? _submit : null,
            child: _submitting
                ? const SizedBox.square(
                    dimension: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(l10n.leaveSubmit),
          ),
        ],
      ),
    );
  }
}

class _Hint extends StatelessWidget {
  const _Hint({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = theme.colorScheme.onSurfaceVariant;
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: theme.textTheme.bodySmall?.copyWith(color: color),
            ),
          ),
        ],
      ),
    );
  }
}

/// Looks like a text field; tapping it opens the date picker.
class _DateField extends StatelessWidget {
  const _DateField({
    super.key,
    required this.label,
    required this.date,
    required this.onTap,
  });

  final String label;
  final DateTime? date;

  /// `null` disables the field.
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final date = this.date;
    return Semantics(
      button: true,
      enabled: onTap != null,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(4),
        child: InputDecorator(
          isEmpty: date == null,
          decoration: InputDecoration(
            labelText: label,
            hintText: l10n.leaveChooseDate,
            enabled: onTap != null,
            suffixIcon: const Icon(Icons.calendar_today_outlined),
          ),
          child: Text(
            date == null ? '' : formatDate(l10n, date),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ),
    );
  }
}

/// Day count, days not counted, the balance and any problems, from the
/// latest preview.
class _PreviewPanel extends StatelessWidget {
  const _PreviewPanel({
    super.key,
    required this.ready,
    required this.loading,
    required this.preview,
    required this.error,
    required this.onRetry,
  });

  /// A type and both dates are chosen.
  final bool ready;
  final bool loading;
  final LeavePreview? preview;
  final Object? error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final preview = this.preview;
    final error = this.error;

    final List<Widget> children;
    if (!ready) {
      children = [
        Text(
          l10n.leavePreviewHint,
          style: theme.textTheme.bodyMedium?.copyWith(
            color: scheme.onSurfaceVariant,
          ),
        ),
      ];
    } else if (error != null) {
      children = [
        Text(describeError(l10n, error), style: TextStyle(color: scheme.error)),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: TextButton(onPressed: onRetry, child: Text(l10n.retry)),
        ),
      ];
    } else if (preview == null) {
      children = [const LinearProgressIndicator()];
    } else {
      children = [
        if (loading) const LinearProgressIndicator(),
        Wrap(
          spacing: 32,
          runSpacing: 8,
          children: [
            MergeSemantics(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    l10n.leaveDaysLabel,
                    style: theme.textTheme.labelMedium?.copyWith(
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                  Text(
                    l10n.leaveDays(preview.days),
                    style: theme.textTheme.headlineSmall?.copyWith(
                      color: scheme.primary,
                    ),
                  ),
                ],
              ),
            ),
            if (preview.balance case final balance?)
              LeaveFact(
                label: l10n.leaveAvailable,
                value: balanceAvailableText(l10n, balance),
              ),
          ],
        ),
        if (preview.excluded.isNotEmpty) ...[
          Text(
            l10n.leaveNotCounted,
            style: theme.textTheme.labelLarge?.copyWith(
              color: scheme.onSurfaceVariant,
            ),
          ),
          for (final day in preview.excluded) _ExcludedRow(day: day),
        ],
        if (preview.problems.isNotEmpty)
          NoticeCard(
            key: ApplyTab.problemsKey,
            icon: Icons.error_outline,
            message: l10n.leaveProblemsTitle,
            details: preview.problems,
            background: scheme.errorContainer,
            foreground: scheme.onErrorContainer,
          ),
      ];
    }

    return Card.filled(
      margin: EdgeInsets.zero,
      color: scheme.surfaceContainerLow,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: 8,
          children: children,
        ),
      ),
    );
  }
}

class _ExcludedRow extends StatelessWidget {
  const _ExcludedRow({required this.day});

  final ExcludedDay day;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final reason = l10n.excludedDayReason(day.reason.wire);
    final name = day.name;
    return MergeSemantics(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 96,
            child: Text(
              formatWeekdayDate(l10n, day.date),
              style: theme.textTheme.bodyMedium,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              name == null || name.isEmpty
                  ? reason
                  : l10n.excludedDayWithName(reason, name),
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// After Send: the new request as the API returned it.
class _Submitted extends StatelessWidget {
  const _Submitted({
    required this.request,
    required this.onShowRequests,
    required this.onApplyAgain,
  });

  final LeaveRequest request;
  final VoidCallback onShowRequests;
  final VoidCallback onApplyAgain;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    return ListView(
      key: ApplyTab.submittedKey,
      padding: const EdgeInsets.all(16),
      children: [
        NoticeCard(
          icon: Icons.check_circle_outline,
          title: l10n.leaveSubmitted,
          message: l10n.leaveSubmittedBody,
          background: scheme.primaryContainer,
          foreground: scheme.onPrimaryContainer,
        ),
        const SizedBox(height: 16),
        LeaveRequestCard(request: request),
        const SizedBox(height: 16),
        FilledButton.tonal(
          key: ApplyTab.showRequestsKey,
          onPressed: onShowRequests,
          child: Text(l10n.leaveViewRequests),
        ),
        const SizedBox(height: 8),
        TextButton(
          key: ApplyTab.applyAgainKey,
          onPressed: onApplyAgain,
          child: Text(l10n.leaveApplyAgain),
        ),
      ],
    );
  }
}
