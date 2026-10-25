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

/// The signed-in employee's salary advances and loans: what each is, where
/// it stands and what is left to pay, with its repayments.
class LoansTab extends ConsumerWidget {
  const LoansTab({super.key});

  static ValueKey<String> loanKey(String id) => ValueKey('loan-$id');
  static ValueKey<String> repaymentsKey(String id) =>
      ValueKey('loan-repayments-$id');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final loans = ref.watch(myLoansProvider);

    return RefreshIndicator(
      onRefresh: () => awaitRefresh(ref.refresh(myLoansProvider.future)),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          switch (loans) {
            AsyncData(value: final List<LoanView> list) when list.isEmpty =>
              LeaveEmptyState(
                icon: Icons.account_balance_wallet_outlined,
                message: l10n.loansEmpty,
              ),
            AsyncData(value: final List<LoanView> list) => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 12,
              children: [
                for (final loan in list)
                  _LoanCard(key: loanKey(loan.id), loan: loan),
              ],
            ),
            AsyncError(:final error)
                when !loans.isLoading && error is! SessionExpiredException =>
              LoadErrorView(
                title: l10n.loansLoadFailed,
                error: error,
                onRetry: () => ref.invalidate(myLoansProvider),
              ),
            _ => const LeaveLoading(),
          },
        ],
      ),
    );
  }
}

class _LoanCard extends StatelessWidget {
  const _LoanCard({super.key, required this.loan});

  final LoanView loan;

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
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: 8,
          children: [
            CardHeading(
              l10n.loanKindName(loan.kind.wire),
              trailing: LoanStatusPill(status: loan.status),
            ),
            Wrap(
              spacing: 32,
              runSpacing: 8,
              children: [
                LeaveFact(
                  label: l10n.loanPrincipal,
                  value: formatTaka(l10n, loan.principal),
                ),
                LeaveFact(
                  label: l10n.loanInstallment,
                  value: formatTaka(l10n, loan.installment),
                ),
                LeaveFact(
                  label: l10n.loanOutstanding,
                  value: formatTaka(l10n, loan.outstanding),
                ),
                LeaveFact(
                  label: l10n.loanRepaid,
                  value: formatTaka(l10n, loan.repaid),
                ),
                LeaveFact(
                  label: l10n.loanStartMonth,
                  value: formatMonth(l10n, loan.startMonth),
                ),
              ],
            ),
            if (loan.reason.isNotEmpty)
              Text(
                loan.reason,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: scheme.onSurfaceVariant,
                ),
              ),
            ExpansionTile(
              key: LoansTab.repaymentsKey(loan.id),
              tilePadding: EdgeInsets.zero,
              childrenPadding: const EdgeInsets.only(bottom: 12),
              shape: const Border(),
              collapsedShape: const Border(),
              expandedCrossAxisAlignment: CrossAxisAlignment.stretch,
              title: Text(
                l10n.loanRepayments(loan.repayments.length),
                style: theme.textTheme.labelLarge,
              ),
              children: [
                if (loan.repayments.isEmpty)
                  Text(l10n.loanNoRepayments, style: secondary),
                for (final (index, repayment) in loan.repayments.indexed) ...[
                  if (index > 0) const Divider(height: 12),
                  MergeSemantics(
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            spacing: 2,
                            children: [
                              Text(
                                formatShortDate(l10n, repayment.date),
                                style: theme.textTheme.bodyMedium,
                              ),
                              Text(
                                repayment.fromSalary
                                    ? l10n.loanFromSalary
                                    : l10n.loanPaidIn,
                                style: secondary,
                              ),
                              if (repayment.note case final note?
                                  when note.isNotEmpty)
                                Text(note, style: secondary),
                            ],
                          ),
                        ),
                        const SizedBox(width: 12),
                        Text(
                          formatTaka(l10n, repayment.amount),
                          style: theme.textTheme.titleSmall,
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}
