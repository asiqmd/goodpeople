import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_models.dart';
import '../auth/auth_controller.dart';
import '../l10n/app_localizations.dart';
import '../leave/leave_widgets.dart';
import '../ui/format.dart';
import '../ui/load_error_view.dart';
import 'pay_providers.dart';
import 'pay_widgets.dart';

/// The signed-in employee's provident fund: both accounts' balances, what
/// they would take on leaving today, and every entry.
class ProvidentFundTab extends ConsumerWidget {
  const ProvidentFundTab({super.key});

  static const balanceKey = ValueKey('pf-balance');
  static const payableKey = ValueKey('pf-payable');
  static ValueKey<String> entryKey(String id) => ValueKey('pf-entry-$id');
  static ValueKey<String> entryAmountKey(String id) =>
      ValueKey('pf-entry-amount-$id');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final fund = ref.watch(myProvidentFundProvider);

    return RefreshIndicator(
      onRefresh: () =>
          awaitRefresh(ref.refresh(myProvidentFundProvider.future)),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          switch (fund) {
            AsyncData(value: final PfStatement statement) => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 12,
              children: [
                _BalanceCard(statement: statement),
                _EntriesCard(entries: statement.entries),
              ],
            ),
            AsyncData() => LeaveEmptyState(
              icon: Icons.savings_outlined,
              message: l10n.pfNotMember,
            ),
            AsyncError(:final error)
                when !fund.isLoading && error is! SessionExpiredException =>
              LoadErrorView(
                title: l10n.pfLoadFailed,
                error: error,
                onRetry: () => ref.invalidate(myProvidentFundProvider),
              ),
            _ => const LeaveLoading(),
          },
        ],
      ),
    );
  }
}

class _BalanceCard extends StatelessWidget {
  const _BalanceCard({required this.statement});

  final PfStatement statement;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final balance = statement.balance;
    final label = theme.textTheme.labelMedium?.copyWith(
      color: scheme.onSurfaceVariant,
    );
    final secondary = theme.textTheme.bodySmall?.copyWith(
      color: scheme.onSurfaceVariant,
    );

    return Card.outlined(
      key: ProvidentFundTab.balanceKey,
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: 12,
          children: [
            MergeSemantics(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(l10n.pfTotal, style: label),
                  Text(
                    formatTaka(l10n, balance.total),
                    style: theme.textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
            Wrap(
              spacing: 32,
              runSpacing: 8,
              children: [
                LeaveFact(
                  label: l10n.pfOwn,
                  value: formatTaka(l10n, balance.own),
                ),
                LeaveFact(
                  label: l10n.pfEmployer,
                  value: formatTaka(l10n, balance.employer),
                ),
              ],
            ),
            const Divider(height: 4),
            MergeSemantics(
              key: ProvidentFundTab.payableKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(l10n.pfPayable, style: label),
                  Text(
                    formatTaka(l10n, balance.payable),
                    style: theme.textTheme.titleLarge?.copyWith(
                      color: scheme.primary,
                    ),
                  ),
                  Text(
                    l10n.pfVested(formatNumber(l10n, balance.vestedPercent)),
                    style: secondary,
                  ),
                ],
              ),
            ),
            Text(
              l10n.pfMemberSince(formatDate(l10n, statement.joinedOn)),
              style: secondary,
            ),
            if (statement.leftOn case final leftOn?)
              Text(l10n.pfLeftOn(formatDate(l10n, leftOn)), style: secondary),
          ],
        ),
      ),
    );
  }
}

class _EntriesCard extends StatelessWidget {
  const _EntriesCard({required this.entries});

  final List<PfEntry> entries;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final secondary = theme.textTheme.bodySmall?.copyWith(
      color: scheme.onSurfaceVariant,
    );

    return Card.outlined(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: 12,
          children: [
            CardHeading(l10n.pfEntriesTitle),
            if (entries.isEmpty) Text(l10n.pfNoEntries, style: secondary),
            for (final (index, entry) in entries.indexed) ...[
              if (index > 0) const Divider(height: 1),
              MergeSemantics(
                key: ProvidentFundTab.entryKey(entry.id),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        spacing: 2,
                        children: [
                          Text(
                            l10n.pfEntryKindName(entry.kind.wire),
                            style: theme.textTheme.titleSmall,
                          ),
                          Text(
                            '${formatShortDate(l10n, entry.date)} · '
                            '${l10n.pfAccountName(entry.account.wire)}',
                            style: secondary,
                          ),
                          if (entry.note case final note? when note.isNotEmpty)
                            Text(note, style: secondary),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    Text(
                      formatTaka(l10n, entry.amount),
                      key: ProvidentFundTab.entryAmountKey(entry.id),
                      style: theme.textTheme.titleSmall?.copyWith(
                        color: entry.isOut ? scheme.error : null,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
