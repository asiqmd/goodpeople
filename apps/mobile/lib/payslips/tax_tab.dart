import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_models.dart';
import '../auth/auth_controller.dart';
import '../documents/file_opener.dart';
import '../l10n/app_localizations.dart';
import '../leave/leave_providers.dart';
import '../leave/leave_widgets.dart';
import '../ui/format.dart';
import '../ui/load_error_view.dart';
import 'declaration_card.dart';
import 'pay_providers.dart';
import 'pay_widgets.dart';
import 'payslips_tab.dart';

/// The signed-in employee's salary tax for an income year (this one or the
/// one before): the year so far and the year's working, month by month,
/// the certificate as a PDF in either language, and the investment
/// declaration.
class TaxTab extends ConsumerStatefulWidget {
  const TaxTab({super.key});

  static ValueKey<String> fiscalYearKey(String fiscalYear) =>
      ValueKey('tax-year-$fiscalYear');
  static const summaryKey = ValueKey('tax-summary');
  static const workingKey = ValueKey('tax-working');
  static const openingKey = ValueKey('tax-opening');
  static const noMonthsKey = ValueKey('tax-no-months');
  static ValueKey<String> monthKey(String runId) =>
      ValueKey('tax-month-$runId');
  static ValueKey<String> monthKindKey(String runId) =>
      ValueKey('tax-month-kind-$runId');
  static ValueKey<String> certificateKey(LetterLanguage language) =>
      ValueKey('tax-certificate-${language.wire}');

  @override
  ConsumerState<TaxTab> createState() => _TaxTabState();
}

class _TaxTabState extends ConsumerState<TaxTab> {
  /// The certificate PDF downloading, and in which language.
  LetterLanguage? _opening;

  Future<void> _openCertificate(
    String fiscalYear,
    LetterLanguage language,
  ) async {
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    // Still usable if the screen closes before the call returns.
    final container = ProviderScope.containerOf(context, listen: false);
    setState(() => _opening = language);
    try {
      final file = await container
          .read(authProvider.notifier)
          .fetchMyTaxCertificate(fiscalYear, language);
      await container
          .read(fileOpenerProvider)
          .open(
            file.bytes,
            fileName:
                file.fileName ??
                'tax-certificate-$fiscalYear-${language.wire}.pdf',
            contentType: 'application/pdf',
          );
    } on SessionExpiredException {
      // AuthGate is already showing the login screen.
    } on Object catch (error) {
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(payFileErrorText(l10n, error))));
    } finally {
      if (mounted) setState(() => _opening = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final fiscalYear = ref.watch(taxFiscalYearProvider);
    final current = fiscalYearOf(ref.watch(todayProvider));
    final tax = ref.watch(myTaxYearProvider(fiscalYear));

    return RefreshIndicator(
      onRefresh: () =>
          awaitRefresh(ref.refresh(myTaxYearProvider(fiscalYear).future)),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: SegmentedButton<String>(
              showSelectedIcon: false,
              segments: [
                for (final year in [current, previousFiscalYear(current)])
                  ButtonSegment(
                    value: year,
                    label: Text(
                      formatFiscalYear(l10n, year),
                      key: TaxTab.fiscalYearKey(year),
                    ),
                  ),
              ],
              selected: {fiscalYear},
              onSelectionChanged: (years) =>
                  ref.read(taxFiscalYearProvider.notifier).select(years.single),
            ),
          ),
          const SizedBox(height: 16),
          switch (tax) {
            AsyncData(value: final TaxYearView view) => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 12,
              children: [
                _SummaryCard(view: view),
                _MonthsCard(months: view.months),
                _CertificateCard(
                  opening: _opening,
                  onOpen: (language) =>
                      _openCertificate(view.fiscalYear, language),
                ),
                DeclarationCard(
                  key: ValueKey('declaration-${view.fiscalYear}'),
                  fiscalYear: view.fiscalYear,
                  declaration: view.declaration,
                ),
              ],
            ),
            AsyncData() => LeaveEmptyState(
              icon: Icons.badge_outlined,
              title: l10n.leaveNoEmployeeTitle,
              message: l10n.taxNoEmployeeBody,
            ),
            AsyncError(:final error)
                when !tax.isLoading && error is! SessionExpiredException =>
              LoadErrorView(
                title: l10n.taxLoadFailed,
                error: error,
                onRetry: () => ref.invalidate(myTaxYearProvider(fiscalYear)),
              ),
            _ => const LeaveLoading(),
          },
        ],
      ),
    );
  }
}

/// [value] as taka: the tax working's whole-taka numbers.
String _taka(AppLocalizations l10n, num value) =>
    formatTaka(l10n, value.toString());

/// Salary paid and tax deducted so far, and the year's tax as the latest
/// run worked it out.
class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.view});

  final TaxYearView view;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final latest = view.latest;
    final secondary = theme.textTheme.bodySmall?.copyWith(
      color: scheme.onSurfaceVariant,
    );

    return Card.outlined(
      key: TaxTab.summaryKey,
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: 12,
          children: [
            CardHeading(l10n.taxYearSoFar),
            Wrap(
              spacing: 32,
              runSpacing: 8,
              children: [
                LeaveFact(
                  label: l10n.taxSalaryPaid,
                  value: formatTaka(l10n, view.salary),
                ),
                LeaveFact(
                  label: l10n.taxDeducted,
                  value: formatTaka(l10n, view.tax),
                ),
              ],
            ),
            if (view.opening case final opening?)
              Text(
                l10n.taxIncludesOpening(
                  formatTaka(l10n, opening.salary),
                  formatTaka(l10n, opening.tax),
                ),
                key: TaxTab.openingKey,
                style: secondary,
              ),
            const Divider(height: 4),
            if (latest == null)
              Text(l10n.taxNotWorkedOut, style: secondary)
            else
              Column(
                key: TaxTab.workingKey,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                spacing: 12,
                children: [
                  MergeSemantics(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          l10n.taxForYear,
                          style: theme.textTheme.labelMedium?.copyWith(
                            color: scheme.onSurfaceVariant,
                          ),
                        ),
                        Text(
                          _taka(l10n, latest.tax),
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
                        label: l10n.taxThisMonth,
                        value: formatTaka(l10n, latest.thisMonth),
                      ),
                      LeaveFact(
                        label: l10n.taxMonthsLeft,
                        value: formatNumber(l10n, latest.monthsLeft),
                      ),
                      LeaveFact(
                        label: l10n.taxRebate,
                        value: _taka(l10n, latest.rebate),
                      ),
                      LeaveFact(
                        label: l10n.taxThreshold,
                        value: _taka(l10n, latest.threshold),
                      ),
                    ],
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}

/// Each run of the year that paid the employee: its salary and tax, and
/// the challan the tax went to the treasury with.
class _MonthsCard extends StatelessWidget {
  const _MonthsCard({required this.months});

  final List<TaxMonth> months;

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
            CardHeading(l10n.taxMonthsTitle),
            if (months.isEmpty)
              Text(l10n.taxNoMonths, key: TaxTab.noMonthsKey, style: secondary),
            for (final (index, month) in months.indexed) ...[
              if (index > 0) const Divider(height: 1),
              MergeSemantics(
                key: TaxTab.monthKey(month.runId),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  spacing: 2,
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Text(
                            formatPayPeriod(l10n, month.month, month.periodEnd),
                            style: theme.textTheme.titleSmall,
                          ),
                        ),
                        if (runKindPill(
                              context,
                              month.kind,
                              key: TaxTab.monthKindKey(month.runId),
                            )
                            case final pill?) ...[
                          const SizedBox(width: 8),
                          pill,
                        ],
                      ],
                    ),
                    Text(
                      l10n.taxMonthLine(
                        formatTaka(l10n, month.salary),
                        formatTaka(l10n, month.tax),
                      ),
                      style: theme.textTheme.bodyMedium,
                    ),
                    if (month.challanNo case final challan?)
                      Text(switch (month.depositedOn) {
                        final DateTime on => l10n.taxChallanOn(
                          challan,
                          formatShortDate(l10n, on),
                        ),
                        null => l10n.taxChallan(challan),
                      }, style: secondary),
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

/// The year's salary and tax deduction certificate, in either language.
class _CertificateCard extends StatelessWidget {
  const _CertificateCard({required this.opening, required this.onOpen});

  final LetterLanguage? opening;
  final ValueChanged<LetterLanguage> onOpen;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);

    return Card.outlined(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: 12,
          children: [
            CardHeading(l10n.taxCertificateTitle),
            Text(
              l10n.taxCertificateBody,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            PdfLanguageButtons(
              primary: appLetterLanguage(l10n),
              opening: opening,
              onOpen: onOpen,
              label: (language) => switch (language) {
                LetterLanguage.en => l10n.taxCertificateEnglish,
                LetterLanguage.bn => l10n.taxCertificateBangla,
              },
              buttonKey: TaxTab.certificateKey,
            ),
          ],
        ),
      ),
    );
  }
}
