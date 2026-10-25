import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/api_models.dart';
import '../auth/auth_controller.dart';
import '../leave/leave_providers.dart';

/// The income year the Tax tab shows: this one (July to June) or the one
/// before. Back to this one each time My pay opens.
final taxFiscalYearProvider =
    NotifierProvider.autoDispose<TaxFiscalYearController, String>(
      TaxFiscalYearController.new,
    );

class TaxFiscalYearController extends Notifier<String> {
  @override
  String build() => fiscalYearOf(ref.watch(todayProvider));

  void select(String fiscalYear) => state = fiscalYear;
}

/// The signed-in employee's salary and tax for an income year such as
/// `2026-27`.
///
/// `null` means a 404: no employee record is linked to this login (usual
/// for tenant admins).
final myTaxYearProvider = FutureProvider.autoDispose
    .family<TaxYearView?, String>((ref, fiscalYear) async {
      _requireSession(ref);
      try {
        return await ref.read(authProvider.notifier).fetchMyTaxYear(fiscalYear);
      } on ApiException catch (error) {
        if (error.statusCode == 404) return null;
        rethrow;
      }
    }, retry: _noRetry);

/// The signed-in employee's provident fund statement; `null` when they are
/// not a member.
final myProvidentFundProvider = FutureProvider.autoDispose<PfStatement?>((ref) {
  _requireSession(ref);
  return ref.read(authProvider.notifier).fetchMyProvidentFund();
}, retry: _noRetry);

/// The signed-in employee's salary advances and loans.
final myLoansProvider = FutureProvider.autoDispose<List<LoanView>>((ref) {
  _requireSession(ref);
  return ref.read(authProvider.notifier).fetchMyLoans();
}, retry: _noRetry);

/// Rebuilds when the session changes, and fails once it has ended, like
/// [tenantAccessProvider].
void _requireSession(Ref ref) {
  if (ref.watch(authProvider) is! SignedIn) {
    throw const SessionExpiredException();
  }
}

/// Retries go through the refresh logic in AuthController, not Riverpod's
/// backoff.
Duration? _noRetry(int retryCount, Object error) => null;
