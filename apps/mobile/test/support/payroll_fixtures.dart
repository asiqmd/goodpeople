/// Payslip JSON exactly as the API contract shapes it, for the seeded
/// worker MG-0005 (Rahima Khatun). The tests fix "today" at [leaveToday],
/// Saturday 24 October 2026.
library;

import 'package:good_people/api/api_models.dart';

import 'leave_fixtures.dart';

const septemberAdjustmentId = 'e1000000-0000-4000-8000-000000000003';
const septemberPayslipId = 'e1000000-0000-4000-8000-000000000002';
const augustPayslipId = 'e1000000-0000-4000-8000-000000000001';

/// One `PayslipSummary`.
Json payslipJson({
  required String itemId,
  String runId = 'e2000000-0000-4000-8000-000000000001',
  String kind = 'regular',
  String periodStart = '2026-09-01',
  String periodEnd = '2026-09-30',
  String paymentDate = '2026-10-07',
  String net = '12500.00',
  String publishedAt = '2026-10-05T06:00:00.000Z',
}) => {
  'itemId': itemId,
  'runId': runId,
  'kind': kind,
  'periodStart': periodStart,
  'periodEnd': periodEnd,
  'paymentDate': paymentDate,
  'net': net,
  'publishedAt': publishedAt,
};

/// `GET /tenant/me/payslips` 200 body, newest first: an adjustment to
/// September paid on 20 October, September itself, and the second half of
/// August (a run need not cover a whole month).
List<Json> myPayslipsJson() => [
  payslipJson(
    itemId: septemberAdjustmentId,
    runId: 'e2000000-0000-4000-8000-000000000003',
    kind: 'adjustment',
    paymentDate: '2026-10-20',
    net: '1250.50',
    publishedAt: '2026-10-20T06:00:00.000Z',
  ),
  payslipJson(
    itemId: septemberPayslipId,
    runId: 'e2000000-0000-4000-8000-000000000002',
  ),
  payslipJson(
    itemId: augustPayslipId,
    periodStart: '2026-08-16',
    periodEnd: '2026-08-31',
    paymentDate: '2026-09-07',
    net: '6250.00',
    publishedAt: '2026-09-05T06:00:00.000Z',
  ),
];
