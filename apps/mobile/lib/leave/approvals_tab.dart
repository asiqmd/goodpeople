import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_models.dart';
import '../auth/auth_controller.dart';
import '../l10n/app_localizations.dart';
import '../ui/error_text.dart';
import '../ui/load_error_view.dart';
import 'leave_providers.dart';
import 'leave_widgets.dart';

/// Other people's leave waiting for the signed-in user's decision.
class ApprovalsTab extends ConsumerWidget {
  const ApprovalsTab({super.key});

  static ValueKey<String> itemKey(String stepId) =>
      ValueKey('approval-$stepId');
  static ValueKey<String> approveKey(String stepId) =>
      ValueKey('approval-approve-$stepId');
  static ValueKey<String> rejectKey(String stepId) =>
      ValueKey('approval-reject-$stepId');

  static const commentFieldKey = ValueKey('approval-comment');
  static const confirmKey = ValueKey('approval-confirm');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final approvals = ref.watch(approvalsProvider);

    return RefreshIndicator(
      onRefresh: () => awaitRefresh(ref.refresh(approvalsProvider.future)),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          switch (approvals) {
            AsyncData(:final value) when value.isEmpty => LeaveEmptyState(
              icon: Icons.task_alt,
              message: l10n.approvalsEmpty,
            ),
            AsyncData(:final value) => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 12,
              children: [
                for (final item in value)
                  _ApprovalCard(key: itemKey(item.stepId), item: item),
              ],
            ),
            AsyncError(:final error)
                when !approvals.isLoading &&
                    error is! SessionExpiredException =>
              LoadErrorView(
                title: l10n.approvalsLoadFailed,
                error: error,
                onRetry: () => ref.invalidate(approvalsProvider),
              ),
            _ => const LeaveLoading(),
          },
        ],
      ),
    );
  }
}

class _ApprovalCard extends ConsumerStatefulWidget {
  const _ApprovalCard({super.key, required this.item});

  final ApprovalItem item;

  @override
  ConsumerState<_ApprovalCard> createState() => _ApprovalCardState();
}

class _ApprovalCardState extends ConsumerState<_ApprovalCard> {
  bool _busy = false;

  Future<void> _decide(ApprovalDecision decision) async {
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    // Still usable if this card is gone by the time the call returns.
    final container = ProviderScope.containerOf(context, listen: false);
    final comment = await showDialog<String>(
      context: context,
      builder: (context) => _DecisionDialog(decision: decision),
    );
    // `null` means the dialog was dismissed; an empty string, no comment.
    if (comment == null || !mounted) return;

    setState(() => _busy = true);
    try {
      await container
          .read(authProvider.notifier)
          .decideApproval(
            widget.item.stepId,
            decision,
            comment: comment.isEmpty ? null : comment,
          );
      messenger.showSnackBar(
        SnackBar(
          content: Text(switch (decision) {
            ApprovalDecision.approve => l10n.leaveApproved,
            ApprovalDecision.reject => l10n.leaveRejected,
          }),
        ),
      );
      container.invalidate(approvalsProvider);
    } on SessionExpiredException {
      // AuthGate is already showing the login screen.
    } on Object catch (error) {
      // 403 or 409: someone else decided, or the request changed. Show why
      // and reload the inbox.
      messenger.showSnackBar(
        SnackBar(content: Text(describeError(l10n, error))),
      );
      container.invalidate(approvalsProvider);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final item = widget.item;
    final request = item.request;
    final balance = item.balance;

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
                        request.employee.fullName,
                        style: theme.textTheme.titleMedium,
                      ),
                      Text(
                        request.employee.employeeCode,
                        style: theme.textTheme.labelLarge?.copyWith(
                          color: scheme.primary,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                LeavePill(
                  label: l10n.approvalYourStep(
                    l10n.approvalStepKindName(item.kind.wire),
                  ),
                  background: scheme.secondaryContainer,
                  foreground: scheme.onSecondaryContainer,
                ),
              ],
            ),
            Text(
              leaveTypeName(l10n, request.leaveType),
              style: theme.textTheme.titleSmall,
            ),
            Text(
              '${requestDatesText(l10n, request)} · '
              '${l10n.leaveDays(request.days)}',
              style: theme.textTheme.bodyMedium,
            ),
            Text(
              request.reason,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: scheme.onSurfaceVariant,
              ),
            ),
            if (balance != null)
              LeaveFact(
                label: l10n.approvalBalance,
                value: balance.isOnRequest
                    ? l10n.leaveOnRequest
                    : l10n.approvalAvailable(
                        balanceAvailableText(l10n, balance),
                      ),
              ),
            if (request.needsDocument)
              Text(
                l10n.leaveNeedsDocument,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: scheme.tertiary,
                ),
              ),
            if (request.steps.length > 1) ...[
              const Divider(height: 8),
              ApprovalTrail(steps: request.steps),
            ],
            const SizedBox(height: 4),
            // Stacks the buttons when both do not fit, as in Bangla on a
            // narrow phone.
            OverflowBar(
              alignment: MainAxisAlignment.end,
              overflowAlignment: OverflowBarAlignment.end,
              spacing: 8,
              overflowSpacing: 8,
              children: [
                OutlinedButton(
                  key: ApprovalsTab.rejectKey(item.stepId),
                  onPressed: _busy
                      ? null
                      : () => _decide(ApprovalDecision.reject),
                  child: Text(l10n.reject),
                ),
                FilledButton(
                  key: ApprovalsTab.approveKey(item.stepId),
                  onPressed: _busy
                      ? null
                      : () => _decide(ApprovalDecision.approve),
                  child: Text(l10n.approve),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Confirms a decision and takes an optional comment. Pops the trimmed
/// comment (empty for none), or `null` when dismissed.
class _DecisionDialog extends StatefulWidget {
  const _DecisionDialog({required this.decision});

  final ApprovalDecision decision;

  @override
  State<_DecisionDialog> createState() => _DecisionDialogState();
}

class _DecisionDialogState extends State<_DecisionDialog> {
  final _comment = TextEditingController();

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final approve = widget.decision == ApprovalDecision.approve;
    return AlertDialog(
      title: Text(approve ? l10n.approveTitle : l10n.rejectTitle),
      content: TextField(
        key: ApprovalsTab.commentFieldKey,
        controller: _comment,
        minLines: 1,
        maxLines: 4,
        maxLength: 500,
        textCapitalization: TextCapitalization.sentences,
        decoration: InputDecoration(labelText: l10n.decisionComment),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(MaterialLocalizations.of(context).cancelButtonLabel),
        ),
        FilledButton(
          key: ApprovalsTab.confirmKey,
          style: approve
              ? null
              : FilledButton.styleFrom(
                  backgroundColor: Theme.of(context).colorScheme.error,
                  foregroundColor: Theme.of(context).colorScheme.onError,
                ),
          onPressed: () => Navigator.of(context).pop(_comment.text.trim()),
          child: Text(approve ? l10n.approve : l10n.reject),
        ),
      ],
    );
  }
}
