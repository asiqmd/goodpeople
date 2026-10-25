import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:good_people/api/api_exception.dart';
import 'package:good_people/api/api_models.dart';
import 'package:good_people/api/good_people_api.dart';
import 'package:good_people/app.dart';
import 'package:good_people/attendance/offline_punch_queue.dart';
import 'package:good_people/auth/auth_controller.dart';
import 'package:good_people/documents/file_opener.dart';
import 'package:good_people/home/home_screen.dart';
import 'package:good_people/leave/leave_providers.dart';
import 'package:good_people/notifications/inbox_screen.dart';
import 'package:good_people/notifications/push_service.dart';
import 'package:good_people/payslips/my_pay_screen.dart';
import 'package:good_people/payslips/payslips_tab.dart';
import 'package:good_people/settings/locale_controller.dart';

import 'support/fake_api.dart';

void main() {
  late FakeFileOpener opener;

  setUp(() => opener = FakeFileOpener());

  /// Signs in through the fake API with "today" fixed at [leaveToday] and
  /// [opener] as the phone's viewer, shows the app in [locale] and, if
  /// [open], opens My pay (on Payslips) from the home screen. The screen is
  /// phone-width, so overflow fails the test.
  Future<ProviderContainer> pumpPayslips(
    WidgetTester tester,
    FakeGoodPeopleApi api, {
    Locale locale = const Locale('en'),
    bool open = true,
    PushService push = const NoPushService(),
  }) async {
    tester.view.physicalSize = const Size(360, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    final container = ProviderContainer.test(
      overrides: [
        goodPeopleApiProvider.overrideWithValue(api),
        todayProvider.overrideWithValue(leaveToday),
        fileOpenerProvider.overrideWithValue(opener),
        punchQueueStoreProvider.overrideWithValue(MemoryPunchQueueStore()),
        pushServiceProvider.overrideWithValue(push),
      ],
    );
    container.read(localeProvider.notifier).select(locale);
    await container
        .read(authProvider.notifier)
        .signIn(
          workspace: 'my-group',
          email: 'rahima@my-group.test',
          password: 'x',
        );
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const GoodPeopleApp(),
      ),
    );
    await tester.pumpAndSettle();
    if (open) {
      await tester.ensureVisible(find.byKey(HomeScreen.myPayKey));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(HomeScreen.myPayKey));
      await tester.pumpAndSettle();
    }
    return container;
  }

  Finder within(Key key, Finder finder) =>
      find.descendant(of: find.byKey(key), matching: finder);

  void expectIn(String id, List<String> texts) {
    for (final text in texts) {
      expect(
        within(PayslipsTab.payslipKey(id), find.text(text)),
        findsOneWidget,
        reason: '$id: $text',
      );
    }
  }

  Future<void> tapOpen(
    WidgetTester tester,
    String id,
    LetterLanguage language,
  ) async {
    final finder = find.byKey(PayslipsTab.openKey(id, language));
    await tester.ensureVisible(finder);
    await tester.pumpAndSettle();
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  testWidgets('a My pay card on home opens the payslips', (tester) async {
    final api = FakeGoodPeopleApi();
    await pumpPayslips(tester, api, open: false);

    expect(within(HomeScreen.myPayKey, find.text('My pay')), findsOneWidget);
    expect(
      within(
        HomeScreen.myPayKey,
        find.text('Payslips, tax, provident fund and loans'),
      ),
      findsOneWidget,
    );
    expect(api.payslipsCalls, 0);

    await tester.ensureVisible(find.byKey(HomeScreen.myPayKey));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(HomeScreen.myPayKey));
    await tester.pumpAndSettle();

    expect(find.byType(MyPayScreen), findsOneWidget);
    expect(find.widgetWithText(AppBar, 'My pay'), findsOneWidget);
    expect(find.byType(PayslipsTab), findsOneWidget);
    expect(api.payslipsCalls, 1);
  });

  testWidgets('without the payroll feature there is no My pay card', (
    tester,
  ) async {
    final api = FakeGoodPeopleApi()
      ..accessView = TenantAccessView.fromJson(
        accessJson(features: const ['core_hr', 'leave', 'attendance']),
      );
    await pumpPayslips(tester, api, open: false);

    expect(find.byKey(HomeScreen.documentsKey), findsOneWidget);
    expect(find.byKey(HomeScreen.myPayKey), findsNothing);
    expect(find.text('My pay'), findsNothing);
    expect(api.payslipsCalls, 0);
  });

  testWidgets('each payslip shows its period, net pay and payment date; '
      'adjustments are marked', (tester) async {
    await pumpPayslips(tester, FakeGoodPeopleApi());

    // Newest first, as the API sends them.
    final cards = tester
        .widgetList(
          find.byWidgetPredicate(
            (widget) =>
                widget.key is ValueKey<String> &&
                (widget.key! as ValueKey<String>).value.startsWith(
                  'payslip-e1',
                ),
          ),
        )
        .map((widget) => widget.key)
        .toList();
    expect(cards, [
      PayslipsTab.payslipKey(septemberAdjustmentId),
      PayslipsTab.payslipKey(septemberPayslipId),
      PayslipsTab.payslipKey(augustPayslipId),
    ]);

    expectIn(septemberPayslipId, [
      'September 2026',
      'Net pay',
      '৳12,500',
      'Paid on Oct 7, 2026',
      'Open in English',
      'Open in Bangla',
    ]);
    expect(
      find.byKey(PayslipsTab.adjustmentKey(septemberPayslipId)),
      findsNothing,
    );

    expectIn(septemberAdjustmentId, [
      'September 2026',
      '৳1,250.50',
      'Paid on Oct 20, 2026',
    ]);
    expect(
      within(
        PayslipsTab.adjustmentKey(septemberAdjustmentId),
        find.text('Adjustment'),
      ),
      findsOneWidget,
    );

    // Not a whole month: its dates.
    expectIn(augustPayslipId, [
      'Aug 16 – Aug 31, 2026',
      '৳6,250',
      'Paid on Sep 7, 2026',
    ]);
  });

  testWidgets('a payslip opens as a PDF in the app\'s language, or in the '
      'other one', (tester) async {
    final api = FakeGoodPeopleApi();
    await pumpPayslips(tester, api);

    // In English, English is the filled button.
    expect(
      tester.widget(
        find.byKey(PayslipsTab.openKey(septemberPayslipId, LetterLanguage.en)),
      ),
      isA<FilledButton>(),
    );
    await tapOpen(tester, septemberPayslipId, LetterLanguage.en);

    expect(api.payslipPdfs, [
      (itemId: septemberPayslipId, language: LetterLanguage.en),
    ]);
    final opened = opener.opened.single;
    expect(opened.bytes, pdfBytes);
    expect(opened.fileName, 'payslip-MG-0005-2026-09-en.pdf');
    expect(opened.contentType, 'application/pdf');

    await tapOpen(tester, septemberPayslipId, LetterLanguage.bn);

    expect(api.payslipPdfs.last, (
      itemId: septemberPayslipId,
      language: LetterLanguage.bn,
    ));
    expect(opener.opened.last.fileName, 'payslip-MG-0005-2026-09-bn.pdf');
  });

  testWidgets('in Bangla: Bangla labels and digits, and Bangla is the filled '
      'button', (tester) async {
    final api = FakeGoodPeopleApi();
    await pumpPayslips(tester, api, locale: const Locale('bn'));

    expect(find.widgetWithText(AppBar, 'আমার বেতন'), findsOneWidget);
    expect(
      find.descendant(
        of: find.byKey(MyPayScreen.tabKey(MyPayTab.payslips)),
        matching: find.text('বেতন বিবরণী'),
      ),
      findsOneWidget,
    );
    expectIn(septemberPayslipId, [
      'সেপ্টেম্বর ২০২৬',
      'নিট বেতন',
      '৳১২,৫০০',
      'পরিশোধ: ৭ অক্টো, ২০২৬',
      'বাংলায় খুলুন',
      'ইংরেজিতে খুলুন',
    ]);
    expectIn(septemberAdjustmentId, ['৳১,২৫০.৫০', 'সমন্বয়']);
    expect(
      tester.widget(
        find.byKey(PayslipsTab.openKey(septemberPayslipId, LetterLanguage.bn)),
      ),
      isA<FilledButton>(),
    );

    await tapOpen(tester, augustPayslipId, LetterLanguage.bn);
    expect(api.payslipPdfs, [
      (itemId: augustPayslipId, language: LetterLanguage.bn),
    ]);
    expect(opener.opened.single.fileName, 'payslip-MG-0005-2026-08-bn.pdf');
  });

  testWidgets('nothing published yet says so', (tester) async {
    final api = FakeGoodPeopleApi()..payslips = [];
    await pumpPayslips(tester, api);

    expect(
      find.text(
        'No payslips yet. They appear here once payroll publishes them.',
      ),
      findsOneWidget,
    );
    expect(find.byType(Card), findsNothing);
  });

  testWidgets('a failed load says why and tries again', (tester) async {
    final api = FakeGoodPeopleApi()
      ..payslipsErrors.add(
        const ApiException(
          kind: ApiErrorKind.server,
          statusCode: 403,
          code: 'feature_not_in_plan',
          message: 'Your plan does not include payroll',
        ),
      );
    await pumpPayslips(tester, api);

    expect(find.text('We could not load your payslips.'), findsOneWidget);
    expect(
      find.text("Your workspace's plan doesn't include this."),
      findsOneWidget,
    );

    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();

    expect(api.payslipsCalls, 2);
    expect(
      find.byKey(PayslipsTab.payslipKey(septemberPayslipId)),
      findsOneWidget,
    );
  });

  testWidgets('a payslip withdrawn since the list loaded says so and the '
      'list reloads; no PDF reader says so too', (tester) async {
    final api = FakeGoodPeopleApi();
    await pumpPayslips(tester, api);

    opener.error = const FileOpenFailed(FileOpenProblem.noApp);
    await tapOpen(tester, septemberPayslipId, LetterLanguage.en);
    expect(
      find.text(
        'No app on this phone can open this file. Install a PDF reader and '
        'try again.',
      ),
      findsOneWidget,
    );
    opener.error = null;

    api.payslipPdfErrors.add(
      const ApiException(
        kind: ApiErrorKind.server,
        statusCode: 404,
        message: 'Payslip not found',
      ),
    );
    api.payslips = [
      for (final json in myPayslipsJson())
        if (json['itemId'] != septemberAdjustmentId) json,
    ];
    await tapOpen(tester, septemberAdjustmentId, LetterLanguage.en);

    expect(find.text('This payslip is no longer available.'), findsOneWidget);
    expect(api.payslipsCalls, 2);
    expect(
      find.byKey(PayslipsTab.payslipKey(septemberAdjustmentId)),
      findsNothing,
    );
    expect(opener.opened, isEmpty);
  });

  testWidgets('a payslip notification opens My pay on the payslips', (
    tester,
  ) async {
    const notificationId = 'f0000000-0000-4000-8000-000000000010';
    final api = FakeGoodPeopleApi()
      ..inbox = inboxJson([
        notificationJson(
          id: notificationId,
          event: 'payslip.published',
          title: 'Your payslip for September 2026 is ready',
          body:
              'Open Payslips in Good People to see it, with every earning '
              'and deduction.',
          link: '/workspace/payslips',
        ),
      ]);
    final push = FakePushService();
    await pumpPayslips(tester, api, open: false, push: push);

    // From the inbox.
    await tester.tap(find.byKey(HomeScreen.inboxKey));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(InboxScreen.itemKey(notificationId)));
    await tester.pumpAndSettle();
    expect(find.byType(MyPayScreen), findsOneWidget);
    expect(find.byType(PayslipsTab), findsOneWidget);
    expect(
      find.byKey(PayslipsTab.payslipKey(septemberPayslipId)),
      findsOneWidget,
    );
    expect(api.readNotificationIds, [notificationId]);

    await tester.pageBack();
    await tester.pumpAndSettle();
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.byType(MyPayScreen), findsNothing);

    // From a tapped push.
    push.opened.add(
      PushMessage.fromData({
        'event': 'payslip.published',
        'link': '/workspace/payslips',
        'notificationId': notificationId,
      }),
    );
    await tester.pumpAndSettle();
    expect(find.byType(MyPayScreen), findsOneWidget);
    expect(find.byType(PayslipsTab), findsOneWidget);
  });
}
