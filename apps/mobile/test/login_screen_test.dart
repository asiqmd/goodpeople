import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:good_people/api/api_exception.dart';
import 'package:good_people/api/api_models.dart';
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

  testWidgets('too many attempts says how long to wait', (tester) async {
    final api = FakeGoodPeopleApi()
      ..loginError = const ApiException(
        kind: ApiErrorKind.server,
        statusCode: 429,
        code: 'too_many_attempts',
        message: 'Too many attempts. Try again in 10 minutes.',
        retryAfterSeconds: 540,
      );
    await tester.pumpWidget(appWith(api));

    await fillForm(tester);
    await tester.tap(find.byKey(LoginScreen.submitKey));
    await tester.pumpAndSettle();

    expect(
      find.text('Too many attempts. Try again in 9 minutes.'),
      findsOneWidget,
    );
  });

  group('by mobile number', () {
    Future<void> askForCode(WidgetTester tester, String phone) async {
      await tester.tap(find.byKey(LoginScreen.methodKey(SignInMethod.phone)));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(LoginScreen.workspaceFieldKey),
        ' Acme ',
      );
      await tester.enterText(find.byKey(LoginScreen.phoneFieldKey), phone);
      await tester.tap(find.byKey(LoginScreen.submitKey));
      await tester.pumpAndSettle();
    }

    bool resendEnabled(WidgetTester tester) =>
        tester
            .widget<TextButton>(find.byKey(LoginScreen.resendKey))
            .onPressed !=
        null;

    testWidgets('the code is texted, then signs in', (tester) async {
      final api = FakeGoodPeopleApi();
      await tester.pumpWidget(appWith(api));

      expect(find.byKey(LoginScreen.emailFieldKey), findsOneWidget);
      // Bangla digits and a dash, as people type them.
      await askForCode(tester, '০১৭১২-৩৪৫৬৭৮');

      expect(find.byKey(LoginScreen.emailFieldKey), findsNothing);
      expect(api.otpRequests.single, (tenant: 'acme', phone: '01712345678'));
      expect(api.logins, isEmpty);
      expect(
        find.text(
          'If 01712345678 has a Good People login, a 6-digit code is on its '
          'way by SMS. It works for 5 minutes.',
        ),
        findsOneWidget,
      );
      expect(resendEnabled(tester), isFalse);

      await tester.enterText(find.byKey(LoginScreen.codeFieldKey), '১২৩ ৪৫৬');
      await tester.tap(find.byKey(LoginScreen.submitKey));
      await tester.pumpAndSettle();

      expect(api.otpCodes.single, (
        tenant: 'acme',
        phone: '01712345678',
        code: '123456',
      ));
      expect(find.byType(HomeScreen), findsOneWidget);
      // The worker has no email; the session says so.
      expect(find.text('Signed in as Rahima Khatun'), findsOneWidget);
      expect(api.accessTokens, ['access-otp']);
    });

    testWidgets('a wrong code says so; after a while the code can be sent '
        'again', (tester) async {
      final api = FakeGoodPeopleApi()..otpErrors.add(wrongCode);
      await tester.pumpWidget(appWith(api));
      await askForCode(tester, '01712345678');

      await tester.enterText(find.byKey(LoginScreen.codeFieldKey), '000000');
      await tester.tap(find.byKey(LoginScreen.submitKey));
      await tester.pumpAndSettle();
      expect(
        find.text(
          'That code is wrong or has expired. Check it, or ask for a new one.',
        ),
        findsOneWidget,
      );
      expect(find.byType(LoginScreen), findsOneWidget);

      expect(resendEnabled(tester), isFalse);
      await tester.pump(LoginScreen.resendDelay);
      expect(resendEnabled(tester), isTrue);
      await tester.tap(find.byKey(LoginScreen.resendKey));
      await tester.pumpAndSettle();
      expect(api.otpRequests, hasLength(2));
      expect(api.otpRequests.last.phone, '01712345678');
      expect(find.text('A new code is on its way.'), findsOneWidget);
      expect(resendEnabled(tester), isFalse);

      // Back to the number, which is kept.
      await tester.tap(find.text('Use a different number'));
      await tester.pumpAndSettle();
      expect(find.text('01712345678'), findsOneWidget);
    });

    testWidgets('a number that is not a Bangladesh mobile is caught first', (
      tester,
    ) async {
      final api = FakeGoodPeopleApi();
      await tester.pumpWidget(appWith(api));
      await askForCode(tester, '02-9876543');

      expect(
        find.text('Enter a Bangladesh mobile number, e.g. 01712345678'),
        findsOneWidget,
      );
      expect(api.otpRequests, isEmpty);
    });
  });

  group('two-step sign-in', () {
    testWidgets('the authenticator code finishes a password sign-in', (
      tester,
    ) async {
      final api = FakeGoodPeopleApi()
        ..loginResponse = const TwoStepChallenge(mfaToken: 'mfa-1');
      await tester.pumpWidget(appWith(api));

      await fillForm(tester);
      await tester.tap(find.byKey(LoginScreen.submitKey));
      await tester.pumpAndSettle();

      expect(api.logins, hasLength(1));
      expect(find.byType(HomeScreen), findsNothing);
      expect(find.text('Two-step sign-in'), findsOneWidget);
      expect(
        find.text('Enter the 6-digit code from your authenticator app.'),
        findsOneWidget,
      );

      // Not six digits: nothing is sent.
      await tester.enterText(find.byKey(LoginScreen.codeFieldKey), '12345');
      await tester.tap(find.byKey(LoginScreen.submitKey));
      await tester.pumpAndSettle();
      expect(find.text('Enter the 6-digit code'), findsOneWidget);
      expect(api.mfaCodes, isEmpty);

      await tester.enterText(find.byKey(LoginScreen.codeFieldKey), '123456');
      await tester.tap(find.byKey(LoginScreen.submitKey));
      await tester.pumpAndSettle();

      expect(api.mfaCodes.single, (mfaToken: 'mfa-1', code: '123456'));
      expect(find.byType(HomeScreen), findsOneWidget);
    });

    testWidgets('a recovery code works too; a wrong one says so', (
      tester,
    ) async {
      final api = FakeGoodPeopleApi()
        ..loginResponse = const TwoStepChallenge(mfaToken: 'mfa-1')
        ..mfaErrors.add(wrongCode);
      await tester.pumpWidget(appWith(api));
      await fillForm(tester);
      await tester.tap(find.byKey(LoginScreen.submitKey));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(LoginScreen.recoveryToggleKey));
      await tester.pumpAndSettle();
      expect(find.text('Recovery code'), findsOneWidget);

      await tester.enterText(find.byKey(LoginScreen.codeFieldKey), 'K7QM-2XPD');
      await tester.tap(find.byKey(LoginScreen.submitKey));
      await tester.pumpAndSettle();
      expect(
        find.text(
          'That code is wrong or has expired. Try again, or go back and sign '
          'in again.',
        ),
        findsOneWidget,
      );

      await tester.tap(find.byKey(LoginScreen.submitKey));
      await tester.pumpAndSettle();
      expect(api.mfaCodes.map((sent) => sent.code), ['k7qm-2xpd', 'k7qm-2xpd']);
      expect(find.byType(HomeScreen), findsOneWidget);
    });

    testWidgets('a role that must set it up first is sent to the web app', (
      tester,
    ) async {
      final api = FakeGoodPeopleApi()
        ..loginResponse = const TwoStepChallenge(
          mfaToken: 'mfa-setup-1',
          setupRequired: true,
        );
      await tester.pumpWidget(appWith(api));
      await fillForm(tester);
      await tester.tap(find.byKey(LoginScreen.submitKey));
      await tester.pumpAndSettle();

      expect(find.byKey(LoginScreen.setupRequiredKey), findsOneWidget);
      expect(find.text('Set up two-step sign-in first'), findsOneWidget);
      expect(find.byKey(LoginScreen.codeFieldKey), findsNothing);
      expect(find.byKey(LoginScreen.submitKey), findsNothing);
      expect(api.mfaCodes, isEmpty);

      await tester.tap(find.text('Back'));
      await tester.pumpAndSettle();
      expect(find.byKey(LoginScreen.emailFieldKey), findsOneWidget);
      expect(find.text('rahima@acme.test'), findsOneWidget);
    });
  });
}
