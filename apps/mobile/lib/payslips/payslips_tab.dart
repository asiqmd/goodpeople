import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/api_models.dart';
import '../auth/auth_controller.dart';
import '../documents/file_opener.dart';
import '../l10n/app_localizations.dart';
import '../leave/leave_widgets.dart';
import '../ui/error_text.dart';
import '../ui/format.dart';
import '../ui/load_error_view.dart';
import 'pay_widgets.dart';
import 'payslips_providers.dart';

/// The signed-in employee's published payslips, newest first.
///
/// Each opens as a PDF in the phone's own viewer, in English or Bangla; the
/// filled button is the app's language.
class PayslipsTab extends ConsumerStatefulWidget {
  const PayslipsTab({super.key});

  static ValueKey<String> payslipKey(String itemId) =>
      ValueKey('payslip-$itemId');
  static ValueKey<String> adjustmentKey(String itemId) =>
      ValueKey('payslip-adjustment-$itemId');
  static ValueKey<String> openKey(String itemId, LetterLanguage language) =>
      ValueKey('payslip-open-${language.wire}-$itemId');

  @override
  ConsumerState<PayslipsTab> createState() => _PayslipsTabState();
}

class _PayslipsTabState extends ConsumerState<PayslipsTab> {
  /// Payslips whose PDF is downloading, and in which language.
  final _opening = <String, LetterLanguage>{};

  Future<void> _open(PayslipSummary payslip, LetterLanguage language) async {
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    // Still usable if the screen closes before the call returns.
    final container = ProviderScope.containerOf(context, listen: false);
    setState(() => _opening[payslip.itemId] = language);
    try {
      final file = await container
          .read(authProvider.notifier)
          .fetchMyPayslipPdf(payslip.itemId, language);
      await container
          .read(fileOpenerProvider)
          .open(
            file.bytes,
            fileName:
                file.fileName ??
                'payslip-${toWireDate(payslip.periodStart)}-'
                    '${language.wire}.pdf',
            contentType: 'application/pdf',
          );
    } on SessionExpiredException {
      // AuthGate is already showing the login screen.
    } on Object catch (error) {
      // Only the latest failure matters when several taps fail.
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(payslipErrorText(l10n, error))));
      // Withdrawn since the list loaded: show the list as it is.
      if (error is ApiException && error.statusCode == 404) {
        container.invalidate(myPayslipsProvider);
      }
    } finally {
      if (mounted) setState(() => _opening.remove(payslip.itemId));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final payslips = ref.watch(myPayslipsProvider);
    final appLanguage = appLetterLanguage(l10n);

    return RefreshIndicator(
      onRefresh: () => awaitRefresh(ref.refresh(myPayslipsProvider.future)),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          switch (payslips) {
            AsyncData(value: final List<PayslipSummary> list)
                when list.isEmpty =>
              LeaveEmptyState(
                icon: Icons.receipt_long_outlined,
                message: l10n.payslipsEmpty,
              ),
            AsyncData(value: final List<PayslipSummary> list) => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 12,
              children: [
                for (final payslip in list)
                  _PayslipCard(
                    key: PayslipsTab.payslipKey(payslip.itemId),
                    payslip: payslip,
                    primary: appLanguage,
                    opening: _opening[payslip.itemId],
                    onOpen: (language) => _open(payslip, language),
                  ),
              ],
            ),
            AsyncError(:final error)
                when !payslips.isLoading && error is! SessionExpiredException =>
              LoadErrorView(
                title: l10n.payslipsLoadFailed,
                error: error,
                onRetry: () => ref.invalidate(myPayslipsProvider),
              ),
            _ => const LeaveLoading(),
          },
        ],
      ),
    );
  }
}

/// User-facing text for a payslip that could not be downloaded or opened.
String payslipErrorText(AppLocalizations l10n, Object error) => switch (error) {
  ApiException(kind: ApiErrorKind.server, statusCode: 404) =>
    l10n.payslipErrorGone,
  _ => payFileErrorText(l10n, error),
};

/// User-facing text for a pay PDF, such as a payslip or the tax
/// certificate, that could not be downloaded or opened.
String payFileErrorText(AppLocalizations l10n, Object error) => switch (error) {
  FileOpenFailed(problem: FileOpenProblem.noApp) => l10n.fileNoApp,
  FileOpenFailed() => l10n.fileOpenFailed,
  _ => describeError(l10n, error),
};

/// One payslip: its period, net pay and payment date, an adjustment mark,
/// and buttons to open it in either language.
class _PayslipCard extends StatelessWidget {
  const _PayslipCard({
    super.key,
    required this.payslip,
    required this.primary,
    required this.opening,
    required this.onOpen,
  });

  final PayslipSummary payslip;

  /// The app's language: the PDF the filled button opens.
  final LetterLanguage primary;

  /// The language whose PDF is downloading, if any.
  final LetterLanguage? opening;
  final ValueChanged<LetterLanguage> onOpen;

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
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.receipt_long_outlined, color: scheme.primary),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    formatPayPeriod(
                      l10n,
                      payslip.periodStart,
                      payslip.periodEnd,
                    ),
                    style: theme.textTheme.titleMedium,
                  ),
                ),
                if (payslip.isAdjustment) ...[
                  const SizedBox(width: 8),
                  LeavePill(
                    key: PayslipsTab.adjustmentKey(payslip.itemId),
                    label: l10n.payslipAdjustment,
                    background: scheme.tertiaryContainer,
                    foreground: scheme.onTertiaryContainer,
                  ),
                ],
              ],
            ),
            const SizedBox(height: 12),
            Text(
              l10n.payslipNetPay,
              style: theme.textTheme.labelMedium?.copyWith(
                color: scheme.onSurfaceVariant,
              ),
            ),
            Text(
              formatTaka(l10n, payslip.net),
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              l10n.payslipPaidOn(formatShortDate(l10n, payslip.paymentDate)),
              style: theme.textTheme.bodySmall?.copyWith(
                color: scheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 12),
            PdfLanguageButtons(
              primary: primary,
              opening: opening,
              onOpen: onOpen,
              label: (language) => switch (language) {
                LetterLanguage.en => l10n.payslipOpenEnglish,
                LetterLanguage.bn => l10n.payslipOpenBangla,
              },
              buttonKey: (language) =>
                  PayslipsTab.openKey(payslip.itemId, language),
            ),
          ],
        ),
      ),
    );
  }
}
