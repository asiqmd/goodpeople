import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:good_people/api/api_models.dart';
import 'package:good_people/api/api_exception.dart';
import 'package:good_people/api/good_people_api.dart';
import 'package:good_people/app.dart';
import 'package:good_people/auth/auth_controller.dart';
import 'package:good_people/home/home_screen.dart';
import 'package:good_people/learning/learning_screen.dart';
import 'package:good_people/settings/locale_controller.dart';
import 'package:good_people/documents/file_opener.dart';
import 'package:good_people/notifications/notification_routes.dart';

import 'support/fake_api.dart';

final training = {
  'manage': false,
  'requirements': [
    {
      'course': {'name': 'Fire safety', 'nameBn': 'অগ্নি নিরাপত্তা'},
      'state': 'overdue',
      'dueOn': '2026-10-01',
    },
  ],
  'sessions': [
    {
      'id': 'session-1',
      'course': {
        'name': 'Fire safety session',
        'nameBn': 'অগ্নি নিরাপত্তা সেশন',
      },
      'startsAt': '2030-11-04T03:00:00Z',
      'venue': 'Training room',
      'status': 'planned',
      'myStatus': null,
      'canEnrol': true,
      'canWithdraw': false,
    },
  ],
  'certificates': [
    {
      'id': 'cert-1',
      'courseName': 'Health and safety',
      'courseNameBn': 'স্বাস্থ্য ও নিরাপত্তা',
      'completedOn': '2026-01-01',
      'expiresOn': '2026-12-31',
      'revokedAt': null,
    },
  ],
};
void main() {
  late FakeGoodPeopleApi api;
  late FakeFileOpener opener;
  setUp(() {
    api = FakeGoodPeopleApi()
      ..accessView = TenantAccessView.fromJson(
        accessJson(features: const ['core_hr', 'lms']),
      )
      ..learningMe = training;
    opener = FakeFileOpener();
  });
  Future<ProviderContainer> pump(
    WidgetTester tester, {
    bool bangla = false,
  }) async {
    tester.view.physicalSize = const Size(400, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final c = ProviderContainer.test(
      overrides: [
        goodPeopleApiProvider.overrideWithValue(api),
        fileOpenerProvider.overrideWithValue(opener),
      ],
    );
    await c
        .read(authProvider.notifier)
        .signIn(workspace: 'acme', email: 'rahima@acme.test', password: 'x');
    if (bangla) c.read(localeProvider.notifier).select(const Locale('bn'));
    await tester.pumpWidget(
      UncontrolledProviderScope(container: c, child: const GoodPeopleApp()),
    );
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(HomeScreen.learningKey));
    await tester.tap(find.byKey(HomeScreen.learningKey));
    await tester.pumpAndSettle();
    return c;
  }

  testWidgets(
    'home opens learning; self enrolment and withdrawal refresh the session',
    (tester) async {
      await pump(tester);
      expect(find.byType(LearningScreen), findsOneWidget);
      expect(find.textContaining('Overdue'), findsOneWidget);
      await tester.ensureVisible(find.text('Enrol me'));
      await tester.tap(find.text('Enrol me'));
      await tester.pumpAndSettle();
      expect(api.learningMoves, [(id: 'session-1', enrol: true)]);
      expect(find.text('Enrolled'), findsOneWidget);
      await tester.ensureVisible(find.text('Withdraw enrolment'));
      await tester.tap(find.text('Withdraw enrolment'));
      await tester.pumpAndSettle();
      expect(api.learningMoves.last, (id: 'session-1', enrol: false));
    },
  );
  testWidgets(
    'certificate download uses the current language and file opener',
    (tester) async {
      await pump(tester, bangla: true);
      expect(find.text('আমার প্রয়োজনীয় প্রশিক্ষণ'), findsOneWidget);
      expect(find.text('অগ্নি নিরাপত্তা'), findsOneWidget);
      await tester.ensureVisible(find.text('বাংলা পিডিএফ নামান'));
      await tester.tap(find.text('বাংলা পিডিএফ নামান'));
      await tester.pumpAndSettle();
      expect(api.learningDownloads, [
        (id: 'cert-1', language: LetterLanguage.bn),
      ]);
      expect(opener.opened.single.contentType, 'application/pdf');
    },
  );
  testWidgets(
    'read-only access disables enrolment while records remain readable',
    (tester) async {
      api.accessView = TenantAccessView.fromJson(
        accessJson(
          accessState: 'read_only',
          features: const ['core_hr', 'lms'],
        ),
      );
      await pump(tester);
      final button = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Enrol me'),
      );
      expect(button.onPressed, isNull);
      expect(find.text('Health and safety'), findsOneWidget);
    },
  );
  testWidgets('capacity refusal is localized and does not change enrolment', (
    tester,
  ) async {
    await pump(tester);
    api.learningError = const ApiException(
      kind: ApiErrorKind.server,
      statusCode: 409,
      code: 'learning_capacity',
      message: 'Full',
    );
    await tester.ensureVisible(find.text('Enrol me'));
    await tester.tap(find.text('Enrol me'));
    await tester.pumpAndSettle();
    expect(find.text('This session is full.'), findsOneWidget);
    expect(api.learningMoves, isEmpty);
  });
  test(
    'models reject missing required fields and learning notices open Learning',
    () {
      expect(
        () => LearningMe.fromJson({'manage': false}),
        throwsFormatException,
      );
      expect(
        notificationRoute(
          NotificationEvent.learningNotice,
          '/workspace/learning',
        ),
        isNotNull,
      );
      expect(
        NotificationEvent.fromWire('learning.notice'),
        NotificationEvent.learningNotice,
      );
    },
  );
}
