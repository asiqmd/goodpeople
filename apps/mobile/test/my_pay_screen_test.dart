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
import 'package:good_people/notifications/push_service.dart';
import 'package:good_people/payslips/declaration_card.dart';
import 'package:good_people/payslips/loans_tab.dart';
import 'package:good_people/payslips/my_pay_screen.dart';
import 'package:good_people/payslips/payslips_tab.dart';
import 'package:good_people/payslips/provident_fund_tab.dart';
import 'package:good_people/payslips/tax_tab.dart';
import 'package:good_people/settings/locale_controller.dart';

import 'support/fake_api.dart';

void main() {
  late FakeFileOpener opener;

  setUp(() => opener = FakeFileOpener());

  /// Scrolls the tab bar to [tab] (they do not all fit on a narrow phone)
  /// and opens it.
  Future<void> showTab(WidgetTester tester, MyPayTab tab) async {
    final finder = find.byKey(MyPayScreen.tabKey(tab));
    await tester.ensureVisible(finder);
    await tester.pumpAndSettle();
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  /// Signs in through the fake API with "today" fixed at [leaveToday]
  /// (24 October 2026, in the 2026-27 income year), shows the app in
  /// [locale], opens My pay from the home screen and, with [tab], that tab.
  /// The screen is phone-width, so overflow fails the test.
  Future<ProviderContainer> pumpMyPay(
    WidgetTester tester,
    FakeGoodPeopleApi api, {
    MyPayTab? tab,
    Locale locale = const Locale('en'),
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
        pushServiceProvider.overrideWithValue(const NoPushService()),
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
    await tester.ensureVisible(find.byKey(HomeScreen.myPayKey));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(HomeScreen.myPayKey));
    await tester.pumpAndSettle();
    if (tab != null) await showTab(tester, tab);
    return container;
  }

  Finder within(Key key, Finder finder) =>
      find.descendant(of: find.byKey(key), matching: finder);

  void expectIn(Key key, List<String> texts) {
    for (final text in texts) {
      expect(within(key, find.text(text)), findsOneWidget, reason: text);
    }
  }

  Future<void> tapKey(WidgetTester tester, Key key) async {
    final finder = find.byKey(key);
    await tester.ensureVisible(finder);
    await tester.pumpAndSettle();
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  Future<void> enter(WidgetTester tester, Key key, String text) async {
    final finder = find.byKey(key);
    await tester.ensureVisible(finder);
    await tester.pumpAndSettle();
    await tester.enterText(finder, text);
    await tester.pumpAndSettle();
  }

  Future<void> chooseKind(WidgetTester tester, int row, String label) async {
    await tapKey(tester, DeclarationCard.kindFieldKey(row));
    await tester.tap(find.text(label).last);
    await tester.pumpAndSettle();
  }

  group('My pay', () {
    testWidgets('four tabs; each loads the first time it is opened', (
      tester,
    ) async {
      final api = FakeGoodPeopleApi();
      await pumpMyPay(tester, api);

      expect(find.widgetWithText(AppBar, 'My pay'), findsOneWidget);
      for (final (tab, label) in [
        (MyPayTab.payslips, 'Payslips'),
        (MyPayTab.tax, 'Tax'),
        (MyPayTab.providentFund, 'Provident fund'),
        (MyPayTab.loans, 'Loans'),
      ]) {
        expect(
          within(MyPayScreen.tabKey(tab), find.text(label)),
          findsOneWidget,
        );
      }
      // Payslips first, and nothing else loaded yet.
      expect(find.byType(PayslipsTab), findsOneWidget);
      expect(api.payslipsCalls, 1);
      expect(api.taxYearQueries, isEmpty);
      expect(api.providentFundCalls, 0);
      expect(api.loansCalls, 0);

      await showTab(tester, MyPayTab.tax);
      expect(find.byType(TaxTab), findsOneWidget);
      expect(api.taxYearQueries, ['2026-27']);

      await showTab(tester, MyPayTab.providentFund);
      expect(api.providentFundCalls, 1);

      await showTab(tester, MyPayTab.loans);
      expect(api.loansCalls, 1);

      // Back to Payslips: kept, not loaded again.
      await showTab(tester, MyPayTab.payslips);
      expect(
        find.byKey(PayslipsTab.payslipKey(septemberPayslipId)),
        findsOneWidget,
      );
      expect(api.payslipsCalls, 1);
    });
  });

  group('tax', () {
    testWidgets('the year so far, the year\'s working and each month', (
      tester,
    ) async {
      await pumpMyPay(tester, FakeGoodPeopleApi(), tab: MyPayTab.tax);

      expect(find.byKey(TaxTab.fiscalYearKey('2026-27')), findsOneWidget);
      expect(find.byKey(TaxTab.fiscalYearKey('2025-26')), findsOneWidget);
      expectIn(TaxTab.summaryKey, [
        'Year so far',
        'Salary paid',
        '৳88,750.50',
        'Tax deducted',
        '৳1,750',
        'Tax for the year (estimated)',
        '৳9,000',
        'This month',
        '৳805.56',
        'Months left',
        '9',
        'Rebate',
        '৳3,000',
        'Tax-free threshold',
        '৳350,000',
      ]);
      expect(find.byKey(TaxTab.openingKey), findsNothing);

      expectIn(TaxTab.monthKey(julyRunId), [
        'July 2026',
        'Salary ৳25,000 · Tax ৳500',
        'Challan CH-2026-0701, deposited Aug 12, 2026',
      ]);
      expectIn(TaxTab.monthKey(augustRunId), [
        'August 2026',
        'Challan CH-2026-0802',
      ]);
      expectIn(TaxTab.monthKey(eidBonusRunId), [
        'August 2026',
        'Salary ৳12,500 · Tax ৳250',
      ]);
      expect(
        within(TaxTab.monthKindKey(eidBonusRunId), find.text('Bonus')),
        findsOneWidget,
      );
      expectIn(TaxTab.monthKey(septemberAdjustmentRunId), [
        'September 2026',
        'Salary ৳1,250.50 · Tax ৳0',
      ]);
      expect(
        within(
          TaxTab.monthKindKey(septemberAdjustmentRunId),
          find.text('Adjustment'),
        ),
        findsOneWidget,
      );
      expect(find.byKey(TaxTab.monthKindKey(julyRunId)), findsNothing);
    });

    testWidgets('the year before: no working yet, an opening balance and a '
        'verified declaration, read-only', (tester) async {
      final api = FakeGoodPeopleApi();
      await pumpMyPay(tester, api, tab: MyPayTab.tax);

      await tester.tap(find.byKey(TaxTab.fiscalYearKey('2025-26')));
      await tester.pumpAndSettle();

      expect(api.taxYearQueries, ['2026-27', '2025-26']);
      expectIn(TaxTab.summaryKey, [
        '৳288,000',
        "The year's tax shows here once payroll works it out from your "
            'salary.',
      ]);
      expect(find.byKey(TaxTab.workingKey), findsNothing);
      expect(
        find.text(
          'Includes ৳264,000 salary and ৳0 tax from earlier in the year, '
          'such as from a previous employer.',
        ),
        findsOneWidget,
      );
      expectIn(TaxTab.monthKey(juneRunId), ['June 2026']);

      // Verified: declared against accepted, and nothing to edit.
      expect(
        within(DeclarationCard.statusKey, find.text('Verified')),
        findsOneWidget,
      );
      expect(find.text('Verified on May 20, 2026'), findsOneWidget);
      expect(find.byKey(DeclarationCard.readOnlyKey), findsOneWidget);
      expect(find.byKey(DeclarationCard.formKey), findsNothing);
      expect(find.byKey(DeclarationCard.submitKey), findsNothing);
      expect(find.byKey(DeclarationCard.saveDraftKey), findsNothing);
      expect(find.byType(TextFormField), findsNothing);
      expectIn(DeclarationCard.itemKey(0), [
        'Savings certificates',
        'Declared',
        '৳50,000',
        'Accepted',
        '৳40,000',
      ]);
      expectIn(DeclarationCard.itemKey(1), [
        'Life insurance premium',
        'Jiban Bima policy 77812',
      ]);
      // Accepted in full.
      expect(
        within(DeclarationCard.itemKey(1), find.text('৳20,000')),
        findsNWidgets(2),
      );
      expectIn(DeclarationCard.totalKey, [
        'Declared in all',
        '৳70,000',
        '৳60,000',
      ]);

      // And back to this year.
      await tester.tap(find.byKey(TaxTab.fiscalYearKey('2026-27')));
      await tester.pumpAndSettle();
      expect(find.byKey(TaxTab.workingKey), findsOneWidget);
      expect(find.byKey(DeclarationCard.formKey), findsOneWidget);
    });

    testWidgets('the certificate opens in the app\'s language, or in the '
        'other one', (tester) async {
      final api = FakeGoodPeopleApi();
      await pumpMyPay(tester, api, tab: MyPayTab.tax);

      expect(find.text('Salary and tax certificate'), findsOneWidget);
      expect(
        tester.widget(find.byKey(TaxTab.certificateKey(LetterLanguage.en))),
        isA<FilledButton>(),
      );
      expect(
        within(
          TaxTab.certificateKey(LetterLanguage.en),
          find.text('Certificate (English)'),
        ),
        findsOneWidget,
      );
      await tapKey(tester, TaxTab.certificateKey(LetterLanguage.en));

      expect(api.taxCertificates, [
        (fiscalYear: '2026-27', language: LetterLanguage.en),
      ]);
      expect(opener.opened.single.bytes, pdfBytes);
      expect(
        opener.opened.single.fileName,
        'tax-certificate-MG-0005-2026-27-en.pdf',
      );
      expect(opener.opened.single.contentType, 'application/pdf');

      // The year before, in Bangla.
      await tester.tap(find.byKey(TaxTab.fiscalYearKey('2025-26')));
      await tester.pumpAndSettle();
      await tapKey(tester, TaxTab.certificateKey(LetterLanguage.bn));
      expect(api.taxCertificates.last, (
        fiscalYear: '2025-26',
        language: LetterLanguage.bn,
      ));
      expect(
        opener.opened.last.fileName,
        'tax-certificate-MG-0005-2025-26-bn.pdf',
      );

      // No PDF reader says so.
      opener.error = const FileOpenFailed(FileOpenProblem.noApp);
      await tapKey(tester, TaxTab.certificateKey(LetterLanguage.en));
      expect(
        find.text(
          'No app on this phone can open this file. Install a PDF reader and '
          'try again.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('submitting the declaration sends every item and shows it '
        'Submitted', (tester) async {
      final api = FakeGoodPeopleApi();
      await pumpMyPay(tester, api, tab: MyPayTab.tax);

      expect(
        within(DeclarationCard.statusKey, find.text('Draft')),
        findsOneWidget,
      );
      expect(
        find.text(
          'Declared investments lower the tax deducted each month; payroll '
          'checks your proofs and the accepted amounts then count instead.',
        ),
        findsOneWidget,
      );
      // The draft as saved, ready to change.
      expect(
        within(
          DeclarationCard.kindFieldKey(0),
          find.text('Savings certificates'),
        ),
        findsOneWidget,
      );
      expect(
        within(DeclarationCard.amountFieldKey(0), find.text('100000')),
        findsOneWidget,
      );

      // Grouping commas and Bangla digits are fine.
      await enter(tester, DeclarationCard.amountFieldKey(0), '1,20,000');
      await tapKey(tester, DeclarationCard.addRowKey);
      await chooseKind(tester, 1, 'DPS');
      await enter(tester, DeclarationCard.amountFieldKey(1), '২৪০০০');
      await enter(tester, DeclarationCard.noteFieldKey(1), 'Sonali Bank DPS');
      // A line left empty is not sent.
      await tapKey(tester, DeclarationCard.addRowKey);
      expectIn(DeclarationCard.totalKey, ['Declared in all', '৳144,000']);

      await tapKey(tester, DeclarationCard.submitKey);

      expect(api.declarationSaves.single.fiscalYear, '2026-27');
      expect(api.declarationSaves.single.body, {
        'items': [
          {
            'kind': 'savings_certificate',
            'declared': '120000',
            'note': 'Sanchaypatra from Sonali Bank',
          },
          {'kind': 'dps', 'declared': '24000', 'note': 'Sonali Bank DPS'},
        ],
        'submit': true,
      });
      expect(find.text('Sent to payroll.'), findsOneWidget);
      expect(
        within(DeclarationCard.statusKey, find.text('Submitted')),
        findsOneWidget,
      );
      expect(find.text('Submitted on Oct 24, 2026'), findsOneWidget);
      // The year reloaded with it; the form shows what was saved.
      expect(api.taxYearQueries, ['2026-27', '2026-27']);
      expect(find.byKey(DeclarationCard.amountFieldKey(2)), findsNothing);
      expect(
        within(DeclarationCard.amountFieldKey(1), find.text('24000')),
        findsOneWidget,
      );
      // Still open to changes until payroll verifies it.
      expect(find.byKey(DeclarationCard.submitKey), findsOneWidget);
    });

    testWidgets('a draft is saved without submitting; amounts are checked '
        'first and the server\'s problems are shown', (tester) async {
      final api = FakeGoodPeopleApi();
      await pumpMyPay(tester, api, tab: MyPayTab.tax);

      await enter(tester, DeclarationCard.amountFieldKey(0), '12,500.505');
      await tapKey(tester, DeclarationCard.saveDraftKey);
      expect(
        find.text('Enter an amount like 12500 or 12500.50'),
        findsOneWidget,
      );
      expect(api.declarationSaves, isEmpty);

      // A line with an amount needs a kind.
      await enter(tester, DeclarationCard.amountFieldKey(0), '12500.50');
      await tapKey(tester, DeclarationCard.addRowKey);
      await enter(tester, DeclarationCard.amountFieldKey(1), '500');
      await tapKey(tester, DeclarationCard.saveDraftKey);
      expect(find.text('Choose what you invested in'), findsOneWidget);
      expect(api.declarationSaves, isEmpty);
      await tapKey(tester, DeclarationCard.removeRowKey(1));

      api.declarationErrors.add(
        const ApiException(
          kind: ApiErrorKind.server,
          statusCode: 400,
          code: 'validation_failed',
          message: 'Validation failed',
          issues: [
            ApiIssue(
              path: 'items.0.declared',
              message: 'Enter an amount like 12500 or 12500.50',
            ),
          ],
        ),
      );
      await tapKey(tester, DeclarationCard.saveDraftKey);
      expect(api.declarationSaves.single.body['submit'], false);
      expect(
        within(
          DeclarationCard.errorKey,
          find.text('Check the amounts and try again.'),
        ),
        findsOneWidget,
      );
      expect(
        within(
          DeclarationCard.errorKey,
          find.text('• Enter an amount like 12500 or 12500.50'),
        ),
        findsOneWidget,
      );

      await tapKey(tester, DeclarationCard.saveDraftKey);
      expect(api.declarationSaves.last.body, {
        'items': [
          {
            'kind': 'savings_certificate',
            'declared': '12500.50',
            'note': 'Sanchaypatra from Sonali Bank',
          },
        ],
        'submit': false,
      });
      expect(find.text('Draft saved.'), findsOneWidget);
      expect(find.byKey(DeclarationCard.errorKey), findsNothing);
      expect(
        within(DeclarationCard.statusKey, find.text('Draft')),
        findsOneWidget,
      );
    });

    testWidgets('a declaration payroll verified meanwhile says so and turns '
        'read-only', (tester) async {
      final api = FakeGoodPeopleApi();
      await pumpMyPay(tester, api, tab: MyPayTab.tax);

      api.declarationErrors.add(
        const ApiException(
          kind: ApiErrorKind.server,
          statusCode: 409,
          code: 'declaration_verified',
          message: 'Payroll has verified this declaration already',
        ),
      );
      api.taxYears = {
        ...api.taxYears,
        '2026-27': taxYearJson(
          declaration: declarationJson(
            status: 'verified',
            items: [declarationItemJson(verified: '80000.00')],
            verified: '80000.00',
            verifiedAt: '2026-10-24T08:00:00.000Z',
          ),
        ),
      };
      await enter(tester, DeclarationCard.amountFieldKey(0), '150000');
      await tapKey(tester, DeclarationCard.submitKey);

      expect(
        find.text(
          'Payroll has verified this declaration, so it can no longer be '
          'changed.',
        ),
        findsOneWidget,
      );
      expect(api.taxYearQueries, ['2026-27', '2026-27']);
      expect(find.byKey(DeclarationCard.formKey), findsNothing);
      expect(find.byKey(DeclarationCard.readOnlyKey), findsOneWidget);
      expectIn(DeclarationCard.itemKey(0), ['৳100,000', '৳80,000']);
    });

    testWidgets('a failed load says why and tries again; no employee record '
        'says so', (tester) async {
      final api = FakeGoodPeopleApi()..taxYearErrors.add(noConnection);
      await pumpMyPay(tester, api, tab: MyPayTab.tax);

      expect(find.text('We could not load your tax.'), findsOneWidget);
      await tester.tap(find.text('Try again'));
      await tester.pumpAndSettle();
      expect(find.byKey(TaxTab.summaryKey), findsOneWidget);

      api.taxYears = {};
      await tester.tap(find.byKey(TaxTab.fiscalYearKey('2025-26')));
      await tester.pumpAndSettle();
      expect(find.text('No employee record'), findsOneWidget);
      expect(
        find.text(
          'Salary tax belongs to an employee record, and your login is not '
          'linked to one. If you think it should be, ask your HR team.',
        ),
        findsOneWidget,
      );
    });
  });

  group('provident fund', () {
    testWidgets('a member sees both accounts, what is payable today and '
        'every entry; money out is red', (tester) async {
      final api = FakeGoodPeopleApi();
      await pumpMyPay(tester, api, tab: MyPayTab.providentFund);

      expectIn(ProvidentFundTab.balanceKey, [
        'Total balance',
        '৳82,000',
        'Your contributions',
        '৳42,000',
        "Employer's contributions",
        '৳40,000',
        'Member since March 1, 2021',
      ]);
      expectIn(ProvidentFundTab.payableKey, [
        'Payable if you left today',
        '৳62,000',
        "Your contributions and 50% of the employer's share",
      ]);

      expect(find.text('Statement'), findsOneWidget);
      expectIn(ProvidentFundTab.entryKey(pfEntryIds[0]), [
        'Opening balance',
        'Jul 1, 2026 · Your account',
        'Balance from the old fund',
        '৳38,000',
      ]);
      expectIn(ProvidentFundTab.entryKey(pfEntryIds[1]), [
        'Contribution',
        "Sep 30, 2026 · Employer's account",
        '৳2,000',
      ]);
      expectIn(ProvidentFundTab.entryKey(pfEntryIds[2]), [
        'Interest',
        '৳4,500.50',
      ]);
      expectIn(ProvidentFundTab.entryKey(pfEntryIds[3]), [
        'Withdrawal',
        '-৳500.50',
      ]);

      final scheme = Theme.of(tester.element(find.byType(ProvidentFundTab)))
          .colorScheme;
      Color? colorOf(String id) => tester
          .widget<Text>(find.byKey(ProvidentFundTab.entryAmountKey(id)))
          .style
          ?.color;
      expect(colorOf(pfEntryIds[3]), scheme.error);
      expect(colorOf(pfEntryIds[1]), isNot(scheme.error));

      // Pull to refresh loads it again.
      await tester.fling(
        find.byType(ListView).last,
        const Offset(0, 1000),
        1000,
      );
      await tester.pumpAndSettle();
      expect(api.providentFundCalls, 2);
    });

    testWidgets('not a member says so', (tester) async {
      final api = FakeGoodPeopleApi()..providentFund = null;
      await pumpMyPay(tester, api, tab: MyPayTab.providentFund);

      expect(
        find.text('You are not a member of the provident fund.'),
        findsOneWidget,
      );
      expect(find.byKey(ProvidentFundTab.balanceKey), findsNothing);
    });

    testWidgets('a failed load says why and tries again', (tester) async {
      final api = FakeGoodPeopleApi()..providentFundErrors.add(noConnection);
      await pumpMyPay(tester, api, tab: MyPayTab.providentFund);

      expect(
        find.text('We could not load your provident fund.'),
        findsOneWidget,
      );
      await tester.tap(find.text('Try again'));
      await tester.pumpAndSettle();
      expect(find.byKey(ProvidentFundTab.balanceKey), findsOneWidget);
    });
  });

  group('loans', () {
    testWidgets('each advance or loan with its status and amounts; '
        'repayments expand', (tester) async {
      await pumpMyPay(tester, FakeGoodPeopleApi(), tab: MyPayTab.loans);

      expectIn(LoansTab.loanKey(advanceId), [
        'Salary advance',
        'Active',
        'Principal',
        '৳10,000',
        'Per month',
        'Outstanding',
        '৳7,500',
        'Repaid',
        'First deduction',
        'September 2026',
        'Eid shopping',
        'Repayments (1)',
      ]);
      // Paid off: the principal, all repaid.
      expect(
        within(LoansTab.loanKey(closedLoanId), find.text('৳20,000')),
        findsNWidgets(2),
      );
      expectIn(LoansTab.loanKey(closedLoanId), [
        'Provident fund loan',
        'Closed',
        '৳0',
        'February 2026',
        'Repayments (2)',
      ]);
      expect(find.text('Paid at the office'), findsNothing);

      await tapKey(tester, LoansTab.repaymentsKey(closedLoanId));
      expectIn(LoansTab.repaymentsKey(closedLoanId), [
        'May 31, 2026',
        'Deducted from salary',
        '৳15,000',
        'Jun 10, 2026',
        'Paid in',
        'Paid at the office',
        '৳5,000',
      ]);
    });

    testWidgets('none says so', (tester) async {
      final api = FakeGoodPeopleApi()..loans = [];
      await pumpMyPay(tester, api, tab: MyPayTab.loans);

      expect(find.text('No advances or loans.'), findsOneWidget);
      expect(find.byType(Card), findsNothing);
    });
  });

  testWidgets('in Bangla: Bangla tabs, labels and digits', (tester) async {
    final api = FakeGoodPeopleApi();
    await pumpMyPay(tester, api, locale: const Locale('bn'), tab: MyPayTab.tax);

    expect(find.widgetWithText(AppBar, 'আমার বেতন'), findsOneWidget);
    for (final (tab, label) in [
      (MyPayTab.payslips, 'বেতন বিবরণী'),
      (MyPayTab.tax, 'কর'),
      (MyPayTab.providentFund, 'ভবিষ্য তহবিল'),
      (MyPayTab.loans, 'ঋণ'),
    ]) {
      expect(within(MyPayScreen.tabKey(tab), find.text(label)), findsOneWidget);
    }
    expect(
      tester.widget<Text>(find.byKey(TaxTab.fiscalYearKey('2026-27'))).data,
      '২০২৬-২৭',
    );
    expect(
      tester.widget<Text>(find.byKey(TaxTab.fiscalYearKey('2025-26'))).data,
      '২০২৫-২৬',
    );
    expectIn(TaxTab.summaryKey, [
      'এ বছর এ পর্যন্ত',
      'পরিশোধিত বেতন',
      '৳৮৮,৭৫০.৫০',
      'বছরের মোট কর (আনুমানিক)',
      '৳৯,০০০',
      'বাকি মাস',
      '৯',
    ]);
    expectIn(TaxTab.monthKey(julyRunId), [
      'জুলাই ২০২৬',
      'বেতন ৳২৫,০০০ · কর ৳৫০০',
    ]);
    expect(
      within(TaxTab.monthKindKey(eidBonusRunId), find.text('বোনাস')),
      findsOneWidget,
    );
    expect(
      within(DeclarationCard.statusKey, find.text('খসড়া')),
      findsOneWidget,
    );
    expect(
      within(DeclarationCard.kindFieldKey(0), find.text('সঞ্চয়পত্র')),
      findsOneWidget,
    );
    // Bangla is the filled button.
    expect(
      tester.widget(find.byKey(TaxTab.certificateKey(LetterLanguage.bn))),
      isA<FilledButton>(),
    );
    expect(find.text('সনদ (বাংলা)'), findsOneWidget);

    await showTab(tester, MyPayTab.loans);
    expectIn(LoansTab.loanKey(advanceId), [
      'বেতন অগ্রিম',
      'চলমান',
      'মাসিক কিস্তি',
      '৳১০,০০০',
      'সেপ্টেম্বর ২০২৬',
    ]);

    await showTab(tester, MyPayTab.providentFund);
    expectIn(ProvidentFundTab.payableKey, [
      'আজ চাকরি ছাড়লে প্রাপ্য',
      '৳৬২,০০০',
      'আপনার চাঁদা ও নিয়োগকর্তার অংশের ৫০%',
    ]);
  });
}
