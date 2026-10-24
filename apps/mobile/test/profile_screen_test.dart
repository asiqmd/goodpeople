import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:good_people/api/api_models.dart';
import 'package:good_people/api/good_people_api.dart';
import 'package:good_people/app.dart';
import 'package:good_people/auth/auth_controller.dart';
import 'package:good_people/home/home_screen.dart';
import 'package:good_people/l10n/app_localizations.dart';
import 'package:good_people/profile/profile_screen.dart';
import 'package:good_people/settings/locale_controller.dart';

import 'support/fake_api.dart';

const _bkashId = '6c5b4a39-2817-4f60-9e5d-4c3b2a190817';
const _bankId = '7d6c5b4a-3928-4f71-8f6e-5d4c3b2a1908';

void main() {
  /// Signs in through the fake API and shows the app (so, HomeScreen) in
  /// [locale]. The screen is phone-width (so overflow fails the test) and
  /// tall enough to lay out the whole profile, so finders see every section
  /// without scrolling.
  Future<void> pumpSignedIn(
    WidgetTester tester,
    FakeGoodPeopleApi api, {
    Locale locale = const Locale('en'),
  }) async {
    tester.view.physicalSize = const Size(360, 3200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    final container = ProviderContainer.test(
      overrides: [goodPeopleApiProvider.overrideWithValue(api)],
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
  }

  Future<void> openProfile(WidgetTester tester) async {
    await tester.tap(find.byKey(HomeScreen.myProfileKey));
    await tester.pumpAndSettle();
  }

  testWidgets('home has a My profile entry that opens the profile', (
    tester,
  ) async {
    await pumpSignedIn(tester, FakeGoodPeopleApi());

    expect(
      find.descendant(
        of: find.byKey(HomeScreen.myProfileKey),
        matching: find.text('My profile'),
      ),
      findsOneWidget,
    );

    await openProfile(tester);

    expect(find.byType(ProfileScreen), findsOneWidget);
    expect(find.widgetWithText(AppBar, 'My profile'), findsOneWidget);
    expect(find.byKey(ProfileScreen.headerKey), findsOneWidget);

    await tester.pageBack();
    await tester.pumpAndSettle();

    expect(find.byType(ProfileScreen), findsNothing);
    expect(find.byType(HomeScreen), findsOneWidget);
  });

  testWidgets('profile shows the employee record', (tester) async {
    final api = FakeGoodPeopleApi();
    await pumpSignedIn(tester, api);
    await openProfile(tester);

    expect(api.employeeTokens, ['access-1']);

    final header = find.byKey(ProfileScreen.headerKey);
    for (final text in [
      'Rahima Khatun',
      'রহিমা খাতুন',
      'MG-0005',
      'Senior Sewing Operator · Line 1',
    ]) {
      expect(
        find.descendant(of: header, matching: find.text(text)),
        findsOneWidget,
        reason: text,
      );
    }
    expect(find.text('Adolescent worker'), findsNothing);

    for (final text in [
      // Job
      'My Group Textiles Ltd',
      'Gazipur Factory',
      'Line 1',
      'Senior Sewing Operator',
      'Worker grade 3',
      'Shirin Akter (MG-0004)',
      'Permanent',
      'Worker',
      'March 1, 2020',
      'June 1, 2020',
      // Personal
      'Abul Kashem',
      'Monowara Begum',
      'April 8, 1996',
      'Female',
      'Islam',
      'B+',
      '+8801711000005',
      // Identity
      'National ID (NID)',
      '1996000005',
      // Addresses: district plus the division's name
      'Konabari Industrial Area\nGazipur Sadar, Gazipur, Dhaka',
      'Village Char Kalibari\nMymensingh, Mymensingh 2200',
      // Nominees
      'Jamal Uddin',
      'Husband · 100% share',
    ]) {
      expect(find.text(text), findsOneWidget, reason: text);
    }

    // Confirmed, so no probation date; only the identity documents on file.
    for (final absent in [
      'Probation ends',
      'Passport',
      'TIN',
      'Birth registration',
    ]) {
      expect(find.text(absent), findsNothing, reason: absent);
    }
  });

  testWidgets('payment accounts show only the masked number', (tester) async {
    await pumpSignedIn(tester, FakeGoodPeopleApi());
    await openProfile(tester);

    Finder inAccount(String id, Finder finder) => find.descendant(
      of: find.byKey(ProfileScreen.paymentAccountKey(id)),
      matching: finder,
    );

    expect(inAccount(_bkashId, find.text('bKash')), findsOneWidget);
    expect(inAccount(_bkashId, find.text('Mobile banking')), findsOneWidget);
    expect(inAccount(_bkashId, find.text('•••• 0005')), findsOneWidget);
    expect(inAccount(_bkashId, find.text('Primary')), findsOneWidget);

    expect(inAccount(_bankId, find.text('Dutch-Bangla Bank')), findsOneWidget);
    expect(inAccount(_bankId, find.text('Bank account')), findsOneWidget);
    expect(inAccount(_bankId, find.text('•••• 4321')), findsOneWidget);
    expect(inAccount(_bankId, find.text('Primary')), findsNothing);

    final section = find.byKey(ProfileScreen.paymentAccountsKey);
    final texts = [
      for (final text in tester.widgetList<Text>(
        find.descendant(of: section, matching: find.byType(Text)),
      ))
        text.data ?? '',
    ];
    for (final hidden in ['Rahima Khatun', 'Konabari Branch', '090330468']) {
      expect(texts.where((t) => t.contains(hidden)), isEmpty, reason: hidden);
    }
    // No run of more than four digits: nothing but the last four shows.
    expect(texts.where(RegExp(r'\d{5,}').hasMatch), isEmpty);
  });

  test('an account number that arrives unmasked is cut to its last four', () {
    expect(maskAccountNumber('•••• 0005'), '•••• 0005');
    expect(maskAccountNumber('01711000005'), '•••• 0005');
    expect(maskAccountNumber('1234'), '1234');
  });

  testWidgets('a login with no employee record sees an empty state', (
    tester,
  ) async {
    final api = FakeGoodPeopleApi()..employeeResults.add(noEmployeeRecord);
    await pumpSignedIn(tester, api);
    await openProfile(tester);

    expect(find.byKey(ProfileScreen.emptyStateKey), findsOneWidget);
    expect(find.text('No employee record yet'), findsOneWidget);
    expect(find.text('We could not load your profile.'), findsNothing);
    expect(find.text('Try again'), findsNothing);
    expect(find.byKey(ProfileScreen.headerKey), findsNothing);
  });

  testWidgets('a suspended workspace shows the API message and can retry', (
    tester,
  ) async {
    final api = FakeGoodPeopleApi()..employeeResults.add(tenantSuspended);
    await pumpSignedIn(tester, api);
    await openProfile(tester);

    expect(find.text('We could not load your profile.'), findsOneWidget);
    expect(find.text('This workspace is suspended'), findsOneWidget);

    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();

    expect(find.byKey(ProfileScreen.headerKey), findsOneWidget);
    expect(api.employeeTokens, ['access-1', 'access-1']);
  });

  testWidgets('Bangla shows Bangla labels and dates with Bangla digits', (
    tester,
  ) async {
    final api = FakeGoodPeopleApi()
      ..employee = EmployeeDetail.fromJson(employeeJson(isAdolescent: true));
    await pumpSignedIn(tester, api, locale: const Locale('bn'));
    await openProfile(tester);

    final bn = lookupAppLocalizations(const Locale('bn'));
    expect(find.widgetWithText(AppBar, 'আমার প্রোফাইল'), findsOneWidget);
    for (final text in [
      'চাকরি',
      'পিতার নাম',
      'জন্ম তারিখ',
      'নারী',
      'ইসলাম',
      'বিকাশ',
      'মোবাইল ব্যাংকিং',
      bn.adolescentWorker,
      bn.primaryAccount,
      bn.employmentTypeName('permanent'),
      bn.workerCategoryName('worker'),
      // Dates and numbers in Bangla digits.
      '৮ এপ্রিল, ১৯৯৬',
      '১ মার্চ, ২০২০',
      'Husband · ১০০% অংশ',
      // District as stored, division by its Bangla name.
      'Konabari Industrial Area\nGazipur Sadar, Gazipur, ঢাকা',
      'Village Char Kalibari\nMymensingh, ${bn.divisionName('mymensingh')} 2200',
    ]) {
      expect(find.text(text), findsOneWidget, reason: text);
    }
    expect(bn.divisionName('mymensingh'), 'ময়মনসিংহ');

    for (final english in ['Job', "Father's name", 'Female', 'April 8, 1996']) {
      expect(find.text(english), findsNothing, reason: english);
    }
  });
}
