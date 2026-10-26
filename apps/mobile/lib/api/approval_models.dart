part of 'api_models.dart';

// ── Approvals inbox: `GET /tenant/approvals` ────────────────────────────────
//
// One inbox for everything waiting on the signed-in user. Each item says
// what it approves in `subjectType`: a leave request, an attendance
// correction (regularization), a resignation (separation) or a month's
// project timesheet. The approve and reject calls are the same for all of
// them.

/// What an approval step decides.
enum ApprovalSubjectType implements WireValue {
  leaveRequest('leave_request'),
  regularization('regularization'),
  separation('separation'),
  timesheet('timesheet'),
  unknown('unknown');

  const ApprovalSubjectType(this.wire);
  @override
  final String wire;

  static ApprovalSubjectType fromWire(String value) =>
      _byWire(values, value, unknown);
}

/// `GET /tenant/approvals` item: one step waiting for the signed-in user.
///
/// A subject type this app does not know becomes an [UnknownApprovalItem]
/// instead of failing the whole inbox, so a newer API does not hide the
/// leave and corrections the app can show.
sealed class ApprovalItem {
  const ApprovalItem({required this.stepId, required this.kind});

  factory ApprovalItem.fromJson(Json json) {
    // Before attendance the API sent no subjectType: every item was leave.
    final subject = _read<String?>(json, 'subjectType');
    return switch (subject == null
        ? ApprovalSubjectType.leaveRequest
        : ApprovalSubjectType.fromWire(subject)) {
      ApprovalSubjectType.leaveRequest => LeaveApprovalItem.fromJson(json),
      ApprovalSubjectType.regularization => RegularizationApprovalItem.fromJson(
        json,
      ),
      ApprovalSubjectType.separation => SeparationApprovalItem.fromJson(json),
      ApprovalSubjectType.timesheet => TimesheetApprovalItem.fromJson(json),
      ApprovalSubjectType.unknown => UnknownApprovalItem(
        stepId: _read<String>(json, 'stepId'),
        kind: ApprovalStepKind.fromWire(_read<String>(json, 'kind')),
        subjectType: subject!,
      ),
    };
  }

  /// The id the approve and reject calls take.
  final String stepId;

  /// The signed-in user's step: as the manager or as HR.
  final ApprovalStepKind kind;
}

/// A leave request waiting for the signed-in user.
final class LeaveApprovalItem extends ApprovalItem {
  const LeaveApprovalItem({
    required super.stepId,
    required super.kind,
    required this.request,
    this.balance,
  });

  factory LeaveApprovalItem.fromJson(Json json) => LeaveApprovalItem(
    stepId: _read<String>(json, 'stepId'),
    kind: ApprovalStepKind.fromWire(_read<String>(json, 'kind')),
    request: LeaveRequest.fromJson(_read<Json>(json, 'request')),
    balance: _readOptional(json, 'balance', LeaveBalance.fromJson),
  );

  final LeaveRequest request;

  /// The requester's balance for the request's leave type and year.
  final LeaveBalance? balance;
}

/// An attendance correction waiting for the signed-in user.
final class RegularizationApprovalItem extends ApprovalItem {
  const RegularizationApprovalItem({
    required super.stepId,
    required super.kind,
    required this.regularization,
    this.day,
  });

  factory RegularizationApprovalItem.fromJson(Json json) =>
      RegularizationApprovalItem(
        stepId: _read<String>(json, 'stepId'),
        kind: ApprovalStepKind.fromWire(_read<String>(json, 'kind')),
        regularization: Regularization.fromJson(
          _read<Json>(json, 'regularization'),
        ),
        day: _readOptional(json, 'day', AttendanceDay.fromJson),
      );

  final Regularization regularization;

  /// The day as processed now, to compare with what is asked. `null` when
  /// the day was never processed.
  final AttendanceDay? day;
}

/// A resignation waiting for the signed-in user. Only resignations go for
/// approval; what HR records stands approved.
final class SeparationApprovalItem extends ApprovalItem {
  const SeparationApprovalItem({
    required super.stepId,
    required super.kind,
    required this.separation,
  });

  factory SeparationApprovalItem.fromJson(Json json) => SeparationApprovalItem(
    stepId: _read<String>(json, 'stepId'),
    kind: ApprovalStepKind.fromWire(_read<String>(json, 'kind')),
    separation: Separation.fromJson(_read<Json>(json, 'separation')),
  );

  final Separation separation;
}

/// A month's project timesheet waiting for the signed-in user, usually the
/// employee's manager. Approved, its shares split the month's salary across
/// projects; rejected, it goes back to the employee to correct and submit
/// again.
final class TimesheetApprovalItem extends ApprovalItem {
  const TimesheetApprovalItem({
    required super.stepId,
    required super.kind,
    required this.timesheet,
  });

  factory TimesheetApprovalItem.fromJson(Json json) => TimesheetApprovalItem(
    stepId: _read<String>(json, 'stepId'),
    kind: ApprovalStepKind.fromWire(_read<String>(json, 'kind')),
    timesheet: TimesheetSummary.fromJson(_read<Json>(json, 'timesheet')),
  );

  final TimesheetSummary timesheet;
}

/// An item whose `subjectType` this app does not know yet. It can be shown,
/// but the app cannot tell what deciding it means.
final class UnknownApprovalItem extends ApprovalItem {
  const UnknownApprovalItem({
    required super.stepId,
    required super.kind,
    required this.subjectType,
  });

  /// The `subjectType` as sent.
  final String subjectType;
}
