/// Documents and separations JSON exactly as the API contract shapes them,
/// for the seeded worker MG-0005 (Rahima Khatun). The tests fix "today" at
/// [leaveToday], Saturday 24 October 2026.
library;

import 'dart:convert';
import 'dart:typed_data';

import 'package:good_people/api/api_models.dart';

import 'attendance_fixtures.dart';
import 'leave_fixtures.dart';

/// The `employee` of document and separation views.
const rahimaRef = rahimaAttendance;

const appointmentLetterId = 'da000000-0000-4000-8000-000000000001';
const nidScanId = 'da000000-0000-4000-8000-000000000002';
const medicalCertificateId = 'da000000-0000-4000-8000-000000000003';
const policeVerificationId = 'da000000-0000-4000-8000-000000000004';
const passportId = 'da000000-0000-4000-8000-000000000005';

/// One `DocumentView`.
Json documentJson({
  required String id,
  required String title,
  String category = 'other',
  String fileName = 'document.pdf',
  String contentType = 'application/pdf',
  int sizeBytes = 48213,
  String source = 'upload',
  String? refNo,
  String? issuedOn,
  String? expiresOn,
  String? uploadedBy = 'Kamal Hossain',
  String createdAt = '2026-10-01T04:00:00.000Z',
}) => {
  'id': id,
  'employee': rahimaRef,
  'category': category,
  'title': title,
  'fileName': fileName,
  'contentType': contentType,
  'sizeBytes': sizeBytes,
  'source': source,
  'refNo': refNo,
  'issuedOn': issuedOn,
  'expiresOn': expiresOn,
  'visibleToEmployee': true,
  'uploadedBy': uploadedBy,
  'createdAt': createdAt,
};

/// `GET /tenant/me/documents` 200 body: a generated appointment letter, an
/// NID scan (a PNG), a medical certificate expiring within 60 days, a
/// police verification that has expired, and a passport good for years.
List<Json> myDocumentsJson() => [
  documentJson(
    id: medicalCertificateId,
    title: 'Fitness certificate',
    category: 'medical_certificate',
    fileName: 'fitness-2025.pdf',
    issuedOn: '2025-11-30',
    expiresOn: '2026-11-30',
  ),
  documentJson(
    id: policeVerificationId,
    title: 'Police clearance',
    category: 'police_verification',
    fileName: 'police-clearance.pdf',
    issuedOn: '2024-09-30',
    expiresOn: '2026-09-30',
  ),
  documentJson(
    id: passportId,
    title: 'My passport',
    category: 'passport',
    fileName: 'passport.pdf',
    issuedOn: '2022-06-01',
    expiresOn: '2032-05-31',
  ),
  documentJson(
    id: nidScanId,
    title: 'NID card (front)',
    category: 'nid',
    fileName: 'nid-front.png',
    contentType: 'image/png',
  ),
  documentJson(
    id: appointmentLetterId,
    title: 'Appointment letter',
    category: 'letter',
    fileName: 'appointment-letter.pdf',
    source: 'generated',
    refNo: 'MG/HR/2020/0005',
    issuedOn: '2020-03-01',
    uploadedBy: null,
    createdAt: '2020-03-01T04:00:00.000Z',
  ),
];

/// A 1×1 transparent PNG, a real image the engine can decode.
final tinyPng = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA'
  '60e6kgAAAABJRU5ErkJggg==',
);

/// The first bytes of a PDF, enough to stand for one.
final pdfBytes = Uint8List.fromList(utf8.encode('%PDF-1.7\n%test\n'));

/// What `GET /tenant/documents/{id}/file` answers for [myDocumentsJson].
Map<String, FileDownload> documentFiles() => {
  for (final json in myDocumentsJson())
    json['id']! as String: FileDownload(
      bytes: json['contentType'] == 'image/png' ? tinyPng : pdfBytes,
      contentType: json['contentType']! as String,
      fileName: json['fileName']! as String,
    ),
};

const pendingResignationId = 'db000000-0000-4000-8000-000000000001';
const cancelledResignationId = 'db000000-0000-4000-8000-000000000002';
const separationStepId = 'c0000000-0000-4000-8000-000000000020';

int _daysBetween(String from, String to) =>
    DateTime.parse('${to}T00:00:00Z')
        .difference(DateTime.parse('${from}T00:00:00Z'))
        .inDays;

/// One `SeparationView`. The shortfall is worked out as the API does.
Json separationJson({
  required String id,
  String type = 'resignation',
  String status = 'pending',
  String noticeDate = '2026-10-24',
  String lastWorkingDay = '2026-11-24',
  String reason = 'Moving back to my village to care for my mother',
  int? noticeDaysRequired = 60,
  String initiatedBy = 'employee',
  Json employee = rahimaRef,
  List<Json>? steps,
  String createdAt = '2026-10-24T04:00:00.000Z',
  String? decidedAt,
  String? completedAt,
}) => {
  'id': id,
  'employee': employee,
  'type': type,
  'status': status,
  'noticeDate': noticeDate,
  'lastWorkingDay': lastWorkingDay,
  'reason': reason,
  'noticeDaysRequired': noticeDaysRequired,
  'noticeShortfallDays': noticeDaysRequired == null
      ? 0
      : (noticeDaysRequired - _daysBetween(noticeDate, lastWorkingDay)).clamp(
          0,
          noticeDaysRequired,
        ),
  'initiatedBy': initiatedBy,
  'steps':
      steps ??
      [
        stepJson(id: '$id-1', stepNo: 1, approver: shirin),
        stepJson(id: '$id-2', stepNo: 2, kind: 'hr', status: 'waiting'),
      ],
  'createdAt': createdAt,
  'decidedAt': decidedAt,
  'completedAt': completedAt,
};

/// `GET /tenant/me/separations` 200 body: a resignation given today with a
/// month's notice, still at the manager step.
List<Json> pendingSeparationsJson() => [
  separationJson(id: pendingResignationId),
];

/// A resignation withdrawn in the spring: nothing open.
List<Json> closedSeparationsJson() => [
  separationJson(
    id: cancelledResignationId,
    status: 'cancelled',
    noticeDate: '2026-04-02',
    lastWorkingDay: '2026-06-01',
    reason: 'Offered a job in Narayanganj',
    steps: [
      stepJson(
        id: '$cancelledResignationId-1',
        stepNo: 1,
        approver: shirin,
        status: 'cancelled',
      ),
      stepJson(
        id: '$cancelledResignationId-2',
        stepNo: 2,
        kind: 'hr',
        status: 'cancelled',
      ),
    ],
    createdAt: '2026-04-02T04:00:00.000Z',
  ),
];

/// The resignation a manager sees in the inbox: Kulsum leaving with 31
/// days' notice where the Act asks for 60.
Json separationApprovalJson() => {
  'subjectType': 'separation',
  'stepId': separationStepId,
  'kind': 'manager',
  'separation': separationJson(
    id: 'db000000-0000-4000-8000-000000000010',
    reason: 'Getting married and moving to Sylhet',
    employee: const {
      'id': 'e0000000-0000-4000-8000-000000000003',
      'employeeCode': 'MG-0012',
      'fullName': 'Kulsum Akter',
      'fullNameBn': 'কুলসুম আক্তার',
    },
    steps: [
      stepJson(id: separationStepId, stepNo: 1, approver: shirin),
      stepJson(
        id: 'c0000000-0000-4000-8000-000000000021',
        stepNo: 2,
        kind: 'hr',
        status: 'waiting',
      ),
    ],
  ),
};
