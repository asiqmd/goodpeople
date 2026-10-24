part of 'api_models.dart';

// ── Leave (Phase 1): balances, requests, approvals and holidays ─────────────
//
// Day counts are `num` because leave comes in halves, for example 1.5.

/// How a leave type earns days: a yearly allowance, by days worked, or per
/// event with no yearly balance (maternity).
enum LeaveAccrual implements WireValue {
  annualGrant('annual_grant'),
  earned('earned'),
  perEvent('per_event'),
  unknown('unknown');

  const LeaveAccrual(this.wire);
  @override
  final String wire;

  static LeaveAccrual fromWire(String value) => _byWire(values, value, unknown);
}

/// Which half of a single day a half-day request covers.
enum HalfDay implements WireValue {
  firstHalf('first_half'),
  secondHalf('second_half'),
  unknown('unknown');

  const HalfDay(this.wire);
  @override
  final String wire;

  static HalfDay fromWire(String value) => _byWire(values, value, unknown);
}

enum LeaveRequestStatus implements WireValue {
  pending('pending'),
  approved('approved'),
  rejected('rejected'),
  cancelled('cancelled'),
  unknown('unknown');

  const LeaveRequestStatus(this.wire);
  @override
  final String wire;

  static LeaveRequestStatus fromWire(String value) =>
      _byWire(values, value, unknown);
}

/// Who decides an approval step: the employee's manager or any HR admin.
enum ApprovalStepKind implements WireValue {
  manager('manager'),
  hr('hr'),
  unknown('unknown');

  const ApprovalStepKind(this.wire);
  @override
  final String wire;

  static ApprovalStepKind fromWire(String value) =>
      _byWire(values, value, unknown);
}

/// One approval step's state. `waiting` means an earlier step is still
/// open; `pending` means it is this approver's turn.
enum ApprovalStatus implements WireValue {
  waiting('waiting'),
  pending('pending'),
  approved('approved'),
  rejected('rejected'),
  skipped('skipped'),
  cancelled('cancelled'),
  unknown('unknown');

  const ApprovalStatus(this.wire);
  @override
  final String wire;

  static ApprovalStatus fromWire(String value) =>
      _byWire(values, value, unknown);
}

/// Why a date inside a leave request is not counted.
enum ExcludedDayReason implements WireValue {
  weeklyOff('weekly_off'),
  holiday('holiday'),
  unknown('unknown');

  const ExcludedDayReason(this.wire);
  @override
  final String wire;

  static ExcludedDayReason fromWire(String value) =>
      _byWire(values, value, unknown);
}

enum HolidayKind implements WireValue {
  public('public'),
  festival('festival'),
  optional('optional'),
  company('company'),
  unknown('unknown');

  const HolidayKind(this.wire);
  @override
  final String wire;

  static HolidayKind fromWire(String value) => _byWire(values, value, unknown);
}

/// `verified` against the gazetted text, or still `needs_review`.
enum RuleStatus implements WireValue {
  verified('verified'),
  needsReview('needs_review'),
  unknown('unknown');

  const RuleStatus(this.wire);
  @override
  final String wire;

  static RuleStatus fromWire(String value) => _byWire(values, value, unknown);
}

/// The approve and reject endpoints, by their path segment.
enum ApprovalDecision {
  approve,
  reject;

  String get pathSegment => name;
}

/// A leave type as it appears inside requests: `{id, code, name, nameBn}`.
class LeaveTypeRef {
  const LeaveTypeRef({
    required this.id,
    required this.code,
    required this.name,
    this.nameBn,
  });

  factory LeaveTypeRef.fromJson(Json json) => LeaveTypeRef(
    id: _read<String>(json, 'id'),
    code: _read<String>(json, 'code'),
    name: _read<String>(json, 'name'),
    nameBn: _read<String?>(json, 'nameBn'),
  );

  final String id;

  /// Short code such as `CL`.
  final String code;
  final String name;

  /// Name in Bangla script, when HR entered one.
  final String? nameBn;
}

/// A leave type as it appears inside a balance, with its accrual and pay.
class LeaveTypeSummary extends LeaveTypeRef {
  const LeaveTypeSummary({
    required super.id,
    required super.code,
    required super.name,
    required this.accrual,
    required this.paid,
    super.nameBn,
  });

  factory LeaveTypeSummary.fromJson(Json json) => LeaveTypeSummary(
    id: _read<String>(json, 'id'),
    code: _read<String>(json, 'code'),
    name: _read<String>(json, 'name'),
    nameBn: _read<String?>(json, 'nameBn'),
    accrual: LeaveAccrual.fromWire(_read<String>(json, 'accrual')),
    paid: _read<bool>(json, 'paid'),
  );

  final LeaveAccrual accrual;
  final bool paid;
}

/// `GET /tenant/leave/types` item: what the apply form needs.
///
/// The API sends more fields (days per year, approval chain and so on);
/// the app reads only these.
class LeaveType extends LeaveTypeRef {
  const LeaveType({
    required super.id,
    required super.code,
    required super.name,
    required this.accrual,
    required this.allowHalfDay,
    required this.countsOffDays,
    required this.isActive,
    super.nameBn,
    this.gender,
    this.maxDaysPerRequest,
    this.requiresDocumentAfterDays,
  });

  factory LeaveType.fromJson(Json json) => LeaveType(
    id: _read<String>(json, 'id'),
    code: _read<String>(json, 'code'),
    name: _read<String>(json, 'name'),
    nameBn: _read<String?>(json, 'nameBn'),
    accrual: LeaveAccrual.fromWire(_read<String>(json, 'accrual')),
    allowHalfDay: _read<bool>(json, 'allowHalfDay'),
    gender: _readOptionalWire(json, 'gender', Gender.fromWire),
    countsOffDays: _read<bool>(json, 'countsOffDays'),
    isActive: _read<bool>(json, 'isActive'),
    maxDaysPerRequest: _read<num?>(json, 'maxDaysPerRequest'),
    requiresDocumentAfterDays: _read<num?>(json, 'requiresDocumentAfterDays'),
  );

  final LeaveAccrual accrual;

  /// Whether a single-day request can be for half the day.
  final bool allowHalfDay;

  /// Only employees of this gender can take it (maternity), or `null`.
  final Gender? gender;

  /// Weekly offs and holidays inside the dates count as leave days.
  final bool countsOffDays;
  final bool isActive;
  final num? maxDaysPerRequest;

  /// A supporting document is needed for requests longer than this.
  final num? requiresDocumentAfterDays;
}

/// `GET /tenant/me/leave/balances` item (the API's `LeaveBalanceView`).
class LeaveBalance {
  const LeaveBalance({
    required this.leaveType,
    required this.year,
    required this.carriedForward,
    required this.adjustments,
    required this.taken,
    required this.pending,
    this.entitlement,
    this.available,
    this.eligibleFrom,
  });

  factory LeaveBalance.fromJson(Json json) => LeaveBalance(
    leaveType: LeaveTypeSummary.fromJson(_read<Json>(json, 'leaveType')),
    year: _read<int>(json, 'year'),
    entitlement: _read<num?>(json, 'entitlement'),
    carriedForward: _read<num>(json, 'carriedForward'),
    adjustments: _read<num>(json, 'adjustments'),
    taken: _read<num>(json, 'taken'),
    pending: _read<num>(json, 'pending'),
    available: _read<num?>(json, 'available'),
    eligibleFrom: _readOptionalDate(json, 'eligibleFrom'),
  );

  final LeaveTypeSummary leaveType;
  final int year;

  /// `null` for per-event leave (maternity), which has no yearly balance.
  final num? entitlement;
  final num carriedForward;
  final num adjustments;
  final num taken;

  /// Days in requests that are still waiting for approval.
  final num pending;

  /// `null` for per-event leave, like [entitlement].
  final num? available;

  /// When the employee first becomes eligible, if not yet.
  final DateTime? eligibleFrom;

  /// Granted per request, with no yearly balance to show.
  bool get isOnRequest => available == null;
}

/// A date inside a request that is not counted as a leave day.
class ExcludedDay {
  const ExcludedDay({required this.date, required this.reason, this.name});

  factory ExcludedDay.fromJson(Json json) => ExcludedDay(
    date: _readDate(json, 'date'),
    reason: ExcludedDayReason.fromWire(_read<String>(json, 'reason')),
    name: _read<String?>(json, 'name'),
  );

  final DateTime date;
  final ExcludedDayReason reason;

  /// The holiday's name (English), for holidays.
  final String? name;
}

/// `POST /tenant/me/leave/preview` 201 response.
class LeavePreview {
  const LeavePreview({
    required this.days,
    required this.excluded,
    required this.problems,
    this.balance,
  });

  factory LeavePreview.fromJson(Json json) => LeavePreview(
    days: _read<num>(json, 'days'),
    excluded: _readList(json, 'excluded', ExcludedDay.fromJson),
    balance: _readOptional(json, 'balance', LeaveBalance.fromJson),
    problems: _readStrings(json, 'problems'),
  );

  final num days;
  final List<ExcludedDay> excluded;
  final LeaveBalance? balance;

  /// Why the request would be refused, in English from the API. Empty when
  /// it can be submitted.
  final List<String> problems;

  bool get canSubmit => problems.isEmpty;
}

/// The leave the user is asking for, before it has a reason: the body of
/// the preview and, with a reason, of the request.
class LeaveDraft {
  const LeaveDraft({
    required this.leaveTypeId,
    required this.startDate,
    required this.endDate,
    this.halfDay,
  });

  final String leaveTypeId;
  final DateTime startDate;
  final DateTime endDate;

  /// Only for a single day, and only for types that allow half days.
  final HalfDay? halfDay;

  /// `POST /tenant/me/leave/preview` body. `halfDay` is always sent, `null`
  /// for a full day.
  Json toPreviewJson() => {
    'leaveTypeId': leaveTypeId,
    'startDate': toWireDate(startDate),
    'endDate': toWireDate(endDate),
    'halfDay': halfDay?.wire,
  };

  /// `POST /tenant/me/leave/requests` body. `halfDay` is left out for a
  /// full day.
  Json toRequestJson({required String reason}) => {
    'leaveTypeId': leaveTypeId,
    'startDate': toWireDate(startDate),
    'endDate': toWireDate(endDate),
    if (halfDay case final halfDay?) 'halfDay': halfDay.wire,
    'reason': reason,
  };
}

/// An id and a full name, for example an approver.
class PersonRef {
  const PersonRef({required this.id, required this.fullName});

  factory PersonRef.fromJson(Json json) => PersonRef(
    id: _read<String>(json, 'id'),
    fullName: _read<String>(json, 'fullName'),
  );

  final String id;
  final String fullName;
}

/// The employee a leave request or an attendance correction belongs to.
class EmployeeRef {
  const EmployeeRef({
    required this.id,
    required this.fullName,
    required this.employeeCode,
    this.fullNameBn,
  });

  factory EmployeeRef.fromJson(Json json) => EmployeeRef(
    id: _read<String>(json, 'id'),
    fullName: _read<String>(json, 'fullName'),
    employeeCode: _read<String>(json, 'employeeCode'),
    fullNameBn: _read<String?>(json, 'fullNameBn'),
  );

  final String id;
  final String fullName;
  final String employeeCode;

  /// Name in Bangla script. Attendance sends it (when HR entered one);
  /// leave requests do not.
  final String? fullNameBn;
}

/// One step of a request's approval trail.
class ApprovalStep {
  const ApprovalStep({
    required this.id,
    required this.stepNo,
    required this.kind,
    required this.status,
    this.approver,
    this.decidedBy,
    this.decidedAt,
    this.comment,
  });

  factory ApprovalStep.fromJson(Json json) => ApprovalStep(
    id: _read<String>(json, 'id'),
    stepNo: _read<int>(json, 'stepNo'),
    kind: ApprovalStepKind.fromWire(_read<String>(json, 'kind')),
    approver: _readOptional(json, 'approver', PersonRef.fromJson),
    status: ApprovalStatus.fromWire(_read<String>(json, 'status')),
    decidedBy: _read<String?>(json, 'decidedBy'),
    decidedAt: _readOptionalTimestamp(json, 'decidedAt'),
    comment: _read<String?>(json, 'comment'),
  );

  final String id;
  final int stepNo;
  final ApprovalStepKind kind;

  /// The manager for a manager step; `null` for HR steps, which any HR
  /// admin can decide.
  final PersonRef? approver;
  final ApprovalStatus status;

  /// Name of the user who decided, once decided.
  final String? decidedBy;
  final DateTime? decidedAt;
  final String? comment;
}

/// A leave request (the API's `LeaveRequestView`).
class LeaveRequest {
  const LeaveRequest({
    required this.id,
    required this.employee,
    required this.leaveType,
    required this.startDate,
    required this.endDate,
    required this.days,
    required this.reason,
    required this.status,
    required this.needsDocument,
    required this.steps,
    required this.createdAt,
    this.halfDay,
    this.decidedAt,
  });

  factory LeaveRequest.fromJson(Json json) => LeaveRequest(
    id: _read<String>(json, 'id'),
    employee: EmployeeRef.fromJson(_read<Json>(json, 'employee')),
    leaveType: LeaveTypeRef.fromJson(_read<Json>(json, 'leaveType')),
    startDate: _readDate(json, 'startDate'),
    endDate: _readDate(json, 'endDate'),
    halfDay: _readOptionalWire(json, 'halfDay', HalfDay.fromWire),
    days: _read<num>(json, 'days'),
    reason: _read<String>(json, 'reason'),
    status: LeaveRequestStatus.fromWire(_read<String>(json, 'status')),
    needsDocument: _read<bool>(json, 'needsDocument'),
    steps: _readList(json, 'steps', ApprovalStep.fromJson),
    createdAt: _readTimestamp(json, 'createdAt'),
    decidedAt: _readOptionalTimestamp(json, 'decidedAt'),
  );

  final String id;
  final EmployeeRef employee;
  final LeaveTypeRef leaveType;
  final DateTime startDate;
  final DateTime endDate;
  final HalfDay? halfDay;
  final num days;
  final String reason;
  final LeaveRequestStatus status;

  /// The leave is long enough that HR needs a supporting document.
  final bool needsDocument;

  /// In step order.
  final List<ApprovalStep> steps;
  final DateTime createdAt;
  final DateTime? decidedAt;

  /// The API allows cancelling a pending request, or an approved one that
  /// has not started by [today].
  bool canCancelOn(DateTime today) => switch (status) {
    LeaveRequestStatus.pending => true,
    LeaveRequestStatus.approved => startDate.isAfter(today),
    _ => false,
  };
}

class HolidayCalendar {
  const HolidayCalendar({
    required this.id,
    required this.name,
    required this.isDefault,
    required this.locations,
  });

  factory HolidayCalendar.fromJson(Json json) => HolidayCalendar(
    id: _read<String>(json, 'id'),
    name: _read<String>(json, 'name'),
    isDefault: _read<bool>(json, 'isDefault'),
    locations: _readList(json, 'locations', EntityRef.fromJson),
  );

  final String id;
  final String name;
  final bool isDefault;

  /// Locations that use this calendar.
  final List<EntityRef> locations;
}

class Holiday {
  const Holiday({
    required this.id,
    required this.calendarId,
    required this.date,
    required this.name,
    required this.kind,
    required this.isTentative,
    this.nameBn,
  });

  factory Holiday.fromJson(Json json) => Holiday(
    id: _read<String>(json, 'id'),
    calendarId: _read<String>(json, 'calendarId'),
    date: _readDate(json, 'date'),
    name: _read<String>(json, 'name'),
    nameBn: _read<String?>(json, 'nameBn'),
    kind: HolidayKind.fromWire(_read<String>(json, 'kind')),
    isTentative: _read<bool>(json, 'isTentative'),
  );

  final String id;
  final String calendarId;
  final DateTime date;
  final String name;
  final String? nameBn;
  final HolidayKind kind;

  /// A lunar date not yet confirmed by the moon-sighting announcement.
  final bool isTentative;
}

/// A statutory rule with its legal reference, for example the number of
/// festival holidays the Labour Act requires.
class StatutoryRule {
  const StatutoryRule({
    required this.key,
    required this.title,
    required this.from,
    required this.act,
    required this.section,
    required this.status,
    this.value,
    this.to,
    this.note,
  });

  factory StatutoryRule.fromJson(Json json) {
    final reference = _read<Json>(json, 'reference');
    return StatutoryRule(
      key: _read<String>(json, 'key'),
      title: _read<String>(json, 'title'),
      value: json['value'],
      from: _readDate(json, 'from'),
      to: _readOptionalDate(json, 'to'),
      act: _read<String>(reference, 'act'),
      section: _read<String>(reference, 'section'),
      status: RuleStatus.fromWire(_read<String>(json, 'status')),
      note: _read<String?>(json, 'note'),
    );
  }

  final String key;
  final String title;

  /// The rule's value as sent; its type depends on the rule.
  final Object? value;
  final DateTime from;

  /// Last day in force, or `null` while current.
  final DateTime? to;
  final String act;
  final String section;
  final RuleStatus status;
  final String? note;
}

/// `GET /tenant/me/holidays` 200 response: the employee's holiday calendar
/// for one year.
class HolidayYear {
  const HolidayYear({
    required this.calendar,
    required this.year,
    required this.holidays,
    required this.festivalDays,
    required this.festivalDaysRequired,
    this.festivalRule,
  });

  factory HolidayYear.fromJson(Json json) => HolidayYear(
    calendar: HolidayCalendar.fromJson(_read<Json>(json, 'calendar')),
    year: _read<int>(json, 'year'),
    holidays: _readList(json, 'holidays', Holiday.fromJson),
    festivalDays: _read<num>(json, 'festivalDays'),
    festivalDaysRequired: _read<num>(json, 'festivalDaysRequired'),
    festivalRule: _readOptional(json, 'festivalRule', StatutoryRule.fromJson),
  );

  final HolidayCalendar calendar;
  final int year;

  /// In date order.
  final List<Holiday> holidays;

  /// Festival holidays in this calendar for the year.
  final num festivalDays;

  /// Festival holidays the Labour Act requires for the year.
  final num festivalDaysRequired;
  final StatutoryRule? festivalRule;
}

/// The leave type inside a calendar entry, without its id.
class CalendarLeaveType {
  const CalendarLeaveType({
    required this.code,
    required this.name,
    this.nameBn,
  });

  factory CalendarLeaveType.fromJson(Json json) => CalendarLeaveType(
    code: _read<String>(json, 'code'),
    name: _read<String>(json, 'name'),
    nameBn: _read<String?>(json, 'nameBn'),
  );

  final String code;
  final String name;
  final String? nameBn;
}

/// Someone's pending or approved leave, on the team calendar.
class LeaveCalendarEntry {
  const LeaveCalendarEntry({
    required this.requestId,
    required this.employee,
    required this.leaveType,
    required this.startDate,
    required this.endDate,
    required this.status,
  });

  factory LeaveCalendarEntry.fromJson(Json json) => LeaveCalendarEntry(
    requestId: _read<String>(json, 'requestId'),
    employee: EmployeeRef.fromJson(_read<Json>(json, 'employee')),
    leaveType: CalendarLeaveType.fromJson(_read<Json>(json, 'leaveType')),
    startDate: _readDate(json, 'startDate'),
    endDate: _readDate(json, 'endDate'),
    status: LeaveRequestStatus.fromWire(_read<String>(json, 'status')),
  );

  final String requestId;
  final EmployeeRef employee;
  final CalendarLeaveType leaveType;
  final DateTime startDate;
  final DateTime endDate;

  /// Pending or approved; the calendar leaves out the rest.
  final LeaveRequestStatus status;

  /// Whether the leave covers [date] (a UTC-midnight calendar date).
  bool covers(DateTime date) =>
      !date.isBefore(startDate) && !date.isAfter(endDate);
}

/// `GET /tenant/leave/calendar?from=&to=` 200 response (the API's
/// `LeaveCalendarView`), at most 62 days, scoped like the team day.
class LeaveCalendar {
  const LeaveCalendar({
    required this.from,
    required this.to,
    required this.holidays,
    required this.entries,
  });

  factory LeaveCalendar.fromJson(Json json) => LeaveCalendar(
    from: _readDate(json, 'from'),
    to: _readDate(json, 'to'),
    holidays: _readList(json, 'holidays', Holiday.fromJson),
    entries: _readList(json, 'entries', LeaveCalendarEntry.fromJson),
  );

  final DateTime from;
  final DateTime to;
  final List<Holiday> holidays;
  final List<LeaveCalendarEntry> entries;
}
