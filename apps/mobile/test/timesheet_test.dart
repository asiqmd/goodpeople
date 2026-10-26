import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:good_people/api/api_exception.dart';
import 'package:good_people/api/api_models.dart';
import 'package:good_people/api/good_people_api.dart';
import 'package:good_people/app.dart';
import 'package:good_people/auth/auth_controller.dart';
import 'package:good_people/home/home_screen.dart';
import 'package:good_people/leave/leave_providers.dart';
import 'package:good_people/notifications/notification_routes.dart';
import 'package:good_people/settings/locale_controller.dart';
import 'package:good_people/timesheets/offline_timesheet_queue.dart';
import 'package:good_people/timesheets/timesheet_screen.dart';
import 'package:good_people/util/uuid.dart';

import 'support/fake_api.dart';

/// The login in [loginJson].
const _userId = '5f0c6c1e-2b7a-4c55-9d3e-0a8f3b1d2c01';
final _october = DateTime.utc(2026, 10);

ApiException _refusal(int status, String code) => ApiException(
  kind: ApiErrorKind.server,
  statusCode: status,
  code: code,
  message: 'Refused: $code',
);

QueuedTimesheetEntry _edit(
  int day,
  String hours, {
  String? projectId = waterProjectId,
  int month = 10,
}) => QueuedTimesheetEntry(
  clientId: uuidV4(),
  userId: _userId,
  date: DateTime.utc(2026, month, day),
  projectId: projectId,
  hours: hours,
);

/// Answers every request with [body] and records it.
class _StubAdapter implements HttpClientAdapter {
  _StubAdapter(this.body);

  final Object? body;
  final requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return ResponseBody.fromString(
      jsonEncode(body),
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  late FakeGoodPeopleApi api;
  late MemoryTimesheetQueueStore store;

  setUp(() {
    api = FakeGoodPeopleApi()
      ..accessView = TenantAccessView.fromJson(
        accessJson(features: const ['core_hr', 'attendance', 'projects']),
      );
    store = MemoryTimesheetQueueStore();
  });

  Future<ProviderContainer> signedIn() async {
    final container = ProviderContainer.test(
      overrides: [
        goodPeopleApiProvider.overrideWithValue(api),
        timesheetQueueStoreProvider.overrideWithValue(store),
      ],
    );
    await container
        .read(authProvider.notifier)
        .signIn(workspace: 'acme', email: 'a@acme.test', password: 'x');
    return container;
  }

  OfflineTimesheetQueue queueOf(ProviderContainer container) =>
      container.read(offlineTimesheetQueueProvider.notifier);

  group('the API client', () {
    test(
      'reads the month and sends entries, prefill and the declaration',
      () async {
        final adapter = _StubAdapter(timesheetJson('2026-10'));
        final client = DioGoodPeopleApi(
          Dio(BaseOptions(baseUrl: 'http://localhost:4000'))
            ..httpClientAdapter = adapter,
        );

        final sheet = await client.fetchMyTimesheet(
          'access-1',
          month: _october,
        );
        expect(sheet.month, _october);
        expect(sheet.days, hasLength(31));
        expect(sheet.projects.first.plannedPercent, '60.00');
        expect(sheet.status, TimesheetStatus.draft);
        expect(adapter.requests.single.uri.path, '/tenant/timesheets/me');
        expect(adapter.requests.single.uri.queryParameters, {
          'month': '2026-10',
        });

        final draft = _edit(5, '7.5');
        await expectLater(
          client.saveTimesheetEntries(
            'access-1',
            month: _october,
            entries: [draft.draft],
          ),
          // The stub answers a month, not a save: the body is checked below.
          throwsA(isA<ApiException>()),
        );
        final put = adapter.requests.last;
        expect(put.method, 'PUT');
        expect(put.uri.path, '/tenant/timesheets/me/entries');
        expect(put.data, {
          'month': '2026-10',
          'entries': [
            {
              'clientId': draft.clientId,
              'date': '2026-10-05',
              'projectId': waterProjectId,
              'hours': '7.5',
            },
          ],
        });

        await client.submitTimesheet('access-1', month: _october);
        expect(adapter.requests.last.uri.path, '/tenant/timesheets/me/submit');
        expect(adapter.requests.last.data, {
          'month': '2026-10',
          'declaration': true,
        });
      },
    );

    test('a month kept on the phone reads back as it was', () {
      final sheet = Timesheet.fromJson(
        withTimesheetEntries(timesheetJson('2026-10'), [
          {'date': '2026-10-05', 'projectId': waterProjectId, 'hours': '7.50'},
        ]),
      );
      final again = Timesheet.fromJson(
        jsonDecode(jsonEncode(sheet.toJson())) as Json,
      );
      expect(again.id, sheet.id);
      expect(again.entries.single.hours, '7.50');
      expect(again.totals.single.project?.code, 'WASH-01');
      expect(again.days[4].hours, '7.50');
    });
  });

  group('hours as typed', () {
    test('take Bangla digits, two decimals and 0 to 24', () {
      expect(parseHours('7.5'), '7.5');
      expect(parseHours('৭.৫'), '7.5');
      expect(parseHours(' 8 '), '8');
      expect(parseHours('8.00'), '8');
      expect(parseHours(''), '0');
      expect(parseHours('24'), '24');
      expect(parseHours('24.5'), isNull);
      expect(parseHours('7.125'), isNull);
      expect(parseHours('-1'), isNull);
      expect(parseHours('seven'), isNull);
    });
  });

  group('the queue', () {
    test('keeps edits in its store, a new edit of a cell replaces the '
        'waiting one, and the next run reads them back', () async {
      final first = await signedIn();
      final old = _edit(5, '4');
      await queueOf(first).edit([old]);
      final newer = _edit(5, '6');
      final other = _edit(5, '2', projectId: null);
      await queueOf(first).edit([newer, other]);

      expect(store.saved.waiting.map((e) => e.clientId), [
        newer.clientId,
        other.clientId,
      ]);
      // Nothing was sent: there was no reason to try yet.
      expect(api.timesheetBatches, isEmpty);

      // A new run of the app with the same store sends them in one batch.
      final second = await signedIn();
      expect(await queueOf(second).send(), 2);
      expect(api.timesheetBatches.single.map((e) => e['clientId']), [
        newer.clientId,
        other.clientId,
      ]);
      expect(store.saved.waiting, isEmpty);
      final sheet = await second
          .read(authProvider.notifier)
          .fetchMyTimesheet(_october);
      expect(sheet.totalHours, '8.00');
    });

    test('sends each month in one batch; refused entries are kept with '
        'their reasons until dismissed', () async {
      api.refusedTimesheetProjects[schoolProjectId] = 'project_inactive';
      final container = await signedIn();
      final october = _edit(6, '5');
      final closed = _edit(6, '2', projectId: schoolProjectId);
      final september = _edit(30, '8', month: 9);
      await queueOf(container).edit([october, closed, september]);

      expect(await queueOf(container).send(), 2);
      expect(api.timesheetBatches.map((b) => b.length), [2, 1]);
      final queue = container.read(offlineTimesheetQueueProvider);
      expect(queue.waiting, isEmpty);
      final refused = queue.refusedFor(_userId).single;
      expect(refused.entry.clientId, closed.clientId);
      expect(refused.code, 'project_inactive');
      expect(store.saved.refused.single.code, 'project_inactive');

      await queueOf(container).dismiss(closed.clientId);
      expect(container.read(offlineTimesheetQueueProvider).refused, isEmpty);
    });

    test('no connection keeps the edits; a locked month refuses its whole '
        'batch with the code', () async {
      final container = await signedIn();
      await queueOf(container).edit([_edit(7, '3'), _edit(8, '4')]);

      api.saveTimesheetErrors.add(noConnection);
      expect(await queueOf(container).send(), 0);
      expect(
        container.read(offlineTimesheetQueueProvider).waiting,
        hasLength(2),
      );

      api.saveTimesheetErrors.add(_refusal(409, 'timesheet_locked'));
      expect(await queueOf(container).send(), 0);
      final queue = container.read(offlineTimesheetQueueProvider);
      expect(queue.waiting, isEmpty);
      expect(queue.refused.map((r) => r.code), [
        'timesheet_locked',
        'timesheet_locked',
      ]);
    });

    test('a resend of an edit the API already has is accepted once', () async {
      final container = await signedIn();
      final edit = _edit(9, '6');
      api.savedTimesheetClientIds.add(edit.clientId);
      await queueOf(container).edit([edit]);
      expect(await queueOf(container).send(), 1);
      final sheet = await container
          .read(authProvider.notifier)
          .fetchMyTimesheet(_october);
      expect(sheet.entries, isEmpty);
    });

    test('the file store keeps the queue and months, and survives a damaged '
        'file', () async {
      final folder = await Directory.systemTemp.createTemp('timesheet-queue-');
      addTearDown(() => folder.delete(recursive: true));
      final files = FileTimesheetQueueStore(directory: () async => folder);

      expect((await files.load()).waiting, isEmpty);
      final edit = _edit(5, '7.5', projectId: null);
      await files.save(TimesheetQueue(waiting: [edit]));
      await files.saveMonth(_userId, '2026-10', timesheetJson('2026-10'));

      final again = FileTimesheetQueueStore(directory: () async => folder);
      final read = (await again.load()).waiting.single;
      expect(read.clientId, edit.clientId);
      expect(read.date, DateTime.utc(2026, 10, 5));
      expect(read.projectId, isNull);
      expect(read.hours, '7.5');
      expect((await again.loadMonth(_userId, '2026-10'))?['month'], '2026-10');
      expect(await again.loadMonth(_userId, '2026-09'), isNull);

      await File('${folder.path}/queue.json').writeAsString('{"waiting": [');
      expect((await again.load()).waiting, isEmpty);
    });
  });

  group('the screen', () {
    /// Signs in with "today" in October 2026 and opens the timesheet from
    /// the home screen, phone-width so overflow fails the test.
    Future<ProviderContainer> pumpTimesheet(
      WidgetTester tester, {
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
          timesheetQueueStoreProvider.overrideWithValue(store),
        ],
      );
      container.read(localeProvider.notifier).select(locale);
      await container
          .read(authProvider.notifier)
          .signIn(
            workspace: 'my-group',
            email: 'r@my-group.test',
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
        await tester.tap(find.byKey(HomeScreen.timesheetKey));
        await tester.pumpAndSettle();
      }
      return container;
    }

    Future<void> openDay(WidgetTester tester, int day) async {
      final card = find.byKey(
        TimesheetScreen.dayKey(DateTime.utc(2026, 10, day)),
      );
      await tester.scrollUntilVisible(card, 300);
      await tester.tap(card);
      await tester.pumpAndSettle();
    }

    Future<void> typeHours(
      WidgetTester tester,
      String? projectId,
      String text,
    ) =>
        tester.enterText(find.byKey(TimesheetScreen.fieldKey(projectId)), text);

    testWidgets('is on the home screen only with projects', (tester) async {
      api.accessView = TenantAccessView.fromJson(accessJson());
      await pumpTimesheet(tester, open: false);
      expect(find.byKey(HomeScreen.attendanceKey), findsOneWidget);
      expect(find.byKey(HomeScreen.timesheetKey), findsNothing);
    });

    testWidgets('a day typed without a connection waits on the phone and '
        'goes when the connection is back', (tester) async {
      final container = await pumpTimesheet(tester);
      expect(api.timesheetMonths, ['2026-10']);
      expect(find.text('October 2026'), findsOneWidget);
      expect(find.text('Attendance 8 h'), findsWidgets);

      api.saveTimesheetErrors.add(noConnection);
      await openDay(tester, 5);
      await typeHours(tester, waterProjectId, '6');
      await typeHours(tester, null, '1.5');
      await tester.tap(find.byKey(TimesheetScreen.saveDayKey));
      await tester.pumpAndSettle();

      expect(
        find.text('Saved on your phone. It will be sent when you are online.'),
        findsOneWidget,
      );
      expect(find.text('2 changes waiting to be sent'), findsOneWidget);
      expect(find.byIcon(Icons.cloud_upload_outlined), findsWidgets);
      final day = find.byKey(TimesheetScreen.dayKey(DateTime.utc(2026, 10, 5)));
      expect(
        find.descendant(of: day, matching: find.text('7.5 h')),
        findsOneWidget,
      );

      await tester.scrollUntilVisible(
        find.byKey(TimesheetScreen.sendNowKey),
        -300,
      );
      await tester.tap(find.byKey(TimesheetScreen.sendNowKey));
      await tester.pumpAndSettle();
      expect(find.text('2 changes sent'), findsOneWidget);
      expect(api.timesheetBatches.last.map((e) => e['hours']), ['6', '1.5']);
      expect(container.read(offlineTimesheetQueueProvider).waiting, isEmpty);
      expect(find.text('Total 7.5 h'), findsOneWidget);
    });

    testWidgets('refuses more than 24 hours in a day before saving', (
      tester,
    ) async {
      await pumpTimesheet(tester);
      await openDay(tester, 5);
      await typeHours(tester, waterProjectId, '20');
      await typeHours(tester, null, '5');
      await tester.tap(find.byKey(TimesheetScreen.saveDayKey));
      await tester.pumpAndSettle();
      expect(find.byKey(TimesheetScreen.dayErrorKey), findsOneWidget);
      expect(find.text('A day cannot have more than 24 hours'), findsOneWidget);
      expect(api.timesheetBatches, isEmpty);
    });

    testWidgets('shows a refused entry with its reason until dismissed', (
      tester,
    ) async {
      api.refusedTimesheetProjects[schoolProjectId] = 'project_inactive';
      final container = await pumpTimesheet(tester);
      await openDay(tester, 6);
      // Not allocated to it: added for the day.
      expect(
        find.byKey(TimesheetScreen.fieldKey(schoolProjectId)),
        findsNothing,
      );
      await tester.tap(find.byKey(TimesheetScreen.addProjectKey));
      await tester.pumpAndSettle();
      await tester.tap(find.text('EDU-02 · Schools in Bhola').last);
      await tester.pumpAndSettle();
      await typeHours(tester, schoolProjectId, '3');
      await tester.tap(find.byKey(TimesheetScreen.saveDayKey));
      await tester.pumpAndSettle();

      final refusal = container
          .read(offlineTimesheetQueueProvider)
          .refused
          .single;
      final card = find.byKey(
        TimesheetScreen.refusedKey(refusal.entry.clientId),
      );
      await tester.scrollUntilVisible(card, -300);
      expect(
        find.descendant(
          of: card,
          matching: find.text('The project is closed.'),
        ),
        findsOneWidget,
      );
      await tester.tap(
        find.byKey(TimesheetScreen.dismissKey(refusal.entry.clientId)),
      );
      await tester.pumpAndSettle();
      expect(card, findsNothing);
    });

    testWidgets('without a connection the copy kept on the phone opens', (
      tester,
    ) async {
      api.timesheets['2026-10'] = withTimesheetEntries(
        timesheetJson('2026-10'),
        [
          {'date': '2026-10-01', 'projectId': waterProjectId, 'hours': '8.00'},
        ],
      );
      final container = await pumpTimesheet(tester);
      expect(find.text('Total 8 h'), findsOneWidget);

      api.timesheetErrors.add(noConnection);
      await tester.tap(find.byKey(TimesheetScreen.previousKey));
      await tester.pumpAndSettle();
      // September was never loaded: nothing to show without a connection.
      expect(find.text('We could not load your timesheet.'), findsOneWidget);

      api.timesheetErrors.add(noConnection);
      await tester.tap(find.byKey(TimesheetScreen.nextKey));
      await tester.pumpAndSettle();
      expect(find.byKey(TimesheetScreen.offlineKey), findsOneWidget);
      expect(find.text('Total 8 h'), findsOneWidget);
      // Filling and submitting wait for a connection.
      expect(find.byKey(TimesheetScreen.submitKey), findsNothing);
      expect(container.read(authProvider), isA<SignedIn>());
    });

    testWidgets('fills from attendance and submits with the declaration', (
      tester,
    ) async {
      api.timesheets['2026-10'] = withTimesheetEntries(
        timesheetJson('2026-10'),
        [
          {'date': '2026-10-01', 'projectId': waterProjectId, 'hours': '8.00'},
        ],
      );
      await pumpTimesheet(tester);

      await tester.tap(find.byKey(TimesheetScreen.prefillKey));
      await tester.pumpAndSettle();
      expect(api.prefilledMonths, ['2026-10']);
      expect(find.text('3 days filled from attendance'), findsOneWidget);

      await tester.tap(find.byKey(TimesheetScreen.submitKey));
      await tester.pumpAndSettle();
      expect(
        find.text(
          'I certify that the hours in this timesheet are the work I actually '
          'did in this month, on the projects shown.',
        ),
        findsOneWidget,
      );
      final confirm = tester.widget<FilledButton>(
        find.byKey(TimesheetScreen.confirmSubmitKey),
      );
      expect(confirm.onPressed, isNull);
      await tester.tap(find.byKey(TimesheetScreen.declarationKey));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(TimesheetScreen.confirmSubmitKey));
      await tester.pumpAndSettle();

      expect(api.submittedTimesheetMonths, ['2026-10']);
      expect(find.text('Timesheet submitted'), findsOneWidget);
      expect(find.text('Submitted'), findsOneWidget);
      expect(find.byKey(TimesheetScreen.submitKey), findsNothing);
    });

    testWidgets('reads in Bangla', (tester) async {
      await pumpTimesheet(tester, locale: const Locale('bn'));
      expect(find.text('টাইমশিট'), findsOneWidget);
      expect(find.text('হাজিরা ৮ ঘণ্টা'), findsWidgets);
      expect(find.text('অক্টোবর ২০২৬'), findsOneWidget);
    });
  });

  group('notifications', () {
    test('a timesheet reminder opens that month', () {
      final route = notificationRoute(
        NotificationEvent.timesheetDue,
        '/workspace/timesheets?month=2026-09',
      );
      expect(route, isA<MaterialPageRoute<void>>());
      final screen = (route! as MaterialPageRoute<void>).builder(
        _FakeContext(),
      );
      expect((screen as TimesheetScreen).month, DateTime.utc(2026, 9));
      expect(
        NotificationEvent.fromWire('timesheet.due'),
        NotificationEvent.timesheetDue,
      );
    });
  });
}

class _FakeContext extends Fake implements BuildContext {}
