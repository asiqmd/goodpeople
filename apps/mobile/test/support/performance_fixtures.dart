import 'package:good_people/api/api_models.dart';

// Performance as the API contract shapes it (`packages/shared/src/
// goals.ts` and `reviews.ts`): the login's tasks, goals, reviews and peer
// feedback in the Annual review 2026 cycle, and a report's draft goals.

const annualCycleId = 'c7000000-0000-4000-8000-000000000001';
const midYearCycleId = 'c7000000-0000-4000-8000-000000000002';

/// The login's open self review in the annual cycle.
const selfReviewId = 'a7000000-0000-4000-8000-000000000001';

/// The login's released mid-year review, to acknowledge.
const releasedReviewId = 'a7000000-0000-4000-8000-000000000002';

/// A review the login writes as Nasima's manager (on the web).
const teamReviewId = 'a7000000-0000-4000-8000-000000000003';

/// Objective with three key results, one done, weight 40%.
const objectiveGoalId = 'b8000000-0000-4000-8000-000000000001';

/// KPI typed in check-ins: first-pass quality, 92 of a 95% target.
const manualKpiGoalId = 'b8000000-0000-4000-8000-000000000002';

/// KPI from the records: the attendance rate.
const recordsKpiGoalId = 'b8000000-0000-4000-8000-000000000003';

/// A draft of the login's, weight 10%.
const draftGoalId = 'b8000000-0000-4000-8000-000000000004';

/// Nasima's two drafts, for her manager (the login) to agree.
const nasimaGoalAId = 'b8000000-0000-4000-8000-000000000005';
const nasimaGoalBId = 'b8000000-0000-4000-8000-000000000006';

/// A request for the login's feedback on Shirin, open.
const openPeerRequestId = 'd9000000-0000-4000-8000-000000000001';

/// A request for the login's feedback on Kamal, answered.
const answeredPeerRequestId = 'd9000000-0000-4000-8000-000000000002';

/// Shirin, named as a peer for Nasima's review, waiting for the login.
const peerApprovalId = 'd9000000-0000-4000-8000-000000000003';

const myEmployeeRef = {
  'id': 'e0000000-0000-4000-8000-000000000010',
  'employeeCode': 'MG-0010',
  'fullName': 'Rahima Akter',
  'fullNameBn': 'রহিমা আক্তার',
};

const kamalRef = {
  'id': 'e0000000-0000-4000-8000-000000000001',
  'employeeCode': 'MG-0001',
  'fullName': 'Kamal Hossain',
  'fullNameBn': 'কামাল হোসেন',
};

const shirinRef = {
  'id': 'e0000000-0000-4000-8000-000000000004',
  'employeeCode': 'MG-0004',
  'fullName': 'Shirin Akter',
  'fullNameBn': 'শিরিন আক্তার',
};

const nasimaRef = {
  'id': 'e0000000-0000-4000-8000-000000000012',
  'employeeCode': 'MG-0012',
  'fullName': 'Nasima Begum',
  'fullNameBn': 'নাসিমা বেগম',
};

const _annualGoalCycle = {
  'id': annualCycleId,
  'name': 'Annual review 2026',
  'status': 'active',
  'periodStart': '2026-01-01',
  'periodEnd': '2026-12-31',
  'goalsDueOn': '2026-02-15',
};

const competencies = [
  {'key': 'quality', 'en': 'Quality of work', 'bn': 'কাজের মান'},
  {
    'key': 'teamwork',
    'en': 'Teamwork and communication',
    'bn': 'দলগত কাজ ও যোগাযোগ',
  },
];

// ── The Performance page ────────────────────────────────────────────────────

Json taskJson({
  required String kind,
  required String id,
  required String link,
  Json? person,
  String? cycle = 'Annual review 2026',
  String? dueOn,
  int count = 1,
}) => {
  'kind': kind,
  'id': id,
  'person': person,
  'cycle': cycle,
  'dueOn': dueOn,
  'count': count,
  'link': link,
};

/// The tasks the app handles, and two it leaves to the web.
List<Json> performanceTasksJson() => [
  taskJson(
    kind: 'self_review',
    id: selfReviewId,
    dueOn: '2026-11-15',
    link: '/workspace/performance/reviews/$selfReviewId',
  ),
  taskJson(
    kind: 'peer_answer',
    id: openPeerRequestId,
    person: shirinRef,
    dueOn: '2026-11-20',
    link: '/workspace/performance/peers/$openPeerRequestId',
  ),
  taskJson(
    kind: 'manager_review',
    id: teamReviewId,
    person: nasimaRef,
    dueOn: '2026-11-30',
    link: '/workspace/performance/reviews/$teamReviewId',
  ),
  taskJson(
    kind: 'acknowledge',
    id: releasedReviewId,
    cycle: 'Mid-year review 2026',
    link: '/workspace/performance/reviews/$releasedReviewId',
  ),
  taskJson(
    kind: 'goals_agree',
    id: nasimaRef['id']!,
    person: nasimaRef,
    cycle: null,
    count: 2,
    link: '/workspace/performance/goals',
  ),
  taskJson(
    kind: 'probation_review',
    id: 'f2000000-0000-4000-8000-000000000001',
    person: nasimaRef,
    cycle: null,
    dueOn: '2026-12-05',
    link:
        '/workspace/performance/probation/f2000000-0000-4000-8000-000000000001',
  ),
];

Json performanceMeJson({List<Json>? items, bool manager = true}) {
  final tasks = items ?? performanceTasksJson();
  return {
    'tasks': tasks.length,
    'items': tasks,
    'manage': false,
    'manager': manager,
    'goals': {
      'total': 4,
      'draft': 1,
      'agreed': 3,
      'completed': 0,
      'progress': 55,
    },
    'reviews': [
      {
        'id': selfReviewId,
        'cycle': {
          'id': annualCycleId,
          'name': 'Annual review 2026',
          'periodStart': '2026-01-01',
          'periodEnd': '2026-12-31',
          'status': 'active',
        },
        'status': 'self',
        'finalRating': null,
        'releasedAt': null,
        'acknowledgedAt': null,
      },
      {
        'id': releasedReviewId,
        'cycle': {
          'id': midYearCycleId,
          'name': 'Mid-year review 2026',
          'periodStart': '2026-01-01',
          'periodEnd': '2026-06-30',
          'status': 'released',
        },
        'status': 'released',
        'finalRating': 4,
        'releasedAt': '2026-10-20T04:00:00.000Z',
        'acknowledgedAt': null,
      },
    ],
  };
}

// ── Goals ───────────────────────────────────────────────────────────────────

Json goalJson({
  required String id,
  required String title,
  String kind = 'objective',
  Json? employee = myEmployeeRef,
  Json? cycle = _annualGoalCycle,
  List<Json> keyResults = const [],
  String? measureUnit,
  String? target,
  String? direction,
  String source = 'manual',
  String? currentValue,
  int progress = 0,
  String? weight,
  String? startsOn = '2026-01-01',
  String? dueOn = '2026-12-31',
  String status = 'agreed',
  Json? reading,
  String? description,
}) => {
  'id': id,
  'employee': employee,
  'orgUnit': null,
  'cycle': cycle,
  'parent': null,
  'title': title,
  'description': description,
  'kind': kind,
  'keyResults': keyResults,
  'measureUnit': measureUnit,
  'target': target,
  'direction': direction,
  'source': source,
  'currentValue': currentValue,
  'progress': progress,
  'weight': weight,
  'startsOn': startsOn,
  'dueOn': dueOn,
  'status': status,
  'agreedAt': status == 'draft' ? null : '2026-02-10T04:00:00.000Z',
  'agreedBy': status == 'draft' ? null : 'Kamal Hossain',
  'reading': reading,
  'createdAt': '2026-02-01T04:00:00.000Z',
  'updatedAt': '2026-10-01T04:00:00.000Z',
};

Json objectiveGoalJson() => goalJson(
  id: objectiveGoalId,
  title: 'Train two new operators on line 3',
  keyResults: [
    {'text': 'Write the training plan', 'done': true},
    {'text': 'Train the first operator', 'done': false},
    {'text': 'Train the second operator', 'done': false},
  ],
  progress: 33,
  weight: '40.00',
);

Json manualKpiGoalJson() => goalJson(
  id: manualKpiGoalId,
  title: 'First-pass quality on line 3',
  kind: 'kpi',
  measureUnit: '%',
  target: '95.00',
  direction: 'higher',
  currentValue: '92.00',
  progress: 97,
  weight: '30.00',
);

Json recordsKpiGoalJson() => goalJson(
  id: recordsKpiGoalId,
  title: 'Attendance',
  kind: 'kpi',
  measureUnit: '%',
  target: '96.00',
  direction: 'higher',
  source: 'attendance_rate',
  currentValue: '94.00',
  progress: 98,
  weight: '20.00',
  reading: {
    'source': 'attendance_rate',
    'from': '2026-01-01',
    'to': '2026-10-31',
    'presentDays': 235.5,
    'workingDays': 250,
    'people': 1,
  },
);

Json draftGoalJson() => goalJson(
  id: draftGoalId,
  title: 'Cut needle changes on line 3',
  progress: 0,
  weight: '10.00',
  status: 'draft',
);

/// A goal as `GET /tenant/performance/goals/{id}` answers it.
Json goalDetailJson(
  Json goal, {
  List<Json> checkins = const [],
  bool agree = false,
  bool checkin = true,
}) => {
  ...goal,
  'parentGoal': null,
  'children': <Json>[],
  'checkins': checkins,
  'dropNote': null,
  'can': {
    'edit': goal['status'] == 'draft',
    'agree': agree,
    'checkin': checkin,
    'complete': false,
    'drop': false,
    'submit': goal['status'] == 'draft' && !agree,
  },
  'alignTo': <Json>[],
  'cycles': <Json>[],
};

Json checkinJson({
  required String id,
  int? progress,
  String? value,
  String? note,
  String createdAt = '2026-10-15T04:30:00.000Z',
}) => {
  'id': id,
  'progress': progress,
  'value': value,
  'note': note,
  'author': 'Rahima Akter',
  'createdAt': createdAt,
};

Json myGoalsJson({List<Json>? goals}) => {
  'employee': myEmployeeRef,
  'manager': kamalRef,
  'goals':
      goals ??
      [
        objectiveGoalJson(),
        manualKpiGoalJson(),
        recordsKpiGoalJson(),
        draftGoalJson(),
      ],
  'alignTo': <Json>[],
  'cycles': [_annualGoalCycle],
  'managesPeople': true,
  'manage': false,
};

List<Json> nasimaGoalsJson() => [
  goalJson(
    id: nasimaGoalAId,
    title: 'Hit 1,200 pieces a day',
    employee: nasimaRef,
    kind: 'kpi',
    measureUnit: 'pieces',
    target: '1200.00',
    direction: 'higher',
    weight: '60.00',
    status: 'draft',
  ),
  goalJson(
    id: nasimaGoalBId,
    title: 'Learn the overlock machine',
    employee: nasimaRef,
    weight: '40.00',
    status: 'draft',
  ),
];

Json teamGoalsJson({List<Json>? nasimaGoals}) {
  final goals = nasimaGoals ?? nasimaGoalsJson();
  return {
    'people': [
      {'employee': nasimaRef, 'manager': null, 'goals': goals},
      // Everything of Shirin's is agreed: nothing waits.
      {
        'employee': shirinRef,
        'manager': null,
        'goals': [
          goalJson(
            id: 'b8000000-0000-4000-8000-000000000007',
            title: 'Keep line 4 on target',
            employee: shirinRef,
            weight: '100.00',
          ),
        ],
      },
    ],
    'cycles': [_annualGoalCycle],
    'toAgree': goals.where((g) => g['status'] == 'draft').length,
  };
}

// ── Reviews ─────────────────────────────────────────────────────────────────

Json _reviewGoal(Json goal) => {
  for (final key in [
    'id',
    'title',
    'description',
    'kind',
    'status',
    'weight',
    'progress',
    'dueOn',
    'measureUnit',
    'target',
    'currentValue',
    'direction',
    'keyResults',
  ])
    key: goal[key],
};

Json _reviewCycle({
  String id = annualCycleId,
  String name = 'Annual review 2026',
  String status = 'active',
  String periodEnd = '2026-12-31',
  bool peerReview = true,
}) => {
  'id': id,
  'name': name,
  'periodStart': '2026-01-01',
  'periodEnd': periodEnd,
  'status': status,
  'selfReview': true,
  'peerReview': peerReview,
  'goalsDueOn': '2026-02-15',
  'selfDueOn': '2026-11-15',
  'peerDueOn': '2026-11-20',
  'managerDueOn': '2026-11-30',
  'calibrationDueOn': '2026-12-10',
  'competencies': competencies,
};

Json _reviewCan({
  bool writeSelf = false,
  bool proposePeers = false,
  bool acknowledge = false,
}) => {
  'writeSelf': writeSelf,
  'writeManager': false,
  'proposePeers': proposePeers,
  'approvePeers': false,
  'acknowledge': acknowledge,
  'calibrate': false,
};

/// The login's open self review: two agreed goals and two competencies,
/// nothing written yet unless [answers] is given.
Json selfReviewJson({Json? answers}) => {
  'id': selfReviewId,
  'cycle': _reviewCycle(),
  'employee': {
    ...myEmployeeRef,
    'designation': 'Line Supervisor',
    'legalEntity': 'My Group Textiles Ltd',
  },
  'manager': kamalRef,
  'status': 'self',
  'role': 'person',
  'can': _reviewCan(writeSelf: true, proposePeers: true),
  'goals': [_reviewGoal(objectiveGoalJson()), _reviewGoal(manualKpiGoalJson())],
  'self': {'answers': answers, 'submittedAt': null},
  'managerReview': null,
  'goalScore': null,
  'finalRating': null,
  'calibration': null,
  'releasedAt': null,
  'acknowledgement': null,
  'peers': null,
  'peerProposals': <Json>[],
  'peerSummary': null,
  'promotionChoices': <Json>[],
};

Json answersJson({
  required Map<String, int> goals,
  required Map<String, int> competencies,
  String? comment,
  String? overall,
}) => {
  'goals': {
    for (final MapEntry(:key, :value) in goals.entries)
      key: {'rating': value, 'comment': ?comment},
  },
  'competencies': {
    for (final MapEntry(:key, :value) in competencies.entries)
      key: {'rating': value},
  },
  'overall': ?overall,
};

/// The login's mid-year review, released with a final rating of 4, the
/// manager's comments and peer feedback together, waiting for them to
/// acknowledge it.
Json releasedReviewJson() => {
  'id': releasedReviewId,
  'cycle': _reviewCycle(
    id: midYearCycleId,
    name: 'Mid-year review 2026',
    status: 'released',
    periodEnd: '2026-06-30',
  ),
  'employee': {
    ...myEmployeeRef,
    'designation': 'Line Supervisor',
    'legalEntity': 'My Group Textiles Ltd',
  },
  'manager': kamalRef,
  'status': 'released',
  'role': 'person',
  'can': _reviewCan(acknowledge: true),
  'goals': [_reviewGoal(objectiveGoalJson())],
  'self': {
    'answers': answersJson(
      goals: {objectiveGoalId: 3},
      competencies: {'quality': 4, 'teamwork': 4},
    ),
    'submittedAt': '2026-07-05T04:00:00.000Z',
  },
  'managerReview': {
    'answers': answersJson(
      goals: {objectiveGoalId: 4},
      competencies: {'quality': 4, 'teamwork': 5},
      comment: 'Both operators trained ahead of plan.',
      overall: 'A strong half year; ready for a second line.',
    ),
    'submittedAt': '2026-07-20T04:00:00.000Z',
    'proposedRating': null,
    'recommendations': null,
  },
  'goalScore': '4.00',
  'finalRating': 4,
  'calibration': null,
  'releasedAt': '2026-10-20T04:00:00.000Z',
  'acknowledgement': null,
  'peers': null,
  'peerProposals': null,
  'peerSummary': {
    'shown': true,
    'answers': {
      'strengths': [
        'Calm when the line is behind.',
        'Explains the work patiently.',
        'Keeps the line tidy.',
      ],
      'improvements': ['Could share the plan earlier.'],
    },
    'averageRating': 4.3,
  },
  'promotionChoices': <Json>[],
};

/// Nasima's review as her manager (the login) opens it: written on the web.
Json teamReviewJson() => {
  ...selfReviewJson(),
  'id': teamReviewId,
  'employee': {
    ...nasimaRef,
    'designation': 'Sewing Operator',
    'legalEntity': 'My Group Textiles Ltd',
  },
  'manager': myEmployeeRef,
  'status': 'manager',
  'role': 'manager',
  'can': {..._reviewCan(), 'writeManager': true},
  'self': {
    'answers': answersJson(goals: {}, competencies: {'quality': 3}),
    'submittedAt': '2026-11-02T04:00:00.000Z',
  },
};

// ── Peer feedback ───────────────────────────────────────────────────────────

Json peerRequestJson({
  String id = openPeerRequestId,
  Json person = shirinRef,
  String status = 'approved',
  bool open = true,
  Json? answers,
  int? rating,
  String? submittedAt,
}) => {
  'id': id,
  'person': person,
  'cycle': {'id': annualCycleId, 'name': 'Annual review 2026'},
  'status': status,
  'dueOn': '2026-11-20',
  'open': open,
  'answers': answers,
  'rating': rating,
  'submittedAt': submittedAt,
};

Json answeredPeerRequestJson() => peerRequestJson(
  id: answeredPeerRequestId,
  person: kamalRef,
  status: 'submitted',
  open: false,
  answers: {
    'strengths': 'Plans the week well.',
    'improvements': 'Could walk the floor more.',
  },
  rating: 4,
  submittedAt: '2026-10-30T04:00:00.000Z',
);

Json peerInboxJson({bool withApproval = true}) => {
  'toAnswer': [peerRequestJson(), answeredPeerRequestJson()],
  'toApprove': [
    if (withApproval)
      {
        'id': peerApprovalId,
        'reviewId': teamReviewId,
        'person': nasimaRef,
        'peer': shirinRef,
        'cycle': {'id': annualCycleId, 'name': 'Annual review 2026'},
        'proposedAt': '2026-10-28T04:00:00.000Z',
      },
  ],
};
