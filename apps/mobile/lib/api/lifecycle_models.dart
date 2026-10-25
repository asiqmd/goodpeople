part of 'api_models.dart';

// ── Documents and lifecycle (Phase 1): my documents, my service book, ──────
// ── resigning ────────────────────────────────────────────────────────────────
//
// Part of `core_hr`, which every workspace has. Calendar dates are UTC
// midnight, as everywhere else.

/// What a document is. `letter` is made by the letters module and
/// `punch_selfie` by a selfie punch; HR uploads the rest.
enum DocumentCategory implements WireValue {
  photo('photo'),
  nid('nid'),
  birthCertificate('birth_certificate'),
  passport('passport'),
  educationalCertificate('educational_certificate'),
  experienceCertificate('experience_certificate'),
  appointmentLetter('appointment_letter'),
  contract('contract'),
  medicalCertificate('medical_certificate'),
  policeVerification('police_verification'),
  nomineeForm('nominee_form'),
  letter('letter'),
  punchSelfie('punch_selfie'),
  other('other'),
  unknown('unknown');

  const DocumentCategory(this.wire);
  @override
  final String wire;

  static DocumentCategory fromWire(String value) =>
      _byWire(values, value, unknown);
}

/// An uploaded file, or a letter the system generated.
enum DocumentSource implements WireValue {
  upload('upload'),
  generated('generated'),
  unknown('unknown');

  const DocumentSource(this.wire);
  @override
  final String wire;

  static DocumentSource fromWire(String value) =>
      _byWire(values, value, unknown);
}

/// How close a document is to its expiry date.
enum DocumentExpiry { none, soon, expired }

/// `GET /tenant/me/documents` item (the API's `DocumentView`): a file HR
/// shared with the employee. Punch selfies are never in that list.
class EmployeeDocument {
  const EmployeeDocument({
    required this.id,
    required this.employee,
    required this.category,
    required this.title,
    required this.fileName,
    required this.contentType,
    required this.sizeBytes,
    required this.source,
    required this.visibleToEmployee,
    required this.createdAt,
    this.refNo,
    this.issuedOn,
    this.expiresOn,
    this.uploadedBy,
  });

  factory EmployeeDocument.fromJson(Json json) => EmployeeDocument(
    id: _read<String>(json, 'id'),
    employee: EmployeeRef.fromJson(_read<Json>(json, 'employee')),
    category: DocumentCategory.fromWire(_read<String>(json, 'category')),
    title: _read<String>(json, 'title'),
    fileName: _read<String>(json, 'fileName'),
    contentType: _read<String>(json, 'contentType'),
    sizeBytes: _read<int>(json, 'sizeBytes'),
    source: DocumentSource.fromWire(_read<String>(json, 'source')),
    refNo: _read<String?>(json, 'refNo'),
    issuedOn: _readOptionalDate(json, 'issuedOn'),
    expiresOn: _readOptionalDate(json, 'expiresOn'),
    visibleToEmployee: _read<bool>(json, 'visibleToEmployee'),
    uploadedBy: _read<String?>(json, 'uploadedBy'),
    createdAt: _readTimestamp(json, 'createdAt'),
  );

  /// Documents expiring within this many days are flagged, as on the web.
  static const expirySoonDays = 60;

  final String id;
  final EmployeeRef employee;
  final DocumentCategory category;
  final String title;
  final String fileName;

  /// `application/pdf`, `image/jpeg`, `image/png` or `image/webp`.
  final String contentType;
  final int sizeBytes;
  final DocumentSource source;

  /// The letter's reference number, for generated letters.
  final String? refNo;
  final DateTime? issuedOn;
  final DateTime? expiresOn;
  final bool visibleToEmployee;

  /// Name of the user who uploaded it.
  final String? uploadedBy;
  final DateTime createdAt;

  bool get isImage => contentType.startsWith('image/');

  /// Expired before [today], expiring within [expirySoonDays] of it, or
  /// neither (including no expiry date).
  DocumentExpiry expiryOn(DateTime today) {
    final expires = expiresOn;
    if (expires == null) return DocumentExpiry.none;
    if (expires.isBefore(today)) return DocumentExpiry.expired;
    final soon = today.add(const Duration(days: expirySoonDays));
    return expires.isAfter(soon) ? DocumentExpiry.none : DocumentExpiry.soon;
  }
}

/// A file the API answered with: a document, the service book or a
/// payslip.
class FileDownload {
  const FileDownload({
    required this.bytes,
    required this.contentType,
    this.fileName,
  });

  final Uint8List bytes;

  /// The media type without parameters, for example `application/pdf`.
  final String contentType;

  /// From `Content-Disposition`, when the API sent one.
  final String? fileName;
}

/// The file name in a `Content-Disposition` header: `filename*` (UTF-8,
/// percent-encoded) when present, else `filename`.
String? fileNameFromDisposition(String? header) {
  if (header == null) return null;
  final extended = RegExp(
    r"filename\*\s*=\s*UTF-8''([^;]+)",
    caseSensitive: false,
  ).firstMatch(header);
  if (extended != null) {
    try {
      return Uri.decodeComponent(extended[1]!.trim());
    } on ArgumentError {
      // A bad percent escape: fall back to the plain name.
    } on FormatException {
      // Not UTF-8 after all: fall back to the plain name.
    }
  }
  final plain = RegExp(
    r'filename\s*=\s*"([^"]*)"|filename\s*=\s*([^;]+)',
    caseSensitive: false,
  ).firstMatch(header);
  final name = (plain?[1] ?? plain?[2])?.trim();
  return name == null || name.isEmpty ? null : name;
}

/// The language a letter, the service book or a payslip is printed in.
enum LetterLanguage implements WireValue {
  en('en'),
  bn('bn');

  const LetterLanguage(this.wire);
  @override
  final String wire;
}

/// How employment ends, in the Labour Act's own terms (ss.19–28).
enum SeparationType implements WireValue {
  resignation('resignation'),
  termination('termination'),
  dismissal('dismissal'),
  discharge('discharge'),
  retrenchment('retrenchment'),
  retirement('retirement'),
  death('death'),
  contractEnd('contract_end'),
  unknown('unknown');

  const SeparationType(this.wire);
  @override
  final String wire;

  static SeparationType fromWire(String value) =>
      _byWire(values, value, unknown);
}

/// `approved`: decided, waiting for the last working day. `completed`: the
/// employee has left.
enum SeparationStatus implements WireValue {
  pending('pending'),
  approved('approved'),
  completed('completed'),
  rejected('rejected'),
  cancelled('cancelled'),
  unknown('unknown');

  const SeparationStatus(this.wire);
  @override
  final String wire;

  static SeparationStatus fromWire(String value) =>
      _byWire(values, value, unknown);
}

/// Who started a separation: the employee resigning, or HR recording it.
enum SeparationInitiator implements WireValue {
  employee('employee'),
  hr('hr'),
  unknown('unknown');

  const SeparationInitiator(this.wire);
  @override
  final String wire;

  static SeparationInitiator fromWire(String value) =>
      _byWire(values, value, unknown);
}

/// A resignation or another way employment ends (the API's
/// `SeparationView`).
class Separation {
  const Separation({
    required this.id,
    required this.employee,
    required this.type,
    required this.status,
    required this.noticeDate,
    required this.lastWorkingDay,
    required this.reason,
    required this.noticeShortfallDays,
    required this.initiatedBy,
    required this.steps,
    required this.createdAt,
    this.noticeDaysRequired,
    this.decidedAt,
    this.completedAt,
  });

  factory Separation.fromJson(Json json) => Separation(
    id: _read<String>(json, 'id'),
    employee: EmployeeRef.fromJson(_read<Json>(json, 'employee')),
    type: SeparationType.fromWire(_read<String>(json, 'type')),
    status: SeparationStatus.fromWire(_read<String>(json, 'status')),
    noticeDate: _readDate(json, 'noticeDate'),
    lastWorkingDay: _readDate(json, 'lastWorkingDay'),
    reason: _read<String>(json, 'reason'),
    noticeDaysRequired: _read<int?>(json, 'noticeDaysRequired'),
    noticeShortfallDays: _read<int>(json, 'noticeShortfallDays'),
    initiatedBy: SeparationInitiator.fromWire(
      _read<String>(json, 'initiatedBy'),
    ),
    steps: _readList(json, 'steps', ApprovalStep.fromJson),
    createdAt: _readTimestamp(json, 'createdAt'),
    decidedAt: _readOptionalTimestamp(json, 'decidedAt'),
    completedAt: _readOptionalTimestamp(json, 'completedAt'),
  );

  final String id;
  final EmployeeRef employee;
  final SeparationType type;
  final SeparationStatus status;

  /// The day notice was given: the day of a resignation.
  final DateTime noticeDate;
  final DateTime lastWorkingDay;
  final String reason;

  /// The notice the Labour Act asks for this separation, or `null` when it
  /// asks for none.
  final int? noticeDaysRequired;

  /// Days short of that notice. Wages in lieu may apply, settled by payroll.
  final int noticeShortfallDays;
  final SeparationInitiator initiatedBy;

  /// In step order. Empty for what HR records, which needs no approval.
  final List<ApprovalStep> steps;
  final DateTime createdAt;
  final DateTime? decidedAt;
  final DateTime? completedAt;

  /// Days from the notice to the last working day, as the API counts them.
  int get noticeGivenDays => lastWorkingDay.difference(noticeDate).inDays;

  /// Pending or approved: still going, so no new resignation is possible.
  bool get isOpen =>
      status == SeparationStatus.pending || status == SeparationStatus.approved;

  /// The employee can withdraw only a pending resignation.
  bool get canCancel => status == SeparationStatus.pending;
}

/// `POST /tenant/me/resignation` body. Notice is given today, by the API.
class ResignationDraft {
  const ResignationDraft({required this.lastWorkingDay, required this.reason});

  final DateTime lastWorkingDay;
  final String reason;

  Json toJson() => {
    'lastWorkingDay': toWireDate(lastWorkingDay),
    'reason': reason,
  };
}
