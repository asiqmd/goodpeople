import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:good_people/auth/login_screen.dart';
import 'package:good_people/home/home_screen.dart';

import 'support/fake_api.dart';

void main() {
  Future<void> fillForm(WidgetTester tester) async {
    await tester.enterText(find.byKey(LoginScreen.workspaceFieldKey), ' Acme ');
    await tester.enterText(
      find.byKey(LoginScreen.emailFieldKey),
      'rahima@acme.test',
    );
    await tester.enterText(find.byKey(LoginScreen.passwordFieldKey), 'secret');
  }

  testWidgets('submitting the empty form shows required-field errors', (
    tester,
  ) async {
    final api = FakeGoodPeopleApi();
    await tester.pumpWidget(appWith(api));

    await tester.tap(find.byKey(LoginScreen.submitKey));
    await tester.pump();

    expect(find.text('Enter your workspace'), findsOneWidget);
    expect(find.text('Enter your email'), findsOneWidget);
    expect(find.text('Enter your password'), findsOneWidget);
    expect(api.logins, isEmpty);
  });

  testWidgets('choosing Bangla shows the Bangla app title', (tester) async {
    await tester.pumpWidget(appWith(FakeGoodPeopleApi()));
    expect(find.text('Good People'), findsOneWidget);

    await tester.tap(find.byTooltip('Language'));
    await tester.pumpAndSettle();
    await tester.tap(
      find.widgetWithText(CheckedPopupMenuItem<Locale>, 'বাংলা'),
    );
    await tester.pumpAndSettle();

    expect(find.text('গুড পিপল'), findsOneWidget);
    expect(find.text('সাইন ইন'), findsOneWidget);
    expect(find.text('Good People'), findsNothing);
  });

  testWidgets('successful login shows a loading state, then home', (
    tester,
  ) async {
    final api = FakeGoodPeopleApi()..loginGate = Completer<void>();
    await tester.pumpWidget(appWith(api));

    await fillForm(tester);
    await tester.tap(find.byKey(LoginScreen.submitKey));
    await tester.pump();

    expect(
      find.descendant(
        of: find.byKey(LoginScreen.submitKey),
        matching: find.byType(CircularProgressIndicator),
      ),
      findsOneWidget,
    );
    expect(api.logins.single, (
      tenant: 'acme',
      email: 'rahima@acme.test',
      password: 'secret',
    ));

    api.loginGate!.complete();
    await tester.pumpAndSettle();

    expect(find.byType(LoginScreen), findsNothing);
    expect(find.byType(HomeScreen), findsOneWidget);
    expect(find.text('Signed in as Rahima Akter'), findsOneWidget);
    expect(api.accessTokens, ['access-1']);
  });

  testWidgets('failed login shows the API error message', (tester) async {
    final api = FakeGoodPeopleApi()..loginError = wrongPassword;
    await tester.pumpWidget(appWith(api));

    await fillForm(tester);
    await tester.tap(find.byKey(LoginScreen.submitKey));
    await tester.pumpAndSettle();

    expect(find.text('Wrong workspace, email or password'), findsOneWidget);
    expect(find.byType(LoginScreen), findsOneWidget);
  });
}
