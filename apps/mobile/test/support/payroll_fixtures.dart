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

// ── Salary tax, provident fund and loans ────────────────────────────────────

/// `EmployeeRef` for MG-0005.
Json employeeRefJson() => {
  'id': '9e8d7c6b-5a49-4382-9170-6f5e4d3c2b1a',
  'employeeCode': 'MG-0005',
  'fullName': 'Rahima Khatun',
  'fullNameBn': 'রহিমা খাতুন',
};

const julyRunId = 'e2000000-0000-4000-8000-000000000010';
const augustRunId = 'e2000000-0000-4000-8000-000000000011';
const eidBonusRunId = 'e2000000-0000-4000-8000-000000000012';
const septemberRunId = 'e2000000-0000-4000-8000-000000000013';
const septemberAdjustmentRunId = 'e2000000-0000-4000-8000-000000000014';
const juneRunId = 'e2000000-0000-4000-8000-000000000009';
const declarationId = 'f1000000-0000-4000-8000-000000000001';

/// One month of `TaxYearView.months`.
Json taxMonthJson({
  required String runId,
  required String month,
  required String periodEnd,
  String kind = 'regular',
  String salary = '25000.00',
  String tax = '500.00',
  String? challanNo,
  String? depositedOn,
}) => {
  'month': month,
  'periodEnd': periodEnd,
  'runId': runId,
  'kind': kind,
  'salary': salary,
  'tax': tax,
  'challanNo': challanNo,
  'depositedOn': depositedOn,
};

/// One `DeclarationItemView`.
Json declarationItemJson({
  String kind = 'savings_certificate',
  String declared = '100000.00',
  String? verified,
  String? note,
}) => {
  'kind': kind,
  'declared': declared,
  'verified': verified,
  'note': note,
  'documentId': null,
};

/// A `TaxDeclarationView`. The default is this year's draft: savings
/// certificates of 1 lakh.
Json declarationJson({
  String? id = declarationId,
  String fiscalYear = '2026-27',
  String? status = 'draft',
  List<Json>? items,
  String declared = '100000.00',
  String? verified,
  String? submittedAt,
  String? verifiedAt,
}) => {
  'id': id,
  'employee': employeeRefJson(),
  'fiscalYear': fiscalYear,
  'status': status,
  'items':
      items ?? [declarationItemJson(note: 'Sanchaypatra from Sonali Bank')],
  'declared': declared,
  'verified': verified,
  'submittedAt': submittedAt,
  'verifiedBy': null,
  'verifiedAt': verifiedAt,
};

/// `RunTaxWorking`, as the September run worked the year out.
Json taxWorkingJson() => {
  'salary': 600000,
  'exemption': 200000,
  'taxableIncome': 400000,
  'threshold': 350000,
  'grossTax': 12000,
  'investment': 100000,
  'rebate': 3000,
  'minimumTax': 5000,
  'tax': 9000,
  'deductedBefore': '1750.00',
  'monthsLeft': 9,
  'thisMonth': '805.56',
};

/// `GET /tenant/me/tax?fiscalYear=2026-27` 200 body: July to September,
/// an Eid bonus in August and an adjustment to September, with the
/// working and a draft declaration.
Json taxYearJson({Json? declaration, bool withLatest = true}) => {
  'fiscalYear': '2026-27',
  'employee': {...employeeRefJson(), 'tin': '123456789012'},
  'profile': {
    'disabled': false,
    'freedomFighter': false,
    'disabledDependants': 0,
    'area': null,
  },
  'months': [
    taxMonthJson(
      runId: julyRunId,
      month: '2026-07-01',
      periodEnd: '2026-07-31',
      challanNo: 'CH-2026-0701',
      depositedOn: '2026-08-12',
    ),
    taxMonthJson(
      runId: augustRunId,
      month: '2026-08-01',
      periodEnd: '2026-08-31',
      challanNo: 'CH-2026-0802',
    ),
    taxMonthJson(
      runId: eidBonusRunId,
      month: '2026-08-01',
      periodEnd: '2026-08-31',
      kind: 'bonus',
      salary: '12500.00',
      tax: '250.00',
    ),
    taxMonthJson(
      runId: septemberRunId,
      month: '2026-09-01',
      periodEnd: '2026-09-30',
    ),
    taxMonthJson(
      runId: septemberAdjustmentRunId,
      month: '2026-09-01',
      periodEnd: '2026-09-30',
      kind: 'adjustment',
      salary: '1250.50',
      tax: '0.00',
    ),
  ],
  'opening': null,
  'salary': '88750.50',
  'tax': '1750.00',
  'latest': withLatest ? taxWorkingJson() : null,
  'declaration': declaration ?? declarationJson(),
};

/// `GET /tenant/me/tax?fiscalYear=2025-26` 200 body: only June went
/// through payroll here, the months before came as an opening balance, no
/// run worked tax out, and payroll verified the declaration.
Json previousTaxYearJson() => {
  'fiscalYear': '2025-26',
  'employee': {...employeeRefJson(), 'tin': null},
  'profile': {
    'disabled': false,
    'freedomFighter': false,
    'disabledDependants': 0,
    'area': 'city_corporation',
  },
  'months': [
    taxMonthJson(
      runId: juneRunId,
      month: '2026-06-01',
      periodEnd: '2026-06-30',
      salary: '24000.00',
      tax: '0.00',
    ),
  ],
  'opening': {'salary': '264000.00', 'tax': '0.00', 'pf': '0.00'},
  'salary': '288000.00',
  'tax': '0.00',
  'latest': null,
  'declaration': declarationJson(
    id: 'f1000000-0000-4000-8000-000000000000',
    fiscalYear: '2025-26',
    status: 'verified',
    items: [
      declarationItemJson(declared: '50000.00', verified: '40000.00'),
      declarationItemJson(
        kind: 'life_insurance',
        declared: '20000.00',
        verified: '20000.00',
        note: 'Jiban Bima policy 77812',
      ),
    ],
    declared: '70000.00',
    verified: '60000.00',
    submittedAt: '2026-05-10T04:00:00.000Z',
    verifiedAt: '2026-05-20T04:00:00.000Z',
  ),
};

const pfEntryIds = [
  'f2000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000002',
  'f2000000-0000-4000-8000-000000000003',
  'f2000000-0000-4000-8000-000000000004',
];

/// `GET /tenant/me/pf` 200 body for a member since 2021, half vested.
Json pfStatementJson() => {
  'employee': employeeRefJson(),
  'joinedOn': '2021-03-01',
  'leftOn': null,
  'balance': {
    'own': '42000.00',
    'employer': '40000.00',
    'total': '82000.00',
    'vestedPercent': 50,
    'payable': '62000.00',
  },
  'entries': [
    {
      'id': pfEntryIds[0],
      'date': '2026-07-01',
      'kind': 'opening',
      'account': 'own',
      'amount': '38000.00',
      'runId': null,
      'note': 'Balance from the old fund',
    },
    {
      'id': pfEntryIds[1],
      'date': '2026-09-30',
      'kind': 'contribution',
      'account': 'employer',
      'amount': '2000.00',
      'runId': septemberRunId,
      'note': null,
    },
    {
      'id': pfEntryIds[2],
      'date': '2026-09-30',
      'kind': 'interest',
      'account': 'own',
      'amount': '4500.50',
      'runId': null,
      'note': null,
    },
    {
      'id': pfEntryIds[3],
      'date': '2026-10-05',
      'kind': 'withdrawal',
      'account': 'own',
      'amount': '-500.50',
      'runId': null,
      'note': null,
    },
  ],
};

const advanceId = 'f3000000-0000-4000-8000-000000000001';
const closedLoanId = 'f3000000-0000-4000-8000-000000000002';

/// One `LoanView`.
Json loanJson({
  required String id,
  String kind = 'advance',
  String status = 'active',
  String principal = '10000.00',
  String installment = '2500.00',
  String repaid = '2500.00',
  String outstanding = '7500.00',
  String startMonth = '2026-09',
  String reason = 'Eid shopping',
  List<Json> repayments = const [],
}) => {
  'id': id,
  'employee': employeeRefJson(),
  'kind': kind,
  'status': status,
  'principal': principal,
  'installment': installment,
  'repaid': repaid,
  'outstanding': outstanding,
  'startMonth': startMonth,
  'reason': reason,
  'requestedBy': 'Shirin Akter',
  'decidedBy': 'Kamal Hossain',
  'createdAt': '2026-08-20T04:00:00.000Z',
  'decidedAt': '2026-08-21T04:00:00.000Z',
  'closedAt': status == 'closed' ? '2026-06-30T04:00:00.000Z' : null,
  'repayments': repayments,
  'steps': <Object?>[],
};

/// `GET /tenant/me/loans` 200 body: an advance being repaid, and a
/// provident fund loan paid off.
List<Json> myLoansJson() => [
  loanJson(
    id: advanceId,
    repayments: [
      {
        'date': '2026-09-30',
        'amount': '2500.00',
        'runId': septemberRunId,
        'note': null,
      },
    ],
  ),
  loanJson(
    id: closedLoanId,
    kind: 'pf_loan',
    status: 'closed',
    principal: '20000.00',
    installment: '5000.00',
    repaid: '20000.00',
    outstanding: '0.00',
    startMonth: '2026-02',
    reason: 'Roof repair',
    repayments: [
      {
        'date': '2026-05-31',
        'amount': '15000.00',
        'runId': 'e2000000-0000-4000-8000-000000000005',
        'note': null,
      },
      {
        'date': '2026-06-10',
        'amount': '5000.00',
        'runId': null,
        'note': 'Paid at the office',
      },
    ],
  ),
];
