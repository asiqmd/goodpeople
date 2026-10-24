import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_models.dart';
import '../auth/auth_controller.dart';
import '../l10n/app_localizations.dart';
import '../leave/leave_widgets.dart';
import '../ui/format.dart';
import '../ui/load_error_view.dart';
import 'attendance_providers.dart';
import 'attendance_widgets.dart';

/// The signed-in employee's corrections (regularizations): status, the
/// times asked for and the approval trail, with Cancel for pending ones and
/// a button to ask for a new one.
class CorrectionsTab extends ConsumerStatefulWidget {
  const CorrectionsTab({super.key, required this.onRequest});

  /// Opens the correction form.
  final VoidCallback onRequest;

  static const requestKey = ValueKey('attendance-correction-request');
  static const confirmCancelKey = ValueKey('attendance-correction-confirm');

  static ValueKey<String> correctionKey(String id) =>
      ValueKey('attendance-correction-$id');
  static ValueKey<String> cancelKey(String id) =>
      ValueKey('attendance-correction-cancel-$id');

  @override
  ConsumerState<CorrectionsTab> createState() => _CorrectionsTabState();
}

class _CorrectionsTabState extends ConsumerState<CorrectionsTab> {
  /// Corrections whose cancel call is running.
  final _cancelling = <String>{};

  Future<void> _cancel(Regularization correction) async {
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    // Still usable if the screen closes before the call returns.
    final container = ProviderScope.containerOf(context, listen: false);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.correctionCancelTitle),
        content: Text(
          l10n.correctionCancelBody(formatShortDate(l10n, correction.date)),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(l10n.leaveKeepRequest),
          ),
          FilledButton(
            key: CorrectionsTab.confirmCancelKey,
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(l10n.correctionCancel),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _cancelling.add(correction.id));
    try {
      await container
          .read(authProvider.notifier)
          .cancelRegularization(correction.id);
      container
        ..invalidate(myRegularizationsProvider)
        ..invalidate(myAttendanceProvider);
      messenger.showSnackBar(SnackBar(content: Text(l10n.correctionCancelled)));
    } on SessionExpiredException {
      // AuthGate is already showing the login screen.
    } on Object catch (error) {
      // A 409 means it was decided meanwhile: show why and reload.
      container.invalidate(myRegularizationsProvider);
      messenger.showSnackBar(
        SnackBar(content: Text(attendanceErrorText(l10n, error))),
      );
    } finally {
      if (mounted) setState(() => _cancelling.remove(correction.id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final corrections = ref.watch(myRegularizationsProvider);

    return RefreshIndicator(
      onRefresh: () =>
          awaitRefresh(ref.refresh(myRegularizationsProvider.future)),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          switch (corrections) {
            AsyncData(value: final List<Regularization> list) => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 12,
              children: [
                FilledButton.tonalIcon(
                  key: CorrectionsTab.requestKey,
                  onPressed: widget.onRequest,
                  icon: const Icon(Icons.add),
                  label: Text(l10n.correctionRequest),
                ),
                if (list.isEmpty)
                  LeaveEmptyState(
                    icon: Icons.fact_check_outlined,
                    message: l10n.correctionsEmpty,
                  ),
                for (final correction in list)
                  _CorrectionCard(
                    key: CorrectionsTab.correctionKey(correction.id),
                    correction: correction,
                    cancelling: _cancelling.contains(correction.id),
                    onCancel: correction.canCancel
                        ? () => _cancel(correction)
                        : null,
                  ),
              ],
            ),
            AsyncData() => LeaveEmptyState(
              icon: Icons.badge_outlined,
              title: l10n.leaveNoEmployeeTitle,
              message: l10n.attendanceNoEmployeeBody,
            ),
            AsyncError(:final error)
                when !corrections.isLoading &&
                    error is! SessionExpiredException =>
              LoadErrorView(
                title: l10n.correctionsLoadFailed,
                error: error,
                onRetry: () => ref.invalidate(myRegularizationsProvider),
              ),
            _ => const LeaveLoading(),
          },
        ],
      ),
    );
  }
}

class _CorrectionCard extends StatelessWidget {
  const _CorrectionCard({
    super.key,
    required this.correction,
    required this.cancelling,
    this.onCancel,
  });

  final Regularization correction;
  final bool cancelling;

  /// Shows a Cancel button when set.
  final VoidCallback? onCancel;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final times = correctionTimesText(l10n, correction);

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
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        formatShortDate(l10n, correction.date),
                        style: theme.textTheme.titleMedium,
                      ),
                      Text(
                        l10n.regularizationKindName(correction.kind.wire),
                        style: theme.textTheme.bodyMedium,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                RegularizationStatusPill(status: correction.status),
              ],
            ),
            if (times != null) Text(times, style: theme.textTheme.bodyMedium),
            Text(
              correction.reason,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: scheme.onSurfaceVariant,
              ),
            ),
            if (correction.steps.isNotEmpty) ...[
              const Divider(height: 8),
              ApprovalTrail(steps: correction.steps),
            ],
            if (onCancel != null)
              Align(
                alignment: AlignmentDirectional.centerEnd,
                child: TextButton.icon(
                  key: CorrectionsTab.cancelKey(correction.id),
                  onPressed: cancelling ? null : onCancel,
                  icon: const Icon(Icons.close),
                  label: Text(l10n.correctionCancel),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
