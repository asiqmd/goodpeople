import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_models.dart';
import '../auth/auth_controller.dart';
import '../l10n/app_localizations.dart';
import '../leave/leave_providers.dart';
import '../ui/format.dart';
import '../ui/language_menu.dart';
import '../ui/notice_card.dart';
import 'attendance_providers.dart';
import 'attendance_widgets.dart';

/// The form to ask for an attendance correction: the day, a missed punch
/// (with the in time, the out time or both) or an on-duty day, and why.
///
/// Pops the created [Regularization] after a successful send, or nothing
/// when the user goes back.
class CorrectionFormScreen extends ConsumerStatefulWidget {
  const CorrectionFormScreen({super.key, this.initialDate, this.shift});

  /// The day to correct, when the form opens from a day in the month.
  final DateTime? initialDate;

  /// That day's shift, if known: its start and end are where the time
  /// pickers open.
  final ShiftRef? shift;

  static Route<Regularization> route({DateTime? date, ShiftRef? shift}) =>
      MaterialPageRoute(
        builder: (context) =>
            CorrectionFormScreen(initialDate: date, shift: shift),
      );

  /// How far back the date picker goes. The workspace's own window (at most
  /// 90 days) is checked by the API.
  static const maxDaysBack = 90;

  static const dateFieldKey = ValueKey('correction-date');
  static const kindKey = ValueKey('correction-kind');
  static const inTimeKey = ValueKey('correction-in');
  static const outTimeKey = ValueKey('correction-out');
  static const clearInKey = ValueKey('correction-in-clear');
  static const clearOutKey = ValueKey('correction-out-clear');
  static const reasonFieldKey = ValueKey('correction-reason');
  static const errorKey = ValueKey('correction-error');
  static const submitKey = ValueKey('correction-submit');

  @override
  ConsumerState<CorrectionFormScreen> createState() =>
      _CorrectionFormScreenState();
}

class _CorrectionFormScreenState extends ConsumerState<CorrectionFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _reason = TextEditingController();

  late DateTime? _date = widget.initialDate;
  RegularizationKind _kind = RegularizationKind.missedPunch;
  ClockTime? _inTime;
  ClockTime? _outTime;

  /// Set by Send, so the date and times show their errors only after a try.
  bool _triedSubmit = false;
  bool _submitting = false;
  Object? _error;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  bool get _missedPunch => _kind == RegularizationKind.missedPunch;

  bool get _timesMissing => _missedPunch && _inTime == null && _outTime == null;

  Future<void> _pickDate() async {
    final today = ref.read(todayProvider);
    final first = today.subtract(
      const Duration(days: CorrectionFormScreen.maxDaysBack),
    );
    final picked = await showDatePicker(
      context: context,
      initialDate: _local(_date ?? today),
      firstDate: _local(first),
      lastDate: _local(today),
    );
    if (picked == null || !mounted) return;
    setState(() {
      _date = DateTime.utc(picked.year, picked.month, picked.day);
      _error = null;
    });
  }

  Future<void> _pickTime({required bool isIn}) async {
    final fallback = isIn
        ? widget.shift?.startTime ?? const ClockTime(9, 0)
        : widget.shift?.endTime ?? const ClockTime(17, 0);
    final current = (isIn ? _inTime : _outTime) ?? fallback;
    final picked = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: current.hour, minute: current.minute),
    );
    if (picked == null || !mounted) return;
    final time = ClockTime(picked.hour, picked.minute);
    setState(() {
      if (isIn) {
        _inTime = time;
      } else {
        _outTime = time;
      }
      _error = null;
    });
  }

  Future<void> _submit() async {
    final formValid = _formKey.currentState?.validate() ?? false;
    setState(() => _triedSubmit = true);
    final date = _date;
    if (!formValid || date == null || _timesMissing) return;

    final draft = RegularizationDraft(
      date: date,
      kind: _kind,
      inTime: _missedPunch ? _inTime : null,
      outTime: _missedPunch ? _outTime : null,
      reason: _reason.text.trim(),
    );
    // Still usable if the screen closes before the call returns.
    final container = ProviderScope.containerOf(context, listen: false);
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final created = await container
          .read(authProvider.notifier)
          .requestRegularization(draft);
      container
        ..invalidate(myRegularizationsProvider)
        ..invalidate(myAttendanceProvider)
        ..invalidate(attendanceTodayProvider);
      if (mounted) Navigator.of(context).pop(created);
    } on SessionExpiredException {
      // AuthGate is already showing the login screen.
    } on Object catch (error) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = error;
      });
    }
  }

  static DateTime _local(DateTime date) =>
      DateTime(date.year, date.month, date.day);

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final error = _error;
    final hintStyle = theme.textTheme.bodySmall?.copyWith(
      color: scheme.onSurfaceVariant,
    );

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.correctionRequest),
        actions: const [LanguageMenuButton()],
      ),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _PickerField(
                key: CorrectionFormScreen.dateFieldKey,
                label: l10n.correctionDate,
                value: _date == null ? null : formatDate(l10n, _date!),
                hint: l10n.leaveChooseDate,
                icon: Icons.calendar_today_outlined,
                errorText: _triedSubmit && _date == null
                    ? l10n.correctionDateRequired
                    : null,
                onTap: _pickDate,
              ),
              const SizedBox(height: 16),
              SegmentedButton<RegularizationKind>(
                key: CorrectionFormScreen.kindKey,
                showSelectedIcon: false,
                segments: [
                  for (final kind in [
                    RegularizationKind.missedPunch,
                    RegularizationKind.onDuty,
                  ])
                    ButtonSegment(
                      value: kind,
                      label: Text(l10n.regularizationKindName(kind.wire)),
                    ),
                ],
                selected: {_kind},
                onSelectionChanged: (kinds) => setState(() {
                  _kind = kinds.single;
                  _error = null;
                }),
              ),
              const SizedBox(height: 16),
              if (_missedPunch) ...[
                _PickerField(
                  key: CorrectionFormScreen.inTimeKey,
                  label: l10n.correctionInTime,
                  value: _inTime == null ? null : clockText(l10n, _inTime!),
                  hint: l10n.correctionChooseTime,
                  icon: Icons.login,
                  errorText: _triedSubmit && _timesMissing ? '' : null,
                  onTap: () => _pickTime(isIn: true),
                  onClear: _inTime == null
                      ? null
                      : () => setState(() => _inTime = null),
                  clearKey: CorrectionFormScreen.clearInKey,
                ),
                const SizedBox(height: 12),
                _PickerField(
                  key: CorrectionFormScreen.outTimeKey,
                  label: l10n.correctionOutTime,
                  value: _outTime == null ? null : clockText(l10n, _outTime!),
                  hint: l10n.correctionChooseTime,
                  icon: Icons.logout,
                  errorText: _triedSubmit && _timesMissing
                      ? l10n.correctionTimesRequired
                      : null,
                  onTap: () => _pickTime(isIn: false),
                  onClear: _outTime == null
                      ? null
                      : () => setState(() => _outTime = null),
                  clearKey: CorrectionFormScreen.clearOutKey,
                ),
                const SizedBox(height: 8),
                Text(l10n.correctionTimesHint, style: hintStyle),
              ] else
                Text(l10n.correctionOnDutyHint, style: hintStyle),
              const SizedBox(height: 16),
              TextFormField(
                key: CorrectionFormScreen.reasonFieldKey,
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
              if (error != null) ...[
                const SizedBox(height: 12),
                NoticeCard(
                  key: CorrectionFormScreen.errorKey,
                  icon: Icons.error_outline,
                  message: attendanceErrorText(l10n, error),
                  background: scheme.errorContainer,
                  foreground: scheme.onErrorContainer,
                ),
              ],
              const SizedBox(height: 16),
              FilledButton(
                key: CorrectionFormScreen.submitKey,
                onPressed: _submitting ? null : _submit,
                child: _submitting
                    ? const SizedBox.square(
                        dimension: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(l10n.correctionSubmit),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Looks like a text field; tapping it opens a date or time picker. With
/// [onClear], a button empties it.
class _PickerField extends StatelessWidget {
  const _PickerField({
    super.key,
    required this.label,
    required this.value,
    required this.hint,
    required this.icon,
    required this.onTap,
    this.errorText,
    this.onClear,
    this.clearKey,
  });

  final String label;
  final String? value;
  final String hint;
  final IconData icon;
  final VoidCallback onTap;

  /// An empty string marks the field as wrong without a message under it.
  final String? errorText;
  final VoidCallback? onClear;
  final Key? clearKey;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final value = this.value;
    final clear = onClear;
    return Semantics(
      button: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(4),
        child: InputDecorator(
          isEmpty: value == null,
          decoration: InputDecoration(
            labelText: label,
            hintText: hint,
            errorText: errorText,
            prefixIcon: Icon(icon),
            suffixIcon: clear == null
                ? null
                : IconButton(
                    key: clearKey,
                    tooltip: l10n.correctionClearTime,
                    icon: const Icon(Icons.clear),
                    onPressed: clear,
                  ),
          ),
          child: Text(
            value ?? '',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ),
    );
  }
}
