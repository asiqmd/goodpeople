part of 'api_models.dart';

// ── Sign-in by code, the user's own account, and notifications (Phase 1) ───

/// `POST /auth/otp/request` 202 response. The API answers the same whether
/// or not the number has a login, so numbers cannot be probed.
class OtpRequestResult {
  const OtpRequestResult({required this.expiresInSeconds});

  factory OtpRequestResult.fromJson(Json json) =>
      OtpRequestResult(expiresInSeconds: _read<int>(json, 'expiresInSeconds'));

  /// How long the code works, if one was sent.
  final int expiresInSeconds;
}

/// The language notifications are written in for this login.
enum UserLanguage implements WireValue {
  en('en'),
  bn('bn'),
  unknown('unknown');

  const UserLanguage(this.wire);
  @override
  final String wire;

  static UserLanguage fromWire(String value) => _byWire(values, value, unknown);
}

/// Where a push token comes from, for `POST /account/devices`.
enum DevicePlatform implements WireValue {
  android('android'),
  ios('ios');

  const DevicePlatform(this.wire);
  @override
  final String wire;
}

/// `GET /account` 200 response (the API's `AccountView`), as far as the app
/// shows it. The API also sends `kind`, `recoveryCodesLeft` and
/// `permissions`; the app does not use them.
class AccountView {
  const AccountView({
    required this.id,
    required this.name,
    required this.role,
    required this.language,
    required this.hasPassword,
    required this.mfaEnabled,
    required this.mfaRequired,
    this.email,
    this.phone,
  });

  factory AccountView.fromJson(Json json) => AccountView(
    id: _read<String>(json, 'id'),
    name: _read<String>(json, 'name'),
    email: _read<String?>(json, 'email'),
    phone: _read<String?>(json, 'phone'),
    role: UserRole.fromWire(_read<String>(json, 'role')),
    language: UserLanguage.fromWire(_read<String>(json, 'language')),
    hasPassword: _read<bool>(json, 'hasPassword'),
    mfaEnabled: _read<bool>(json, 'mfaEnabled'),
    mfaRequired: _read<bool?>(json, 'mfaRequired') ?? false,
  );

  final String id;
  final String name;
  final String? email;

  /// E.164, for example `+8801712345678`.
  final String? phone;
  final UserRole role;
  final UserLanguage language;

  /// Signs in with a password; a login with only a mobile number uses SMS
  /// codes and has none to change.
  final bool hasPassword;
  final bool mfaEnabled;

  /// The server requires two-step sign-in for this role.
  final bool mfaRequired;
}

/// What a notification is about.
enum NotificationEvent implements WireValue {
  /// A request waits for the user's decision.
  approvalRequested('approval.requested'),

  /// The user's own request was approved or rejected.
  approvalDecided('approval.decided'),
  documentExpiring('document.expiring'),
  probationEnding('probation.ending'),
  letterIssued('letter.issued'),

  /// Yesterday has only one punch.
  missingPunch('attendance.missing_punch'),

  /// A payroll run was locked and the user's payslip published.
  payslipPublished('payslip.published'),
  unknown('unknown');

  const NotificationEvent(this.wire);
  @override
  final String wire;

  static NotificationEvent fromWire(String value) =>
      _byWire(values, value, unknown);
}

/// One item in the inbox (the API's `NotificationView`). [title] and
/// [body] arrive already in the user's language.
///
/// Not called `Notification`, which would clash with Flutter's.
class InboxNotification {
  const InboxNotification({
    required this.id,
    required this.event,
    required this.title,
    required this.body,
    required this.createdAt,
    this.link,
    this.readAt,
  });

  factory InboxNotification.fromJson(Json json) => InboxNotification(
    id: _read<String>(json, 'id'),
    event: NotificationEvent.fromWire(_read<String>(json, 'event')),
    title: _read<String>(json, 'title'),
    body: _read<String>(json, 'body'),
    link: _read<String?>(json, 'link'),
    readAt: _readOptionalTimestamp(json, 'readAt'),
    createdAt: _readTimestamp(json, 'createdAt'),
  );

  final String id;
  final NotificationEvent event;
  final String title;
  final String body;

  /// A path in the web app, for example `/workspace/leave`. The app uses it
  /// to tell what a decided approval was about.
  final String? link;
  final DateTime? readAt;
  final DateTime createdAt;

  bool get isRead => readAt != null;

  InboxNotification markedRead(DateTime at) => InboxNotification(
    id: id,
    event: event,
    title: title,
    body: body,
    link: link,
    readAt: readAt ?? at,
    createdAt: createdAt,
  );
}

/// `GET /tenant/notifications` 200 response: the latest 50, newest first,
/// and how many are unread in all.
class NotificationInbox {
  const NotificationInbox({required this.unread, required this.items});

  factory NotificationInbox.fromJson(Json json) => NotificationInbox(
    unread: _read<int>(json, 'unread'),
    items: _readList(json, 'items', InboxNotification.fromJson),
  );

  static const empty = NotificationInbox(unread: 0, items: []);

  final int unread;
  final List<InboxNotification> items;

  /// The inbox with [id] read, as the server will have it.
  NotificationInbox withRead(String id, DateTime at) {
    final index = items.indexWhere((item) => item.id == id);
    if (index < 0 || items[index].isRead) return this;
    return NotificationInbox(
      unread: math.max(0, unread - 1),
      items: [...items]..[index] = items[index].markedRead(at),
    );
  }

  /// The inbox with everything read.
  NotificationInbox allRead(DateTime at) => NotificationInbox(
    unread: 0,
    items: [for (final item in items) item.markedRead(at)],
  );
}
