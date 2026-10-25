import 'package:flutter/material.dart';

import '../api/api_models.dart';
import '../l10n/app_localizations.dart';
import '../leave/leave_widgets.dart';
import '../ui/theme.dart';

/// The PDF language that matches the app's: Bangla under Bangla, else
/// English.
LetterLanguage appLetterLanguage(AppLocalizations l10n) =>
    l10n.localeName.startsWith('bn') ? LetterLanguage.bn : LetterLanguage.en;

/// The amount the user typed, as the API takes it: Bangla digits become
/// ASCII ones, and grouping commas and spaces go, so `১,২৫,০০০` is
/// `125000`.
String normalizeAmount(String text) {
  const bangla = '০১২৩৪৫৬৭৮৯';
  final buffer = StringBuffer();
  for (final char in text.trim().split('')) {
    final digit = bangla.indexOf(char);
    if (digit >= 0) {
      buffer.write(digit);
    } else if (char != ',' && char.trim().isNotEmpty) {
      buffer.write(char);
    }
  }
  return buffer.toString();
}

final _amountPattern = RegExp(r'^\d{1,10}(\.\d{1,2})?$');

/// Whether [text] (once normalized) is an amount the API takes, such as
/// `12500` or `12500.50`.
bool isValidAmount(String text) =>
    _amountPattern.hasMatch(normalizeAmount(text));

/// Two buttons that open a PDF in English or in Bangla. The filled one is
/// [primary], the app's language; while one downloads, both are disabled
/// and it shows a spinner.
///
/// Side by side when they fit; on a narrow phone the filled button goes on
/// top.
class PdfLanguageButtons extends StatelessWidget {
  const PdfLanguageButtons({
    super.key,
    required this.primary,
    required this.opening,
    required this.onOpen,
    required this.label,
    required this.buttonKey,
  });

  final LetterLanguage primary;

  /// The language whose PDF is downloading, if any.
  final LetterLanguage? opening;
  final ValueChanged<LetterLanguage> onOpen;
  final String Function(LetterLanguage language) label;
  final Key Function(LetterLanguage language) buttonKey;

  @override
  Widget build(BuildContext context) {
    final other = primary == LetterLanguage.bn
        ? LetterLanguage.en
        : LetterLanguage.bn;
    Widget icon(LetterLanguage language, IconData idle) => opening == language
        ? const SizedBox.square(
            dimension: 18,
            child: CircularProgressIndicator(strokeWidth: 2),
          )
        : Icon(idle);
    VoidCallback? onPressed(LetterLanguage language) =>
        opening == null ? () => onOpen(language) : null;

    return OverflowBar(
      alignment: MainAxisAlignment.end,
      spacing: 8,
      overflowAlignment: OverflowBarAlignment.end,
      overflowSpacing: 8,
      overflowDirection: VerticalDirection.up,
      children: [
        OutlinedButton.icon(
          key: buttonKey(other),
          onPressed: onPressed(other),
          icon: icon(other, Icons.translate),
          label: Text(label(other)),
        ),
        FilledButton.icon(
          key: buttonKey(primary),
          onPressed: onPressed(primary),
          icon: icon(primary, Icons.picture_as_pdf_outlined),
          label: Text(label(primary)),
        ),
      ],
    );
  }
}

/// The mark for a run that is not a regular month: an adjustment or a
/// bonus. Nothing for a regular run.
Widget? runKindPill(BuildContext context, PayrollRunKind kind, {Key? key}) {
  final l10n = AppLocalizations.of(context);
  final scheme = Theme.of(context).colorScheme;
  return switch (kind) {
    PayrollRunKind.adjustment => LeavePill(
      key: key,
      label: l10n.payslipAdjustment,
      background: scheme.tertiaryContainer,
      foreground: scheme.onTertiaryContainer,
    ),
    PayrollRunKind.bonus => LeavePill(
      key: key,
      label: l10n.payrollRunKindBonus,
      background: scheme.secondaryContainer,
      foreground: scheme.onSecondaryContainer,
    ),
    PayrollRunKind.regular || PayrollRunKind.unknown => null,
  };
}

/// A heading inside a card, read out as one.
class CardHeading extends StatelessWidget {
  const CardHeading(this.text, {super.key, this.trailing});

  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final heading = Semantics(
      header: true,
      child: Text(text, style: Theme.of(context).textTheme.titleMedium),
    );
    final trailing = this.trailing;
    if (trailing == null) return heading;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(child: heading),
        const SizedBox(width: 8),
        trailing,
      ],
    );
  }
}

/// The pill for a declaration's [status].
class DeclarationStatusPill extends StatelessWidget {
  const DeclarationStatusPill({super.key, required this.status});

  final DeclarationStatus status;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    final warning = StatusColors.of(context);
    final (background, foreground) = switch (status) {
      DeclarationStatus.submitted => (
        warning.warningContainer,
        warning.onWarningContainer,
      ),
      DeclarationStatus.verified => (
        scheme.primaryContainer,
        scheme.onPrimaryContainer,
      ),
      DeclarationStatus.draft || DeclarationStatus.unknown => (
        scheme.surfaceContainerHighest,
        scheme.onSurfaceVariant,
      ),
    };
    return LeavePill(
      label: l10n.declarationStatusName(status.wire),
      background: background,
      foreground: foreground,
    );
  }
}

/// The pill for a loan's [status].
class LoanStatusPill extends StatelessWidget {
  const LoanStatusPill({super.key, required this.status});

  final LoanStatus status;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    final warning = StatusColors.of(context);
    final (background, foreground) = switch (status) {
      LoanStatus.pending => (
        warning.warningContainer,
        warning.onWarningContainer,
      ),
      LoanStatus.active => (scheme.primaryContainer, scheme.onPrimaryContainer),
      LoanStatus.rejected => (scheme.errorContainer, scheme.onErrorContainer),
      LoanStatus.closed || LoanStatus.cancelled || LoanStatus.unknown => (
        scheme.surfaceContainerHighest,
        scheme.onSurfaceVariant,
      ),
    };
    return LeavePill(
      label: l10n.loanStatusName(status.wire),
      background: background,
      foreground: foreground,
    );
  }
}
