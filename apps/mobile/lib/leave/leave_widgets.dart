import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_models.dart';
import '../l10n/app_localizations.dart';
import '../ui/format.dart';
import '../ui/theme.dart';
import 'leave_providers.dart';

/// [nameBn] under Bangla when HR entered one, else [name].
String localizedName(AppLocalizations l10n, String name, String? nameBn) =>
    l10n.localeName.startsWith('bn') && nameBn != null && nameBn.isNotEmpty
    ? nameBn
    : name;

String leaveTypeName(AppLocalizations l10n, LeaveTypeRef type) =>
    localizedName(l10n, type.name, type.nameBn);

/// The dates of a request, plus the half for a half day.
String requestDatesText(AppLocalizations l10n, LeaveRequest request) {
  final dates = formatDateRange(l10n, request.startDate, request.endDate);
  return switch (request.halfDay) {
    final HalfDay half => '$dates · ${l10n.halfDayName(half.wire)}',
    null => dates,
  };
}

/// Days left of a balance, or "On request" for per-event leave.
String balanceAvailableText(AppLocalizations l10n, LeaveBalance balance) =>
    switch (balance.available) {
      final num days => l10n.leaveDays(days),
      null => l10n.leaveOnRequest,
    };

/// Waits for a pull-to-refresh reload. A failure shows through the
/// provider's error state, so it is not rethrown here.
Future<void> awaitRefresh(Future<Object?> reload) async {
  try {
    await reload;
  } on Object {
    // Shown by the tab's error view.
  }
}

/// A spinner inside a tab's list.
class LeaveLoading extends StatelessWidget {
  const LeaveLoading({super.key});

  @override
  Widget build(BuildContext context) => const Padding(
    padding: EdgeInsets.all(32),
    child: Center(child: CircularProgressIndicator()),
  );
}

/// This year or next, shared by the Balances, My requests and Holidays tabs.
class LeaveYearSwitcher extends ConsumerWidget {
  const LeaveYearSwitcher({super.key});

  static ValueKey<String> yearKey(int year) => ValueKey('leave-year-$year');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final thisYear = ref.watch(todayProvider).year;
    final selected = ref.watch(leaveYearProvider);
    return Align(
      alignment: AlignmentDirectional.centerStart,
      child: SegmentedButton<int>(
        showSelectedIcon: false,
        segments: [
          for (final year in [thisYear, thisYear + 1])
            ButtonSegment(
              value: year,
              label: Text(formatYear(l10n, year), key: yearKey(year)),
            ),
        ],
        selected: {selected},
        onSelectionChanged: (years) =>
            ref.read(leaveYearProvider.notifier).select(years.single),
      ),
    );
  }
}

/// An icon, a title and a sentence, for empty and not-applicable states.
class LeaveEmptyState extends StatelessWidget {
  const LeaveEmptyState({
    super.key,
    required this.icon,
    required this.message,
    this.title,
  });

  final IconData icon;
  final String? title;
  final String message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 8),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 48, color: theme.colorScheme.outline),
          const SizedBox(height: 16),
          if (title case final title?) ...[
            Text(
              title,
              style: theme.textTheme.titleMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
          ],
          Text(message, textAlign: TextAlign.center),
        ],
      ),
    );
  }
}

/// A label above its value, read out together.
class LeaveFact extends StatelessWidget {
  const LeaveFact({super.key, required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return MergeSemantics(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: theme.textTheme.labelMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          Text(value, style: theme.textTheme.titleSmall),
        ],
      ),
    );
  }
}

/// A small coloured label, for example a request's status.
class LeavePill extends StatelessWidget {
  const LeavePill({
    super.key,
    required this.label,
    required this.background,
    required this.foreground,
  });

  /// The pill for a request [status].
  factory LeavePill.status(BuildContext context, LeaveRequestStatus status) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    final warning = StatusColors.of(context);
    final (background, foreground) = switch (status) {
      LeaveRequestStatus.pending => (
        warning.warningContainer,
        warning.onWarningContainer,
      ),
      LeaveRequestStatus.approved => (
        scheme.primaryContainer,
        scheme.onPrimaryContainer,
      ),
      LeaveRequestStatus.rejected => (
        scheme.errorContainer,
        scheme.onErrorContainer,
      ),
      LeaveRequestStatus.cancelled || LeaveRequestStatus.unknown => (
        scheme.surfaceContainerHighest,
        scheme.onSurfaceVariant,
      ),
    };
    return LeavePill(
      label: l10n.leaveStatusName(status.wire),
      background: background,
      foreground: foreground,
    );
  }

  final String label;
  final Color background;
  final Color foreground;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        child: Text(
          label,
          style: Theme.of(context).textTheme.labelMedium
              ?.copyWith(color: foreground),
        ),
      ),
    );
  }
}

/// A request's approval steps, in order: who, their status, and any comment.
class ApprovalTrail extends StatelessWidget {
  const ApprovalTrail({super.key, required this.steps});

  final List<ApprovalStep> steps;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 8,
      children: [
        Semantics(
          header: true,
          child: Text(
            l10n.approvalTrail,
            style: theme.textTheme.labelLarge?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ),
        for (final step in steps) _StepRow(step: step),
      ],
    );
  }
}

class _StepRow extends StatelessWidget {
  const _StepRow({required this.step});

  final ApprovalStep step;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final (icon, color) = switch (step.status) {
      ApprovalStatus.approved => (Icons.check_circle, scheme.primary),
      ApprovalStatus.rejected => (Icons.cancel, scheme.error),
      ApprovalStatus.pending => (Icons.hourglass_top, scheme.tertiary),
      ApprovalStatus.waiting => (Icons.schedule, scheme.outline),
      ApprovalStatus.skipped ||
      ApprovalStatus.cancelled ||
      ApprovalStatus.unknown => (Icons.remove_circle_outline, scheme.outline),
    };
    final kind = l10n.approvalStepKindName(step.kind.wire);
    // "Manager: Shirin Akter"; an HR step any HR admin can decide is just
    // "HR team".
    final title = switch (step.approver) {
      final PersonRef approver => l10n.approvalStepTitle(
        kind,
        approver.fullName,
      ),
      null when step.kind == ApprovalStepKind.hr => l10n.approvalHrTeam,
      null => kind,
    };
    final decided = [
      if (step.decidedBy case final name? when name.isNotEmpty)
        if (step.decidedAt case final at?)
          l10n.approvalDecidedBy(name, formatShortDate(l10n, at.toLocal()))
        else
          name,
    ];
    final secondary = theme.textTheme.bodySmall?.copyWith(
      color: scheme.onSurfaceVariant,
    );

    return MergeSemantics(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: color),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: theme.textTheme.bodyMedium),
                Text(
                  l10n.approvalStepStatusName(step.status.wire),
                  style: theme.textTheme.bodySmall?.copyWith(color: color),
                ),
                for (final line in decided) Text(line, style: secondary),
                if (step.comment case final comment? when comment.isNotEmpty)
                  Text(
                    '“$comment”',
                    style: theme.textTheme.bodySmall?.copyWith(
                      fontStyle: FontStyle.italic,
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// One of the user's own requests: type, status, dates, days, reason and
/// the approval trail, with an optional Cancel button.
class LeaveRequestCard extends StatelessWidget {
  const LeaveRequestCard({
    super.key,
    required this.request,
    this.onCancel,
    this.cancelling = false,
  });

  static ValueKey<String> cancelKey(String requestId) =>
      ValueKey('leave-request-cancel-$requestId');

  final LeaveRequest request;

  /// Shows a Cancel button when set.
  final VoidCallback? onCancel;

  /// Disables the Cancel button while the cancel call runs.
  final bool cancelling;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

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
                    leaveTypeName(l10n, request.leaveType),
                    style: theme.textTheme.titleMedium,
                  ),
                ),
                const SizedBox(width: 8),
                LeavePill.status(context, request.status),
              ],
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
            if (request.needsDocument)
              Row(
                children: [
                  Icon(
                    Icons.description_outlined,
                    size: 18,
                    color: scheme.tertiary,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      l10n.leaveNeedsDocument,
                      style: theme.textTheme.bodySmall,
                    ),
                  ),
                ],
              ),
            if (request.steps.isNotEmpty) ...[
              const Divider(height: 8),
              ApprovalTrail(steps: request.steps),
            ],
            if (onCancel != null)
              Align(
                alignment: AlignmentDirectional.centerEnd,
                child: TextButton.icon(
                  key: cancelKey(request.id),
                  onPressed: cancelling ? null : onCancel,
                  icon: const Icon(Icons.close),
                  label: Text(l10n.leaveCancelRequest),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
