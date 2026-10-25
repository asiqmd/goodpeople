part of 'api_models.dart';

// ── Payroll (Phase 2): my payslips ──────────────────────────────────────────
//
// Needs the workspace's `payroll` feature: without it the API answers 403
// with code `feature_not_in_plan`. Calendar dates are UTC midnight, as
// everywhere else.

/// A payroll run for a month, an adjustment run that corrects one, or a
/// festival bonus run.
enum PayrollRunKind implements WireValue {
  regular('regular'),
  adjustment('adjustment'),
  bonus('bonus'),
  unknown('unknown');

  const PayrollRunKind(this.wire);
  @override
  final String wire;

  static PayrollRunKind fromWire(String value) =>
      _byWire(values, value, unknown);
}

/// `GET /tenant/me/payslips` item (the API's `PayslipSummary`): one of the
/// employee's payslips. Only published ones are listed.
class PayslipSummary {
  const PayslipSummary({
    required this.itemId,
    required this.runId,
    required this.kind,
    required this.periodStart,
    required this.periodEnd,
    required this.paymentDate,
    required this.net,
    required this.publishedAt,
  });

  factory PayslipSummary.fromJson(Json json) => PayslipSummary(
    itemId: _read<String>(json, 'itemId'),
    runId: _read<String>(json, 'runId'),
    kind: PayrollRunKind.fromWire(_read<String>(json, 'kind')),
    periodStart: _readDate(json, 'periodStart'),
    periodEnd: _readDate(json, 'periodEnd'),
    paymentDate: _readDate(json, 'paymentDate'),
    net: _readMoney(json, 'net'),
    publishedAt: _readTimestamp(json, 'publishedAt'),
  );

  /// The payslip's id (the run's line for this employee), used to fetch
  /// its PDF.
  final String itemId;
  final String runId;
  final PayrollRunKind kind;
  final DateTime periodStart;
  final DateTime periodEnd;
  final DateTime paymentDate;

  /// Net pay as the API sends it: a decimal string with at most two places,
  /// such as `12500.00`.
  final String net;
  final DateTime publishedAt;

  bool get isAdjustment => kind == PayrollRunKind.adjustment;
}

final _money = RegExp(r'^-?\d+(\.\d{1,2})?$');

/// A money amount: a decimal string such as `12500.00`.
String _readMoney(Json json, String key) {
  final text = _read<String>(json, key);
  if (_money.hasMatch(text)) return text;
  throw FormatException('Expected "$key" to be an amount like 12500.00: $text');
}
