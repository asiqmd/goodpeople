part of 'api_models.dart';

// ── Recruitment: openings and offers to approve, and the login's interviews ──
//
// Interviewers are employees with logins. `GET /tenant/recruitment/me` says
// how many interviews need them; `/tenant/interviews` lists them, and each
// interview takes the interviewer's scorecard: a rating from 1 to 5 for
// each of the opening's criteria, a recommendation and notes.

enum InterviewKind implements WireValue {
  inPerson('in_person'),
  phone('phone'),
  video('video'),
  unknown('unknown');

  const InterviewKind(this.wire);
  @override
  final String wire;

  static InterviewKind fromWire(String value) =>
      _byWire(values, value, unknown);
}

enum InterviewStatus implements WireValue {
  scheduled('scheduled'),
  completed('completed'),
  cancelled('cancelled'),
  unknown('unknown');

  const InterviewStatus(this.wire);
  @override
  final String wire;

  static InterviewStatus fromWire(String value) =>
      _byWire(values, value, unknown);
}

/// An interviewer's verdict, from strong no to strong yes.
enum Recommendation implements WireValue {
  strongNo('strong_no'),
  no('no'),
  yes('yes'),
  strongYes('strong_yes'),
  unknown('unknown');

  const Recommendation(this.wire);
  @override
  final String wire;

  static Recommendation fromWire(String value) =>
      _byWire(values, value, unknown);

  /// The ones an interviewer can choose, in order.
  static const choices = [strongNo, no, yes, strongYes];
}

/// `GET /tenant/recruitment/me`: what the login has to do with recruitment.
class RecruitmentMe {
  const RecruitmentMe({
    required this.manage,
    required this.hiringManager,
    required this.interviews,
  });

  factory RecruitmentMe.fromJson(Json json) => RecruitmentMe(
    manage: _read<bool>(json, 'manage'),
    hiringManager: _read<bool>(json, 'hiringManager'),
    interviews: _read<int>(json, 'interviews'),
  );

  /// Manages recruitment (on the web).
  final bool manage;

  /// Hiring manager of an opening still being filled.
  final bool hiringManager;

  /// Interviews that need them: still to come, or over without their
  /// scorecard.
  final int interviews;
}

/// The opening an interview is for.
class InterviewOpening {
  const InterviewOpening({
    required this.id,
    required this.title,
    this.postTitleEn,
    this.postTitleBn,
  });

  factory InterviewOpening.fromJson(Json json) => InterviewOpening(
    id: _read<String>(json, 'id'),
    title: _read<String>(json, 'title'),
    postTitleEn: _read<String?>(json, 'postTitleEn'),
    postTitleBn: _read<String?>(json, 'postTitleBn'),
  );

  final String id;

  /// HR's own name for the position.
  final String title;

  /// The job post's titles, once HR wrote the post.
  final String? postTitleEn;
  final String? postTitleBn;

  /// The post's title in [languageCode], else in the other language, else
  /// HR's name for the position, as the API's emails choose it.
  String titleIn(String languageCode) =>
      (languageCode == 'bn' ? postTitleBn ?? postTitleEn : postTitleEn) ??
      postTitleBn ??
      title;
}

/// One of the login's interviews (the API's `MyInterviewItem`).
class MyInterviewItem {
  const MyInterviewItem({
    required this.id,
    required this.kind,
    required this.startsAt,
    required this.endsAt,
    required this.status,
    required this.candidateName,
    required this.opening,
    required this.submitted,
    this.location,
    this.meetingUrl,
  });

  factory MyInterviewItem.fromJson(Json json) => MyInterviewItem(
    id: _read<String>(json, 'id'),
    kind: InterviewKind.fromWire(_read<String>(json, 'kind')),
    startsAt: _readTimestamp(json, 'startsAt'),
    endsAt: _readTimestamp(json, 'endsAt'),
    location: _read<String?>(json, 'location'),
    meetingUrl: _read<String?>(json, 'meetingUrl'),
    status: InterviewStatus.fromWire(_read<String>(json, 'status')),
    candidateName: _read<String>(json, 'candidateName'),
    opening: InterviewOpening.fromJson(_read<Json>(json, 'opening')),
    submitted: _read<bool>(json, 'submitted'),
  );

  final String id;
  final InterviewKind kind;
  final DateTime startsAt;
  final DateTime endsAt;

  /// The place for an interview in person; a note (who calls whom) for one
  /// by phone.
  final String? location;

  /// The video call's link.
  final String? meetingUrl;
  final InterviewStatus status;

  /// "Erased candidate" once the candidate's data has been erased.
  final String candidateName;
  final InterviewOpening opening;

  /// The login's scorecard is in.
  final bool submitted;
}

/// `GET /tenant/interviews`.
class MyInterviews {
  const MyInterviews({required this.upcoming, required this.past});

  factory MyInterviews.fromJson(Json json) => MyInterviews(
    upcoming: _readList(json, 'upcoming', MyInterviewItem.fromJson),
    past: _readList(json, 'past', MyInterviewItem.fromJson),
  );

  /// Scheduled and not over yet, soonest first.
  final List<MyInterviewItem> upcoming;

  /// Over or cancelled, latest first.
  final List<MyInterviewItem> past;
}

/// A submitted scorecard.
class Scorecard {
  const Scorecard({
    required this.ratings,
    required this.recommendation,
    required this.submittedAt,
    this.feedback,
  });

  factory Scorecard.fromJson(Json json) => Scorecard(
    ratings: {
      for (final MapEntry(:key, :value) in _read<Json>(json, 'ratings').entries)
        key: value is int
            ? value
            : throw FormatException('Expected rating "$key" to be an int'),
    },
    recommendation: Recommendation.fromWire(
      _read<String>(json, 'recommendation'),
    ),
    feedback: _read<String?>(json, 'feedback'),
    submittedAt: _readTimestamp(json, 'submittedAt'),
  );

  /// 1 to 5 for each criterion, by the criterion's name.
  final Map<String, int> ratings;
  final Recommendation recommendation;
  final String? feedback;
  final DateTime submittedAt;
}

/// Another interviewer's scorecard for the same application.
class PeerScorecard {
  const PeerScorecard({required this.employee, required this.scorecard});

  factory PeerScorecard.fromJson(Json json) => PeerScorecard(
    employee: EmployeeRef.fromJson(_read<Json>(json, 'employee')),
    scorecard: Scorecard.fromJson(_read<Json>(json, 'scorecard')),
  );

  final EmployeeRef employee;
  final Scorecard scorecard;
}

/// An interviewer on the panel, and whether their scorecard is in.
class PanelMember {
  const PanelMember({required this.employee, required this.submitted});

  factory PanelMember.fromJson(Json json) => PanelMember(
    employee: EmployeeRef.fromJson(_read<Json>(json, 'employee')),
    submitted: _read<bool>(json, 'submitted'),
  );

  final EmployeeRef employee;
  final bool submitted;
}

/// `GET /tenant/interviews/{id}`: an interview as its interviewer sees it.
class MyInterviewDetail extends MyInterviewItem {
  const MyInterviewDetail({
    required super.id,
    required super.kind,
    required super.startsAt,
    required super.endsAt,
    required super.status,
    required super.candidateName,
    required super.opening,
    required super.submitted,
    super.location,
    super.meetingUrl,
    required this.applicationId,
    required this.hasCv,
    required this.criteria,
    required this.scorable,
    required this.others,
    this.notes,
    this.coverNote,
    this.mine,
    this.panel,
  });

  factory MyInterviewDetail.fromJson(Json json) {
    final item = MyInterviewItem.fromJson(json);
    return MyInterviewDetail(
      id: item.id,
      kind: item.kind,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      location: item.location,
      meetingUrl: item.meetingUrl,
      status: item.status,
      candidateName: item.candidateName,
      opening: item.opening,
      submitted: item.submitted,
      applicationId: _read<String>(json, 'applicationId'),
      notes: _read<String?>(json, 'notes'),
      hasCv: _read<bool>(json, 'hasCv'),
      coverNote: _read<String?>(json, 'coverNote'),
      criteria: _readStrings(json, 'criteria'),
      scorable: _read<bool>(json, 'scorable'),
      mine: _readOptional(json, 'mine', Scorecard.fromJson),
      others: _readList(json, 'others', PeerScorecard.fromJson),
      panel: json['panel'] == null
          ? null
          : _readList(json, 'panel', PanelMember.fromJson),
    );
  }

  /// For the CV download, `GET /tenant/recruitment/applications/{id}/cv`.
  final String applicationId;

  /// HR's notes for the panel.
  final String? notes;
  final bool hasCv;

  /// What the candidate wrote when applying.
  final String? coverNote;

  /// What each interviewer rates, in order.
  final List<String> criteria;

  /// The scorecard may be submitted or changed: the interview was not
  /// cancelled and the application is still open.
  final bool scorable;

  /// The login's own scorecard, once submitted.
  final Scorecard? mine;

  /// The other interviewers' scorecards for this application, oldest first;
  /// empty until [mine] is submitted.
  final List<PeerScorecard> others;

  /// Everyone on this interview's panel, when the API sends it (the
  /// contract's `PanelMemberView` without the scorecard).
  final List<PanelMember>? panel;
}

/// `PUT /tenant/interviews/{id}/scorecard`.
class ScorecardDraft {
  const ScorecardDraft({
    required this.ratings,
    required this.recommendation,
    this.feedback,
  });

  final Map<String, int> ratings;
  final Recommendation recommendation;
  final String? feedback;

  Json toJson() => {
    'ratings': ratings,
    'recommendation': recommendation.wire,
    'feedback': feedback,
  };
}

// ── Approvals ───────────────────────────────────────────────────────────────

enum OpeningReason implements WireValue {
  newPosition('new_position'),
  replacement('replacement'),
  unknown('unknown');

  const OpeningReason(this.wire);
  @override
  final String wire;

  static OpeningReason fromWire(String value) =>
      _byWire(values, value, unknown);
}

/// An opening as its approver sees it (the fields of the API's
/// `OpeningView` the inbox shows).
class OpeningApproval {
  const OpeningApproval({
    required this.id,
    required this.title,
    required this.legalEntity,
    required this.employmentType,
    required this.headcount,
    required this.reason,
    required this.steps,
    this.orgUnit,
    this.location,
    this.designation,
    this.grade,
    this.replaces,
    this.budgetMin,
    this.budgetMax,
    this.justification,
    this.hiringManager,
  });

  factory OpeningApproval.fromJson(Json json) => OpeningApproval(
    id: _read<String>(json, 'id'),
    title: _read<String>(json, 'title'),
    legalEntity: EntityRef.fromJson(_read<Json>(json, 'legalEntity')),
    orgUnit: _readOptional(json, 'orgUnit', EntityRef.fromJson),
    location: _readOptional(json, 'location', EntityRef.fromJson),
    designation: _readOptional(json, 'designation', EntityRef.fromJson),
    grade: _readOptional(json, 'grade', EntityRef.fromJson),
    employmentType: EmploymentType.fromWire(
      _read<String>(json, 'employmentType'),
    ),
    headcount: _read<int>(json, 'headcount'),
    reason: OpeningReason.fromWire(_read<String>(json, 'reason')),
    replaces: _readOptional(json, 'replaces', EmployeeRef.fromJson),
    budgetMin: _read<String?>(json, 'budgetMin'),
    budgetMax: _read<String?>(json, 'budgetMax'),
    justification: _read<String?>(json, 'justification'),
    hiringManager: _readOptional(json, 'hiringManager', EmployeeRef.fromJson),
    steps: _readList(json, 'steps', ApprovalStep.fromJson),
  );

  final String id;
  final String title;

  /// The company.
  final EntityRef legalEntity;
  final EntityRef? orgUnit;
  final EntityRef? location;
  final EntityRef? designation;
  final EntityRef? grade;
  final EmploymentType employmentType;

  /// How many people.
  final int headcount;
  final OpeningReason reason;

  /// Who is being replaced, for a replacement.
  final EmployeeRef? replaces;

  /// The monthly gross budget, decimals such as `35000.00`.
  final String? budgetMin;
  final String? budgetMax;
  final String? justification;
  final EmployeeRef? hiringManager;

  /// Every round of approval, oldest first; earlier rounds have step
  /// numbers below 1.
  final List<ApprovalStep> steps;

  /// This round's steps.
  List<ApprovalStep> get currentSteps => [
    for (final step in steps)
      if (step.stepNo >= 1) step,
  ];
}

/// An offer above its opening's budget, as HR sees it in the inbox (the
/// fields of the API's `OfferView` the inbox shows).
class OfferApproval {
  const OfferApproval({
    required this.id,
    required this.applicationId,
    required this.candidateName,
    required this.openingTitle,
    required this.legalEntity,
    required this.employmentType,
    required this.joiningOn,
    required this.monthlyGross,
    required this.expiresOn,
    required this.steps,
    this.budgetMax,
    this.designation,
    this.probationMonths,
    this.createdBy,
  });

  factory OfferApproval.fromJson(Json json) {
    final opening = _read<Json>(json, 'opening');
    return OfferApproval(
      id: _read<String>(json, 'id'),
      applicationId: _read<String>(json, 'applicationId'),
      candidateName: _read<String>(_read<Json>(json, 'candidate'), 'fullName'),
      openingTitle: _read<String>(opening, 'title'),
      budgetMax: _read<String?>(opening, 'budgetMax'),
      legalEntity: OfferRef.fromJson(_read<Json>(json, 'legalEntity')),
      designation: _readOptional(json, 'designation', OfferRef.fromJson),
      employmentType: EmploymentType.fromWire(
        _read<String>(json, 'employmentType'),
      ),
      joiningOn: _readDate(json, 'joiningOn'),
      monthlyGross: _read<String>(json, 'monthlyGross'),
      probationMonths: _read<int?>(json, 'probationMonths'),
      expiresOn: _readDate(json, 'expiresOn'),
      createdBy: _read<String?>(json, 'createdBy'),
      steps: _readList(json, 'steps', ApprovalStep.fromJson),
    );
  }

  final String id;
  final String applicationId;
  final String candidateName;

  /// HR's name for the opening.
  final String openingTitle;

  /// The opening's top monthly gross budget; `null` when it has none.
  final String? budgetMax;

  /// The company.
  final OfferRef legalEntity;
  final OfferRef? designation;
  final EmploymentType employmentType;
  final DateTime joiningOn;

  /// The monthly gross pay offered, such as `65000.00`.
  final String monthlyGross;
  final int? probationMonths;

  /// The last day the candidate can accept.
  final DateTime expiresOn;

  /// The name of whoever drafted it.
  final String? createdBy;
  final List<ApprovalStep> steps;
}

/// A name with its Bangla one, when there is one (the API's `OfferRef`).
class OfferRef {
  const OfferRef({required this.name, this.nameBn});

  factory OfferRef.fromJson(Json json) => OfferRef(
    name: _read<String>(json, 'name'),
    nameBn: _read<String?>(json, 'nameBn'),
  );

  final String name;
  final String? nameBn;
}
