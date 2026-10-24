import '../api/api_exception.dart';
import '../l10n/app_localizations.dart';

/// User-facing text for an error from the API layer.
///
/// Server errors with a `code` the app knows get a localized message (see
/// [apiErrorCodeText]); other server errors show the API's own message,
/// which is English. Network and parsing failures get a localized message
/// instead of technical details.
String describeError(AppLocalizations l10n, Object error) {
  if (error is ApiException) {
    return switch (error.kind) {
      ApiErrorKind.server => apiErrorCodeText(l10n, error) ?? error.message,
      ApiErrorKind.network => l10n.networkError,
      ApiErrorKind.badResponse => l10n.unexpectedError,
    };
  }
  return l10n.unexpectedError;
}

/// A localized message for the [ApiException.code]s the app can meet
/// anywhere: signing in, the workspace's state, roles and punching. `null`
/// for any other code, or none.
///
/// Screens with codes of their own (leave, corrections, resignations) map
/// those first and fall back to [describeError].
String? apiErrorCodeText(AppLocalizations l10n, ApiException error) =>
    switch (error.code) {
      'too_many_attempts' => switch (error.retryAfterSeconds) {
        // Whole minutes, at least one, as the API's own message counts them.
        final int seconds when seconds > 0 => l10n.errorTooManyAttemptsWait(
          (seconds / 60).ceil(),
        ),
        _ => l10n.errorTooManyAttempts,
      },
      'login_disabled' => l10n.errorLoginDisabled,
      'wrong_password' => l10n.errorWrongPassword,
      'tenant_suspended' => l10n.errorTenantSuspended,
      'tenant_read_only' => l10n.errorTenantReadOnly,
      'role_not_allowed' => l10n.errorRoleNotAllowed,
      'feature_not_in_plan' => l10n.errorFeatureNotInPlan,
      'outside_geofence' => l10n.punchErrorOutsideArea,
      'location_required' => l10n.punchErrorLocationRequired,
      'selfie_required' => l10n.punchErrorSelfieRequired,
      'too_soon' => l10n.punchErrorTooSoon,
      'no_geofence' => l10n.punchBlockedNoGeofence,
      'self_punch_disabled' => l10n.punchBlockedDisabled,
      'separated' => l10n.resignErrorSeparated,
      'offline_punch_too_old' => l10n.punchErrorOfflineTooOld,
      'future_punch' => l10n.correctionErrorFuturePunch,
      _ => null,
    };
