part of 'api_models.dart';

// ── Project timesheets: `/tenant/timesheets/me` ─────────────────────────────
//
// A month of hours by project, for staff charged to donor-funded projects.
// Entries can be made without a connection: each carries a `clientId`, so
// sending it again changes nothing.

/// The month as the API takes it: `2026-10` for any date in October 2026.
String toWireMonth(DateTime month) => toWireDate(month).substring(0, 7);

enum TimesheetStatus implements WireValue {
  draft('draft'),
  submitted('submitted'),
  approved('approved'),

  /// Returned by the manager: the employee corrects it and submits again.
  rejected('rejected'),
  unknown('unknown');

  const TimesheetStatus(this.wire);
  @override
  final String wire;

  static TimesheetStatus fromWire(String value) =>
      _byWire(values, value, unknown);
}

class TimesheetProjectRef {
  const TimesheetProjectRef({
    required this.id,
    required this.code,
    required this.name,
    this.nameBn,
  });

  factory TimesheetProjectRef.fromJson(Json json) => TimesheetProjectRef(
    id: _read<String>(json, 'id'),
    code: _read<String>(json, 'code'),
    name: _read<String>(json, 'name'),
    nameBn: _read<String?>(json, 'nameBn'),
  );

  final String id;
  final String code;
  final String name;
  final String? nameBn;

  /// The name in [languageCode], English when there is no Bangla one.
  String nameIn(String languageCode) =>
      languageCode == 'bn' && nameBn != null ? nameBn! : name;

  Json toJson() => {'id': id, 'code': code, 'name': name, 'nameBn': nameBn};
}

/// A project on the timesheet: the person's allocated ones come first.
class TimesheetProject extends TimesheetProjectRef {
  const TimesheetProject({
    required super.id,
    required super.code,
    required super.name,
    super.nameBn,
    required this.chargeable,
    this.plannedPercent,
  });

  factory TimesheetProject.fromJson(Json json) => TimesheetProject(
    id: _read<String>(json, 'id'),
    code: _read<String>(json, 'code'),
    name: _read<String>(json, 'name'),
    nameBn: _read<String?>(json, 'nameBn'),
    plannedPercent: _read<String?>(json, 'plannedPercent'),
    chargeable: _read<bool>(json, 'chargeable'),
  );

  /// Their planned share of salary on it, such as `60.00`; `null` when they
  /// are not allocated to it.
  final String? plannedPercent;

  /// Hours can be added to it this month.
  final bool chargeable;

  @override
  Json toJson() => {
    ...super.toJson(),
    'plannedPercent': plannedPercent,
    'chargeable': chargeable,
  };
}

class TimesheetLeave {
  const TimesheetLeave({required this.code, required this.name, this.nameBn});

  factory TimesheetLeave.fromJson(Json json) => TimesheetLeave(
    code: _read<String>(json, 'code'),
    name: _read<String>(json, 'name'),
    nameBn: _read<String?>(json, 'nameBn'),
  );

  final String code;
  final String name;
  final String? nameBn;

  Json toJson() => {'code': code, 'name': name, 'nameBn': nameBn};
}

class TimesheetDay {
  const TimesheetDay({
    required this.date,
    required this.weekend,
    required this.offDay,
    required this.hours,
    this.holiday,
    this.leave,
    this.workedHours,
  });

  factory TimesheetDay.fromJson(Json json) => TimesheetDay(
    date: _readDate(json, 'date'),
    weekend: _read<bool>(json, 'weekend'),
    holiday: _read<String?>(json, 'holiday'),
    leave: _readOptional(json, 'leave', TimesheetLeave.fromJson),
    offDay: _read<bool>(json, 'offDay'),
    workedHours: _read<String?>(json, 'workedHours'),
    hours: _read<String>(json, 'hours'),
  );

  final DateTime date;

  /// A weekly holiday of their work location.
  final bool weekend;

  /// The public holiday's name.
  final String? holiday;

  /// Approved leave on the day.
  final TimesheetLeave? leave;

  /// Not a working day: a weekend, a holiday or a rostered day off.
  final bool offDay;

  /// The hours attendance recorded, such as `8.00`: a hint.
  final String? workedHours;

  /// The day's entries together, such as `7.50`.
  final String hours;

  Json toJson() => {
    'date': toWireDate(date),
    'weekend': weekend,
    'holiday': holiday,
    'leave': leave?.toJson(),
    'offDay': offDay,
    'workedHours': workedHours,
    'hours': hours,
  };
}

class TimesheetEntry {
  const TimesheetEntry({
    required this.id,
    required this.date,
    required this.hours,
    this.projectId,
    this.note,
  });

  factory TimesheetEntry.fromJson(Json json) => TimesheetEntry(
    id: _read<String>(json, 'id'),
    date: _readDate(json, 'date'),
    projectId: _read<String?>(json, 'projectId'),
    hours: _read<String>(json, 'hours'),
    note: _read<String?>(json, 'note'),
  );

  final String id;
  final DateTime date;

  /// `null`: work not charged to a project.
  final String? projectId;
  final String hours;
  final String? note;

  Json toJson() => {
    'id': id,
    'date': toWireDate(date),
    'projectId': projectId,
    'hours': hours,
    'note': note,
  };
}

class TimesheetTotal {
  const TimesheetTotal({
    required this.hours,
    required this.percent,
    this.project,
    this.plannedPercent,
  });

  factory TimesheetTotal.fromJson(Json json) => TimesheetTotal(
    project: _readOptional(json, 'project', TimesheetProjectRef.fromJson),
    hours: _read<String>(json, 'hours'),
    percent: _read<String>(json, 'percent'),
    plannedPercent: _read<String?>(json, 'plannedPercent'),
  );

  /// `null`: work not charged to a project.
  final TimesheetProjectRef? project;
  final String hours;

  /// Share of the month's hours, such as `75.00`.
  final String percent;
  final String? plannedPercent;

  Json toJson() => {
    'project': project?.toJson(),
    'hours': hours,
    'percent': percent,
    'plannedPercent': plannedPercent,
  };
}

/// A month's timesheet in a line, as the approvals inbox sends it: whose it
/// is and their hours by project.
class TimesheetSummary {
  const TimesheetSummary({
    required this.id,
    required this.employee,
    required this.month,
    required this.status,
    required this.totalHours,
    required this.totals,
    this.submittedAt,
    this.decidedAt,
  });

  factory TimesheetSummary.fromJson(Json json) => TimesheetSummary(
    id: _read<String>(json, 'id'),
    employee: EmployeeRef.fromJson(_read<Json>(json, 'employee')),
    month: _readMonth(json, 'month'),
    status: TimesheetStatus.fromWire(_read<String>(json, 'status')),
    submittedAt: _readOptionalTimestamp(json, 'submittedAt'),
    decidedAt: _readOptionalTimestamp(json, 'decidedAt'),
    totalHours: _read<String>(json, 'totalHours'),
    totals: _readList(json, 'totals', TimesheetTotal.fromJson),
  );

  final String id;
  final EmployeeRef employee;

  /// The month's first day, UTC midnight.
  final DateTime month;
  final TimesheetStatus status;
  final DateTime? submittedAt;
  final DateTime? decidedAt;

  /// The month's hours together, such as `168.00`.
  final String totalHours;

  /// Hours and share by project; a `null` project is work not charged to
  /// one.
  final List<TimesheetTotal> totals;
}

/// `GET /tenant/timesheets/me?month=`: one person's month. Before anything
/// is saved it is an empty draft with no [id].
class Timesheet {
  const Timesheet({
    required this.month,
    required this.status,
    required this.needed,
    required this.editable,
    required this.projects,
    required this.days,
    required this.entries,
    required this.totals,
    required this.totalHours,
    required this.steps,
    this.id,
    this.submittedAt,
    this.decidedAt,
    this.decidedBy,
    this.note,
  });

  factory Timesheet.fromJson(Json json) => Timesheet(
    id: _read<String?>(json, 'id'),
    month: _readDate(json, 'from'),
    status: TimesheetStatus.fromWire(_read<String>(json, 'status')),
    needed: _read<bool>(json, 'needed'),
    editable: _read<bool>(json, 'editable'),
    submittedAt: _readOptionalTimestamp(json, 'submittedAt'),
    decidedAt: _readOptionalTimestamp(json, 'decidedAt'),
    decidedBy: _readOptional(json, 'decidedBy', PersonRef.fromJson),
    note: _read<String?>(json, 'note'),
    projects: _readList(json, 'projects', TimesheetProject.fromJson),
    days: _readList(json, 'days', TimesheetDay.fromJson),
    entries: _readList(json, 'entries', TimesheetEntry.fromJson),
    totals: _readList(json, 'totals', TimesheetTotal.fromJson),
    totalHours: _read<String>(json, 'totalHours'),
    steps: _readList(json, 'steps', ApprovalStep.fromJson),
  );

  final String? id;

  /// The month's first day, UTC midnight.
  final DateTime month;
  final TimesheetStatus status;

  /// They are allocated to a project this month, so a timesheet is due.
  final bool needed;

  /// Entries can change: a draft, or one returned for correction.
  final bool editable;
  final DateTime? submittedAt;
  final DateTime? decidedAt;
  final PersonRef? decidedBy;

  /// Why HR reopened it, if it did.
  final String? note;
  final List<TimesheetProject> projects;
  final List<TimesheetDay> days;
  final List<TimesheetEntry> entries;
  final List<TimesheetTotal> totals;
  final String totalHours;

  /// The current round of approval.
  final List<ApprovalStep> steps;

  /// For the copy kept on the phone; the approval steps are left out.
  Json toJson() => {
    'id': id,
    'from': toWireDate(month),
    'status': status.wire,
    'needed': needed,
    'editable': editable,
    'submittedAt': submittedAt == null ? null : toWireInstant(submittedAt!),
    'decidedAt': decidedAt == null ? null : toWireInstant(decidedAt!),
    'decidedBy': switch (decidedBy) {
      final PersonRef person => {'id': person.id, 'fullName': person.fullName},
      null => null,
    },
    'note': note,
    'projects': [for (final project in projects) project.toJson()],
    'days': [for (final day in days) day.toJson()],
    'entries': [for (final entry in entries) entry.toJson()],
    'totals': [for (final total in totals) total.toJson()],
    'totalHours': totalHours,
    'steps': const <Json>[],
  };
}

/// One cell sent to `PUT /tenant/timesheets/me/entries`; zero hours removes
/// it.
class TimesheetEntryDraft {
  const TimesheetEntryDraft({
    required this.clientId,
    required this.date,
    required this.hours,
    this.projectId,
  });

  final String clientId;
  final DateTime date;
  final String? projectId;

  /// Such as `7.5`.
  final String hours;

  Json toJson() => {
    'clientId': clientId,
    'date': toWireDate(date),
    'projectId': projectId,
    'hours': hours,
  };
}

/// An entry the API did not save, and why.
class TimesheetEntryRefusal {
  const TimesheetEntryRefusal({
    required this.date,
    required this.code,
    required this.message,
    this.clientId,
    this.projectId,
  });

  factory TimesheetEntryRefusal.fromJson(Json json) => TimesheetEntryRefusal(
    clientId: _read<String?>(json, 'clientId'),
    date: _readDate(json, 'date'),
    projectId: _read<String?>(json, 'projectId'),
    code: _read<String>(json, 'code'),
    message: _read<String>(json, 'message'),
  );

  final String? clientId;
  final DateTime date;
  final String? projectId;

  /// For example `day_over_24_hours` or `project_inactive`.
  final String code;

  /// The API's English text, shown when the code has no translation.
  final String message;
}

/// The answer to a save: which entries went in (a resend included) and
/// which did not, with the month as it is now.
class TimesheetSaveResult {
  const TimesheetSaveResult({
    required this.acceptedClientIds,
    required this.refused,
    required this.timesheet,
  });

  factory TimesheetSaveResult.fromJson(Json json) => TimesheetSaveResult(
    acceptedClientIds: {
      for (final item in _read<List<Object?>>(json, 'accepted'))
        if (item is Json && item['clientId'] is String)
          item['clientId']! as String,
    },
    refused: _readList(json, 'refused', TimesheetEntryRefusal.fromJson),
    timesheet: Timesheet.fromJson(_read<Json>(json, 'timesheet')),
  );

  final Set<String> acceptedClientIds;
  final List<TimesheetEntryRefusal> refused;
  final Timesheet timesheet;
}

/// `POST /tenant/timesheets/me/prefill`.
class TimesheetPrefillResult {
  const TimesheetPrefillResult({required this.days, required this.timesheet});

  factory TimesheetPrefillResult.fromJson(Json json) => TimesheetPrefillResult(
    days: _read<int>(json, 'days'),
    timesheet: Timesheet.fromJson(_read<Json>(json, 'timesheet')),
  );

  /// Days filled from attendance.
  final int days;
  final Timesheet timesheet;
}
