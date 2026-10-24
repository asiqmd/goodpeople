import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_models.dart';
import '../auth/auth_controller.dart';
import '../l10n/app_localizations.dart';
import '../ui/format.dart';
import '../ui/load_error_view.dart';
import 'leave_providers.dart';
import 'leave_widgets.dart';

/// A card per leave type with what is left for the chosen year.
class BalancesTab extends ConsumerWidget {
  const BalancesTab({super.key});

  static ValueKey<String> balanceKey(String leaveTypeId) =>
      ValueKey('leave-balance-$leaveTypeId');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final year = ref.watch(leaveYearProvider);
    final balances = ref.watch(leaveBalancesProvider(year));

    return RefreshIndicator(
      onRefresh: () =>
          awaitRefresh(ref.refresh(leaveBalancesProvider(year).future)),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          const LeaveYearSwitcher(),
          const SizedBox(height: 16),
          switch (balances) {
            AsyncData(value: final List<LeaveBalance> list) when list.isEmpty =>
              LeaveEmptyState(
                icon: Icons.event_busy_outlined,
                message: l10n.leaveNoTypes,
              ),
            AsyncData(value: final List<LeaveBalance> list) => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 12,
              children: [
                for (final balance in list)
                  _BalanceCard(
                    key: balanceKey(balance.leaveType.id),
                    balance: balance,
                  ),
              ],
            ),
            AsyncData() => LeaveEmptyState(
              icon: Icons.badge_outlined,
              title: l10n.leaveNoEmployeeTitle,
              message: l10n.leaveNoEmployeeBody,
            ),
            AsyncError(:final error)
                when !balances.isLoading && error is! SessionExpiredException =>
              LoadErrorView(
                title: l10n.leaveLoadFailed,
                error: error,
                onRetry: () => ref.invalidate(leaveBalancesProvider(year)),
              ),
            _ => const LeaveLoading(),
          },
        ],
      ),
    );
  }
}

class _BalanceCard extends StatelessWidget {
  const _BalanceCard({super.key, required this.balance});

  final LeaveBalance balance;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final b = balance;
    final facts = [
      if (b.entitlement case final entitlement?)
        (l10n.leaveEntitlement, entitlement),
      if (b.carriedForward != 0) (l10n.leaveCarriedForward, b.carriedForward),
      if (b.adjustments != 0) (l10n.leaveAdjustments, b.adjustments),
      (l10n.leaveTaken, b.taken),
      (l10n.leavePendingDays, b.pending),
    ];

    return Card.outlined(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        leaveTypeName(l10n, b.leaveType),
                        style: theme.textTheme.titleMedium,
                      ),
                      if (!b.leaveType.paid)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: LeavePill(
                            label: l10n.leaveUnpaid,
                            background: scheme.surfaceContainerHighest,
                            foreground: scheme.onSurfaceVariant,
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                MergeSemantics(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        balanceAvailableText(l10n, b),
                        style:
                            (b.isOnRequest
                                    ? theme.textTheme.titleMedium
                                    : theme.textTheme.headlineSmall)
                                ?.copyWith(color: scheme.primary),
                      ),
                      if (!b.isOnRequest)
                        Text(
                          l10n.leaveAvailable,
                          style: theme.textTheme.labelMedium?.copyWith(
                            color: scheme.onSurfaceVariant,
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 24,
              runSpacing: 8,
              children: [
                for (final (label, days) in facts)
                  LeaveFact(label: label, value: formatNumber(l10n, days)),
              ],
            ),
            if (b.eligibleFrom case final eligibleFrom?) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  Icon(Icons.event_outlined, size: 18, color: scheme.tertiary),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      l10n.leaveEligibleFrom(formatDate(l10n, eligibleFrom)),
                      style: theme.textTheme.bodyMedium,
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
