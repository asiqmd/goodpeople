import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:good_people/api/api_exception.dart';
import 'package:good_people/api/api_models.dart';
import 'package:good_people/api/good_people_api.dart';
import 'package:good_people/app.dart';
import 'package:good_people/auth/auth_controller.dart';
import 'package:good_people/home/home_screen.dart';
import 'package:good_people/leave/apply_tab.dart';
import 'package:good_people/leave/approvals_tab.dart';
import 'package:good_people/leave/balances_tab.dart';
import 'package:good_people/leave/holidays_tab.dart';
import 'package:good_people/leave/leave_providers.dart';
import 'package:good_people/leave/leave_screen.dart';
import 'package:good_people/leave/leave_widgets.dart';
import 'package:good_people/leave/requests_tab.dart';
import 'package:good_people/settings/locale_controller.dart';

import 'support/fake_api.dart';

const _newRequestId = 'b0000000-0000-4000-8000-0000000000ff';

void main() {
  /// Signs in through the fake API with "today" fixed at [leaveToday], shows
  /// the app in [locale] and, if [open], opens Leave from the home screen.
  /// The screen is phone-width, so overflow fails the test.
  Future<void> pumpLeave(
    WidgetTester tester,
    FakeGoodPeopleApi api, {
    Locale locale = const Locale('en'),
    bool open = true,
  }) async {
    tester.view.physicalSize = const Size(360, 2400);
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
    if (open) {
      await tester.tap(find.byKey(HomeScreen.leaveKey));
      await tester.pumpAndSettle();
    }
  }

  /// Scrolls the tab bar to [tab], as on a phone, and taps it.
  Future<void> openTab(WidgetTester tester, LeaveTab tab) async {
    final finder = find.byKey(LeaveScreen.tabKey(tab));
    await tester.ensureVisible(finder);
    await tester.pumpAndSettle();
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  /// Opens the date picker from [field] and picks [day] of the month shown.
  Future<void> pickDay(WidgetTester tester, Key field, String day) async {
    await tester.tap(find.byKey(field));
    await tester.pumpAndSettle();
    await tester.tap(find.text(day));
    final ok = MaterialLocalizations.of(
      tester.element(find.byType(DatePickerDialog)),
    ).okButtonLabel;
    await tester.tap(find.text(ok));
    await tester.pumpAndSettle();
  }

  Future<void> chooseType(WidgetTester tester, String name) async {
    await tester.tap(find.byKey(ApplyTab.typeFieldKey));
    await tester.pumpAndSettle();
    await tester.tap(find.text(name).last);
    await tester.pumpAndSettle();
  }

  Finder within(Key key, Finder finder) =>
      find.descendant(of: find.byKey(key), matching: finder);

  /// The status pill of the request card with [requestId].
  Finder statusOf(String requestId, String label) => within(
    RequestsTab.requestKey(requestId),
    find.widgetWithText(LeavePill, label),
  );

  bool submitEnabled(WidgetTester tester) =>
      tester.widget<FilledButton>(find.byKey(ApplyTab.submitKey)).onPressed !=
      null;

  test('the apply form offers active types the employee can take', () {
    final types = [
      for (final json in leaveTypesJson()) LeaveType.fromJson(json),
    ];
    List<String> codes(Gender? gender) => [
      for (final type in applicableLeaveTypes(types, gender)) type.code,
    ];

    expect(codes(Gender.female), ['CL', 'SL', 'EL', 'ML']);
    expect(codes(Gender.male), ['CL', 'SL', 'EL', 'PL']);
    // Gender not known: every active type.
    expect(codes(null), ['CL', 'SL', 'EL', 'ML', 'PL']);
    expect(codes(Gender.unknown), ['CL', 'SL', 'EL', 'ML', 'PL']);
  });

  group('home', () {
    testWidgets('a Leave card next to My profile opens Leave', (tester) async {
      final api = FakeGoodPeopleApi();
      await pumpLeave(tester, api, open: false);

      expect(find.byKey(HomeScreen.myProfileKey), findsOneWidget);
      expect(within(HomeScreen.leaveKey, find.text('Leave')), findsOneWidget);

      await tester.tap(find.byKey(HomeScreen.leaveKey));
      await tester.pumpAndSettle();

      expect(find.byType(LeaveScreen), findsOneWidget);
      expect(find.widgetWithText(AppBar, 'Leave'), findsOneWidget);
      // Only the first tab and the approval inbox load at first.
      expect(api.balanceYears, [2026]);
      expect(api.approvalCalls, 1);
      expect(api.leaveTypeCalls, 0);
      expect(api.requestYears, isEmpty);
      expect(api.holidayYears, isEmpty);
    });

    testWidgets('no Leave card without the leave module', (tester) async {
      final api = FakeGoodPeopleApi()
        ..accessView = TenantAccessView.fromJson(
          accessJson(features: const ['core_hr']),
        );
      await pumpLeave(tester, api, open: false);

      expect(find.byKey(HomeScreen.myProfileKey), findsOneWidget);
      expect(find.byKey(HomeScreen.leaveKey), findsNothing);
    });
  });

  testWidgets('balances show halves, per-event leave and eligibility', (
    tester,
  ) async {
    final api = FakeGoodPeopleApi();
    await pumpLeave(tester, api);

    Finder inBalance(String id, String text) =>
        within(BalancesTab.balanceKey(id), find.text(text));

    expect(inBalance(casualLeaveId, 'Casual leave'), findsOneWidget);
    expect(inBalance(casualLeaveId, '8.5 days'), findsOneWidget);
    expect(inBalance(casualLeaveId, 'Available'), findsOneWidget);
    expect(inBalance(casualLeaveId, '10'), findsOneWidget);
    expect(inBalance(casualLeaveId, '1.5'), findsOneWidget);

    expect(inBalance(sickLeaveId, '12 days'), findsOneWidget);
    expect(inBalance(sickLeaveId, '2'), findsOneWidget);

    expect(inBalance(earnedLeaveId, 'Carried forward'), findsOneWidget);
    expect(inBalance(earnedLeaveId, '4'), findsOneWidget);
    expect(
      inBalance(earnedLeaveId, 'Eligible from March 1, 2027'),
      findsOneWidget,
    );
    // No carry-forward or eligibility date on the others.
    expect(inBalance(casualLeaveId, 'Carried forward'), findsNothing);
    expect(find.textContaining('Eligible from'), findsOneWidget);

    // Maternity has no yearly balance.
    expect(inBalance(maternityLeaveId, 'Maternity leave'), findsOneWidget);
    expect(inBalance(maternityLeaveId, 'On request'), findsOneWidget);
    expect(inBalance(maternityLeaveId, 'Entitlement'), findsNothing);
    expect(inBalance(maternityLeaveId, 'Available'), findsNothing);

    // Next year.
    await tester.tap(find.byKey(LeaveYearSwitcher.yearKey(2027)));
    await tester.pumpAndSettle();
    expect(api.balanceYears, [2026, 2027]);
    expect(inBalance(casualLeaveId, '8.5 days'), findsOneWidget);
  });

  testWidgets('a login with no employee record sees an empty state', (
    tester,
  ) async {
    final api = FakeGoodPeopleApi()
      ..balanceErrors.add(noEmployeeRecord)
      ..employeeResults.add(noEmployeeRecord);
    await pumpLeave(tester, api);

    expect(find.text('No employee record'), findsOneWidget);
    expect(find.text('We could not load your leave.'), findsNothing);

    await openTab(tester, LeaveTab.apply);
    expect(find.text('No employee record'), findsOneWidget);
    expect(find.byKey(ApplyTab.typeFieldKey), findsNothing);
  });

  testWidgets('apply: the preview shows problems and blocks Send until they '
      'clear, then Send posts the request body', (tester) async {
    final api = FakeGoodPeopleApi()
      ..previewFor = (draft) {
        final longer = draft.endDate == DateTime.utc(2026, 10, 31);
        return LeavePreview.fromJson({
          'days': longer ? 2 : (draft.halfDay == null ? 1 : 0.5),
          'excluded': [
            if (longer) {'date': '2026-10-30', 'reason': 'weekly_off'},
          ],
          'balance': balanceJson(casualLeaveJson, taken: 9, available: 1),
          'problems': [if (longer) 'Only 1 days available.'],
        });
      };
    await pumpLeave(tester, api);
    await openTab(tester, LeaveTab.apply);

    expect(
      find.text(
        'Choose a leave type and dates to see how many days '
        'this takes.',
      ),
      findsOneWidget,
    );
    expect(submitEnabled(tester), isFalse);

    // Active types this employee can take: no paternity (male only) and no
    // inactive type.
    await tester.tap(find.byKey(ApplyTab.typeFieldKey));
    await tester.pumpAndSettle();
    expect(find.text('Maternity leave'), findsOneWidget);
    expect(find.text('Paternity leave'), findsNothing);
    expect(find.text('Old special leave'), findsNothing);
    await tester.tap(find.text('Casual leave').last);
    await tester.pumpAndSettle();
    expect(api.previews, isEmpty);

    // Thursday 29 to Saturday 31 October; Friday is the weekly off.
    await pickDay(tester, ApplyTab.startFieldKey, '29');
    expect(api.previews.last, {
      'leaveTypeId': casualLeaveId,
      'startDate': '2026-10-29',
      'endDate': '2026-10-29',
      'halfDay': null,
    });
    await pickDay(tester, ApplyTab.endFieldKey, '31');
    expect(api.previews.last['endDate'], '2026-10-31');

    final preview = find.byKey(ApplyTab.previewKey);
    Finder inPreview(String text) =>
        find.descendant(of: preview, matching: find.text(text));
    expect(inPreview('2 days'), findsOneWidget);
    expect(inPreview('Fri, Oct 30'), findsOneWidget);
    expect(inPreview('Weekly off'), findsOneWidget);
    expect(inPreview('1 day'), findsOneWidget); // available
    expect(inPreview('This request can\'t be sent yet:'), findsOneWidget);
    expect(inPreview('• Only 1 days available.'), findsOneWidget);
    expect(submitEnabled(tester), isFalse);
    // Several days: no half-day choice.
    expect(find.byKey(ApplyTab.dayPartKey), findsNothing);

    // Back to one day: the problem clears and a half day is possible.
    await pickDay(tester, ApplyTab.endFieldKey, '29');
    expect(inPreview('1 day'), findsNWidgets(2));
    expect(find.textContaining('Only 1 days available.'), findsNothing);
    expect(submitEnabled(tester), isTrue);

    await tester.tap(find.text('First half'));
    await tester.pumpAndSettle();
    expect(api.previews.last['halfDay'], 'first_half');
    expect(inPreview('0.5 days'), findsOneWidget);

    // The reason needs at least 3 characters.
    await tester.enterText(find.byKey(ApplyTab.reasonFieldKey), 'ab');
    await tester.tap(find.byKey(ApplyTab.submitKey));
    await tester.pumpAndSettle();
    expect(find.text('Write at least 3 characters'), findsOneWidget);
    expect(api.applications, isEmpty);

    await tester.enterText(
      find.byKey(ApplyTab.reasonFieldKey),
      '  Family wedding  ',
    );
    await tester.tap(find.byKey(ApplyTab.submitKey));
    await tester.pumpAndSettle();

    expect(api.applications.single, {
      'leaveTypeId': casualLeaveId,
      'startDate': '2026-10-29',
      'endDate': '2026-10-29',
      'halfDay': 'first_half',
      'reason': 'Family wedding',
    });

    // The new request, as the API returned it; balances reload.
    final submitted = find.byKey(ApplyTab.submittedKey);
    expect(
      find.descendant(of: submitted, matching: find.text('Leave request sent')),
      findsOneWidget,
    );
    for (final text in [
      'Casual leave',
      'Pending',
      'Oct 29, 2026 · First half · 0.5 days',
      'Family wedding',
      'Manager: Shirin Akter',
    ]) {
      expect(
        find.descendant(of: submitted, matching: find.text(text)),
        findsOneWidget,
        reason: text,
      );
    }
    expect(api.balanceYears, [2026, 2026]);

    // It is first under My requests.
    await tester.tap(find.byKey(ApplyTab.showRequestsKey));
    await tester.pumpAndSettle();
    expect(find.byKey(RequestsTab.requestKey(_newRequestId)), findsOneWidget);
    final first = tester
        .widgetList<LeaveRequestCard>(find.byType(LeaveRequestCard))
        .first;
    expect(first.request.id, _newRequestId);

    // Apply again starts from an empty form.
    await openTab(tester, LeaveTab.apply);
    expect(find.byKey(ApplyTab.submittedKey), findsNothing);
    expect(find.byKey(ApplyTab.typeFieldKey), findsOneWidget);
    expect(submitEnabled(tester), isFalse);
  });

  testWidgets('apply: a leave_not_allowed answer shows the API problems', (
    tester,
  ) async {
    final api = FakeGoodPeopleApi()
      ..applyError = const ApiException(
        kind: ApiErrorKind.server,
        statusCode: 400,
        code: 'leave_not_allowed',
        message: 'This overlaps another leave request.',
      );
    await pumpLeave(tester, api);
    await openTab(tester, LeaveTab.apply);

    await chooseType(tester, 'Sick leave');
    expect(
      find.text('A supporting document is needed for more than 2 days.'),
      findsOneWidget,
    );
    await pickDay(tester, ApplyTab.startFieldKey, '27');
    await tester.enterText(find.byKey(ApplyTab.reasonFieldKey), 'Fever');
    await tester.tap(find.byKey(ApplyTab.submitKey));
    await tester.pumpAndSettle();

    expect(api.applications, hasLength(1));
    expect(
      within(
        ApplyTab.problemsKey,
        find.text('• This overlaps another leave request.'),
      ),
      findsOneWidget,
    );
    expect(find.byKey(ApplyTab.submittedKey), findsNothing);
    expect(submitEnabled(tester), isFalse);
  });

  testWidgets('my requests show statuses and the approval trail', (
    tester,
  ) async {
    final api = FakeGoodPeopleApi();
    await pumpLeave(tester, api);
    await openTab(tester, LeaveTab.requests);

    expect(api.requestYears, [2026]);
    void expectIn(String id, List<String> texts) {
      for (final text in texts) {
        expect(
          within(RequestsTab.requestKey(id), find.text(text)),
          findsOneWidget,
          reason: '$id: $text',
        );
      }
    }

    expect(statusOf(pendingRequestId, 'Pending'), findsOneWidget);
    expect(statusOf(startedRequestId, 'Approved'), findsOneWidget);
    expect(statusOf(rejectedRequestId, 'Rejected'), findsOneWidget);
    expect(statusOf(approvedFutureId, 'Approved'), findsOneWidget);
    expectIn(pendingRequestId, [
      'Casual leave',
      'Nov 2 – Nov 3, 2026 · 2 days',
      'Family wedding in Mymensingh',
      'Manager: Shirin Akter',
      'Awaiting decision',
      'HR team',
      'Waiting for previous step',
    ]);
    expectIn(startedRequestId, [
      'Sick leave',
      'Supporting document needed',
      'Shirin Akter, Oct 19, 2026',
      '“Get well soon”',
      'Kamal Hossain, Oct 19, 2026',
    ]);
    expectIn(rejectedRequestId, [
      'Sep 10, 2026 · First half · 0.5 days',
      '“Line shortage that day”',
      'Skipped',
    ]);

    // Pending, or approved and not started: can cancel. Started or decided
    // against: cannot.
    for (final (id, cancellable) in [
      (approvedFutureId, true),
      (pendingRequestId, true),
      (startedRequestId, false),
      (rejectedRequestId, false),
    ]) {
      expect(
        find.byKey(LeaveRequestCard.cancelKey(id)),
        cancellable ? findsOneWidget : findsNothing,
        reason: id,
      );
    }
  });

  testWidgets('cancelling asks first, then cancels and reloads', (
    tester,
  ) async {
    final api = FakeGoodPeopleApi();
    await pumpLeave(tester, api);
    await openTab(tester, LeaveTab.requests);

    final cancel = find.byKey(LeaveRequestCard.cancelKey(pendingRequestId));
    await tester.tap(cancel);
    await tester.pumpAndSettle();
    expect(find.text('Cancel this request?'), findsOneWidget);
    expect(
      find.text(
        'Casual leave, Nov 2 – Nov 3, 2026. Days not yet taken go back to '
        'your balance.',
      ),
      findsOneWidget,
    );

    await tester.tap(find.text('Keep it'));
    await tester.pumpAndSettle();
    expect(api.cancelledIds, isEmpty);
    expect(find.text('Cancel this request?'), findsNothing);

    await tester.tap(cancel);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(RequestsTab.confirmCancelKey));
    await tester.pumpAndSettle();

    expect(api.cancelledIds, [pendingRequestId]);
    expect(find.text('Request cancelled'), findsOneWidget);
    expect(api.requestYears, [2026, 2026]);
    expect(api.balanceYears, [2026, 2026]);
    expect(statusOf(pendingRequestId, 'Cancelled'), findsOneWidget);
    expect(cancel, findsNothing);
  });

  testWidgets('a cancel the API refuses shows its message', (tester) async {
    final api = FakeGoodPeopleApi()
      ..cancelError = const ApiException(
        kind: ApiErrorKind.server,
        statusCode: 409,
        message:
            'Leave that has started cannot be cancelled; ask HR to '
            'adjust it',
      );
    await pumpLeave(tester, api);
    await openTab(tester, LeaveTab.requests);

    await tester.tap(find.byKey(LeaveRequestCard.cancelKey(approvedFutureId)));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(RequestsTab.confirmCancelKey));
    await tester.pumpAndSettle();

    expect(api.cancelledIds, [approvedFutureId]);
    expect(
      find.text(
        'Leave that has started cannot be cancelled; ask HR to adjust it',
      ),
      findsOneWidget,
    );
    expect(statusOf(approvedFutureId, 'Approved'), findsOneWidget);
  });

  testWidgets('no Approvals tab while the inbox is empty', (tester) async {
    final api = FakeGoodPeopleApi();
    await pumpLeave(tester, api);

    expect(api.approvalCalls, 1);
    expect(find.byKey(LeaveScreen.tabKey(LeaveTab.approvals)), findsNothing);
    expect(find.byKey(LeaveScreen.approvalsBadgeKey), findsNothing);
    for (final tab in [
      LeaveTab.balances,
      LeaveTab.apply,
      LeaveTab.requests,
      LeaveTab.holidays,
    ]) {
      expect(find.byKey(LeaveScreen.tabKey(tab)), findsOneWidget);
    }
  });

  testWidgets('approvals: a badge with the count; approve and reject call '
      'the API', (tester) async {
    final api = FakeGoodPeopleApi()..approvals = approvalsJson();
    await pumpLeave(tester, api);

    final tab = find.byKey(LeaveScreen.tabKey(LeaveTab.approvals));
    expect(
      find.descendant(of: tab, matching: find.text('Approvals')),
      findsOneWidget,
    );
    expect(
      within(LeaveScreen.approvalsBadgeKey, find.text('2')),
      findsOneWidget,
    );

    await openTab(tester, LeaveTab.approvals);

    void expectIn(String stepId, List<String> texts) {
      for (final text in texts) {
        expect(
          within(ApprovalsTab.itemKey(stepId), find.text(text)),
          findsOneWidget,
          reason: '$stepId: $text',
        );
      }
    }

    expectIn(managerStepId, [
      'Jamal Uddin',
      'MG-0007',
      'Your step: Manager',
      'Casual leave',
      'Oct 28 – Oct 29, 2026 · 2 days',
      'My son is sick',
      'Their balance',
      '6 days available',
    ]);
    expectIn(hrStepId, [
      'Nasima Begum',
      'Your step: HR',
      'Maternity leave',
      'Nov 15 – Dec 31, 2026 · 47 days',
      'On request',
      'Shirin Akter, Oct 23, 2026',
    ]);

    // Approve with a comment.
    await tester.tap(find.byKey(ApprovalsTab.approveKey(managerStepId)));
    await tester.pumpAndSettle();
    expect(find.text('Approve this leave?'), findsOneWidget);
    await tester.enterText(
      find.byKey(ApprovalsTab.commentFieldKey),
      ' Get well soon, Rafi ',
    );
    await tester.tap(find.byKey(ApprovalsTab.confirmKey));
    await tester.pumpAndSettle();

    expect(api.decisions, [
      (
        stepId: managerStepId,
        decision: ApprovalDecision.approve,
        comment: 'Get well soon, Rafi',
      ),
    ]);
    expect(find.text('Leave approved'), findsOneWidget);
    expect(find.byKey(ApprovalsTab.itemKey(managerStepId)), findsNothing);
    expect(
      within(LeaveScreen.approvalsBadgeKey, find.text('1')),
      findsOneWidget,
    );

    // Dismissing the dialog sends nothing.
    await tester.tap(find.byKey(ApprovalsTab.rejectKey(hrStepId)));
    await tester.pumpAndSettle();
    expect(find.text('Reject this leave?'), findsOneWidget);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(api.decisions, hasLength(1));

    // Reject the last one without a comment: the tab goes away.
    await tester.tap(find.byKey(ApprovalsTab.rejectKey(hrStepId)));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(ApprovalsTab.confirmKey));
    await tester.pumpAndSettle();

    expect(api.decisions.last, (
      stepId: hrStepId,
      decision: ApprovalDecision.reject,
      comment: null,
    ));
    expect(tab, findsNothing);
    expect(find.byKey(BalancesTab.balanceKey(casualLeaveId)), findsOneWidget);
  });

  testWidgets('holidays list the year and mark tentative dates', (
    tester,
  ) async {
    final api = FakeGoodPeopleApi();
    await pumpLeave(tester, api);
    await openTab(tester, LeaveTab.holidays);

    expect(api.holidayYears, [2026]);
    expect(find.text('Bangladesh public holidays'), findsOneWidget);

    Finder inHoliday(int n, String text) => within(
      HolidaysTab.holidayKey('f1000000-0000-4000-8000-00000000000$n'),
      find.text(text),
    );
    expect(inHoliday(4, 'Wed, Dec 16'), findsOneWidget);
    expect(inHoliday(4, 'Victory Day'), findsOneWidget);
    expect(inHoliday(4, 'Public holiday'), findsOneWidget);
    expect(inHoliday(4, 'Tentative'), findsNothing);
    expect(inHoliday(2, 'Eid ul-Fitr'), findsOneWidget);
    expect(inHoliday(2, 'Festival holiday'), findsOneWidget);
    expect(inHoliday(2, 'Tentative'), findsOneWidget);
    expect(inHoliday(3, 'Company holiday'), findsOneWidget);
    expect(find.text('Tentative'), findsOneWidget);
    expect(
      find.text('Tentative dates depend on the moon sighting and can move.'),
      findsOneWidget,
    );

    // The year is shared with the other tabs.
    await tester.tap(find.byKey(LeaveYearSwitcher.yearKey(2027)));
    await tester.pumpAndSettle();
    expect(api.holidayYears, [2026, 2027]);
    expect(api.balanceYears, [2026, 2027]);
  });

  testWidgets('a workspace without a holiday calendar says so', (tester) async {
    final api = FakeGoodPeopleApi()
      ..holidaysError = const ApiException(
        kind: ApiErrorKind.server,
        statusCode: 404,
        message: 'This workspace has no holiday calendar yet',
      );
    await pumpLeave(tester, api);
    await openTab(tester, LeaveTab.holidays);

    expect(
      find.text('No holiday calendar has been set up yet.'),
      findsOneWidget,
    );
  });

  testWidgets('Bangla: Bangla labels, leave names and Bangla digits', (
    tester,
  ) async {
    final api = FakeGoodPeopleApi()..approvals = approvalsJson();
    await pumpLeave(tester, api, locale: const Locale('bn'), open: false);

    expect(within(HomeScreen.leaveKey, find.text('ছুটি')), findsOneWidget);
    await tester.tap(find.byKey(HomeScreen.leaveKey));
    await tester.pumpAndSettle();

    expect(find.widgetWithText(AppBar, 'ছুটি'), findsOneWidget);
    for (final (tab, label) in [
      (LeaveTab.balances, 'ছুটির হিসাব'),
      (LeaveTab.apply, 'আবেদন'),
      (LeaveTab.requests, 'আমার আবেদন'),
      (LeaveTab.approvals, 'অনুমোদন'),
      (LeaveTab.holidays, 'ছুটির দিন'),
    ]) {
      expect(within(LeaveScreen.tabKey(tab), find.text(label)), findsOneWidget);
    }
    expect(
      within(LeaveScreen.approvalsBadgeKey, find.text('২')),
      findsOneWidget,
    );

    // Balances: nameBn, halves and the year in Bangla digits.
    Finder inBalance(String id, String text) =>
        within(BalancesTab.balanceKey(id), find.text(text));
    expect(inBalance(casualLeaveId, 'নৈমিত্তিক ছুটি'), findsOneWidget);
    expect(inBalance(casualLeaveId, '৮.৫ দিন'), findsOneWidget);
    expect(inBalance(casualLeaveId, '১.৫'), findsOneWidget);
    expect(inBalance(casualLeaveId, 'অবশিষ্ট'), findsOneWidget);
    expect(inBalance(maternityLeaveId, 'আবেদন সাপেক্ষে'), findsOneWidget);
    expect(
      inBalance(earnedLeaveId, '১ মার্চ, ২০২৭ থেকে প্রাপ্য'),
      findsOneWidget,
    );
    expect(find.text('২০২৬'), findsOneWidget);
    expect(find.text('২০২৭'), findsOneWidget);

    // My requests: statuses, step kinds, half day, dates and days.
    await openTab(tester, LeaveTab.requests);
    Finder inRequest(String id, String text) =>
        within(RequestsTab.requestKey(id), find.text(text));
    expect(inRequest(pendingRequestId, 'অপেক্ষমাণ'), findsOneWidget);
    expect(
      inRequest(pendingRequestId, '২ নভে – ৩ নভে, ২০২৬ · ২ দিন'),
      findsOneWidget,
    );
    expect(
      inRequest(pendingRequestId, 'ম্যানেজার: Shirin Akter'),
      findsOneWidget,
    );
    expect(inRequest(pendingRequestId, 'এইচআর টিম'), findsOneWidget);
    expect(
      inRequest(pendingRequestId, 'সিদ্ধান্তের অপেক্ষায়'),
      findsOneWidget,
    );
    expect(inRequest(startedRequestId, 'অনুমোদিত'), findsNWidgets(3));
    expect(inRequest(rejectedRequestId, 'প্রত্যাখ্যাত'), findsNWidgets(2));
    expect(
      inRequest(rejectedRequestId, '১০ সেপ, ২০২৬ · প্রথমার্ধ · ০.৫ দিন'),
      findsOneWidget,
    );
    expect(inRequest(pendingRequestId, 'আবেদন বাতিল করুন'), findsOneWidget);

    // Approvals: the requester's balance.
    await openTab(tester, LeaveTab.approvals);
    expect(
      within(ApprovalsTab.itemKey(managerStepId), find.text('৬ দিন অবশিষ্ট')),
      findsOneWidget,
    );
    expect(
      within(ApprovalsTab.itemKey(hrStepId), find.text('আপনার ধাপ: এইচআর')),
      findsOneWidget,
    );

    // Holidays: nameBn when there is one, Bangla dates, "Tentative".
    await openTab(tester, LeaveTab.holidays);
    expect(find.text('বিজয় দিবস'), findsOneWidget);
    expect(find.text('বুধ ১৬ ডিসে'), findsOneWidget);
    expect(find.text('সাধারণ ছুটি'), findsNWidgets(2));
    expect(find.text('সম্ভাব্য'), findsOneWidget);
    expect(find.text('Factory foundation day'), findsOneWidget);

    // Apply: weekly off and half-day labels in Bangla.
    api.previewFor = (draft) => LeavePreview.fromJson({
      'days': 1,
      'excluded': [
        {'date': '2026-10-30', 'reason': 'weekly_off'},
        {'date': '2026-10-31', 'reason': 'holiday', 'name': 'Company day'},
      ],
      'balance': null,
      'problems': <String>[],
    });
    await openTab(tester, LeaveTab.apply);
    await chooseType(tester, 'নৈমিত্তিক ছুটি');
    await pickDay(tester, ApplyTab.startFieldKey, '২৯');
    final preview = find.byKey(ApplyTab.previewKey);
    for (final text in [
      '১ দিন',
      'শুক্র ৩০ অক্টো',
      'সাপ্তাহিক ছুটি',
      'ছুটির দিন: Company day',
    ]) {
      expect(
        find.descendant(of: preview, matching: find.text(text)),
        findsOneWidget,
        reason: text,
      );
    }
    for (final text in ['পুরো দিন', 'প্রথমার্ধ', 'দ্বিতীয়ার্ধ']) {
      expect(within(ApplyTab.dayPartKey, find.text(text)), findsOneWidget);
    }
    // Start and end, both the 29th.
    expect(find.text('২৯ অক্টোবর, ২০২৬'), findsNWidgets(2));

    for (final english in [
      'Casual leave',
      'On request',
      'Pending',
      'Weekly off',
      'Tentative',
    ]) {
      expect(find.text(english), findsNothing, reason: english);
    }
  });
}
