import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:good_people/api/api_exception.dart';
import 'package:good_people/api/good_people_api.dart';
import 'package:good_people/app.dart';
import 'package:good_people/auth/auth_controller.dart';
import 'package:good_people/home/home_screen.dart';
import 'package:good_people/leave/leave_providers.dart';
import 'package:good_people/profile/profile_screen.dart';
import 'package:good_people/resignation/resignation_screen.dart';
import 'package:good_people/resignation/separation_widgets.dart';
import 'package:good_people/settings/locale_controller.dart';

import 'support/fake_api.dart';

const _newResignationId = 'db000000-0000-4000-8000-0000000000ff';

ApiException _refusal(int status, String code, String message) => ApiException(
  kind: ApiErrorKind.server,
  statusCode: status,
  code: code,
  message: message,
);

void main() {
  /// Signs in through the fake API with "today" fixed at [leaveToday],
  /// shows the app in [locale], opens My profile and, if [open], the
  /// Resignation screen from its last entry. The screen is phone-width, so
  /// overflow fails the test.
  Future<ProviderContainer> pumpResignation(
    WidgetTester tester,
    FakeGoodPeopleApi api, {
    Locale locale = const Locale('en'),
    bool open = true,
  }) async {
    tester.view.physicalSize = const Size(360, 3200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    final container = ProviderContainer.test(
      overrides: [
        goodPeopleApiProvider.overrideWithValue(api),
        todayProvider.overrideWithValue(leaveToday),
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
    await tester.tap(find.byKey(HomeScreen.myProfileKey));
    await tester.pumpAndSettle();
    if (open) {
      await tester.ensureVisible(find.byKey(ProfileScreen.resignationKey));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(ProfileScreen.resignationKey));
      await tester.pumpAndSettle();
    }
    return container;
  }

  Finder within(Key key, Finder finder) =>
      find.descendant(of: find.byKey(key), matching: finder);

  void expectIn(Key key, List<String> texts) {
    for (final text in texts) {
      expect(within(key, find.text(text)), findsOneWidget, reason: text);
    }
  }

  Finder statusOf(String id, String label) => within(
    ResignationScreen.separationKey(id),
    find.descendant(
      of: find.byType(SeparationStatusPill),
      matching: find.text(label),
    ),
  );

  Future<void> tapKey(WidgetTester tester, Key key) async {
    await tester.ensureVisible(find.byKey(key));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(key));
    await tester.pumpAndSettle();
  }

  /// Picks the 15th of the month the date picker opens on (December 2026,
  /// 60 days from today) and accepts it.
  Future<void> pickDecember15(WidgetTester tester) async {
    await tapKey(tester, ResignationScreen.lastDayFieldKey);
    expect(find.text('Last working day'), findsWidgets);
    await tester.tap(find.text('15'));
    await tester.pumpAndSettle();
    final ok = MaterialLocalizations.of(
      tester.element(find.byType(DatePickerDialog)),
    ).okButtonLabel;
    await tester.tap(find.text(ok));
    await tester.pumpAndSettle();
  }

  testWidgets('the last entry of My profile opens Resignation; with nothing '
      'open, the form explains the notice first', (tester) async {
    final api = FakeGoodPeopleApi();
    await pumpResignation(tester, api, open: false);

    expectIn(ProfileScreen.resignationKey, [
      'Resignation',
      'Give notice, or follow your resignation',
    ]);
    expect(api.separationCalls, 0);

    await tapKey(tester, ProfileScreen.resignationKey);

    expect(find.byType(ResignationScreen), findsOneWidget);
    expect(find.widgetWithText(AppBar, 'Resignation'), findsOneWidget);
    expect(api.separationCalls, 1);
    expect(find.byKey(ResignationScreen.formKey), findsOneWidget);
    expect(
      within(
        ResignationScreen.noticeInfoKey,
        find.text(
          'Under the Bangladesh Labour Act (section 27), a permanent worker '
          "gives 60 days' written notice to resign, and a temporary worker on "
          'monthly wages 30 days. Your notice starts today. If you give less, '
          'wages for the missing days may be deducted from your final '
          'settlement.',
        ),
      ),
      findsOneWidget,
    );
  });

  testWidgets('the form checks the day and the reason, asks first, then '
      'sends; the new resignation shows its notice', (tester) async {
    final api = FakeGoodPeopleApi();
    await pumpResignation(tester, api);

    // Nothing filled in.
    await tapKey(tester, ResignationScreen.submitKey);
    expect(find.text('Choose your last working day'), findsOneWidget);
    expect(find.text('Write at least 3 characters'), findsOneWidget);

    // The picker opens 60 days ahead and allows no past day.
    await pickDecember15(tester);
    expectIn(ResignationScreen.lastDayFieldKey, ['December 15, 2026']);
    expect(
      tester.widget<Text>(find.byKey(ResignationScreen.noticeGivenKey)).data,
      'That gives 52 days of notice.',
    );
    expect(find.text('Choose your last working day'), findsNothing);

    await tester.enterText(find.byKey(ResignationScreen.reasonFieldKey), 'ok');
    await tapKey(tester, ResignationScreen.submitKey);
    expect(find.text('Write at least 3 characters'), findsOneWidget);
    expect(find.byType(AlertDialog), findsNothing);

    await tester.enterText(
      find.byKey(ResignationScreen.reasonFieldKey),
      '  Moving to Chattogram with my family  ',
    );
    await tapKey(tester, ResignationScreen.submitKey);

    // A confirmation first; backing out sends nothing.
    expect(find.text('Send your resignation?'), findsOneWidget);
    expect(
      find.text(
        'Your last working day will be December 15, 2026. It goes to your '
        'manager, then HR. You can withdraw it while it is pending.',
      ),
      findsOneWidget,
    );
    final cancel = MaterialLocalizations.of(
      tester.element(find.byType(AlertDialog)),
    ).cancelButtonLabel;
    await tester.tap(find.text(cancel));
    await tester.pumpAndSettle();
    expect(api.resignations, isEmpty);

    await tapKey(tester, ResignationScreen.submitKey);
    await tester.tap(find.byKey(ResignationScreen.confirmKey));
    await tester.pumpAndSettle();

    expect(api.resignations.single, {
      'lastWorkingDay': '2026-12-15',
      'reason': 'Moving to Chattogram with my family',
    });
    expect(find.text('Resignation sent for approval'), findsOneWidget);
    expect(api.separationCalls, 2);
    // Now one is pending: no form, the resignation instead.
    expect(find.byKey(ResignationScreen.formKey), findsNothing);
    final card = ResignationScreen.separationKey(_newResignationId);
    expect(statusOf(_newResignationId, 'Pending'), findsOneWidget);
    expectIn(card, [
      'Resignation',
      'Notice given on',
      'Oct 24, 2026',
      'Last working day',
      'Dec 15, 2026',
      'Notice required',
      '60 days',
      'Notice given',
      '52 days',
      'That is 8 days short of the notice the Labour Act asks for. Wages '
          'for the missing days may be deducted from your final settlement.',
      'Moving to Chattogram with my family',
    ]);
    expect(
      find.byKey(ResignationScreen.cancelKey(_newResignationId)),
      findsOneWidget,
    );
  });

  testWidgets('a pending resignation shows its notice and trail and can be '
      'withdrawn; then the form is back', (tester) async {
    final api = FakeGoodPeopleApi()
      ..separations = [...pendingSeparationsJson(), ...closedSeparationsJson()];
    await pumpResignation(tester, api);

    expect(find.byKey(ResignationScreen.formKey), findsNothing);
    final pending = ResignationScreen.separationKey(pendingResignationId);
    expect(statusOf(pendingResignationId, 'Pending'), findsOneWidget);
    expectIn(pending, [
      'Oct 24, 2026',
      'Nov 24, 2026',
      '60 days',
      '31 days',
      'That is 29 days short of the notice the Labour Act asks for. Wages '
          'for the missing days may be deducted from your final settlement.',
      'Moving back to my village to care for my mother',
      'Manager: Shirin Akter',
      'Awaiting decision',
      'HR team',
    ]);
    // The withdrawn one from the spring, under Earlier, with no button.
    expect(find.text('Earlier'), findsOneWidget);
    expect(statusOf(cancelledResignationId, 'Cancelled'), findsOneWidget);
    expect(
      find.byKey(ResignationScreen.cancelKey(cancelledResignationId)),
      findsNothing,
    );

    final cancel = ResignationScreen.cancelKey(pendingResignationId);
    await tapKey(tester, cancel);
    expect(find.text('Withdraw your resignation?'), findsOneWidget);
    expect(
      find.text(
        'Your resignation with the last working day November 24, 2026 will '
        'be withdrawn, and you stay in your job.',
      ),
      findsOneWidget,
    );
    await tester.tap(find.text('Keep it'));
    await tester.pumpAndSettle();
    expect(api.cancelledSeparationIds, isEmpty);

    await tapKey(tester, cancel);
    await tester.tap(find.byKey(ResignationScreen.confirmCancelKey));
    await tester.pumpAndSettle();

    expect(api.cancelledSeparationIds, [pendingResignationId]);
    expect(find.text('Resignation withdrawn'), findsOneWidget);
    expect(api.separationCalls, 2);
    expect(statusOf(pendingResignationId, 'Cancelled'), findsOneWidget);
    expect(find.byKey(cancel), findsNothing);
    expect(find.byKey(ResignationScreen.formKey), findsOneWidget);
  });

  testWidgets('an approved resignation has no Cancel and blocks a new one', (
    tester,
  ) async {
    const approvedId = 'db000000-0000-4000-8000-000000000005';
    final api = FakeGoodPeopleApi()
      ..separations = [
        separationJson(
          id: approvedId,
          status: 'approved',
          lastWorkingDay: '2026-12-23',
          decidedAt: '2026-10-25T04:00:00.000Z',
        ),
      ];
    await pumpResignation(tester, api);

    expect(statusOf(approvedId, 'Approved'), findsOneWidget);
    // Required and given.
    expect(
      within(ResignationScreen.separationKey(approvedId), find.text('60 days')),
      findsNWidgets(2),
    );
    // 60 days given: nothing short.
    expect(find.textContaining('short of the notice'), findsNothing);
    expect(find.byKey(ResignationScreen.cancelKey(approvedId)), findsNothing);
    expect(find.byKey(ResignationScreen.formKey), findsNothing);
  });

  testWidgets('refusals show a message for their code', (tester) async {
    final api = FakeGoodPeopleApi();
    await pumpResignation(tester, api);

    await pickDecember15(tester);
    await tester.enterText(
      find.byKey(ResignationScreen.reasonFieldKey),
      'Moving to Chattogram with my family',
    );

    Future<void> send() async {
      await tapKey(tester, ResignationScreen.submitKey);
      await tester.tap(find.byKey(ResignationScreen.confirmKey));
      await tester.pumpAndSettle();
    }

    for (final (refusal, message) in [
      (
        _refusal(
          400,
          'past_last_day',
          'The last working day cannot be in '
              'the past',
        ),
        "The last working day can't be in the past.",
      ),
      (
        _refusal(409, 'separated', 'This employee has already left'),
        'Your employment has already ended.',
      ),
      (
        _refusal(409, 'brand_new_rule', 'Resignations are paused this week'),
        'Resignations are paused this week',
      ),
    ]) {
      api.resignError = refusal;
      await send();
      expectIn(ResignationScreen.errorKey, [message]);
      // The form stays as it was, to try again.
      expectIn(ResignationScreen.lastDayFieldKey, ['December 15, 2026']);
    }
    expect(api.separationCalls, 1);

    // Something is open after all: say so and show it.
    api
      ..resignError = _refusal(
        409,
        'separation_open',
        'A separation is already in progress',
      )
      ..separations = pendingSeparationsJson();
    await send();
    expect(
      find.descendant(
        of: find.byType(SnackBar),
        matching: find.text(
          'A resignation or separation is already in progress.',
        ),
      ),
      findsOneWidget,
    );
    expect(api.separationCalls, 2);
    expect(find.byKey(ResignationScreen.formKey), findsNothing);
    expect(statusOf(pendingResignationId, 'Pending'), findsOneWidget);
    expect(api.resignations, hasLength(4));
  });

  testWidgets('a withdrawal the API refuses shows why and reloads', (
    tester,
  ) async {
    final api = FakeGoodPeopleApi()
      ..separations = pendingSeparationsJson()
      ..cancelSeparationError = _refusal(
        409,
        'not_open',
        'This separation is approved',
      );
    await pumpResignation(tester, api);

    await tapKey(tester, ResignationScreen.cancelKey(pendingResignationId));
    await tester.tap(find.byKey(ResignationScreen.confirmCancelKey));
    await tester.pumpAndSettle();

    expect(
      find.text(
        "This resignation has already been decided, so it can't be withdrawn.",
      ),
      findsOneWidget,
    );
    expect(api.separationCalls, 2);
  });

  testWidgets('Bangla: the entry, the notice and the form', (tester) async {
    final api = FakeGoodPeopleApi()..separations = closedSeparationsJson();
    await pumpResignation(tester, api, locale: const Locale('bn'), open: false);

    expectIn(ProfileScreen.resignationKey, ['পদত্যাগ']);
    await tapKey(tester, ProfileScreen.resignationKey);

    expect(find.widgetWithText(AppBar, 'পদত্যাগ'), findsOneWidget);
    expect(
      within(ResignationScreen.noticeInfoKey, find.textContaining('৬০ দিনের')),
      findsOneWidget,
    );
    expectIn(ResignationScreen.formKey, [
      'চাকরি থেকে পদত্যাগ',
      'পদত্যাগপত্র পাঠান',
    ]);
    expect(find.text('আগের'), findsOneWidget);
    expect(statusOf(cancelledResignationId, 'বাতিল'), findsOneWidget);
    // Required and given, in Bangla digits.
    expect(
      within(
        ResignationScreen.separationKey(cancelledResignationId),
        find.text('৬০ দিন'),
      ),
      findsNWidgets(2),
    );

    await tapKey(tester, ResignationScreen.submitKey);
    expect(find.text('আপনার শেষ কর্মদিবস বেছে নিন'), findsOneWidget);
    expect(find.text('অন্তত ৩টি অক্ষর লিখুন'), findsOneWidget);
    for (final english in ['Resignation', 'Send resignation', 'Earlier']) {
      expect(find.text(english), findsNothing, reason: english);
    }
  });
}
