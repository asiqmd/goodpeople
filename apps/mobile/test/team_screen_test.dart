import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:good_people/api/api_models.dart';
import 'package:good_people/api/good_people_api.dart';
import 'package:good_people/app.dart';
import 'package:good_people/attendance/offline_punch_queue.dart';
import 'package:good_people/auth/auth_controller.dart';
import 'package:good_people/home/home_screen.dart';
import 'package:good_people/leave/leave_providers.dart';
import 'package:good_people/team/team_screen.dart';

import 'support/fake_api.dart';

const _me = '9e8d7c6b-5a49-4382-9170-6f5e4d3c2b1a';
const _karim = 'e0000000-0000-4000-8000-000000000001';
const _salma = 'e0000000-0000-4000-8000-000000000002';

/// Like [find.text], reading a no-break space as a plain one.
Finder _text(String value) => find.byWidgetPredicate(
  (widget) => widget is Text && widget.data?.replaceAll(' ', ' ') == value,
  description: 'text "$value"',
);

Map<String, Object?> _team(String date) => teamDayJson(date, [
  teamRowJson(
    id: _karim,
    name: 'Karim Uddin',
    code: 'MG-0011',
    date: date,
    firstIn: '08:20',
    lateMinutes: 20,
  ),
  teamRowJson(id: _me, name: 'Rahima Khatun', code: 'MG-0005', date: date),
  teamRowJson(
    id: _salma,
    name: 'Salma Begum',
    code: 'MG-0012',
    date: date,
    status: 'absent',
    firstIn: null,
  ),
]);

Map<String, Object?> _leave(String from, String to) =>
    leaveCalendarJson(from, to, [
      {
        'requestId': 'b0000000-0000-4000-8000-000000000101',
        'employee': {
          'id': _salma,
          'fullName': 'Salma Begum',
          'employeeCode': 'MG-0012',
        },
        'leaveType': {
          'code': 'SL',
          'name': 'Sick leave',
          'nameBn': 'অসুস্থতা ছুটি',
        },
        'startDate': '2026-10-24',
        'endDate': '2026-10-25',
        'status': 'approved',
      },
      {
        'requestId': 'b0000000-0000-4000-8000-000000000102',
        'employee': {
          'id': _karim,
          'fullName': 'Karim Uddin',
          'employeeCode': 'MG-0011',
        },
        'leaveType': {'code': 'CL', 'name': 'Casual leave', 'nameBn': null},
        'startDate': '2026-10-29',
        'endDate': '2026-10-29',
        'status': 'pending',
      },
    ]);

/// [loginJson] for someone with the employee role.
final _employeeLogin = LoginResponse.fromJson({
  ...loginJson,
  'user': {...loginJson['user']! as Map<String, Object?>, 'role': 'employee'},
});

void main() {
  Future<void> pumpHome(WidgetTester tester, FakeGoodPeopleApi api) async {
    tester.view.physicalSize = const Size(400, 1800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final container = ProviderContainer.test(
      overrides: [
        goodPeopleApiProvider.overrideWithValue(api),
        punchQueueStoreProvider.overrideWithValue(MemoryPunchQueueStore()),
        todayProvider.overrideWithValue(leaveToday),
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
  }

  testWidgets('staff see Team without the day being asked for first', (
    tester,
  ) async {
    final api = FakeGoodPeopleApi()..teamDay = _team;
    await pumpHome(tester, api);

    expect(find.byKey(HomeScreen.teamKey), findsOneWidget);
    expect(api.teamDayDates, isEmpty);
  });

  testWidgets('an employee alone in the team view sees no Team', (
    tester,
  ) async {
    final alone = FakeGoodPeopleApi()
      ..loginResponse = _employeeLogin
      ..teamDay = (date) => teamDayJson(date, [
        teamRowJson(
          id: _me,
          name: 'Rahima Khatun',
          code: 'MG-0005',
          date: date,
        ),
      ]);
    await pumpHome(tester, alone);
    expect(alone.teamDayDates, ['2026-10-24']);
    expect(find.byKey(HomeScreen.teamKey), findsNothing);
  });

  testWidgets('an employee with someone besides themselves sees Team', (
    tester,
  ) async {
    final manager = FakeGoodPeopleApi()
      ..loginResponse = _employeeLogin
      ..teamDay = _team;
    await pumpHome(tester, manager);
    expect(find.byKey(HomeScreen.teamKey), findsOneWidget);

    // Opening it uses the day already loaded.
    await tester.tap(find.byKey(HomeScreen.teamKey));
    await tester.pumpAndSettle();
    expect(find.byType(TeamScreen), findsOneWidget);
    expect(manager.teamDayDates, ['2026-10-24']);
  });

  testWidgets('without attendance in the plan there is no Team', (
    tester,
  ) async {
    final api = FakeGoodPeopleApi()
      ..accessView = TenantAccessView.fromJson(
        accessJson(features: const ['core_hr', 'leave']),
      );
    await pumpHome(tester, api);
    expect(find.byKey(HomeScreen.teamKey), findsNothing);
  });

  testWidgets('Team lists everyone\'s day, filters by status, and shows who '
      'is on leave this week', (tester) async {
    final api = FakeGoodPeopleApi()
      ..teamDay = _team
      ..leaveCalendar = _leave;
    await pumpHome(tester, api);
    await tester.tap(find.byKey(HomeScreen.teamKey));
    await tester.pumpAndSettle();

    expect(find.text('Saturday, October 24'), findsOneWidget);
    expect(find.text('All · 3'), findsOneWidget);
    expect(find.text('Present · 2'), findsOneWidget);
    expect(find.text('Absent · 1'), findsOneWidget);
    final karim = find.byKey(TeamScreen.rowKey(_karim));
    expect(
      find.descendant(
        of: karim,
        matching: _text('MG-0011 · 8:20 AM – … · Late 0:20'),
      ),
      findsOneWidget,
    );
    expect(find.byKey(TeamScreen.rowKey(_salma)), findsOneWidget);

    await tester.tap(find.byKey(TeamScreen.filterKey(AttendanceStatus.absent)));
    await tester.pumpAndSettle();
    expect(find.byKey(TeamScreen.rowKey(_salma)), findsOneWidget);
    expect(find.byKey(TeamScreen.rowKey(_karim)), findsNothing);

    await tester.tap(find.byKey(TeamScreen.filterKey(null)));
    await tester.pumpAndSettle();
    expect(find.byKey(TeamScreen.rowKey(_karim)), findsOneWidget);

    expect(api.leaveCalendarQueries.single, (
      from: '2026-10-24',
      to: '2026-10-30',
    ));
    final leave = find.byKey(TeamScreen.leaveSectionKey);
    expect(
      find.descendant(
        of: leave,
        matching: find.text('Sick leave · Oct 24 – Oct 25, 2026'),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(of: leave, matching: find.text('Pending')),
      findsOneWidget,
    );
  });
}
