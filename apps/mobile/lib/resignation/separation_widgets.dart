import 'package:flutter/material.dart';

import '../api/api_exception.dart';
import '../api/api_models.dart';
import '../l10n/app_localizations.dart';
import '../leave/leave_widgets.dart';
import '../ui/error_text.dart';
import '../ui/theme.dart';

/// User-facing text for a resignation error: a localized message for the
/// API's refusal codes, else what [describeError] says.
String separationErrorText(AppLocalizations l10n, Object error) {
  if (error is ApiException && error.kind == ApiErrorKind.server) {
    switch (error.code) {
      case 'separation_open':
        return l10n.resignErrorOpen;
      case 'separated':
        return l10n.resignErrorSeparated;
      case 'past_last_day':
        return l10n.resignErrorPastLastDay;
      case 'not_open':
        return l10n.resignErrorNotOpen;
    }
  }
  return describeError(l10n, error);
}

/// The pill for a separation's [status].
class SeparationStatusPill extends StatelessWidget {
  const SeparationStatusPill({super.key, required this.status});

  final SeparationStatus status;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    final warning = StatusColors.of(context);
    final (background, foreground) = switch (status) {
      SeparationStatus.pending => (
        warning.warningContainer,
        warning.onWarningContainer,
      ),
      SeparationStatus.approved => (
        scheme.primaryContainer,
        scheme.onPrimaryContainer,
      ),
      SeparationStatus.completed => (
        scheme.secondaryContainer,
        scheme.onSecondaryContainer,
      ),
      SeparationStatus.rejected => (
        scheme.errorContainer,
        scheme.onErrorContainer,
      ),
      SeparationStatus.cancelled || SeparationStatus.unknown => (
        scheme.surfaceContainerHighest,
        scheme.onSurfaceVariant,
      ),
    };
    return LeavePill(
      label: l10n.separationStatusName(status.wire),
      background: background,
      foreground: foreground,
    );
  }
}
