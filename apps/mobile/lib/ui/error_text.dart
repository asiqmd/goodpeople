import '../api/api_exception.dart';
import '../l10n/app_localizations.dart';

/// User-facing text for an error from the API layer.
///
/// Server errors show the API's own message; network and parsing failures
/// get a localized message instead of technical details.
String describeError(AppLocalizations l10n, Object error) {
  if (error is ApiException) {
    return switch (error.kind) {
      ApiErrorKind.server => error.message,
      ApiErrorKind.network => l10n.networkError,
      ApiErrorKind.badResponse => l10n.unexpectedError,
    };
  }
  return l10n.unexpectedError;
}
