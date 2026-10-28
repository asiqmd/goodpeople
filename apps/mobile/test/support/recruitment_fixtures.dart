import 'package:good_people/api/api_models.dart';

// Recruitment as the API contract shapes it (`packages/shared/src/
// openings.ts`, `offers.ts` and `applications.ts`): an opening and an offer
// waiting in the approvals inbox, and an interviewer's interviews.

const openingStepId = 'c0000000-0000-4000-8000-000000000041';
const offerStepId = 'c0000000-0000-4000-8000-000000000042';

/// Coming up: a video interview of Farhana on Thursday 29 October 2026,
/// 10:00 to 11:00 Bangladesh time, without a scorecard yet.
const upcomingInterviewId = 'f1000000-0000-4000-8000-000000000001';

/// Over, in person, with the login's scorecard in.
const pastInterviewId = 'f1000000-0000-4000-8000-000000000002';

/// Cancelled, by phone.
const cancelledInterviewId = 'f1000000-0000-4000-8000-000000000003';

const interviewApplicationId = 'a9000000-0000-4000-8000-000000000001';

const scorecardCriteria = ['Skills for the job', 'Experience', 'Communication'];

const _shirin = {
  'id': 'e0000000-0000-4000-8000-000000000004',
  'employeeCode': 'MG-0004',
  'fullName': 'Shirin Akter',
  'fullNameBn': 'শিরিন আক্তার',
};

Json _step({
  required String id,
  required int stepNo,
  required String kind,
  required String status,
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

/// An opening for two permanent line supervisors replacing Abdul Karim,
/// budgeted at Tk 30,000 to 40,000 a month, waiting for the hiring
/// manager's line manager. Its first round was rejected.
Json openingApprovalJson({String stepId = openingStepId}) => {
  'subjectType': 'job_opening',
  'stepId': stepId,
  'kind': 'manager',
  'opening': {
    'id': 'b7000000-0000-4000-8000-000000000001',
    'status': 'pending_approval',
    'title': 'Line supervisor',
    'legalEntity': {
      'id': 'a1b2c3d4-0000-4000-8000-000000000001',
      'name': 'My Group Textiles Ltd',
    },
    'orgUnit': {
      'id': 'a1b2c3d4-0000-4000-8000-000000000003',
      'name': 'Sewing floor 2',
    },
    'location': {
      'id': 'a1b2c3d4-0000-4000-8000-000000000002',
      'name': 'Gazipur Factory',
    },
    'designation': {
      'id': 'a1b2c3d4-0000-4000-8000-000000000004',
      'name': 'Line Supervisor',
    },
    'grade': null,
    'employmentType': 'permanent',
    'headcount': 2,
    'reason': 'replacement',
    'replaces': {
      'id': 'e0000000-0000-4000-8000-000000000007',
      'employeeCode': 'MG-0007',
      'fullName': 'Abdul Karim',
      'fullNameBn': 'আবদুল করিম',
    },
    'budgetMin': '30000.00',
    'budgetMax': '40000.00',
    'justification':
        'Two supervisors left in September; lines 3 and 4 run '
        'without one.',
    'hiringManager': _shirin,
    'scorecardCriteria': scorecardCriteria,
    'postTitleEn': null,
    'postTitleBn': null,
    'descriptionEn': null,
    'descriptionBn': null,
    'showSalary': false,
    'closesOn': null,
    'publishedAt': null,
    'closedAt': null,
    'createdBy': {
      'id': '5f0c6c1e-2b7a-4c55-9d3e-0a8f3b1d2c09',
      'name': 'Nasrin Sultana',
    },
    'createdAt': '2026-10-20T04:00:00.000Z',
    'updatedAt': '2026-10-26T04:00:00.000Z',
    'steps': [
      _step(
        id: 'd0000000-0000-4000-8000-000000000040',
        stepNo: -1,
        kind: 'manager',
        status: 'rejected',
        approver: {
          'id': 'e0000000-0000-4000-8000-000000000001',
          'fullName': 'Kamal Hossain',
        },
        decidedBy: 'Kamal Hossain',
        decidedAt: '2026-10-22T05:00:00.000Z',
        comment: 'The budget is too high',
      ),
      _step(
        id: stepId,
        stepNo: 1,
        kind: 'manager',
        status: 'pending',
        approver: {
          'id': 'e0000000-0000-4000-8000-000000000001',
          'fullName': 'Kamal Hossain',
        },
      ),
      _step(
        id: 'd0000000-0000-4000-8000-000000000041',
        stepNo: 2,
        kind: 'hr',
        status: 'waiting',
      ),
    ],
    'counts': {
      'applied': 0,
      'screening': 0,
      'interview': 0,
      'offer': 0,
      'hired': 0,
      'rejected': 0,
      'withdrawn': 0,
    },
    'applications': 0,
  },
};

/// An offer to Farhana of Tk 45,000 a month, above the opening's budget of
/// Tk 40,000, waiting for HR.
Json offerApprovalJson({String stepId = offerStepId}) => {
  'subjectType': 'offer',
  'stepId': stepId,
  'kind': 'hr',
  'offer': {
    'id': 'b8000000-0000-4000-8000-000000000001',
    'applicationId': interviewApplicationId,
    'status': 'pending_approval',
    'candidate': {
      'id': 'b9000000-0000-4000-8000-000000000001',
      'fullName': 'Farhana Yasmin',
      'email': 'farhana@example.com',
      'phone': '+8801711000001',
      'language': 'bn',
    },
    'opening': {
      'id': 'b7000000-0000-4000-8000-000000000001',
      'title': 'Line supervisor',
      'status': 'open',
      'headcount': 2,
      'budgetMin': '30000.00',
      'budgetMax': '40000.00',
    },
    'legalEntity': {
      'id': 'a1b2c3d4-0000-4000-8000-000000000001',
      'name': 'My Group Textiles Ltd',
      'nameBn': null,
    },
    'orgUnit': {
      'id': 'a1b2c3d4-0000-4000-8000-000000000003',
      'name': 'Sewing floor 2',
      'nameBn': null,
    },
    'location': null,
    'designation': {
      'id': 'a1b2c3d4-0000-4000-8000-000000000004',
      'name': 'Line Supervisor',
      'nameBn': 'লাইন সুপারভাইজার',
    },
    'grade': null,
    'employmentType': 'permanent',
    'joiningOn': '2026-12-01',
    'monthlyGross': '45000.00',
    'probationMonths': 6,
    'expiresOn': '2026-11-15',
    'language': 'bn',
    'terms': null,
    'aboveBudget': true,
    'sentAt': null,
    'decidedAt': null,
    'acceptedName': null,
    'acceptedIp': null,
    'declineReason': null,
    'letterSha256': null,
    'employeeId': null,
    'createdBy': 'Nasrin Sultana',
    'createdAt': '2026-10-27T04:00:00.000Z',
    'steps': [_step(id: stepId, stepNo: 1, kind: 'hr', status: 'pending')],
  },
};

Json recruitmentMeJson({int interviews = 2}) => {
  'manage': false,
  'hiringManager': false,
  'interviews': interviews,
};

const _opening = {
  'id': 'b7000000-0000-4000-8000-000000000001',
  'title': 'Line supervisor',
  'postTitleEn': 'Line Supervisor (Sewing)',
  'postTitleBn': 'লাইন সুপারভাইজার (সেলাই)',
};

Json interviewItemJson({
  String id = upcomingInterviewId,
  String kind = 'video',
  String startsAt = '2026-10-29T04:00:00.000Z',
  String endsAt = '2026-10-29T05:00:00.000Z',
  String? location,
  String? meetingUrl = 'https://meet.example.com/abc-defg-hij',
  String status = 'scheduled',
  String candidateName = 'Farhana Yasmin',
  bool submitted = false,
}) => {
  'id': id,
  'kind': kind,
  'startsAt': startsAt,
  'endsAt': endsAt,
  'location': location,
  'meetingUrl': meetingUrl,
  'status': status,
  'candidateName': candidateName,
  'opening': _opening,
  'submitted': submitted,
};

Json pastInterviewJson() => interviewItemJson(
  id: pastInterviewId,
  kind: 'in_person',
  startsAt: '2026-10-20T08:30:00.000Z',
  endsAt: '2026-10-20T09:00:00.000Z',
  location: 'Gazipur Factory, meeting room 2',
  meetingUrl: null,
  status: 'completed',
  candidateName: 'Mizanur Rahman',
  submitted: true,
);

Json cancelledInterviewJson() => interviewItemJson(
  id: cancelledInterviewId,
  kind: 'phone',
  startsAt: '2026-10-18T06:00:00.000Z',
  endsAt: '2026-10-18T06:30:00.000Z',
  location: 'HR calls the candidate',
  meetingUrl: null,
  status: 'cancelled',
  candidateName: 'Rokeya Begum',
);

/// `GET /tenant/interviews`: one to come, two past (latest first).
Json myInterviewsJson() => {
  'upcoming': [interviewItemJson()],
  'past': [pastInterviewJson(), cancelledInterviewJson()],
};

Json scorecardJson({
  Map<String, int> ratings = const {
    'Skills for the job': 4,
    'Experience': 3,
    'Communication': 5,
  },
  String recommendation = 'yes',
  String? feedback = 'Knows line balancing well.',
  String submittedAt = '2026-10-29T05:30:00.000Z',
}) => {
  'ratings': ratings,
  'recommendation': recommendation,
  'feedback': feedback,
  'submittedAt': submittedAt,
};

/// Shirin's scorecard, which the login sees once theirs is in.
Json shirinScorecardJson() => {
  'employee': _shirin,
  'scorecard': scorecardJson(
    ratings: const {
      'Skills for the job': 5,
      'Experience': 4,
      'Communication': 4,
    },
    recommendation: 'strong_yes',
    feedback: 'Ran two lines at her last factory.',
    submittedAt: '2026-10-29T05:15:00.000Z',
  ),
};

/// `GET /tenant/interviews/{id}` for [item]: the CV, HR's notes and the
/// candidate's note, the criteria and, with [mine], the login's scorecard.
Json interviewDetailJson({
  Json? item,
  Json? mine,
  List<Json> others = const [],
  bool scorable = true,
  bool hasCv = true,
  List<Json>? panel,
}) {
  final base = item ?? interviewItemJson();
  return {
    ...base,
    'submitted': mine != null,
    'applicationId': interviewApplicationId,
    'notes': 'Ask about line balancing.',
    'hasCv': hasCv,
    'coverNote': 'I have run two lines at another factory for three years.',
    'criteria': scorecardCriteria,
    'scorable': scorable,
    'mine': mine,
    // The API sends the others only once the login's scorecard is in.
    'others': mine == null ? <Json>[] : others,
    'panel': ?panel,
  };
}

/// The panel as an interview's `panel` would list it.
List<Json> panelJson() => [
  {'employee': _shirin, 'submitted': true},
  {
    'employee': {
      'id': 'e0000000-0000-4000-8000-000000000005',
      'employeeCode': 'MG-0005',
      'fullName': 'Rahima Khatun',
      'fullNameBn': 'রহিমা খাতুন',
    },
    'submitted': false,
  },
];
