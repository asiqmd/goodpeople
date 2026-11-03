import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:good_people/api/api_models.dart';
import 'package:good_people/api/api_exception.dart';
import 'package:good_people/api/good_people_api.dart';
import 'package:good_people/app.dart';
import 'package:good_people/auth/auth_controller.dart';
import 'package:good_people/employee_services/engagement_screen.dart';
import 'package:good_people/employee_services/employee_services_screen.dart';
import 'package:good_people/home/home_screen.dart';
import 'package:good_people/notifications/notification_routes.dart';
import 'package:good_people/settings/locale_controller.dart';

import 'support/fake_api.dart';
import 'support/employee_service_fixtures.dart';

void main() {
  late FakeGoodPeopleApi api;
  setUp(() {
    api = FakeGoodPeopleApi()
      ..engagement = engagementJson()
      ..employeeServices = employeeServicesJson()
      ..accessView = TenantAccessView.fromJson(
        accessJson(features: const ['core_hr']),
      );
  });
  Future<void> open(
    WidgetTester tester, {
    bool services = false,
    bool bangla = false,
  }) async {
    tester.view.physicalSize = const Size(430, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final container = ProviderContainer.test(
      overrides: [goodPeopleApiProvider.overrideWithValue(api)],
    );
    await container
        .read(authProvider.notifier)
        .signIn(workspace: 'acme', email: 'rahima@acme.test', password: 'x');
    if (bangla) {
      container.read(localeProvider.notifier).select(const Locale('bn'));
    }
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const GoodPeopleApp(),
      ),
    );
    await tester.pumpAndSettle();
    final shortcut = find.byKey(
      services ? HomeScreen.employeeServicesKey : HomeScreen.engagementKey,
    );
    await tester.ensureVisible(shortcut);
    await tester.tap(shortcut);
    await tester.pumpAndSettle();
  }

  Future<void> select(WidgetTester tester, String field, String value) async {
    final target = find.byKey(ValueKey('service-field-$field'));
    await tester.ensureVisible(target);
    await tester.tap(target);
    await tester.pumpAndSettle();
    await tester.tap(find.text(value).last);
    await tester.pumpAndSettle();
  }

  Future<void> submit(WidgetTester tester, String label) async {
    final button = find.widgetWithText(FilledButton, label).last;
    await tester.ensureVisible(button);
    await tester.tap(button);
    await tester.pumpAndSettle();
  }

  testWidgets(
    'policy opens in Bangla, shows full wording and records the employee receipt',
    (tester) async {
      await open(tester, bangla: true);
      expect(find.byType(EngagementScreen), findsOneWidget);
      await tester.tap(find.text('সরঞ্জামের নীতিমালা'));
      await tester.pumpAndSettle();
      expect(find.text('সরঞ্জামের যত্নের নীতিমালা পড়ুন।'), findsOneWidget);
      await submit(tester, 'আমি নোটিশটি পড়েছি');
      expect(api.serviceCalls.single.path, 'notice/notice-1');
      expect(find.text('প্রাপ্তি স্বীকৃত'), findsWidgets);
    },
  );
  testWidgets(
    'anonymous survey requires every answer and submits scores without an employee identifier',
    (tester) async {
      await open(tester);
      await tester.tap(find.text('Surveys and eNPS'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Anonymous pulse'));
      await tester.pumpAndSettle();
      await submit(tester, 'Submit anonymous response');
      await submit(tester, 'Submit anonymous response');
      expect(api.serviceCalls, isEmpty);
      await select(tester, 'enps', '9');
      await select(tester, 'q0', '4');
      await submit(tester, 'Submit anonymous response');
      expect(api.serviceCalls.single.path, 'survey/survey-1');
      expect(api.serviceCalls.single.body, {
        'enps': 9,
        'scores': [4],
      });
      expect(
        find.text('Your anonymous response has been recorded.'),
        findsOneWidget,
      );
    },
  );
  testWidgets(
    'recognition composer clearly states company visibility and sends a colleague message',
    (tester) async {
      await open(tester);
      await tester.ensureVisible(find.text('Recognition'));
      await tester.tap(find.text('Recognition'));
      await tester.pumpAndSettle();
      await submit(tester, 'Recognize a colleague');
      expect(
        find.text(
          'Your name and message will be visible to colleagues in your company.',
        ),
        findsWidgets,
      );
      await tester.enterText(
        find.byKey(const ValueKey('service-field-employeeCode')),
        'MG-0006',
      );
      await select(tester, 'value', 'Teamwork');
      await tester.enterText(
        find.byKey(const ValueKey('service-field-message')),
        'Thank you for helping our team.',
      );
      await submit(tester, 'Recognize a colleague');
      expect(api.serviceCalls.single.body, {
        'employeeCode': 'MG-0006',
        'value': 'teamwork',
        'message': 'Thank you for helping our team.',
      });
    },
  );
  testWidgets(
    'private request hides internal notes, sends replies and allows own closure and reopening',
    (tester) async {
      await open(tester, services: true);
      expect(find.byType(EmployeeServicesScreen), findsOneWidget);
      await tester.tap(find.text('Employment letter'));
      await tester.pumpAndSettle();
      expect(find.text('Internal confidential note'), findsNothing);
      expect(find.text('Please prepare my letter.'), findsOneWidget);
      await submit(tester, 'Send reply');
      await tester.enterText(
        find.byKey(const ValueKey('service-field-text')),
        'Thank you, I received it.',
      );
      await submit(tester, 'Send reply');
      expect(find.text('Thank you, I received it.'), findsOneWidget);
      await tester.tap(find.text('Close resolved request'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('service-field-text')),
        'Received and checked.',
      );
      await submit(tester, 'Close resolved request');
      expect(find.widgetWithText(FilledButton, 'Send reply'), findsNothing);
      await tester.tap(find.text('Reopen request'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('service-field-text')),
        'Please correct the issue date.',
      );
      await submit(tester, 'Reopen request');
      expect(api.serviceCalls.last.body['status'], 'open');
    },
  );
  testWidgets('asset receipt refreshes own issue history', (tester) async {
    await open(tester, services: true);
    await tester.tap(find.text('My issued assets'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('GP-ID-01 · Staff ID card'));
    await tester.pumpAndSettle();
    await submit(tester, 'I received this asset');
    expect(api.serviceCalls.single.path, 'asset/issue-1');
    expect(find.text('Acknowledged'), findsOneWidget);
  });
  testWidgets(
    'read-only workspaces keep records visible and disable employee service writes',
    (tester) async {
      api.accessView = TenantAccessView.fromJson(
        accessJson(accessState: 'read_only', features: const ['core_hr']),
      );
      await open(tester, services: true);
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Open HR request'),
            )
            .onPressed,
        isNull,
      );
      await tester.tap(find.text('My issued assets'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('GP-ID-01 · Staff ID card'));
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'I received this asset'),
            )
            .onPressed,
        isNull,
      );
    },
  );
  testWidgets(
    'private request creation keeps typed text on refusal and opens the created request after retry',
    (tester) async {
      await open(tester, services: true);
      await submit(tester, 'Open HR request');
      await select(tester, 'category', 'Letters');
      await select(tester, 'priority', 'Normal');
      await tester.enterText(
        find.byKey(const ValueKey('service-field-subject')),
        'A new employment letter',
      );
      await tester.enterText(
        find.byKey(const ValueKey('service-field-body')),
        'Please prepare a letter for my bank.',
      );
      api.serviceError = const ApiException(
        kind: ApiErrorKind.server,
        statusCode: 409,
        code: 'hr_request_closed',
        message: 'Closed',
      );
      await submit(tester, 'Open HR request');
      expect(find.text('A new employment letter'), findsOneWidget);
      expect(find.text('Please prepare a letter for my bank.'), findsOneWidget);
      expect(api.serviceCalls, isEmpty);
      api.serviceError = null;
      await submit(tester, 'Open HR request');
      expect(find.byType(HrRequestScreen), findsOneWidget);
      expect(find.text('A new employment letter'), findsOneWidget);
      expect(api.serviceCalls.single.path, 'request');
    },
  );
  testWidgets(
    'a survey closed during entry preserves selected answers and shows the localized refusal',
    (tester) async {
      await open(tester);
      await tester.tap(find.text('Surveys and eNPS'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Anonymous pulse'));
      await tester.pumpAndSettle();
      await submit(tester, 'Submit anonymous response');
      await select(tester, 'enps', '9');
      await select(tester, 'q0', '4');
      api.serviceError = const ApiException(
        kind: ApiErrorKind.server,
        statusCode: 409,
        code: 'survey_closed',
        message: 'Closed',
      );
      await submit(tester, 'Submit anonymous response');
      expect(find.text('The survey is closed.'), findsOneWidget);
      expect(
        tester
            .state<FormFieldState<String>>(
              find.byKey(const ValueKey('service-field-enps')),
            )
            .value,
        '9',
      );
      expect(
        tester
            .state<FormFieldState<String>>(
              find.byKey(const ValueKey('service-field-q0')),
            )
            .value,
        '4',
      );
      expect(api.serviceCalls, isEmpty);
    },
  );
  test('strict service models and notification targets handle employee-service events', () {
    expect(
      () => EngagementOverview.fromJson({'manage': false}),
      throwsFormatException,
    );
    expect(
      () => EmployeeServicesOverview.fromJson({'manage': false}),
      throwsFormatException,
    );
    expect(
      NotificationEvent.fromWire('engagement.notice'),
      NotificationEvent.engagementNotice,
    );
    expect(
      notificationRoute(
        NotificationEvent.engagementNotice,
        '/workspace/engagement/surveys/id',
      ),
      isNotNull,
    );
    expect(
      notificationRoute(
        NotificationEvent.servicesNotice,
        '/workspace/employee-services/requests/id',
      ),
      isNotNull,
    );
    expect(
      notificationRoute(
        NotificationEvent.servicesNotice,
        '/workspace/employee-services/assets',
      ),
      isNotNull,
    );
  });
}
