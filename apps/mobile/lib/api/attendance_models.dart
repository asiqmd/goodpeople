part of 'api_models.dart';

// ── Attendance (Phase 1): my day, punching, my month and corrections ───────
//
// Instants such as `firstIn` and `punchedAt` are [DateTime]s in UTC; show
// them in the response's `timeZone` (see `wallClock` in lib/ui/format.dart).
// Shift and correction times are wall-clock `HH:MM` in that zone, kept as
// [ClockTime]. Calendar dates are UTC midnight, as everywhere else.

enum PunchSource implements WireValue {
  device('device'),
  web('web'),
  mobile('mobile'),
  manual('manual'),
  regularization('regularization'),
  unknown('unknown');

  const PunchSource(this.wire);
  @override
  final String wire;

  static PunchSource fromWire(String value) => _byWire(values, value, unknown);
}

/// In or out. Device punches can come without a direction (`unknown`).
enum PunchDirection implements WireValue {
  punchIn('in'),
  punchOut('out'),
  unknown('unknown');

  const PunchDirection(this.wire);
  @override
  final String wire;

  static PunchDirection fromWire(String value) =>
      _byWire(values, value, unknown);
}

enum DayType implements WireValue {
  working('working'),
  weeklyOff('weekly_off'),
  holiday('holiday'),
  unknown('unknown');

  const DayType(this.wire);
  @override
  final String wire;

  static DayType fromWire(String value) => _byWire(values, value, unknown);
}

/// A day's outcome. `pending`: the day is not over yet. `missingPunch`: only
/// one punch, so the hours are unknown until the day is corrected.
enum AttendanceStatus implements WireValue {
  present('present'),
  halfDay('half_day'),
  absent('absent'),
  onLeave('on_leave'),
  missingPunch('missing_punch'),
  off('off'),
  pending('pending'),
  unknown('unknown');

  const AttendanceStatus(this.wire);
  @override
  final String wire;

  static AttendanceStatus fromWire(String value) =>
      _byWire(values, value, unknown);
}

enum AttendanceFlag implements WireValue {
  late('late'),
  earlyOut('early_out'),

  /// Worked more than the Labour Act's daily maximum, overtime included.
  overDailyLimit('over_daily_limit'),
  regularized('regularized'),
  onDuty('on_duty'),
  outsideGeofence('outside_geofence'),
  unknown('unknown');

  const AttendanceFlag(this.wire);
  @override
  final String wire;

  static AttendanceFlag fromWire(String value) =>
      _byWire(values, value, unknown);
}

/// `missedPunch`: add the in or out time the device missed. `onDuty`:
/// official work elsewhere, counted as the whole shift.
enum RegularizationKind implements WireValue {
  missedPunch('missed_punch'),
  onDuty('on_duty'),
  unknown('unknown');

  const RegularizationKind(this.wire);
  @override
  final String wire;

  static RegularizationKind fromWire(String value) =>
      _byWire(values, value, unknown);
}

/// Same values as [LeaveRequestStatus].
enum RegularizationStatus implements WireValue {
  pending('pending'),
  approved('approved'),
  rejected('rejected'),
  cancelled('cancelled'),
  unknown('unknown');

  const RegularizationStatus(this.wire);
  @override
  final String wire;

  static RegularizationStatus fromWire(String value) =>
      _byWire(values, value, unknown);
}

/// Punching from the web or mobile app: off, only inside the work
/// location's geofence, or anywhere.
enum SelfPunchMode implements WireValue {
  off('off'),
  geofenced('geofenced'),
  anywhere('anywhere'),
  unknown('unknown');

  const SelfPunchMode(this.wire);
  @override
  final String wire;

  static SelfPunchMode fromWire(String value) =>
      _byWire(values, value, unknown);
}

/// Why punching from the app is not possible.
enum SelfPunchBlock implements WireValue {
  disabled('disabled'),
  noGeofence('no_geofence'),
  unknown('unknown');

  const SelfPunchBlock(this.wire);
  @override
  final String wire;

  static SelfPunchBlock fromWire(String value) =>
      _byWire(values, value, unknown);
}

/// A wall-clock time of day, `HH:MM` (24-hour) on the wire.
class ClockTime implements Comparable<ClockTime> {
  const ClockTime(this.hour, this.minute)
    : assert(hour >= 0 && hour < 24),
      assert(minute >= 0 && minute < 60);

  /// Parses `HH:MM`. Throws [FormatException] for anything else.
  factory ClockTime.parse(String text) {
    final match = _clockTime.firstMatch(text);
    if (match != null) {
      final hour = int.parse(match[1]!);
      final minute = int.parse(match[2]!);
      if (hour < 24 && minute < 60) return ClockTime(hour, minute);
    }
    throw FormatException('Expected a HH:MM time: $text');
  }

  final int hour;
  final int minute;

  /// `HH:MM`, for example `08:05`.
  String get wire =>
      '${hour.toString().padLeft(2, '0')}:${minute.toString().padLeft(2, '0')}';

  @override
  int compareTo(ClockTime other) =>
      (hour * 60 + minute) - (other.hour * 60 + other.minute);

  @override
  bool operator ==(Object other) =>
      other is ClockTime && other.hour == hour && other.minute == minute;

  @override
  int get hashCode => Object.hash(hour, minute);

  @override
  String toString() => wire;
}

final _clockTime = RegExp(r'^(\d{2}):(\d{2})$');

ClockTime _readClock(Json json, String key) {
  final text = _read<String>(json, key);
  try {
    return ClockTime.parse(text);
  } on FormatException {
    throw FormatException('Expected "$key" to be a HH:MM time: $text');
  }
}

ClockTime? _readOptionalClock(Json json, String key) =>
    json[key] == null ? null : _readClock(json, key);

/// A shift as it appears inside a day.
class ShiftRef {
  const ShiftRef({
    required this.id,
    required this.code,
    required this.name,
    required this.startTime,
    required this.endTime,
    this.nameBn,
  });

  factory ShiftRef.fromJson(Json json) => ShiftRef(
    id: _read<String>(json, 'id'),
    code: _read<String>(json, 'code'),
    name: _read<String>(json, 'name'),
    nameBn: _read<String?>(json, 'nameBn'),
    startTime: _readClock(json, 'startTime'),
    endTime: _readClock(json, 'endTime'),
  );

  final String id;
  final String code;
  final String name;
  final String? nameBn;
  final ClockTime startTime;

  /// At or before [startTime] for a shift that runs past midnight.
  final ClockTime endTime;
}

/// Approved leave covering a day.
class DayLeave {
  const DayLeave({
    required this.requestId,
    required this.code,
    required this.days,
  });

  factory DayLeave.fromJson(Json json) => DayLeave(
    requestId: _read<String>(json, 'requestId'),
    code: _read<String>(json, 'code'),
    days: _read<num>(json, 'days'),
  );

  final String requestId;

  /// The leave type's code, for example `CL`.
  final String code;

  /// 1, or 0.5 for half-day leave.
  final num days;
}

/// The correction asked for a day, if one is open or approved.
class DayRegularization {
  const DayRegularization({
    required this.id,
    required this.kind,
    required this.status,
  });

  factory DayRegularization.fromJson(Json json) => DayRegularization(
    id: _read<String>(json, 'id'),
    kind: RegularizationKind.fromWire(_read<String>(json, 'kind')),
    status: RegularizationStatus.fromWire(_read<String>(json, 'status')),
  );

  final String id;
  final RegularizationKind kind;
  final RegularizationStatus status;
}

/// One employee's day (the API's `AttendanceDayView`). Past days come from
/// processing; today is projected until it closes.
///
/// The API also sends `shiftSource`; the app does not use it.
class AttendanceDay {
  const AttendanceDay({
    required this.date,
    required this.dayType,
    required this.status,
    required this.workedMinutes,
    required this.lateMinutes,
    required this.earlyOutMinutes,
    required this.overtimeMinutes,
    required this.flags,
    this.holidayName,
    this.shift,
    this.leave,
    this.firstIn,
    this.lastOut,
    this.regularization,
  });

  factory AttendanceDay.fromJson(Json json) => AttendanceDay(
    date: _readDate(json, 'date'),
    dayType: DayType.fromWire(_read<String>(json, 'dayType')),
    holidayName: _read<String?>(json, 'holidayName'),
    status: AttendanceStatus.fromWire(_read<String>(json, 'status')),
    shift: _readOptional(json, 'shift', ShiftRef.fromJson),
    leave: _readOptional(json, 'leave', DayLeave.fromJson),
    firstIn: _readOptionalTimestamp(json, 'firstIn'),
    lastOut: _readOptionalTimestamp(json, 'lastOut'),
    workedMinutes: _read<int>(json, 'workedMinutes'),
    lateMinutes: _read<int>(json, 'lateMinutes'),
    earlyOutMinutes: _read<int>(json, 'earlyOutMinutes'),
    overtimeMinutes: _read<int>(json, 'overtimeMinutes'),
    flags: {
      for (final flag in _readStrings(json, 'flags'))
        AttendanceFlag.fromWire(flag),
    },
    regularization: _readOptional(
      json,
      'regularization',
      DayRegularization.fromJson,
    ),
  );

  final DateTime date;
  final DayType dayType;

  /// The holiday's name (English), on holidays.
  final String? holidayName;
  final AttendanceStatus status;
  final ShiftRef? shift;
  final DayLeave? leave;
  final DateTime? firstIn;
  final DateTime? lastOut;
  final int workedMinutes;
  final int lateMinutes;
  final int earlyOutMinutes;
  final int overtimeMinutes;
  final Set<AttendanceFlag> flags;
  final DayRegularization? regularization;

  /// A weekly off or a holiday.
  bool get isOffDay =>
      dayType == DayType.weeklyOff || dayType == DayType.holiday;
}

/// Counts over a range of days. Days still `pending` are not counted.
class AttendanceTotals {
  const AttendanceTotals({
    required this.present,
    required this.halfDay,
    required this.absent,
    required this.onLeave,
    required this.missingPunch,
    required this.late,
    required this.workedMinutes,
    required this.overtimeMinutes,
  });

  factory AttendanceTotals.fromJson(Json json) => AttendanceTotals(
    present: _read<int>(json, 'present'),
    halfDay: _read<int>(json, 'halfDay'),
    absent: _read<int>(json, 'absent'),
    onLeave: _read<int>(json, 'onLeave'),
    missingPunch: _read<int>(json, 'missingPunch'),
    late: _read<int>(json, 'late'),
    workedMinutes: _read<int>(json, 'workedMinutes'),
    overtimeMinutes: _read<int>(json, 'overtimeMinutes'),
  );

  final int present;
  final int halfDay;
  final int absent;
  final int onLeave;
  final int missingPunch;

  /// Days with the `late` flag.
  final int late;
  final int workedMinutes;
  final int overtimeMinutes;
}

/// `GET /tenant/me/attendance?from=&to=` 200 response.
class AttendanceRange {
  const AttendanceRange({
    required this.employee,
    required this.timeZone,
    required this.from,
    required this.to,
    required this.days,
    required this.totals,
  });

  factory AttendanceRange.fromJson(Json json) => AttendanceRange(
    employee: EmployeeRef.fromJson(_read<Json>(json, 'employee')),
    timeZone: _read<String>(json, 'timeZone'),
    from: _readDate(json, 'from'),
    to: _readDate(json, 'to'),
    days: _readList(json, 'days', AttendanceDay.fromJson),
    totals: AttendanceTotals.fromJson(_read<Json>(json, 'totals')),
  );

  final EmployeeRef employee;

  /// IANA time zone of the employee's work location, for example
  /// `Asia/Dhaka`.
  final String timeZone;
  final DateTime from;
  final DateTime to;

  /// In date order. Days before attendance went live, or before joining,
  /// are left out.
  final List<AttendanceDay> days;
  final AttendanceTotals totals;
}

/// One punch (the API's `PunchView`).
class Punch {
  const Punch({
    required this.id,
    required this.punchedAt,
    required this.source,
    required this.direction,
    required this.voided,
    this.device,
    this.distanceM,
    this.insideGeofence,
    this.note,
    this.selfieDocumentId,
  });

  factory Punch.fromJson(Json json) => Punch(
    id: _read<String>(json, 'id'),
    punchedAt: _readTimestamp(json, 'punchedAt'),
    source: PunchSource.fromWire(_read<String>(json, 'source')),
    direction: PunchDirection.fromWire(_read<String>(json, 'direction')),
    device: _readOptional(json, 'device', EntityRef.fromJson),
    distanceM: _read<num?>(json, 'distanceM'),
    insideGeofence: _read<bool?>(json, 'insideGeofence'),
    note: _read<String?>(json, 'note'),
    voided: _read<bool>(json, 'voided'),
    // Missing before selfie punches; read as none.
    selfieDocumentId: _read<String?>(json, 'selfieDocumentId'),
  );

  final String id;
  final DateTime punchedAt;
  final PunchSource source;
  final PunchDirection direction;

  /// The attendance device, for device punches.
  final EntityRef? device;

  /// Metres from the work location, for app punches sent with a location
  /// when the location has a geofence.
  final num? distanceM;
  final bool? insideGeofence;

  /// HR's note, or why the punch was voided.
  final String? note;

  /// Voided by HR: kept on record but not counted.
  final bool voided;

  /// The photo taken with an app punch, a document HR can read.
  final String? selfieDocumentId;
}

/// A work location's geofence: a circle around a point.
class Geofence {
  const Geofence({
    required this.latitude,
    required this.longitude,
    required this.radiusM,
  });

  factory Geofence.fromJson(Json json) => Geofence(
    latitude: _read<num>(json, 'latitude'),
    longitude: _read<num>(json, 'longitude'),
    radiusM: _read<num>(json, 'radiusM'),
  );

  final num latitude;
  final num longitude;
  final num radiusM;

  /// Great-circle distance in metres from the centre to [location], as the
  /// API computes it.
  double distanceTo(PunchLocation location) {
    double rad(num degrees) => degrees * math.pi / 180;
    final dLat = rad(location.latitude - latitude);
    final dLng = rad(location.longitude - longitude);
    final h =
        math.pow(math.sin(dLat / 2), 2) +
        math.cos(rad(latitude)) *
            math.cos(rad(location.latitude)) *
            math.pow(math.sin(dLng / 2), 2);
    return 2 * 6371000 * math.asin(math.sqrt(h));
  }
}

/// Whether and how the user can punch from the app.
class SelfPunch {
  const SelfPunch({
    required this.mode,
    this.blockedReason,
    this.geofence,
    this.requireSelfie = false,
  });

  factory SelfPunch.fromJson(Json json) => SelfPunch(
    mode: SelfPunchMode.fromWire(_read<String>(json, 'mode')),
    blockedReason: _readOptionalWire(
      json,
      'blockedReason',
      SelfPunchBlock.fromWire,
    ),
    geofence: _readOptional(json, 'geofence', Geofence.fromJson),
    // Missing before selfie punches, when no workspace asked for one.
    requireSelfie: _read<bool?>(json, 'requireSelfie') ?? false,
  );

  final SelfPunchMode mode;

  /// Why punching from the app is not possible, if it is not.
  final SelfPunchBlock? blockedReason;
  final Geofence? geofence;

  /// Each punch from the app must come with a photo of the employee.
  final bool requireSelfie;

  /// The app can offer the punch button.
  bool get canPunch =>
      blockedReason == null &&
      (mode == SelfPunchMode.geofenced || mode == SelfPunchMode.anywhere);

  /// A punch must carry the device location.
  bool get needsLocation => mode == SelfPunchMode.geofenced;
}

/// `GET /tenant/me/attendance/today` 200 response, and what a punch answers.
class MyAttendanceToday {
  const MyAttendanceToday({
    required this.employee,
    required this.timeZone,
    required this.day,
    required this.punches,
    required this.selfPunch,
    required this.nextDirection,
  });

  factory MyAttendanceToday.fromJson(Json json) => MyAttendanceToday(
    employee: EmployeeRef.fromJson(_read<Json>(json, 'employee')),
    timeZone: _read<String>(json, 'timeZone'),
    day: AttendanceDay.fromJson(_read<Json>(json, 'day')),
    punches: _readList(json, 'punches', Punch.fromJson),
    selfPunch: SelfPunch.fromJson(_read<Json>(json, 'selfPunch')),
    nextDirection: PunchDirection.fromWire(
      _read<String>(json, 'nextDirection'),
    ),
  );

  final EmployeeRef employee;
  final String timeZone;

  /// Today, or a night shift that began yesterday and has not closed yet.
  final AttendanceDay day;

  /// The day's punches, voided ones included, oldest first.
  final List<Punch> punches;
  final SelfPunch selfPunch;

  /// What the next punch will be.
  final PunchDirection nextDirection;
}

/// Where the phone is, sent with a punch.
class PunchLocation {
  const PunchLocation({
    required this.latitude,
    required this.longitude,
    this.accuracyM,
  });

  final double latitude;
  final double longitude;

  /// The reported accuracy radius in metres. The API forgives up to 50 m of
  /// it when checking the geofence.
  final double? accuracyM;
}

/// The photo taken for a selfie punch, a JPEG.
class PunchSelfie {
  const PunchSelfie({required this.bytes, this.fileName = 'selfie.jpg'});

  /// The API refuses a larger photo (413).
  static const maxBytes = 2 * 1024 * 1024;

  final Uint8List bytes;
  final String fileName;

  bool get isTooLarge => bytes.length > maxBytes;
}

/// `POST /tenant/me/attendance/punch` body from the mobile app. Without a
/// [location] no coordinates are sent, which only the `anywhere` mode
/// accepts.
Json selfPunchBody(PunchLocation? location) => {
  'source': 'mobile',
  if (location != null) ...{
    'latitude': location.latitude,
    'longitude': location.longitude,
    if (location.accuracyM case final accuracy?)
      // The API takes 0 to 100 km.
      'accuracyM': accuracy.clamp(0, 100000),
  },
};

/// The same fields as [selfPunchBody] as text, for the multipart form a
/// punch with a selfie is sent as. The API reads the numbers back.
Map<String, String> selfPunchFields(PunchLocation? location) => {
  for (final MapEntry(:key, :value) in selfPunchBody(location).entries)
    key: '$value',
};

/// An attendance correction (the API's `RegularizationView`).
class Regularization {
  const Regularization({
    required this.id,
    required this.employee,
    required this.date,
    required this.kind,
    required this.reason,
    required this.status,
    required this.steps,
    required this.createdAt,
    this.inTime,
    this.outTime,
    this.decidedAt,
  });

  factory Regularization.fromJson(Json json) => Regularization(
    id: _read<String>(json, 'id'),
    employee: EmployeeRef.fromJson(_read<Json>(json, 'employee')),
    date: _readDate(json, 'date'),
    kind: RegularizationKind.fromWire(_read<String>(json, 'kind')),
    inTime: _readOptionalClock(json, 'inTime'),
    outTime: _readOptionalClock(json, 'outTime'),
    reason: _read<String>(json, 'reason'),
    status: RegularizationStatus.fromWire(_read<String>(json, 'status')),
    steps: _readList(json, 'steps', ApprovalStep.fromJson),
    createdAt: _readTimestamp(json, 'createdAt'),
    decidedAt: _readOptionalTimestamp(json, 'decidedAt'),
  );

  final String id;
  final EmployeeRef employee;
  final DateTime date;
  final RegularizationKind kind;

  /// Local times asked for a missed punch. An out time at or before the
  /// shift start (or the in time) is the next morning, as on a night shift.
  final ClockTime? inTime;
  final ClockTime? outTime;
  final String reason;
  final RegularizationStatus status;

  /// In step order.
  final List<ApprovalStep> steps;
  final DateTime createdAt;
  final DateTime? decidedAt;

  /// Only pending corrections can be cancelled.
  bool get canCancel => status == RegularizationStatus.pending;
}

/// `POST /tenant/me/attendance/regularizations` body.
class RegularizationDraft {
  const RegularizationDraft({
    required this.date,
    required this.kind,
    required this.reason,
    this.inTime,
    this.outTime,
  });

  final DateTime date;
  final RegularizationKind kind;

  /// For a missed punch: the in time, the out time or both. On-duty days
  /// take no times.
  final ClockTime? inTime;
  final ClockTime? outTime;
  final String reason;

  /// A missed punch needs at least one time.
  bool get hasRequiredTimes =>
      kind != RegularizationKind.missedPunch ||
      inTime != null ||
      outTime != null;

  /// Times are left out when unset, and always for on-duty days.
  Json toJson() => {
    'date': toWireDate(date),
    'kind': kind.wire,
    if (kind == RegularizationKind.missedPunch) ...{
      if (inTime case final time?) 'inTime': time.wire,
      if (outTime case final time?) 'outTime': time.wire,
    },
    'reason': reason,
  };
}
