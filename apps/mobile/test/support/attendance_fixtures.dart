/// Attendance JSON exactly as the API contract shapes it, for the seeded
/// worker MG-0005 (Rahima Khatun) at the Gazipur factory, which keeps
/// Asia/Dhaka time (UTC+6). The tests fix "today" at [leaveToday], Saturday
/// 24 October 2026; Friday is the weekly off.
library;

import 'package:good_people/api/api_models.dart';

import 'leave_fixtures.dart';

/// The `employee` of attendance views, with the Bangla name.
const rahimaAttendance = <String, Object?>{
  'id': '9e8d7c6b-5a49-4382-9170-6f5e4d3c2b1a',
  'employeeCode': 'MG-0005',
  'fullName': 'Rahima Khatun',
  'fullNameBn': 'রহিমা খাতুন',
};

/// 08:00 to 17:00 with an hour's break.
const generalShift = <String, Object?>{
  'id': 'ab000000-0000-4000-8000-000000000001',
  'code': 'GEN',
  'name': 'General shift',
  'nameBn': 'সাধারণ শিফট',
  'startTime': '08:00',
  'endTime': '17:00',
};

const gazipurGeofence = <String, Object?>{
  'latitude': 24.0023,
  'longitude': 90.4264,
  'radiusM': 200,
};

/// A fix at the factory gate, 15 m from the geofence's centre.
const atTheFactory = PunchLocation(
  latitude: 24.0024,
  longitude: 90.4265,
  accuracyM: 12,
);

/// A fix at the bazaar, 801 m north of the factory.
const atTheBazaar = PunchLocation(
  latitude: 24.0095,
  longitude: 90.4264,
  accuracyM: 20,
);

const mainGate = <String, Object?>{
  'id': 'ae000000-0000-4000-8000-000000000001',
  'name': 'Main gate',
};

/// The instant of a Dhaka wall-clock [time] (`HH:MM`) on [date], as the
/// API sends it: `dhaka('2026-10-24', '07:55')` is `2026-10-24T01:55:00.000Z`.
String dhaka(String date, String time) =>
    DateTime.parse('${date}T$time:00Z')
        .subtract(const Duration(hours: 6))
        .toIso8601String();

/// One `AttendanceDayView`. [firstIn] and [lastOut] are Dhaka `HH:MM` on
/// [date].
Json dayJson({
  required String date,
  String dayType = 'working',
  String? holidayName,
  String status = 'present',
  Json? shift = generalShift,
  Json? leave,
  String? firstIn,
  String? lastOut,
  int worked = 0,
  int late = 0,
  int earlyOut = 0,
  int overtime = 0,
  List<String> flags = const [],
  Json? regularization,
}) => {
  'date': date,
  'dayType': dayType,
  'holidayName': holidayName,
  'status': status,
  'shift': shift,
  'shiftSource': 'assignment',
  'leave': leave,
  'firstIn': firstIn == null ? null : dhaka(date, firstIn),
  'lastOut': lastOut == null ? null : dhaka(date, lastOut),
  'workedMinutes': worked,
  'lateMinutes': late,
  'earlyOutMinutes': earlyOut,
  'overtimeMinutes': overtime,
  'flags': flags,
  'regularization': regularization,
};

/// One `PunchView` at Dhaka [time] on [date].
Json punchJson({
  required String id,
  required String date,
  required String time,
  String source = 'device',
  String direction = 'in',
  Json? device,
  num? distanceM,
  bool? insideGeofence,
  String? note,
  bool voided = false,
  String? selfieDocumentId,
}) => {
  'id': id,
  'punchedAt': dhaka(date, time),
  'source': source,
  'direction': direction,
  'device': device,
  'distanceM': distanceM,
  'insideGeofence': insideGeofence,
  'note': note,
  'voided': voided,
  'selfieDocumentId': selfieDocumentId,
};

/// The document the API stores a punch's selfie as.
const selfieDocumentId = 'da000000-0000-4000-8000-0000000000ff';

const devicePunchId = 'ac000000-0000-4000-8000-000000000001';
const voidedPunchId = 'ac000000-0000-4000-8000-000000000002';
const mobilePunchId = 'ac000000-0000-4000-8000-0000000000ff';

/// `GET /tenant/me/attendance/today` 200 body: in at 07:55 on the main gate
/// device, plus a double tap HR voided, so the next punch is out.
Json attendanceTodayJson({
  String mode = 'geofenced',
  String? blockedReason,
  Json? geofence = gazipurGeofence,
  bool requireSelfie = false,
  List<Json>? punches,
  String nextDirection = 'out',
  Json? day,
}) => {
  'employee': rahimaAttendance,
  'timeZone': 'Asia/Dhaka',
  'day':
      day ?? dayJson(date: '2026-10-24', status: 'pending', firstIn: '07:55'),
  'punches':
      punches ??
      [
        punchJson(
          id: devicePunchId,
          date: '2026-10-24',
          time: '07:55',
          device: mainGate,
        ),
        punchJson(
          id: voidedPunchId,
          date: '2026-10-24',
          time: '07:56',
          direction: 'out',
          device: mainGate,
          note: 'Double tap',
          voided: true,
        ),
      ],
  'selfPunch': {
    'mode': mode,
    'blockedReason': blockedReason,
    'geofence': geofence,
    'requireSelfie': requireSelfie,
  },
  'nextDirection': nextDirection,
};

/// What the API answers a punch at 17:10 with: [today] plus a mobile punch
/// in its next direction, inside the geofence when [body] has a location,
/// and with a selfie document when one came [withSelfie].
Json punchedJson(Json today, Json body, {bool withSelfie = false}) {
  final day = today['day']! as Json;
  final date = day['date']! as String;
  final direction = today['nextDirection']! as String;
  final located = body.containsKey('latitude');
  final at = dhaka(date, '17:10');
  return {
    ...today,
    'day': {
      ...day,
      if (direction == 'in' && day['firstIn'] == null) 'firstIn': at,
      if (direction == 'out') ...{
        'lastOut': at,
        // 07:55 to 17:10, less the hour's break.
        'workedMinutes': 495,
      },
    },
    'punches': [
      ...(today['punches']! as List<Object?>),
      punchJson(
        id: mobilePunchId,
        date: date,
        time: '17:10',
        source: 'mobile',
        direction: direction,
        distanceM: located ? 15 : null,
        insideGeofence: located ? true : null,
        selfieDocumentId: withSelfie ? selfieDocumentId : null,
      ),
    ],
    'nextDirection': direction == 'in' ? 'out' : 'in',
  };
}

const pendingCorrectionId = 'ad000000-0000-4000-8000-000000000001';
const approvedCorrectionId = 'ad000000-0000-4000-8000-000000000002';
const rejectedCorrectionId = 'ad000000-0000-4000-8000-000000000003';

/// The days of October 2026 that differ from a plain present day
/// (07:55 to 17:05).
final _octoberDays = <int, Json Function(String date)>{
  8: (date) => dayJson(
    date: date,
    firstIn: '08:00',
    lastOut: '17:00',
    worked: 480,
    flags: ['on_duty'],
    regularization: {
      'id': approvedCorrectionId,
      'kind': 'on_duty',
      'status': 'approved',
    },
  ),
  12: (date) => dayJson(
    date: date,
    status: 'half_day',
    firstIn: '08:00',
    lastOut: '13:00',
    worked: 300,
    earlyOut: 240,
    flags: ['early_out'],
  ),
  14: (date) => dayJson(
    date: date,
    status: 'on_leave',
    leave: {
      'requestId': 'b0000000-0000-4000-8000-000000000010',
      'code': 'CL',
      'days': 1,
    },
  ),
  15: (date) => dayJson(date: date, status: 'absent'),
  19: (date) => dayJson(
    date: date,
    firstIn: '07:50',
    lastOut: '19:10',
    worked: 620,
    overtime: 120,
  ),
  20: (date) => dayJson(
    date: date,
    status: 'missing_punch',
    firstIn: '07:58',
    regularization: {
      'id': pendingCorrectionId,
      'kind': 'missed_punch',
      'status': 'pending',
    },
  ),
  21: (date) => dayJson(
    date: date,
    dayType: 'holiday',
    holidayName: 'Durga Puja',
    status: 'off',
  ),
  22: (date) => dayJson(
    date: date,
    firstIn: '08:25',
    lastOut: '17:05',
    worked: 460,
    late: 25,
    flags: ['late'],
  ),
  24: (date) => dayJson(date: date, status: 'pending', firstIn: '07:55'),
};

/// `GET /tenant/me/attendance?from=&to=` 200 body: every day from [from]
/// to [to], Fridays off, with the totals the API would count.
Json attendanceRangeJson(String from, String to) {
  final days = <Json>[];
  for (
    var date = DateTime.parse('${from}T00:00:00Z');
    !date.isAfter(DateTime.parse('${to}T00:00:00Z'));
    date = date.add(const Duration(days: 1))
  ) {
    final wire = toWireDate(date);
    final friday = date.weekday == DateTime.friday;
    final special = date.month == 10 ? _octoberDays[date.day] : null;
    days.add(
      // Days after today are projections, still pending.
      date.isAfter(leaveToday)
          ? dayJson(
              date: wire,
              dayType: friday ? 'weekly_off' : 'working',
              status: 'pending',
            )
          : special?.call(wire) ??
                (friday
                    ? dayJson(date: wire, dayType: 'weekly_off', status: 'off')
                    : dayJson(
                        date: wire,
                        firstIn: '07:55',
                        lastOut: '17:05',
                        worked: 490,
                      )),
    );
  }
  final counted = [
    for (final day in days)
      if (day['status'] != 'pending') day,
  ];
  int count(String status) =>
      counted.where((day) => day['status'] == status).length;
  int sum(String key) =>
      counted.fold(0, (total, day) => total + (day[key]! as int));
  return {
    'employee': rahimaAttendance,
    'timeZone': 'Asia/Dhaka',
    'from': from,
    'to': to,
    'days': days,
    'totals': {
      'present': count('present'),
      'halfDay': count('half_day'),
      'absent': count('absent'),
      'onLeave': count('on_leave'),
      'missingPunch': count('missing_punch'),
      'late': counted
          .where((day) => (day['flags']! as List<Object?>).contains('late'))
          .length,
      'workedMinutes': sum('workedMinutes'),
      'overtimeMinutes': sum('overtimeMinutes'),
    },
  };
}

/// One `RegularizationView`.
Json regularizationJson({
  required String id,
  required String date,
  String kind = 'missed_punch',
  String? inTime,
  String? outTime,
  String reason = 'The card reader at the gate was down',
  String status = 'pending',
  Json employee = rahimaAttendance,
  List<Json>? steps,
  String createdAt = '2026-10-21T03:00:00.000Z',
  String? decidedAt,
}) => {
  'id': id,
  'employee': employee,
  'date': date,
  'kind': kind,
  'inTime': inTime,
  'outTime': outTime,
  'reason': reason,
  'status': status,
  'steps':
      steps ??
      [
        stepJson(id: '$id-1', stepNo: 1, approver: shirin),
        stepJson(id: '$id-2', stepNo: 2, kind: 'hr', status: 'waiting'),
      ],
  'createdAt': createdAt,
  'decidedAt': decidedAt,
};

/// `GET /tenant/me/attendance/regularizations` 200 body, newest day first:
/// a pending missed out-punch, an approved on-duty day and a rejected
/// missed punch.
List<Json> myRegularizationsJson() => [
  regularizationJson(
    id: pendingCorrectionId,
    date: '2026-10-20',
    outTime: '17:40',
  ),
  regularizationJson(
    id: approvedCorrectionId,
    date: '2026-10-08',
    kind: 'on_duty',
    reason: 'Buyer inspection at the Ashulia unit',
    status: 'approved',
    steps: [
      stepJson(
        id: '$approvedCorrectionId-1',
        stepNo: 1,
        approver: shirin,
        status: 'approved',
        decidedBy: 'Shirin Akter',
        decidedAt: '2026-10-09T04:00:00.000Z',
      ),
    ],
    decidedAt: '2026-10-09T04:00:00.000Z',
  ),
  regularizationJson(
    id: rejectedCorrectionId,
    date: '2026-10-05',
    inTime: '08:00',
    outTime: '17:00',
    reason: 'Forgot my card',
    status: 'rejected',
    steps: [
      stepJson(
        id: '$rejectedCorrectionId-1',
        stepNo: 1,
        approver: shirin,
        status: 'rejected',
        decidedBy: 'Shirin Akter',
        decidedAt: '2026-10-06T04:00:00.000Z',
        comment: 'The device has you at 9:40',
      ),
      stepJson(
        id: '$rejectedCorrectionId-2',
        stepNo: 2,
        kind: 'hr',
        status: 'skipped',
      ),
    ],
    decidedAt: '2026-10-06T04:00:00.000Z',
  ),
];

const correctionStepId = 'c0000000-0000-4000-8000-000000000010';
const unknownStepId = 'c0000000-0000-4000-8000-000000000011';

/// The correction a supervisor sees in the inbox: Kulsum's missed
/// in-punch on 22 October, a day with only her 17:06 out-punch.
Json correctionApprovalJson() => {
  'subjectType': 'regularization',
  'stepId': correctionStepId,
  'kind': 'manager',
  'regularization': regularizationJson(
    id: 'ad000000-0000-4000-8000-000000000010',
    date: '2026-10-22',
    inTime: '08:02',
    reason: 'The device did not read my finger',
    employee: const {
      'id': 'e0000000-0000-4000-8000-000000000003',
      'employeeCode': 'MG-0012',
      'fullName': 'Kulsum Akter',
      'fullNameBn': 'কুলসুম আক্তার',
    },
    steps: [
      stepJson(id: correctionStepId, stepNo: 1, approver: shirin),
      stepJson(
        id: 'c0000000-0000-4000-8000-000000000012',
        stepNo: 2,
        kind: 'hr',
        status: 'waiting',
      ),
    ],
  ),
  'day': dayJson(date: '2026-10-22', status: 'missing_punch', firstIn: '17:06'),
};

/// `GET /tenant/approvals` 200 body with both subject types and one this
/// app does not know: the manager-step casual leave, Kulsum's correction,
/// and an overtime request from a newer API.
List<Json> mixedApprovalsJson() => [
  approvalsJson().first,
  correctionApprovalJson(),
  {
    'subjectType': 'overtime_request',
    'stepId': unknownStepId,
    'kind': 'hr',
    'overtime': {'id': 'af000000-0000-4000-8000-000000000001', 'hours': 2},
  },
];
