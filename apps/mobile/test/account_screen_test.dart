import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:good_people/api/api_exception.dart';
import 'package:good_people/api/good_people_api.dart';
import 'package:good_people/app.dart';
import 'package:good_people/account/account_screen.dart';
import 'package:good_people/account/change_password_screen.dart';
import 'package:good_people/attendance/offline_punch_queue.dart';
import 'package:good_people/auth/auth_controller.dart';
import 'package:good_people/home/home_screen.dart';

import 'support/fake_api.dart';

void main() {
  Future<ProviderContainer> pumpAccount(
    WidgetTester tester,
    FakeGoodPeopleApi api,
  ) async {
    tester.view.physicalSize = const Size(400, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final container = ProviderContainer.test(
      overrides: [
        goodPeopleApiProvider.overrideWithValue(api),
        punchQueueStoreProvider.overrideWithValue(MemoryPunchQueueStore()),
      ],
    );
    await container
        .read(authProvider.notifier)
        .signIn(workspace: 'acme', email: 'a@acme.test', password: 'x');
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const GoodPeopleApp(),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(HomeScreen.accountKey));
    await tester.pumpAndSettle();
    return container;
  }

  Future<void> fill(
    WidgetTester tester, {
    required String current,
    required String next,
    String? confirm,
  }) async {
    await tester.enterText(
      find.byKey(ChangePasswordScreen.currentFieldKey),
      current,
    );
    await tester.enterText(find.byKey(ChangePasswordScreen.newFieldKey), next);
    await tester.enterText(
      find.byKey(ChangePasswordScreen.confirmFieldKey),
      confirm ?? next,
    );
    await tester.tap(find.byKey(ChangePasswordScreen.submitKey));
    await tester.pumpAndSettle();
  }

  testWidgets('shows the login: contact, role and two-step sign-in', (
    tester,
  ) async {
    await pumpAccount(tester, FakeGoodPeopleApi());

    expect(find.byType(AccountScreen), findsOneWidget);
    for (final text in [
      'Rahima Akter',
      'rahima@acme.test',
      '+8801711000005',
      'Workspace admin',
      'Off',
    ]) {
      expect(find.text(text), findsOneWidget, reason: text);
    }
  });

  testWidgets('changing the password keeps this session signed in', (
    tester,
  ) async {
    final api = FakeGoodPeopleApi();
    final container = await pumpAccount(tester, api);

    await tester.tap(find.byKey(AccountScreen.changePasswordKey));
    await tester.pumpAndSettle();
    await fill(tester, current: 'old secret', next: 'a whole new password');

    expect(api.passwordChanges.single, (
      current: 'old secret',
      next: 'a whole new password',
      keepRefreshToken: 'refresh-1',
    ));
    expect(find.byType(ChangePasswordScreen), findsNothing);
    expect(
      find.text(
        'Password changed. You stay signed in here; other phones and '
        'browsers were signed out.',
      ),
      findsOneWidget,
    );
    expect(container.read(authProvider), isA<SignedIn>());
  });

  testWidgets('a short, unchanged or mistyped password is caught first', (
    tester,
  ) async {
    final api = FakeGoodPeopleApi();
    await pumpAccount(tester, api);
    await tester.tap(find.byKey(AccountScreen.changePasswordKey));
    await tester.pumpAndSettle();

    await fill(tester, current: 'old secret', next: 'too short');
    expect(find.text('Use at least 10 characters'), findsOneWidget);

    await fill(tester, current: 'same old secret', next: 'same old secret');
    expect(
      find.text('Choose a password you have not been using'),
      findsOneWidget,
    );

    await fill(
      tester,
      current: 'old secret',
      next: 'a whole new password',
      confirm: 'a whole new pasword',
    );
    expect(find.text('The two new passwords are not the same'), findsOneWidget);
    expect(api.passwordChanges, isEmpty);
  });

  testWidgets('a wrong current password says so', (tester) async {
    final api = FakeGoodPeopleApi()
      ..passwordError = const ApiException(
        kind: ApiErrorKind.server,
        statusCode: 400,
        code: 'wrong_password',
        message: 'Your current password is not right',
      );
    await pumpAccount(tester, api);
    await tester.tap(find.byKey(AccountScreen.changePasswordKey));
    await tester.pumpAndSettle();

    await fill(tester, current: 'not it', next: 'a whole new password');
    expect(find.text('Your current password is not right.'), findsOneWidget);
    expect(find.byType(ChangePasswordScreen), findsOneWidget);
  });

  testWidgets('a login that signs in by code has no password to change', (
    tester,
  ) async {
    final api = FakeGoodPeopleApi()
      ..account = accountJson(
        email: null,
        role: 'employee',
        hasPassword: false,
      );
    await pumpAccount(tester, api);

    expect(find.byKey(AccountScreen.changePasswordKey), findsNothing);
    expect(
      find.text(
        'You sign in with a code sent to your mobile, so there is no '
        'password to change.',
      ),
      findsOneWidget,
    );
    expect(find.text('Not set'), findsOneWidget);
    expect(find.text('Employee'), findsOneWidget);
  });
}
