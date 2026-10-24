import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:good_people/api/api_exception.dart';
import 'package:good_people/api/api_models.dart';
import 'package:good_people/api/good_people_api.dart';
import 'package:good_people/app.dart';
import 'package:good_people/attendance/attendance_screen.dart';
import 'package:good_people/attendance/camera_service.dart';
import 'package:good_people/attendance/correction_form_screen.dart';
import 'package:good_people/attendance/location_service.dart';
import 'package:good_people/attendance/offline_punch_queue.dart';
import 'package:good_people/attendance/today_tab.dart';
import 'package:good_people/auth/auth_controller.dart';
import 'package:good_people/home/home_screen.dart';
import 'package:good_people/l10n/app_localizations.dart';
import 'package:good_people/leave/leave_providers.dart';
import 'package:good_people/util/uuid.dart';

import 'support/fake_api.dart';

/// The login in [loginJson].
const _userId = '5f0c6c1e-2b7a-4c55-9d3e-0a8f3b1d2c01';
const _otherUserId = '8e7d6c5b-4a39-4f82-9a7f-6e5d4c3b2a19';

ApiException _refusal(int status, String? code, String message) => ApiException(
  kind: ApiErrorKind.server,
  statusCode: status,
  code: code,
  message: message,
);

QueuedPunch _punch(
  String clientId, {
  String userId = _userId,
  Duration ago = const Duration(hours: 2),
  PunchLocation? location = atTheFactory,
}) => QueuedPunch(
  clientId: clientId,
  punchedAt: DateTime.now().toUtc().subtract(ago),
  userId: userId,
  timeZone: 'Asia/Dhaka',
  location: location,
);

void main() {
  late FakeGoodPeopleApi api;
  late MemoryPunchQueueStore store;

  setUp(() {
    api = FakeGoodPeopleApi();
    store = MemoryPunchQueueStore();
  });

  Future<ProviderContainer> signedIn() async {
    final container = ProviderContainer.test(
      overrides: [
        goodPeopleApiProvider.overrideWithValue(api),
        punchQueueStoreProvider.overrideWithValue(store),
      ],
    );
    await container
        .read(authProvider.notifier)
        .signIn(workspace: 'acme', email: 'a@acme.test', password: 'x');
    return container;
  }

  OfflinePunchQueue queueOf(ProviderContainer container) =>
      container.read(offlinePunchQueueProvider.notifier);

  group('the queue', () {
    test('keeps what is added in its store, and the next run of the app '
        'reads it back', () async {
      final first = await signedIn();
      final punch = _punch(uuidV4());
      await queueOf(first).add(punch);

      expect(store.saved.waiting.single.clientId, punch.clientId);
      // Nothing was sent: there was no reason to try yet.
      expect(api.punchBodies, isEmpty);

      // A new run of the app with the same store.
      final second = await signedIn();
      await queueOf(second).send();
      expect(api.punchBodies.single['clientId'], punch.clientId);
    });

    test('the file store keeps the queue and photos in its folder, and '
        'survives a damaged file', () async {
      final folder = await Directory.systemTemp.createTemp('punch-queue-');
      addTearDown(() => folder.delete(recursive: true));
      final files = FilePunchQueueStore(directory: () async => folder);

      expect((await files.load()).waiting, isEmpty);
      final photo = await files.writePhoto('c1', tinyPng);
      final punch = _punch('3b241101-e2bb-4255-8caf-4136c566a962')
          .withSelfieFile(photo);
      await files.save(
        PunchQueue(
          waiting: [punch],
          refused: [
            RefusedPunch(
              punch: _punch('6f1c2c55-0b0f-4b7e-9f55-3d2f8b0c9a10'),
              statusCode: 400,
              code: 'offline_punch_too_old',
              message: 'Too old',
            ),
          ],
        ),
      );

      final again = await FilePunchQueueStore(directory: () async => folder)
          .load();
      final read = again.waiting.single;
      expect(read.clientId, punch.clientId);
      // To the millisecond, as the API takes it.
      expect(toWireInstant(read.punchedAt), toWireInstant(punch.punchedAt));
      expect(read.punchedAt.isUtc, isTrue);
      expect(read.userId, _userId);
      expect(read.timeZone, 'Asia/Dhaka');
      expect(read.location?.latitude, atTheFactory.latitude);
      expect(read.location?.accuracyM, atTheFactory.accuracyM);
      expect(await files.readPhoto(read.selfieFile!), tinyPng);
      expect(again.refused.single.code, 'offline_punch_too_old');

      await files.deletePhoto(photo);
      expect(await files.readPhoto(photo), isNull);

      await File('${folder.path}/queue.json').writeAsString('{"waiting": [');
      expect((await files.load()).waiting, isEmpty);
    });

    test(
      '201: sent with when it happened and its clientId, then gone',
      () async {
        final container = await signedIn();
        final punch = _punch(uuidV4());
        await queueOf(container).add(punch);

        expect(await queueOf(container).send(), 1);

        expect(api.punchBodies.single, {
          'source': 'mobile',
          'latitude': atTheFactory.latitude,
          'longitude': atTheFactory.longitude,
          'accuracyM': atTheFactory.accuracyM,
          'clientId': punch.clientId,
          'punchedAt': toWireInstant(punch.punchedAt),
        });
        expect(
          api.punchBodies.single['punchedAt'],
          matches(RegExp(r'^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$')),
        );
        expect(container.read(offlinePunchQueueProvider).waiting, isEmpty);
        expect(store.saved.waiting, isEmpty);
      },
    );

    test('no connection keeps it and ends the round; the next try sends the '
        'same clientId', () async {
      final container = await signedIn();
      final first = _punch(uuidV4(), ago: const Duration(hours: 3));
      final second = _punch(uuidV4());
      await queueOf(container).add(first);
      await queueOf(container).add(second);

      api.punchErrors.addAll([noConnection, noConnection]);
      expect(await queueOf(container).send(), 0);
      expect(await queueOf(container).send(), 0);
      // Oldest first, and the round stopped there.
      expect(api.punchBodies, hasLength(2));
      expect(api.punchBodies.map((body) => body['clientId']), [
        first.clientId,
        first.clientId,
      ]);
      expect(container.read(offlinePunchQueueProvider).waiting, hasLength(2));

      expect(await queueOf(container).send(), 2);
      expect(api.punchBodies.map((body) => body['clientId']), [
        first.clientId,
        first.clientId,
        first.clientId,
        second.clientId,
      ]);
      // When it happened does not change either.
      expect(
        api.punchBodies.first['punchedAt'],
        api.punchBodies[2]['punchedAt'],
      );
      expect(container.read(offlinePunchQueueProvider).waiting, isEmpty);
    });

    test('a 400 refusal leaves the queue and is kept to say why', () async {
      final container = await signedIn();
      final old = _punch(uuidV4(), ago: const Duration(hours: 80));
      final next = _punch(uuidV4());
      await queueOf(container).add(old);
      await queueOf(container).add(next);
      api.punchErrors.add(
        _refusal(
          400,
          'offline_punch_too_old',
          'Punches recorded offline must arrive within 72 hours; ask for a '
              'correction instead',
        ),
      );

      // The refusal does not stop the round: the next punch goes too.
      expect(await queueOf(container).send(), 1);

      final queue = container.read(offlinePunchQueueProvider);
      expect(queue.waiting, isEmpty);
      final refused = queue.refusedFor(_userId).single;
      expect(refused.punch.clientId, old.clientId);
      expect(refused.code, 'offline_punch_too_old');
      expect(store.saved.refused.single.punch.clientId, old.clientId);

      await queueOf(container).dismiss(old.clientId);
      expect(container.read(offlinePunchQueueProvider).refused, isEmpty);
      expect(store.saved.refused, isEmpty);
    });

    test(
      'a 401 that cannot be refreshed, 408, 429 and 5xx keep the punch',
      () async {
        for (final error in [
          _refusal(408, null, 'Request Timeout'),
          _refusal(429, 'too_many_attempts', 'Too many attempts'),
          _refusal(500, null, 'Internal Server Error'),
          _refusal(503, null, 'Service Unavailable'),
        ]) {
          final container = await signedIn();
          final punch = _punch(uuidV4());
          await queueOf(container).add(punch);
          api.punchErrors.add(error);

          expect(await queueOf(container).send(), 0, reason: '$error');
          expect(
            container.read(offlinePunchQueueProvider).waiting.single.clientId,
            punch.clientId,
          );
          expect(container.read(offlinePunchQueueProvider).refused, isEmpty);
          // Sent next time.
          await queueOf(container).send();
          store.saved = const PunchQueue();
        }

        // A 401 refreshes once; when that is refused, the session ends and
        // the punch waits for the next one.
        final container = await signedIn();
        final punch = _punch(uuidV4());
        await queueOf(container).add(punch);
        const expired = ApiException(
          kind: ApiErrorKind.server,
          statusCode: 401,
          message: 'Unauthorized',
        );
        api
          ..punchErrors.add(expired)
          ..refreshResult = expired;
        expect(await queueOf(container).send(), 0);
        expect(container.read(authProvider), isA<SignedOut>());
        expect(
          container.read(offlinePunchQueueProvider).waiting.single.clientId,
          punch.clientId,
        );
      },
    );

    test('only the signed-in login\'s punches are sent', () async {
      final container = await signedIn();
      final someoneElse = _punch(uuidV4(), userId: _otherUserId);
      final mine = _punch(uuidV4());
      await queueOf(container).add(someoneElse);
      await queueOf(container).add(mine);

      expect(await queueOf(container).send(), 1);
      expect(api.punchBodies.single['clientId'], mine.clientId);
      final queue = container.read(offlinePunchQueueProvider);
      expect(
        queue.waitingFor(_otherUserId).single.clientId,
        someoneElse.clientId,
      );
      expect(queue.waitingFor(_userId), isEmpty);
    });

    test('a selfie punch keeps its photo and sends it as the same form '
        'later', () async {
      final container = await signedIn();
      final punch = _punch(uuidV4());
      await queueOf(container).add(punch, selfie: PunchSelfie(bytes: tinyPng));
      expect(store.photos.values.single, tinyPng);

      expect(await queueOf(container).send(), 1);
      expect(api.punchSelfies.single?.bytes, tinyPng);
      // As a form, every field is text.
      expect(api.punchBodies.single, {
        'source': 'mobile',
        'latitude': '${atTheFactory.latitude}',
        'longitude': '${atTheFactory.longitude}',
        'accuracyM': '${atTheFactory.accuracyM}',
        'clientId': punch.clientId,
        'punchedAt': toWireInstant(punch.punchedAt),
      });
      await pumpEventQueue();
      expect(store.photos, isEmpty);
    });

    test('any call that goes through sends what waits', () async {
      final container = await signedIn();
      final punch = _punch(uuidV4());
      await queueOf(container).add(punch);

      await container.read(authProvider.notifier).fetchMyEmployee();
      await pumpEventQueue();

      expect(api.punchBodies.single['clientId'], punch.clientId);
      expect(container.read(offlinePunchQueueProvider).waiting, isEmpty);
    });
  });

  group('the Today tab', () {
    late FakeLocationService location;

    setUp(() => location = FakeLocationService());

    Future<ProviderContainer> pumpToday(
      WidgetTester tester, {
      Locale locale = const Locale('en'),
    }) async {
      tester.view.physicalSize = const Size(360, 2400);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      // A punch is queued with the real clock, so the day shown must be today
      // in Dhaka for it to count as one of the day's punches.
      final dhaka = DateTime.now().toUtc().add(const Duration(hours: 6));
      final today =
          '${dhaka.year}-${dhaka.month.toString().padLeft(2, '0')}-'
          '${dhaka.day.toString().padLeft(2, '0')}';
      api.attendanceToday = attendanceTodayJson(
        day: dayJson(date: today, status: 'pending', firstIn: '07:55'),
      );
      final container = ProviderContainer.test(
        overrides: [
          goodPeopleApiProvider.overrideWithValue(api),
          punchQueueStoreProvider.overrideWithValue(store),
          todayProvider.overrideWithValue(leaveToday),
          locationServiceProvider.overrideWithValue(location),
          cameraServiceProvider.overrideWithValue(FakeCameraService()),
        ],
      );
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
      await tester.tap(find.byKey(HomeScreen.attendanceKey));
      await tester.pumpAndSettle();
      return container;
    }

    String? punchLabel(WidgetTester tester) => tester
        .widget<Text>(
          find
              .descendant(
                of: find.byKey(TodayTab.punchButtonKey),
                matching: find.byType(Text),
              )
              .first,
        )
        .data;

    testWidgets('with no connection the punch is kept, the tab says it '
        'waits, and Send now sends it', (tester) async {
      final container = await pumpToday(tester);
      expect(punchLabel(tester), 'Punch out');

      api.punchErrors.add(noConnection);
      await tester.tap(find.byKey(TodayTab.punchButtonKey));
      await tester.pumpAndSettle();

      expect(
        find.textContaining('No connection. Your punch at'),
        findsOneWidget,
      );
      expect(find.byKey(TodayTab.punchErrorKey), findsNothing);
      expect(find.text('1 punch waiting to be sent'), findsOneWidget);
      // The punch out is on its way, so the next one is in.
      expect(punchLabel(tester), 'Punch in');
      final waiting = container.read(offlinePunchQueueProvider).waiting.single;
      expect(waiting.clientId, api.punchBodies.single['clientId']);
      expect(waiting.location?.latitude, atTheFactory.latitude);

      // Still offline: it says so, and the punch stays.
      api.punchErrors.add(noConnection);
      await tester.tap(find.byKey(TodayTab.sendNowKey));
      await tester.pumpAndSettle();
      expect(
        find.text(
          'Could not reach the server. Check your connection and try again.',
        ),
        findsOneWidget,
      );
      expect(find.text('1 punch waiting to be sent'), findsOneWidget);

      // Back online.
      await tester.tap(find.byKey(TodayTab.sendNowKey));
      await tester.pumpAndSettle();

      expect(api.punchBodies, hasLength(3));
      expect(api.punchBodies.skip(1).map((body) => body['clientId']), [
        waiting.clientId,
        waiting.clientId,
      ]);
      expect(api.punchBodies.last['punchedAt'], isNotNull);
      expect(find.byKey(TodayTab.waitingKey), findsNothing);
      expect(find.text('1 saved punch sent'), findsOneWidget);
      // Today reloads with the punch the API recorded.
      expect(api.attendanceTodayCalls, greaterThanOrEqualTo(2));
    });

    testWidgets('a refused punch says why in the app\'s language and offers a '
        'correction for its day', (tester) async {
      final punchedAt = DateTime.utc(2026, 10, 21, 2, 5);
      store.saved = PunchQueue(
        refused: [
          RefusedPunch(
            punch: QueuedPunch(
              clientId: '6f1c2c55-0b0f-4b7e-9f55-3d2f8b0c9a10',
              punchedAt: punchedAt,
              userId: _userId,
              timeZone: 'Asia/Dhaka',
            ),
            statusCode: 400,
            code: 'offline_punch_too_old',
            message: 'Punches recorded offline must arrive within 72 hours',
          ),
        ],
      );
      await pumpToday(tester);

      final card = TodayTab.refusedKey('6f1c2c55-0b0f-4b7e-9f55-3d2f8b0c9a10');
      expect(
        find.descendant(
          of: find.byKey(card),
          matching: find.textContaining('was not recorded'),
        ),
        findsOneWidget,
      );
      expect(
        find.text(
          'This punch was saved more than 72 hours ago, so it can\'t be '
          'added now. Ask for a correction instead.',
        ),
        findsOneWidget,
      );

      await tester.tap(
        find.byKey(
          TodayTab.refusedCorrectKey('6f1c2c55-0b0f-4b7e-9f55-3d2f8b0c9a10'),
        ),
      );
      await tester.pumpAndSettle();
      final form = tester.widget<CorrectionFormScreen>(
        find.byType(CorrectionFormScreen),
      );
      // 8:05 AM in Dhaka on the 21st.
      expect(form.initialDate, DateTime.utc(2026, 10, 21));

      await tester.pageBack();
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(
          TodayTab.refusedDismissKey('6f1c2c55-0b0f-4b7e-9f55-3d2f8b0c9a10'),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byKey(card), findsNothing);
      expect(store.saved.refused, isEmpty);
    });

    testWidgets('the home screen points to a refused punch', (tester) async {
      store.saved = PunchQueue(
        refused: [
          RefusedPunch(
            punch: _punch('6f1c2c55-0b0f-4b7e-9f55-3d2f8b0c9a10'),
            statusCode: 403,
            code: 'self_punch_disabled',
            message: 'Punching from the app is turned off',
          ),
        ],
      );
      await pumpToday(tester);
      await tester.pageBack();
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(HomeScreen.refusedPunchKey));
      await tester.pumpAndSettle();
      expect(find.byType(AttendanceScreen), findsOneWidget);
      expect(
        find.text(
          'Punching from the app is turned off for your workspace. Use the '
          'attendance device at work.',
        ),
        findsOneWidget,
      );
    });
  });

  test('refusal codes read in Bangla too', () {
    final bn = lookupAppLocalizations(const Locale('bn'));
    expect(
      bn.punchErrorOfflineTooOld,
      'এই পাঞ্চটি ৭২ ঘণ্টারও বেশি আগে সংরক্ষণ করা হয়েছিল, তাই এখন আর যোগ করা '
      'যাবে না। এর বদলে সংশোধনের আবেদন করুন।',
    );
    expect(bn.punchesWaiting(2), '২টি পাঞ্চ পাঠানোর অপেক্ষায়');
  });

  test('uuidV4 gives version 4 ids that do not repeat', () {
    final ids = {for (var i = 0; i < 1000; i++) uuidV4()};
    expect(ids, hasLength(1000));
    expect(ids.every(uuidV4Pattern.hasMatch), isTrue);
  });
}
