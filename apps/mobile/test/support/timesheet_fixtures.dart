import 'package:good_people/api/api_models.dart';

/// A project the employee is allocated to (60%).
const waterProjectId = 'a1b2c3d4-0000-4000-8000-000000000001';

/// A project of their company they are not allocated to.
const schoolProjectId = 'a1b2c3d4-0000-4000-8000-000000000002';

/// `GET /tenant/timesheets/me?month=` 200 body for [month] (`YYYY-MM`), as
/// the API contract shapes it: Fridays are weekly holidays, attendance
/// recorded 8 hours on every other day, and [entries] give the hours.
Json timesheetJson(
  String month, {
  String status = 'draft',
  List<Json> entries = const [],
  bool needed = true,
  String? note,
  List<Json> steps = const [],
}) {
  final first = DateTime.parse('$month-01T00:00:00Z');
  final days = <Json>[];
  for (
    var day = first;
    day.month == first.month;
    day = day.add(const Duration(days: 1))
  ) {
    final weekend = day.weekday == DateTime.friday;
    days.add({
      'date': toWireDate(day),
      'weekend': weekend,
      'holiday': null,
      'leave': null,
      'offDay': weekend,
      'workedHours': weekend ? null : '8.00',
      'hours': '0.00',
    });
  }
  return withTimesheetEntries({
    'id': null,
    'employee': {
      'id': '7d1e5c3b-2a49-4f86-8e1d-3c5b7a9f0e21',
      'employeeCode': 'MG-0005',
      'fullName': 'Rahima Akter',
      'fullNameBn': 'রহিমা আক্তার',
    },
    'month': month,
    'from': toWireDate(first),
    'to': days.last['date'],
    'status': status,
    'needed': needed,
    'editable': status == 'draft' || status == 'rejected',
    'submittedAt': status == 'draft' ? null : '2026-11-02T04:00:00.000Z',
    'decidedAt': null,
    'decidedBy': null,
    'note': note,
    'projects': [
      {
        'id': waterProjectId,
        'code': 'WASH-01',
        'name': 'Safe water for Kurigram',
        'nameBn': 'কুড়িগ্রামে নিরাপদ পানি',
        'donor': {'code': 'UNICEF', 'name': 'UNICEF'},
        'startsOn': '2025-01-01',
        'endsOn': null,
        'plannedPercent': '60.00',
        'costKind': 'programme',
        'chargeable': true,
      },
      {
        'id': schoolProjectId,
        'code': 'EDU-02',
        'name': 'Schools in Bhola',
        'nameBn': null,
        'donor': null,
        'startsOn': '2025-01-01',
        'endsOn': null,
        'plannedPercent': null,
        'costKind': null,
        'chargeable': true,
      },
    ],
    'days': days,
    'entries': <Json>[],
    'totals': <Json>[],
    'totalHours': '0.00',
    'steps': steps,
  }, entries);
}

/// [sheet] with [entries], its day hours and totals worked out again.
Json withTimesheetEntries(Json sheet, List<Json> entries) {
  final byDay = <String, double>{};
  final byProject = <String?, double>{};
  for (final entry in entries) {
    final hours = double.parse(entry['hours']! as String);
    byDay.update(
      entry['date']! as String,
      (h) => h + hours,
      ifAbsent: () => hours,
    );
    byProject.update(
      entry['projectId'] as String?,
      (h) => h + hours,
      ifAbsent: () => hours,
    );
  }
  final total = byProject.values.fold<double>(0, (s, h) => s + h);
  final projects = sheet['projects']! as List<Object?>;
  Json? refOf(String? id) => switch (projects.cast<Json>().where(
    (p) => p['id'] == id,
  )) {
    final found when found.isNotEmpty => {
      for (final key in ['id', 'code', 'name', 'nameBn']) key: found.first[key],
    },
    _ => null,
  };
  return {
    ...sheet,
    'id': entries.isEmpty && sheet['id'] == null
        ? null
        : '9e8d7c6b-5a49-4382-a1b0-c9d8e7f6a5b4',
    'entries': [
      for (final (i, entry) in entries.indexed)
        {
          'id': 'e0000000-0000-4000-8000-${i.toString().padLeft(12, '0')}',
          'note': null,
          ...entry,
        },
    ],
    'days': [
      for (final day in (sheet['days']! as List<Object?>).cast<Json>())
        {...day, 'hours': (byDay[day['date']] ?? 0).toStringAsFixed(2)},
    ],
    'totals': [
      for (final MapEntry(key: id, value: hours) in byProject.entries)
        {
          'project': refOf(id),
          'hours': hours.toStringAsFixed(2),
          'percent': (total == 0 ? 0 : hours * 100 / total).toStringAsFixed(2),
          'plannedPercent': id == waterProjectId ? '60.00' : null,
        },
    ],
    'totalHours': total.toStringAsFixed(2),
  };
}

const timesheetStepId = 'c0000000-0000-4000-8000-000000000030';

/// The step of the same timesheet once corrected and submitted again.
const resubmittedTimesheetStepId = 'c0000000-0000-4000-8000-000000000031';

/// The timesheet a manager sees in the inbox (`TimesheetApprovalItem`):
/// Kulsum's October, 160 hours, most of them on the water project she is
/// planned at 60%, some on a project she is not allocated to, and some
/// not charged to any project.
Json timesheetApprovalJson({String stepId = timesheetStepId}) => {
  'subjectType': 'timesheet',
  'stepId': stepId,
  'kind': 'manager',
  'timesheet': {
    'id': '9e8d7c6b-5a49-4382-a1b0-c9d8e7f6a5c0',
    'employee': {
      'id': 'e0000000-0000-4000-8000-000000000003',
      'employeeCode': 'MG-0012',
      'fullName': 'Kulsum Akter',
      'fullNameBn': 'কুলসুম আক্তার',
    },
    'month': '2026-10',
    'status': 'submitted',
    'submittedAt': '2026-11-02T04:00:00.000Z',
    'decidedAt': null,
    'totalHours': '160.00',
    'totals': [
      {
        'project': {
          'id': waterProjectId,
          'code': 'WASH-01',
          'name': 'Safe water for Kurigram',
          'nameBn': 'কুড়িগ্রামে নিরাপদ পানি',
        },
        'hours': '112.50',
        'percent': '70.31',
        'plannedPercent': '60.00',
      },
      {
        'project': {
          'id': schoolProjectId,
          'code': 'EDU-02',
          'name': 'Schools in Bhola',
          'nameBn': null,
        },
        'hours': '31.50',
        'percent': '19.69',
        'plannedPercent': null,
      },
      {
        'project': null,
        'hours': '16.00',
        'percent': '10.00',
        'plannedPercent': null,
      },
    ],
  },
};
