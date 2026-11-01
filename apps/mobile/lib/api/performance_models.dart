part of 'api_models.dart';

// ── Performance: goals and check-ins, reviews and peer feedback ─────────────
//
// `GET /tenant/performance/me` says what waits for the login; their goals
// are under `/tenant/performance/goals`, their reviews under `.../reviews`
// and the feedback colleagues ask of them under `.../peers`. Every rating is
// 1 (well below) to 5 (well above expectations). Decimals (weights, targets,
// values, the goal score) arrive as text, like the API's other numeric
// columns.

/// An objective has key results; a KPI has a measure and a target.
enum GoalKind implements WireValue {
  objective('objective'),
  kpi('kpi'),
  unknown('unknown');

  const GoalKind(this.wire);
  @override
  final String wire;

  static GoalKind fromWire(String value) => _byWire(values, value, unknown);
}

/// `draft` until the manager agrees it; then `agreed`; finally `completed`
/// or `dropped`.
enum GoalStatus implements WireValue {
  draft('draft'),
  agreed('agreed'),
  completed('completed'),
  dropped('dropped'),
  unknown('unknown');

  const GoalStatus(this.wire);
  @override
  final String wire;

  static GoalStatus fromWire(String value) => _byWire(values, value, unknown);
}

/// Where a KPI's value comes from: typed in at check-ins, or read from the
/// records (processed attendance, or daily production in the RMG pack).
enum KpiSource implements WireValue {
  manual('manual'),
  attendanceRate('attendance_rate'),
  productionTarget('production_target'),
  unknown('unknown');

  const KpiSource(this.wire);
  @override
  final String wire;

  static KpiSource fromWire(String value) => _byWire(values, value, unknown);

  /// Read from the records: the value is never typed.
  bool get fromRecords => this != manual;
}

enum KpiDirection implements WireValue {
  higher('higher'),
  lower('lower'),
  unknown('unknown');

  const KpiDirection(this.wire);
  @override
  final String wire;

  static KpiDirection fromWire(String value) => _byWire(values, value, unknown);
}

enum CycleStatus implements WireValue {
  draft('draft'),
  active('active'),
  calibration('calibration'),
  released('released'),
  closed('closed'),
  unknown('unknown');

  const CycleStatus(this.wire);
  @override
  final String wire;

  static CycleStatus fromWire(String value) => _byWire(values, value, unknown);

  /// Goals in a cycle still change while it is being set up or under way.
  bool get goalsOpen => this == draft || this == active;
}

/// Where one person's review is. Without self reviews it starts at
/// `manager`.
enum ReviewStatus implements WireValue {
  self('self'),
  manager('manager'),
  calibration('calibration'),
  released('released'),
  acknowledged('acknowledged'),
  unknown('unknown');

  const ReviewStatus(this.wire);
  @override
  final String wire;

  static ReviewStatus fromWire(String value) => _byWire(values, value, unknown);

  /// The person can read the outcome.
  bool get isReleased => this == released || this == acknowledged;
}

enum PeerStatus implements WireValue {
  proposed('proposed'),
  approved('approved'),
  declined('declined'),
  submitted('submitted'),
  unknown('unknown');

  const PeerStatus(this.wire);
  @override
  final String wire;

  static PeerStatus fromWire(String value) => _byWire(values, value, unknown);
}

/// How the login stands to a review.
enum ReviewRole implements WireValue {
  person('person'),
  manager('manager'),
  hr('hr'),
  unknown('unknown');

  const ReviewRole(this.wire);
  @override
  final String wire;

  static ReviewRole fromWire(String value) => _byWire(values, value, unknown);
}

/// What waits for the login on the Performance page.
enum PerformanceTaskKind implements WireValue {
  selfReview('self_review'),
  managerReview('manager_review'),
  peerAnswer('peer_answer'),
  peerApprove('peer_approve'),
  acknowledge('acknowledge'),
  goalsAgree('goals_agree'),
  probationReview('probation_review'),
  unknown('unknown');

  const PerformanceTaskKind(this.wire);
  @override
  final String wire;

  static PerformanceTaskKind fromWire(String value) =>
      _byWire(values, value, unknown);
}

/// The two questions every peer answers, besides a rating.
enum PeerQuestion implements WireValue {
  strengths('strengths'),
  improvements('improvements');

  const PeerQuestion(this.wire);
  @override
  final String wire;
}

// ── The Performance page ────────────────────────────────────────────────────

/// One thing waiting for the login (the API's `PerformanceTask`).
class PerformanceTask {
  const PerformanceTask({
    required this.kind,
    required this.id,
    required this.count,
    this.person,
    this.cycle,
    this.dueOn,
  });

  factory PerformanceTask.fromJson(Json json) => PerformanceTask(
    kind: PerformanceTaskKind.fromWire(_read<String>(json, 'kind')),
    id: _read<String>(json, 'id'),
    person: _readOptional(json, 'person', EmployeeRef.fromJson),
    cycle: _read<String?>(json, 'cycle'),
    dueOn: _readOptionalDate(json, 'dueOn'),
    count: _read<int>(json, 'count'),
  );

  final PerformanceTaskKind kind;

  /// A review's id (self review, acknowledge), a peer request's (peer
  /// answer); for the other kinds what the web links to.
  final String id;

  /// Whom it is about; `null` for the login's own review, and for reviews
  /// without a manager, which HR writes.
  final EmployeeRef? person;

  /// The review cycle's name.
  final String? cycle;
  final DateTime? dueOn;

  /// Goals to agree, peers to approve, reviews without a manager; 1
  /// otherwise.
  final int count;
}

/// A review cycle as a list of reviews shows it.
class ReviewCycleRef {
  const ReviewCycleRef({
    required this.id,
    required this.name,
    required this.periodStart,
    required this.periodEnd,
  });

  factory ReviewCycleRef.fromJson(Json json) => ReviewCycleRef(
    id: _read<String>(json, 'id'),
    name: _read<String>(json, 'name'),
    periodStart: _readDate(json, 'periodStart'),
    periodEnd: _readDate(json, 'periodEnd'),
  );

  final String id;
  final String name;
  final DateTime periodStart;
  final DateTime periodEnd;
}

/// One of the login's own reviews, by cycle.
class MyReviewItem {
  const MyReviewItem({
    required this.id,
    required this.cycle,
    required this.status,
    this.finalRating,
  });

  factory MyReviewItem.fromJson(Json json) => MyReviewItem(
    id: _read<String>(json, 'id'),
    cycle: ReviewCycleRef.fromJson(_read<Json>(json, 'cycle')),
    status: ReviewStatus.fromWire(_read<String>(json, 'status')),
    finalRating: _read<int?>(json, 'finalRating'),
  );

  final String id;
  final ReviewCycleRef cycle;
  final ReviewStatus status;

  /// 1 to 5, once released.
  final int? finalRating;
}

/// The login's goals still worked on, in numbers.
class PerformanceGoalsSummary {
  const PerformanceGoalsSummary({
    required this.total,
    required this.draft,
    required this.agreed,
    required this.completed,
    this.progress,
  });

  factory PerformanceGoalsSummary.fromJson(Json json) =>
      PerformanceGoalsSummary(
        total: _read<int>(json, 'total'),
        draft: _read<int>(json, 'draft'),
        agreed: _read<int>(json, 'agreed'),
        completed: _read<int>(json, 'completed'),
        progress: _read<int?>(json, 'progress'),
      );

  final int total;
  final int draft;
  final int agreed;
  final int completed;

  /// Their average progress, 0 to 100; `null` without goals.
  final int? progress;
}

/// `GET /tenant/performance/me`: what waits for the login, their goals and
/// their reviews.
class PerformanceMe {
  const PerformanceMe({
    required this.tasks,
    required this.items,
    required this.manager,
    required this.goals,
    required this.reviews,
  });

  factory PerformanceMe.fromJson(Json json) => PerformanceMe(
    tasks: _read<int>(json, 'tasks'),
    items: _readList(json, 'items', PerformanceTask.fromJson),
    manager: _read<bool>(json, 'manager'),
    goals: PerformanceGoalsSummary.fromJson(_read<Json>(json, 'goals')),
    reviews: _readList(json, 'reviews', MyReviewItem.fromJson),
  );

  /// How many [items].
  final int tasks;

  /// Soonest due first.
  final List<PerformanceTask> items;

  /// Has a team: direct reports, or reviews to write.
  final bool manager;
  final PerformanceGoalsSummary goals;

  /// Latest cycle first.
  final List<MyReviewItem> reviews;
}

// ── Goals ───────────────────────────────────────────────────────────────────

/// The cycle a goal is rated in.
class GoalCycleRef {
  const GoalCycleRef({
    required this.id,
    required this.name,
    required this.status,
  });

  factory GoalCycleRef.fromJson(Json json) => GoalCycleRef(
    id: _read<String>(json, 'id'),
    name: _read<String>(json, 'name'),
    status: CycleStatus.fromWire(_read<String>(json, 'status')),
  );

  final String id;
  final String name;
  final CycleStatus status;
}

class KeyResult {
  const KeyResult({required this.text, required this.done});

  factory KeyResult.fromJson(Json json) => KeyResult(
    text: _read<String>(json, 'text'),
    done: _read<bool>(json, 'done'),
  );

  final String text;
  final bool done;
}

/// How a KPI from the records got its value, over its period so far.
sealed class KpiReading {
  const KpiReading({
    required this.from,
    required this.to,
    required this.people,
  });

  /// `null` for a source this app does not know.
  static KpiReading? fromJson(Json json) =>
      switch (_read<String>(json, 'source')) {
        'attendance_rate' => AttendanceReading(
          from: _readDate(json, 'from'),
          to: _readDate(json, 'to'),
          presentDays: _read<num>(json, 'presentDays'),
          workingDays: _read<num>(json, 'workingDays'),
          people: _read<int>(json, 'people'),
        ),
        'production_target' => ProductionReading(
          from: _readDate(json, 'from'),
          to: _readDate(json, 'to'),
          pieces: _read<num>(json, 'pieces'),
          target: _read<num>(json, 'target'),
          people: _read<int>(json, 'people'),
        ),
        _ => null,
      };

  final DateTime from;
  final DateTime to;

  /// Whose records: one for a person's goal.
  final int people;
}

/// Days present (a half day counts a half) of the scheduled working days.
class AttendanceReading extends KpiReading {
  const AttendanceReading({
    required super.from,
    required super.to,
    required super.people,
    required this.presentDays,
    required this.workingDays,
  });

  final num presentDays;
  final num workingDays;
}

/// Pieces made against the day targets of the operations worked.
class ProductionReading extends KpiReading {
  const ProductionReading({
    required super.from,
    required super.to,
    required super.people,
    required this.pieces,
    required this.target,
  });

  final num pieces;
  final num target;
}

/// A goal (the fields of the API's `GoalView` the app shows).
class GoalView {
  const GoalView({
    required this.id,
    required this.title,
    required this.kind,
    required this.keyResults,
    required this.source,
    required this.progress,
    required this.status,
    this.employee,
    this.cycle,
    this.parentTitle,
    this.description,
    this.measureUnit,
    this.target,
    this.direction,
    this.currentValue,
    this.weight,
    this.startsOn,
    this.dueOn,
    this.reading,
  });

  factory GoalView.fromJson(Json json) => GoalView(
    id: _read<String>(json, 'id'),
    employee: _readOptional(json, 'employee', EmployeeRef.fromJson),
    cycle: _readOptional(json, 'cycle', GoalCycleRef.fromJson),
    parentTitle: _readOptional(
      json,
      'parent',
      (parent) => _read<String>(parent, 'title'),
    ),
    title: _read<String>(json, 'title'),
    description: _read<String?>(json, 'description'),
    kind: GoalKind.fromWire(_read<String>(json, 'kind')),
    keyResults: _readList(json, 'keyResults', KeyResult.fromJson),
    measureUnit: _read<String?>(json, 'measureUnit'),
    target: _read<String?>(json, 'target'),
    direction: _readOptionalWire(json, 'direction', KpiDirection.fromWire),
    source: KpiSource.fromWire(_read<String>(json, 'source')),
    currentValue: _read<String?>(json, 'currentValue'),
    progress: _read<int>(json, 'progress'),
    weight: _read<String?>(json, 'weight'),
    startsOn: _readOptionalDate(json, 'startsOn'),
    dueOn: _readOptionalDate(json, 'dueOn'),
    status: GoalStatus.fromWire(_read<String>(json, 'status')),
    reading: switch (_read<Json?>(json, 'reading')) {
      final Json reading => KpiReading.fromJson(reading),
      null => null,
    },
  );

  final String id;

  /// Whose goal; `null` for a unit's.
  final EmployeeRef? employee;
  final GoalCycleRef? cycle;

  /// The title of the goal this one serves.
  final String? parentTitle;
  final String title;
  final String? description;
  final GoalKind kind;
  final List<KeyResult> keyResults;

  /// A KPI's measure, such as `%` or `pieces`.
  final String? measureUnit;
  final String? target;
  final KpiDirection? direction;
  final KpiSource source;
  final String? currentValue;

  /// 0 to 100.
  final int progress;

  /// Percent of the person's goals for the cycle.
  final String? weight;
  final DateTime? startsOn;
  final DateTime? dueOn;
  final GoalStatus status;

  /// For a KPI from the records that is still open: how its value was read.
  final KpiReading? reading;

  /// A KPI whose value comes from the records.
  bool get fromRecords => kind == GoalKind.kpi && source.fromRecords;

  /// Its cycle (or none) still takes changes to its goals.
  bool get cycleOpen => cycle?.status.goalsOpen ?? true;
}

/// A dated progress note on a goal.
class GoalCheckin {
  const GoalCheckin({
    required this.id,
    required this.createdAt,
    this.progress,
    this.value,
    this.note,
    this.author,
  });

  factory GoalCheckin.fromJson(Json json) => GoalCheckin(
    id: _read<String>(json, 'id'),
    progress: _read<int?>(json, 'progress'),
    value: _read<String?>(json, 'value'),
    note: _read<String?>(json, 'note'),
    author: _read<String?>(json, 'author'),
    createdAt: _readTimestamp(json, 'createdAt'),
  );

  final String id;
  final int? progress;

  /// A KPI's value typed at the check-in.
  final String? value;
  final String? note;

  /// The login's name.
  final String? author;
  final DateTime createdAt;
}

/// What the signed-in login may do with a goal (the app offers agreeing
/// and checking in; the rest is on the web).
class GoalActions {
  const GoalActions({required this.agree, required this.checkin});

  factory GoalActions.fromJson(Json json) => GoalActions(
    agree: _read<bool>(json, 'agree'),
    checkin: _read<bool>(json, 'checkin'),
  );

  final bool agree;
  final bool checkin;
}

/// `GET /tenant/performance/goals/{id}`: a goal with its check-ins.
class GoalDetail extends GoalView {
  const GoalDetail({
    required super.id,
    required super.title,
    required super.kind,
    required super.keyResults,
    required super.source,
    required super.progress,
    required super.status,
    super.employee,
    super.cycle,
    super.parentTitle,
    super.description,
    super.measureUnit,
    super.target,
    super.direction,
    super.currentValue,
    super.weight,
    super.startsOn,
    super.dueOn,
    super.reading,
    required this.checkins,
    required this.can,
    this.dropNote,
  });

  factory GoalDetail.fromJson(Json json) {
    final goal = GoalView.fromJson(json);
    return GoalDetail(
      id: goal.id,
      employee: goal.employee,
      cycle: goal.cycle,
      parentTitle: goal.parentTitle,
      title: goal.title,
      description: goal.description,
      kind: goal.kind,
      keyResults: goal.keyResults,
      measureUnit: goal.measureUnit,
      target: goal.target,
      direction: goal.direction,
      source: goal.source,
      currentValue: goal.currentValue,
      progress: goal.progress,
      weight: goal.weight,
      startsOn: goal.startsOn,
      dueOn: goal.dueOn,
      status: goal.status,
      reading: goal.reading,
      checkins: _readList(json, 'checkins', GoalCheckin.fromJson),
      dropNote: _read<String?>(json, 'dropNote'),
      can: GoalActions.fromJson(_read<Json>(json, 'can')),
    );
  }

  /// Latest first.
  final List<GoalCheckin> checkins;

  /// Why a dropped goal was dropped.
  final String? dropNote;
  final GoalActions can;
}

/// `GET /tenant/performance/goals/mine`.
class MyGoals {
  const MyGoals({required this.goals, this.employee, this.manager});

  factory MyGoals.fromJson(Json json) => MyGoals(
    employee: _readOptional(json, 'employee', EmployeeRef.fromJson),
    manager: _readOptional(json, 'manager', EmployeeRef.fromJson),
    goals: _readList(json, 'goals', GoalView.fromJson),
  );

  /// `null` for a login without an employee record, which has no goals.
  final EmployeeRef? employee;

  /// Who agrees them.
  final EmployeeRef? manager;

  /// Oldest first.
  final List<GoalView> goals;
}

/// One person below the login, with their goals.
class TeamGoalsPerson {
  const TeamGoalsPerson({
    required this.employee,
    required this.goals,
    this.manager,
  });

  factory TeamGoalsPerson.fromJson(Json json) => TeamGoalsPerson(
    employee: EmployeeRef.fromJson(_read<Json>(json, 'employee')),
    manager: _readOptional(json, 'manager', EmployeeRef.fromJson),
    goals: _readList(json, 'goals', GoalView.fromJson),
  );

  final EmployeeRef employee;

  /// Their own manager, for people below the login's direct reports.
  final EmployeeRef? manager;
  final List<GoalView> goals;
}

/// `GET /tenant/performance/goals/team`.
class TeamGoals {
  const TeamGoals({required this.people, required this.toAgree});

  factory TeamGoals.fromJson(Json json) => TeamGoals(
    people: _readList(json, 'people', TeamGoalsPerson.fromJson),
    toAgree: _read<int>(json, 'toAgree'),
  );

  /// By name.
  final List<TeamGoalsPerson> people;

  /// Drafts waiting for agreement, in cycles still open.
  final int toAgree;
}

/// `POST /tenant/performance/goals/submit`.
class GoalSubmitResult {
  const GoalSubmitResult({required this.goals, required this.notified});

  factory GoalSubmitResult.fromJson(Json json) => GoalSubmitResult(
    goals: _read<int>(json, 'goals'),
    notified: _read<int>(json, 'notified'),
  );

  final int goals;

  /// How many were told: 0 when these drafts were sent before.
  final int notified;
}

/// `POST /tenant/performance/goals/{id}/checkins`: a note with the progress
/// (an objective without key results), the key results done (by their
/// place in the list) or the value (a KPI typed by hand).
class GoalCheckinDraft {
  const GoalCheckinDraft({this.progress, this.value, this.done, this.note});

  final int? progress;

  /// Decimal text, such as `92.5`.
  final String? value;
  final List<int>? done;
  final String? note;

  Json toJson() => {
    'progress': ?progress,
    'value': ?value,
    'done': ?done,
    'note': ?note,
  };
}

// ── Reviews ─────────────────────────────────────────────────────────────────

/// What a review rates besides goals, named in English and Bangla.
class Competency {
  const Competency({required this.key, required this.en, required this.bn});

  factory Competency.fromJson(Json json) => Competency(
    key: _read<String>(json, 'key'),
    en: _read<String>(json, 'en'),
    bn: _read<String>(json, 'bn'),
  );

  final String key;
  final String en;
  final String bn;

  String nameIn(String languageCode) => languageCode == 'bn' ? bn : en;
}

/// The cycle a review belongs to (the API's `CycleSummary` with the
/// competencies it rates).
class ReviewCycle {
  const ReviewCycle({
    required this.id,
    required this.name,
    required this.periodStart,
    required this.periodEnd,
    required this.competencies,
    this.selfDueOn,
  });

  factory ReviewCycle.fromJson(Json json) => ReviewCycle(
    id: _read<String>(json, 'id'),
    name: _read<String>(json, 'name'),
    periodStart: _readDate(json, 'periodStart'),
    periodEnd: _readDate(json, 'periodEnd'),
    selfDueOn: _readOptionalDate(json, 'selfDueOn'),
    competencies: _readList(json, 'competencies', Competency.fromJson),
  );

  final String id;
  final String name;
  final DateTime periodStart;
  final DateTime periodEnd;
  final DateTime? selfDueOn;
  final List<Competency> competencies;
}

/// A rating, 1 to 5, and a comment.
class ReviewAnswer {
  const ReviewAnswer({required this.rating, this.comment});

  factory ReviewAnswer.fromJson(Json json) => ReviewAnswer(
    rating: _read<int>(json, 'rating'),
    comment: _read<String?>(json, 'comment'),
  );

  final int rating;
  final String? comment;

  Json toJson() => {'rating': rating, 'comment': ?comment};
}

/// One part of a review: each goal's (by id) and competency's (by key)
/// rating and comment, and an overall comment.
class ReviewAnswers {
  const ReviewAnswers({
    required this.goals,
    required this.competencies,
    this.overall,
  });

  factory ReviewAnswers.fromJson(Json json) {
    Map<String, ReviewAnswer> group(String key) => {
      for (final MapEntry(key: id, :value)
          in (_read<Json?>(json, key) ?? const {}).entries)
        id: value is Json
            ? ReviewAnswer.fromJson(value)
            : throw FormatException('Expected "$key.$id" to be an object'),
    };
    return ReviewAnswers(
      goals: group('goals'),
      competencies: group('competencies'),
      overall: _read<String?>(json, 'overall'),
    );
  }

  final Map<String, ReviewAnswer> goals;
  final Map<String, ReviewAnswer> competencies;
  final String? overall;

  Json toJson() => {
    'goals': {
      for (final MapEntry(:key, :value) in goals.entries) key: value.toJson(),
    },
    'competencies': {
      for (final MapEntry(:key, :value) in competencies.entries)
        key: value.toJson(),
    },
    'overall': ?overall,
  };
}

/// A goal a review rates (the API's `ReviewGoal`).
class ReviewGoal {
  const ReviewGoal({
    required this.id,
    required this.title,
    required this.kind,
    required this.status,
    required this.progress,
    this.description,
    this.weight,
    this.measureUnit,
    this.target,
    this.currentValue,
  });

  factory ReviewGoal.fromJson(Json json) => ReviewGoal(
    id: _read<String>(json, 'id'),
    title: _read<String>(json, 'title'),
    description: _read<String?>(json, 'description'),
    kind: GoalKind.fromWire(_read<String>(json, 'kind')),
    status: GoalStatus.fromWire(_read<String>(json, 'status')),
    weight: _read<String?>(json, 'weight'),
    progress: _read<int>(json, 'progress'),
    measureUnit: _read<String?>(json, 'measureUnit'),
    target: _read<String?>(json, 'target'),
    currentValue: _read<String?>(json, 'currentValue'),
  );

  final String id;
  final String title;
  final String? description;
  final GoalKind kind;
  final GoalStatus status;

  /// Percent; `null` when the goals carry no weights (they count equally).
  final String? weight;
  final int progress;
  final String? measureUnit;
  final String? target;
  final String? currentValue;
}

/// What the login may do with a review (the app writes the self review and
/// the acknowledgement; the rest is on the web).
class ReviewActions {
  const ReviewActions({
    required this.writeSelf,
    required this.proposePeers,
    required this.acknowledge,
  });

  factory ReviewActions.fromJson(Json json) => ReviewActions(
    writeSelf: _read<bool>(json, 'writeSelf'),
    proposePeers: _read<bool>(json, 'proposePeers'),
    acknowledge: _read<bool>(json, 'acknowledge'),
  );

  final bool writeSelf;
  final bool proposePeers;
  final bool acknowledge;
}

/// A part of the review the login may see, and when it was submitted.
class ReviewPart {
  const ReviewPart({this.answers, this.submittedAt});

  factory ReviewPart.fromJson(Json json) => ReviewPart(
    answers: _readOptional(json, 'answers', ReviewAnswers.fromJson),
    submittedAt: _readOptionalTimestamp(json, 'submittedAt'),
  );

  final ReviewAnswers? answers;
  final DateTime? submittedAt;
}

/// The person's acknowledgement of their released review.
class ReviewAcknowledgement {
  const ReviewAcknowledgement({required this.at, this.agrees, this.comment});

  factory ReviewAcknowledgement.fromJson(Json json) => ReviewAcknowledgement(
    at: _readTimestamp(json, 'at'),
    agrees: _read<bool?>(json, 'agrees'),
    comment: _read<String?>(json, 'comment'),
  );

  final DateTime at;
  final bool? agrees;
  final String? comment;
}

/// Peer feedback as the person reads it after release: each question's
/// answers together, in no order that ties them to anyone, and the average
/// rating; nothing at all from too few peers.
class PeerSummary {
  const PeerSummary({
    required this.shown,
    required this.answers,
    this.averageRating,
  });

  factory PeerSummary.fromJson(Json json) {
    final answers = _read<Json>(json, 'answers');
    return PeerSummary(
      shown: _read<bool>(json, 'shown'),
      answers: {
        for (final question in PeerQuestion.values)
          question: answers[question.wire] == null
              ? const []
              : _readStrings(answers, question.wire),
      },
      averageRating: _read<num?>(json, 'averageRating'),
    );
  }

  /// Enough peers answered for anything to be shown.
  final bool shown;
  final Map<PeerQuestion, List<String>> answers;

  /// To one decimal.
  final num? averageRating;
}

/// `GET /tenant/performance/reviews/{id}`: a review as the login may see it
/// (the fields the app shows).
class ReviewDetail {
  const ReviewDetail({
    required this.id,
    required this.cycle,
    required this.employee,
    required this.status,
    required this.role,
    required this.can,
    required this.goals,
    this.manager,
    this.self,
    this.managerReview,
    this.goalScore,
    this.finalRating,
    this.releasedAt,
    this.acknowledgement,
    this.peerSummary,
  });

  factory ReviewDetail.fromJson(Json json) => ReviewDetail(
    id: _read<String>(json, 'id'),
    cycle: ReviewCycle.fromJson(_read<Json>(json, 'cycle')),
    employee: EmployeeRef.fromJson(_read<Json>(json, 'employee')),
    manager: _readOptional(json, 'manager', EmployeeRef.fromJson),
    status: ReviewStatus.fromWire(_read<String>(json, 'status')),
    role: ReviewRole.fromWire(_read<String>(json, 'role')),
    can: ReviewActions.fromJson(_read<Json>(json, 'can')),
    goals: _readList(json, 'goals', ReviewGoal.fromJson),
    self: _readOptional(json, 'self', ReviewPart.fromJson),
    managerReview: _readOptional(json, 'managerReview', ReviewPart.fromJson),
    goalScore: _read<String?>(json, 'goalScore'),
    finalRating: _read<int?>(json, 'finalRating'),
    releasedAt: _readOptionalTimestamp(json, 'releasedAt'),
    acknowledgement: _readOptional(
      json,
      'acknowledgement',
      ReviewAcknowledgement.fromJson,
    ),
    peerSummary: _readOptional(json, 'peerSummary', PeerSummary.fromJson),
  );

  final String id;
  final ReviewCycle cycle;

  /// Whose review.
  final EmployeeRef employee;
  final EmployeeRef? manager;
  final ReviewStatus status;
  final ReviewRole role;
  final ReviewActions can;

  /// The agreed goals it rates.
  final List<ReviewGoal> goals;

  /// The self review; for the person always, even while a draft.
  final ReviewPart? self;

  /// The manager's ratings and comments; for the person once released.
  final ReviewPart? managerReview;

  /// The manager's goal ratings averaged by weight, such as `3.40`.
  final String? goalScore;

  /// 1 to 5; for the person once released.
  final int? finalRating;
  final DateTime? releasedAt;
  final ReviewAcknowledgement? acknowledgement;

  /// For the person after release, in a cycle with peer feedback.
  final PeerSummary? peerSummary;
}

/// `PUT /tenant/performance/reviews/{id}/self`: [submit] sends it to the
/// manager, after which it cannot change.
class SelfReviewDraft {
  const SelfReviewDraft({required this.answers, required this.submit});

  final ReviewAnswers answers;
  final bool submit;

  Json toJson() => {'answers': answers.toJson(), 'submit': submit};
}

/// `POST /tenant/performance/reviews/{id}/acknowledge`.
class AcknowledgementDraft {
  const AcknowledgementDraft({required this.agrees, this.comment});

  final bool agrees;
  final String? comment;

  Json toJson() => {'agrees': agrees, 'comment': ?comment};
}

// ── Peer feedback ───────────────────────────────────────────────────────────

/// The cycle a peer request belongs to.
class PeerCycleRef {
  const PeerCycleRef({required this.id, required this.name});

  factory PeerCycleRef.fromJson(Json json) => PeerCycleRef(
    id: _read<String>(json, 'id'),
    name: _read<String>(json, 'name'),
  );

  final String id;
  final String name;
}

/// A request for the login's feedback on a colleague (the API's
/// `PeerRequestView`).
class PeerRequest {
  const PeerRequest({
    required this.id,
    required this.person,
    required this.cycle,
    required this.status,
    required this.open,
    this.dueOn,
    this.answers = const {},
    this.rating,
  });

  factory PeerRequest.fromJson(Json json) {
    final answers = _read<Json?>(json, 'answers');
    return PeerRequest(
      id: _read<String>(json, 'id'),
      person: EmployeeRef.fromJson(_read<Json>(json, 'person')),
      cycle: PeerCycleRef.fromJson(_read<Json>(json, 'cycle')),
      status: PeerStatus.fromWire(_read<String>(json, 'status')),
      dueOn: _readOptionalDate(json, 'dueOn'),
      open: _read<bool>(json, 'open'),
      answers: {
        if (answers != null)
          for (final question in PeerQuestion.values)
            question: ?_read<String?>(answers, question.wire),
      },
      rating: _read<int?>(json, 'rating'),
    );
  }

  final String id;

  /// Whom the feedback is about.
  final EmployeeRef person;
  final PeerCycleRef cycle;
  final PeerStatus status;
  final DateTime? dueOn;

  /// Still open for an answer.
  final bool open;

  /// The login's answers, once given.
  final Map<PeerQuestion, String> answers;
  final int? rating;
}

/// A peer someone named, waiting for the manager's yes or no.
class PeerApproval {
  const PeerApproval({
    required this.id,
    required this.person,
    required this.peer,
    required this.cycle,
  });

  factory PeerApproval.fromJson(Json json) => PeerApproval(
    id: _read<String>(json, 'id'),
    person: EmployeeRef.fromJson(_read<Json>(json, 'person')),
    peer: EmployeeRef.fromJson(_read<Json>(json, 'peer')),
    cycle: PeerCycleRef.fromJson(_read<Json>(json, 'cycle')),
  );

  final String id;

  /// Whose review.
  final EmployeeRef person;

  /// Who was named to give feedback.
  final EmployeeRef peer;
  final PeerCycleRef cycle;
}

/// `GET /tenant/performance/peers`.
class PeerInbox {
  const PeerInbox({required this.toAnswer, required this.toApprove});

  factory PeerInbox.fromJson(Json json) => PeerInbox(
    toAnswer: _readList(json, 'toAnswer', PeerRequest.fromJson),
    toApprove: _readList(json, 'toApprove', PeerApproval.fromJson),
  );

  /// Feedback the login is asked for, open or given.
  final List<PeerRequest> toAnswer;

  /// For a manager: peers named for their team's reviews.
  final List<PeerApproval> toApprove;
}

/// `PUT /tenant/performance/peers/{id}`: both answers and a rating, given
/// once.
class PeerAnswerDraft {
  const PeerAnswerDraft({
    required this.strengths,
    required this.improvements,
    required this.rating,
  });

  final String strengths;
  final String improvements;
  final int rating;

  Json toJson() => {
    'answers': {'strengths': strengths, 'improvements': improvements},
    'rating': rating,
  };
}
