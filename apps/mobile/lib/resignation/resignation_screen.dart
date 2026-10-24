import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/api_models.dart';
import '../auth/auth_controller.dart';
import '../l10n/app_localizations.dart';
import '../leave/leave_providers.dart';
import '../leave/leave_widgets.dart';
import '../ui/format.dart';
import '../ui/language_menu.dart';
import '../ui/load_error_view.dart';
import '../ui/notice_card.dart';
import '../ui/theme.dart';
import 'separation_providers.dart';
import 'separation_widgets.dart';

/// The signed-in employee's resignation: the ones on record with their
/// status, notice and approval trail, Cancel for a pending one, and, when
/// none is pending or approved, the form to resign.
///
/// Resigning gives notice today. The form explains the Labour Act's notice
/// first; the API works out what applies to this employee and how many days
/// short the notice is, and the card shows both once it is sent.
class ResignationScreen extends ConsumerStatefulWidget {
  const ResignationScreen({super.key});

  static const formKey = ValueKey('resignation-form');
  static const noticeInfoKey = ValueKey('resignation-notice-info');
  static const lastDayFieldKey = ValueKey('resignation-last-day');
  static const noticeGivenKey = ValueKey('resignation-notice-given');
  static const reasonFieldKey = ValueKey('resignation-reason');
  static const errorKey = ValueKey('resignation-error');
  static const submitKey = ValueKey('resignation-submit');
  static const confirmKey = ValueKey('resignation-confirm');
  static const confirmCancelKey = ValueKey('resignation-cancel-confirm');

  static ValueKey<String> separationKey(String id) =>
      ValueKey('separation-$id');
  static ValueKey<String> cancelKey(String id) =>
      ValueKey('separation-cancel-$id');

  /// Where the date picker opens: the 60 days' notice a permanent worker
  /// gives.
  static const suggestedNoticeDays = 60;

  /// How far ahead the last working day can be picked.
  static const maxDaysAhead = 365;

  static Route<void> route() =>
      MaterialPageRoute(builder: (context) => const ResignationScreen());

  @override
  ConsumerState<ResignationScreen> createState() => _ResignationScreenState();
}

class _ResignationScreenState extends ConsumerState<ResignationScreen> {
  final _formKey = GlobalKey<FormState>();
  final _reason = TextEditingController();
  DateTime? _lastDay;

  /// Set by Send, so the date shows its error only after a try.
  bool _triedSubmit = false;
  bool _submitting = false;
  Object? _error;

  /// Separations whose cancel call is running.
  final _cancelling = <String>{};

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  static DateTime _local(DateTime date) =>
      DateTime(date.year, date.month, date.day);

  Future<void> _pickLastDay() async {
    final l10n = AppLocalizations.of(context);
    final today = ref.read(todayProvider);
    final chosen = _lastDay;
    final picked = await showDatePicker(
      context: context,
      helpText: l10n.separationLastWorkingDay,
      // A day chosen before midnight may be in the past by now.
      initialDate: _local(
        chosen != null && !chosen.isBefore(today)
            ? chosen
            : today.add(
                const Duration(days: ResignationScreen.suggestedNoticeDays),
              ),
      ),
      firstDate: _local(today),
      lastDate: _local(
        today.add(const Duration(days: ResignationScreen.maxDaysAhead)),
      ),
    );
    if (picked == null || !mounted) return;
    setState(() {
      _lastDay = DateTime.utc(picked.year, picked.month, picked.day);
      _error = null;
    });
  }

  Future<void> _submit() async {
    final formValid = _formKey.currentState?.validate() ?? false;
    setState(() => _triedSubmit = true);
    final lastDay = _lastDay;
    if (!formValid || lastDay == null) return;

    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    // Still usable if the screen closes before the call returns.
    final container = ProviderScope.containerOf(context, listen: false);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.resignConfirmTitle),
        content: Text(l10n.resignConfirmBody(formatDate(l10n, lastDay))),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(MaterialLocalizations.of(context).cancelButtonLabel),
          ),
          FilledButton(
            key: ResignationScreen.confirmKey,
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(l10n.resignConfirm),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await container
          .read(authProvider.notifier)
          .resign(
            ResignationDraft(
              lastWorkingDay: lastDay,
              reason: _reason.text.trim(),
            ),
          );
      container.invalidate(mySeparationsProvider);
      messenger.showSnackBar(SnackBar(content: Text(l10n.resignSent)));
      if (mounted) {
        setState(() {
          _lastDay = null;
          _triedSubmit = false;
          _reason.clear();
        });
      }
    } on SessionExpiredException {
      // AuthGate is already showing the login screen.
    } on Object catch (error) {
      if (mounted) setState(() => _error = error);
      // One is open after all, perhaps recorded by HR meanwhile: show it.
      // The form gives way to it, so the message goes in a snack bar too.
      if (error is ApiException && error.code == 'separation_open') {
        container.invalidate(mySeparationsProvider);
        messenger.showSnackBar(
          SnackBar(content: Text(separationErrorText(l10n, error))),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  Future<void> _cancel(Separation separation) async {
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final container = ProviderScope.containerOf(context, listen: false);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.resignationCancelTitle),
        content: Text(
          l10n.resignationCancelBody(
            formatDate(l10n, separation.lastWorkingDay),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(l10n.leaveKeepRequest),
          ),
          FilledButton(
            key: ResignationScreen.confirmCancelKey,
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(l10n.resignationCancel),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _cancelling.add(separation.id));
    try {
      await container
          .read(authProvider.notifier)
          .cancelSeparation(separation.id);
      container.invalidate(mySeparationsProvider);
      messenger.showSnackBar(
        SnackBar(content: Text(l10n.resignationCancelled)),
      );
    } on SessionExpiredException {
      // AuthGate is already showing the login screen.
    } on Object catch (error) {
      // A 409 means it was decided meanwhile: show why and reload.
      container.invalidate(mySeparationsProvider);
      messenger.showSnackBar(
        SnackBar(content: Text(separationErrorText(l10n, error))),
      );
    } finally {
      if (mounted) setState(() => _cancelling.remove(separation.id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final separations = ref.watch(mySeparationsProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.resignationTitle),
        actions: const [LanguageMenuButton()],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () =>
              awaitRefresh(ref.refresh(mySeparationsProvider.future)),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: [
              switch (separations) {
                AsyncData(value: final List<Separation> list) => _content(
                  context,
                  list,
                ),
                AsyncData() => LeaveEmptyState(
                  icon: Icons.badge_outlined,
                  title: l10n.leaveNoEmployeeTitle,
                  message: l10n.separationsNoEmployeeBody,
                ),
                AsyncError(:final error)
                    when !separations.isLoading &&
                        error is! SessionExpiredException =>
                  LoadErrorView(
                    title: l10n.separationsLoadFailed,
                    error: error,
                    onRetry: () => ref.invalidate(mySeparationsProvider),
                  ),
                _ => const LeaveLoading(),
              },
            ],
          ),
        ),
      ),
    );
  }

  /// Open separations first; the form when there is none; then the rest.
  Widget _content(BuildContext context, List<Separation> list) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final open = [
      for (final s in list)
        if (s.isOpen) s,
    ];
    final closed = [
      for (final s in list)
        if (!s.isOpen) s,
    ];

    Widget card(Separation separation) => _SeparationCard(
      key: ResignationScreen.separationKey(separation.id),
      separation: separation,
      cancelling: _cancelling.contains(separation.id),
      onCancel: separation.canCancel ? () => _cancel(separation) : null,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 12,
      children: [
        for (final separation in open) card(separation),
        if (open.isEmpty) _form(context),
        if (closed.isNotEmpty) ...[
          const SizedBox(height: 4),
          Semantics(
            header: true,
            child: Text(
              l10n.separationsEarlier,
              style: theme.textTheme.titleMedium,
            ),
          ),
          for (final separation in closed) card(separation),
        ],
      ],
    );
  }

  Widget _form(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final error = _error;
    final lastDay = _lastDay;
    final noticeGiven = lastDay?.difference(ref.watch(todayProvider)).inDays;

    return Card.outlined(
      key: ResignationScreen.formKey,
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: 16,
            children: [
              Semantics(
                header: true,
                child: Text(
                  l10n.resignHeading,
                  style: theme.textTheme.titleMedium,
                ),
              ),
              NoticeCard(
                key: ResignationScreen.noticeInfoKey,
                icon: Icons.gavel_outlined,
                message: l10n.resignNoticeInfo,
                background: scheme.surfaceContainerHigh,
                foreground: scheme.onSurface,
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                spacing: 8,
                children: [
                  _DateField(
                    key: ResignationScreen.lastDayFieldKey,
                    label: l10n.separationLastWorkingDay,
                    value: lastDay == null ? null : formatDate(l10n, lastDay),
                    hint: l10n.leaveChooseDate,
                    errorText: _triedSubmit && lastDay == null
                        ? l10n.resignLastDayRequired
                        : null,
                    onTap: _pickLastDay,
                  ),
                  if (noticeGiven != null)
                    Text(
                      l10n.resignNoticeGiven(l10n.leaveDays(noticeGiven)),
                      key: ResignationScreen.noticeGivenKey,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: scheme.onSurfaceVariant,
                      ),
                    ),
                ],
              ),
              TextFormField(
                key: ResignationScreen.reasonFieldKey,
                controller: _reason,
                minLines: 2,
                maxLines: 5,
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
              if (error != null)
                NoticeCard(
                  key: ResignationScreen.errorKey,
                  icon: Icons.error_outline,
                  message: separationErrorText(l10n, error),
                  background: scheme.errorContainer,
                  foreground: scheme.onErrorContainer,
                ),
              FilledButton(
                key: ResignationScreen.submitKey,
                onPressed: _submitting ? null : _submit,
                child: _submitting
                    ? const SizedBox.square(
                        dimension: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(l10n.resignSubmit),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A resignation or a separation HR recorded: kind, status, the notice
/// and the last day, the reason and the approval trail, with Cancel when
/// set.
class _SeparationCard extends StatelessWidget {
  const _SeparationCard({
    super.key,
    required this.separation,
    required this.cancelling,
    this.onCancel,
  });

  final Separation separation;
  final bool cancelling;
  final VoidCallback? onCancel;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final warning = StatusColors.of(context);
    final s = separation;

    return Card.outlined(
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
                  child: Text(
                    l10n.separationTypeName(s.type.wire),
                    style: theme.textTheme.titleMedium,
                  ),
                ),
                const SizedBox(width: 8),
                SeparationStatusPill(status: s.status),
              ],
            ),
            Wrap(
              spacing: 32,
              runSpacing: 8,
              children: [
                LeaveFact(
                  label: l10n.separationNoticeDate,
                  value: formatShortDate(l10n, s.noticeDate),
                ),
                LeaveFact(
                  label: l10n.separationLastWorkingDay,
                  value: formatShortDate(l10n, s.lastWorkingDay),
                ),
                LeaveFact(
                  label: l10n.separationNoticeRequired,
                  value: switch (s.noticeDaysRequired) {
                    final int days => l10n.leaveDays(days),
                    null => l10n.separationNoNoticeRequired,
                  },
                ),
                LeaveFact(
                  label: l10n.separationNoticeGiven,
                  value: l10n.leaveDays(s.noticeGivenDays),
                ),
              ],
            ),
            if (s.noticeShortfallDays > 0)
              NoticeCard(
                icon: Icons.warning_amber_outlined,
                message: l10n.separationShortfall(
                  l10n.leaveDays(s.noticeShortfallDays),
                ),
                background: warning.warningContainer,
                foreground: warning.onWarningContainer,
              ),
            Text(
              s.reason,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: scheme.onSurfaceVariant,
              ),
            ),
            if (s.steps.isNotEmpty) ...[
              const Divider(height: 8),
              ApprovalTrail(steps: s.steps),
            ],
            if (onCancel != null)
              Align(
                alignment: AlignmentDirectional.centerEnd,
                child: TextButton.icon(
                  key: ResignationScreen.cancelKey(s.id),
                  onPressed: cancelling ? null : onCancel,
                  icon: const Icon(Icons.undo),
                  label: Text(l10n.resignationCancel),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Looks like a text field; tapping it opens the date picker.
class _DateField extends StatelessWidget {
  const _DateField({
    super.key,
    required this.label,
    required this.value,
    required this.hint,
    required this.onTap,
    this.errorText,
  });

  final String label;
  final String? value;
  final String hint;
  final VoidCallback onTap;
  final String? errorText;

  @override
  Widget build(BuildContext context) {
    final value = this.value;
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
            prefixIcon: const Icon(Icons.event_outlined),
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
