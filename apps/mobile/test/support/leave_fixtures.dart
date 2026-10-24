/// Leave JSON exactly as the API contract shapes it, for the seeded worker
/// MG-0005 (Rahima Khatun, female). The tests fix "today" at
/// [leaveToday], a Saturday; Friday is the weekly off.
library;

import 'package:good_people/api/api_models.dart';

final leaveToday = DateTime.utc(2026, 10, 24);

const casualLeaveId = '11111111-1111-4111-8111-111111111111';
const sickLeaveId = '22222222-2222-4222-8222-222222222222';
const earnedLeaveId = '33333333-3333-4333-8333-333333333333';
const maternityLeaveId = '44444444-4444-4444-8444-444444444444';
const paternityLeaveId = '55555555-5555-4555-8555-555555555555';
const retiredLeaveId = '66666666-6666-4666-8666-666666666666';

/// One `GET /tenant/leave/types` item, with every field the API sends.
Json leaveTypeJson({
  required String id,
  required String code,
  required String name,
  String? nameBn,
  String accrual = 'annual_grant',
  bool paid = true,
  bool allowHalfDay = true,
  String? gender,
  bool countsOffDays = false,
  bool isActive = true,
  int? requiresDocumentAfterDays,
  int? maxDaysPerRequest,
}) => {
  'id': id,
  'code': code,
  'name': name,
  'nameBn': nameBn,
  'statutoryKey': null,
  'paid': paid,
  'accrual': accrual,
  'daysPerYear': accrual == 'annual_grant' ? 10 : null,
  'workedDaysPerLeaveDay': accrual == 'earned' ? 18 : null,
  'maxDaysPerRequest': maxDaysPerRequest,
  'carryForwardMax': 0,
  'minServiceDays': 0,
  'gender': gender,
  'countsOffDays': countsOffDays,
  'allowHalfDay': allowHalfDay,
  'approvalChain': ['manager', 'hr'],
  'requiresDocumentAfterDays': requiresDocumentAfterDays,
  'isActive': isActive,
};

final casualLeaveJson = leaveTypeJson(
  id: casualLeaveId,
  code: 'CL',
  name: 'Casual leave',
  nameBn: 'নৈমিত্তিক ছুটি',
);

final sickLeaveJson = leaveTypeJson(
  id: sickLeaveId,
  code: 'SL',
  name: 'Sick leave',
  nameBn: 'অসুস্থতাজনিত ছুটি',
  requiresDocumentAfterDays: 2,
);

final earnedLeaveJson = leaveTypeJson(
  id: earnedLeaveId,
  code: 'EL',
  name: 'Earned leave',
  nameBn: 'অর্জিত ছুটি',
  accrual: 'earned',
  allowHalfDay: false,
);

final maternityLeaveJson = leaveTypeJson(
  id: maternityLeaveId,
  code: 'ML',
  name: 'Maternity leave',
  nameBn: 'প্রসূতি কল্যাণ ছুটি',
  accrual: 'per_event',
  allowHalfDay: false,
  gender: 'female',
  countsOffDays: true,
  maxDaysPerRequest: 112,
);

List<Json> leaveTypesJson() => [
  casualLeaveJson,
  sickLeaveJson,
  earnedLeaveJson,
  maternityLeaveJson,
  leaveTypeJson(
    id: paternityLeaveId,
    code: 'PL',
    name: 'Paternity leave',
    gender: 'male',
  ),
  leaveTypeJson(
    id: retiredLeaveId,
    code: 'OL',
    name: 'Old special leave',
    isActive: false,
  ),
];

/// The `leaveType` inside a balance: id, code, names, accrual and pay.
Json balanceTypeJson(Json type) => {
  for (final key in ['id', 'code', 'name', 'nameBn', 'accrual', 'paid'])
    key: type[key],
};

/// The `leaveType` inside a request: id, code and names.
Json requestTypeJson(Json type) => {
  for (final key in ['id', 'code', 'name', 'nameBn']) key: type[key],
};

Json balanceJson(
  Json type, {
  int year = 2026,
  num? entitlement = 10,
  num carriedForward = 0,
  num adjustments = 0,
  num taken = 0,
  num pending = 0,
  num? available = 10,
  String? eligibleFrom,
}) => {
  'leaveType': balanceTypeJson(type),
  'year': year,
  'entitlement': entitlement,
  'carriedForward': carriedForward,
  'adjustments': adjustments,
  'taken': taken,
  'pending': pending,
  'available': available,
  'eligibleFrom': eligibleFrom,
};

/// `GET /tenant/me/leave/balances?year=` 200 body: halves, a carry-forward,
/// an eligibility date and per-event maternity leave.
List<Json> balancesJson(int year) => [
  balanceJson(casualLeaveJson, year: year, taken: 1.5, available: 8.5),
  balanceJson(
    sickLeaveJson,
    year: year,
    entitlement: 14,
    pending: 2,
    available: 12,
  ),
  balanceJson(
    earnedLeaveJson,
    year: year,
    entitlement: 11,
    carriedForward: 4,
    available: 15,
    eligibleFrom: '2027-03-01',
  ),
  balanceJson(
    maternityLeaveJson,
    year: year,
    entitlement: null,
    available: null,
  ),
];

Json stepJson({
  required String id,
  required int stepNo,
  String kind = 'manager',
  String status = 'pending',
  Json? approver,
  String? decidedBy,
  String? decidedAt,
  String? comment,
}) => {
  'id': id,
  'stepNo': stepNo,
  'kind': kind,
  'approver': approver,
  'status': status,
  'decidedBy': decidedBy,
  'decidedAt': decidedAt,
  'comment': comment,
};

const shirin = <String, Object?>{
  'id': 'a1b2c3d4-0000-4000-8000-000000000007',
  'fullName': 'Shirin Akter',
};

const rahima = <String, Object?>{
  'id': '9e8d7c6b-5a49-4382-9170-6f5e4d3c2b1a',
  'fullName': 'Rahima Khatun',
  'employeeCode': 'MG-0005',
};

Json leaveRequestJson({
  required String id,
  required Json type,
  required String startDate,
  required String endDate,
  required num days,
  String reason = 'Family matters',
  String status = 'pending',
  String? halfDay,
  bool needsDocument = false,
  Json employee = rahima,
  List<Json>? steps,
  String createdAt = '2026-10-20T08:00:00.000Z',
  String? decidedAt,
}) => {
  'id': id,
  'employee': employee,
  'leaveType': requestTypeJson(type),
  'startDate': startDate,
  'endDate': endDate,
  'halfDay': halfDay,
  'days': days,
  'reason': reason,
  'status': status,
  'needsDocument': needsDocument,
  'steps':
      steps ??
      [
        stepJson(id: '$id-1', stepNo: 1, approver: shirin),
        stepJson(id: '$id-2', stepNo: 2, kind: 'hr', status: 'waiting'),
      ],
  'createdAt': createdAt,
  'decidedAt': decidedAt,
};

const approvedFutureId = 'b0000000-0000-4000-8000-000000000001';
const pendingRequestId = 'b0000000-0000-4000-8000-000000000002';
const startedRequestId = 'b0000000-0000-4000-8000-000000000003';
const rejectedRequestId = 'b0000000-0000-4000-8000-000000000004';

/// `GET /tenant/me/leave/requests` 200 body, newest first: approved and not
/// started, pending, approved and started (no cancel), rejected half day.
List<Json> myRequestsJson() => [
  leaveRequestJson(
    id: approvedFutureId,
    type: earnedLeaveJson,
    startDate: '2026-12-20',
    endDate: '2026-12-23',
    days: 4,
    reason: 'Visiting my parents',
    status: 'approved',
    steps: [
      stepJson(
        id: '$approvedFutureId-1',
        stepNo: 1,
        approver: shirin,
        status: 'approved',
        decidedBy: 'Shirin Akter',
        decidedAt: '2026-10-21T04:00:00.000Z',
      ),
      stepJson(
        id: '$approvedFutureId-2',
        stepNo: 2,
        kind: 'hr',
        status: 'approved',
        decidedBy: 'Kamal Hossain',
        decidedAt: '2026-10-22T05:00:00.000Z',
      ),
    ],
    decidedAt: '2026-10-22T05:00:00.000Z',
  ),
  leaveRequestJson(
    id: pendingRequestId,
    type: casualLeaveJson,
    startDate: '2026-11-02',
    endDate: '2026-11-03',
    days: 2,
    reason: 'Family wedding in Mymensingh',
  ),
  leaveRequestJson(
    id: startedRequestId,
    type: sickLeaveJson,
    startDate: '2026-10-20',
    endDate: '2026-10-22',
    days: 3,
    reason: 'Fever',
    status: 'approved',
    needsDocument: true,
    steps: [
      stepJson(
        id: '$startedRequestId-1',
        stepNo: 1,
        approver: shirin,
        status: 'approved',
        decidedBy: 'Shirin Akter',
        decidedAt: '2026-10-19T12:00:00.000Z',
        comment: 'Get well soon',
      ),
      stepJson(
        id: '$startedRequestId-2',
        stepNo: 2,
        kind: 'hr',
        status: 'approved',
        decidedBy: 'Kamal Hossain',
        decidedAt: '2026-10-19T12:30:00.000Z',
      ),
    ],
  ),
  leaveRequestJson(
    id: rejectedRequestId,
    type: casualLeaveJson,
    startDate: '2026-09-10',
    endDate: '2026-09-10',
    halfDay: 'first_half',
    days: 0.5,
    reason: 'Bank visit',
    status: 'rejected',
    steps: [
      stepJson(
        id: '$rejectedRequestId-1',
        stepNo: 1,
        approver: shirin,
        status: 'rejected',
        decidedBy: 'Shirin Akter',
        decidedAt: '2026-09-08T06:00:00.000Z',
        comment: 'Line shortage that day',
      ),
      stepJson(
        id: '$rejectedRequestId-2',
        stepNo: 2,
        kind: 'hr',
        status: 'skipped',
      ),
    ],
  ),
];

const managerStepId = 'c0000000-0000-4000-8000-000000000001';
const hrStepId = 'c0000000-0000-4000-8000-000000000002';

/// `GET /tenant/approvals` 200 body for a manager who is also in HR: a
/// casual leave at the manager step and a maternity leave at the HR step.
List<Json> approvalsJson() => [
  {
    'subjectType': 'leave_request',
    'stepId': managerStepId,
    'kind': 'manager',
    'request': leaveRequestJson(
      id: 'd0000000-0000-4000-8000-000000000001',
      type: casualLeaveJson,
      startDate: '2026-10-28',
      endDate: '2026-10-29',
      days: 2,
      reason: 'My son is sick',
      employee: const {
        'id': 'e0000000-0000-4000-8000-000000000001',
        'fullName': 'Jamal Uddin',
        'employeeCode': 'MG-0007',
      },
      steps: [
        stepJson(id: managerStepId, stepNo: 1, approver: shirin),
        stepJson(
          id: 'c0000000-0000-4000-8000-000000000003',
          stepNo: 2,
          kind: 'hr',
          status: 'waiting',
        ),
      ],
    ),
    'balance': balanceJson(casualLeaveJson, taken: 2, pending: 2, available: 6),
  },
  {
    'subjectType': 'leave_request',
    'stepId': hrStepId,
    'kind': 'hr',
    'request': leaveRequestJson(
      id: 'd0000000-0000-4000-8000-000000000002',
      type: maternityLeaveJson,
      startDate: '2026-11-15',
      endDate: '2026-12-31',
      days: 47,
      reason: 'Maternity leave before the due date',
      employee: const {
        'id': 'e0000000-0000-4000-8000-000000000002',
        'fullName': 'Nasima Begum',
        'employeeCode': 'MG-0011',
      },
      steps: [
        stepJson(
          id: 'c0000000-0000-4000-8000-000000000004',
          stepNo: 1,
          approver: shirin,
          status: 'approved',
          decidedBy: 'Shirin Akter',
          decidedAt: '2026-10-23T12:00:00.000Z',
        ),
        stepJson(id: hrStepId, stepNo: 2, kind: 'hr'),
      ],
    ),
    'balance': balanceJson(
      maternityLeaveJson,
      entitlement: null,
      available: null,
    ),
  },
];

/// `GET /tenant/me/holidays?year=` 200 body.
Json holidayYearJson(int year) => {
  'calendar': {
    'id': 'f0000000-0000-4000-8000-000000000001',
    'name': 'Bangladesh public holidays',
    'isDefault': true,
    'locations': [
      {'id': 'a1b2c3d4-0000-4000-8000-000000000002', 'name': 'Gazipur Factory'},
    ],
  },
  'year': year,
  'holidays': [
    _holiday(1, '$year-02-21', 'Language Martyrs’ Day', 'শহীদ দিবস', 'public'),
    _holiday(
      2,
      '$year-03-20',
      'Eid ul-Fitr',
      'ঈদুল ফিতর',
      'festival',
      tentative: true,
    ),
    _holiday(3, '$year-07-01', 'Factory foundation day', null, 'company'),
    _holiday(4, '$year-12-16', 'Victory Day', 'বিজয় দিবস', 'public'),
  ],
  'festivalDays': 1,
  'festivalDaysRequired': 13,
  'festivalRule': {
    'key': 'holidays.festival.days_per_year',
    'title': 'Festival holidays per year',
    'value': 13,
    'from': '2026-01-01',
    'to': null,
    'reference': {'act': 'Bangladesh Labour Act 2006', 'section': '118'},
    'status': 'needs_review',
  },
};

Json _holiday(
  int n,
  String date,
  String name,
  String? nameBn,
  String kind, {
  bool tentative = false,
}) => {
  'id': 'f1000000-0000-4000-8000-00000000000$n',
  'calendarId': 'f0000000-0000-4000-8000-000000000001',
  'date': date,
  'name': name,
  'nameBn': nameBn,
  'kind': kind,
  'isTentative': tentative,
};
