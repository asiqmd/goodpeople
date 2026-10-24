import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:good_people/api/api_models.dart';
import 'package:good_people/api/good_people_api.dart';
import 'package:good_people/app.dart';
import 'package:good_people/approvals/approvals_screen.dart';
import 'package:good_people/attendance/attendance_screen.dart';
import 'package:good_people/attendance/offline_punch_queue.dart';
import 'package:good_people/auth/auth_controller.dart';
import 'package:good_people/auth/login_screen.dart';
import 'package:good_people/documents/documents_screen.dart';
import 'package:good_people/home/home_screen.dart';
import 'package:good_people/leave/leave_providers.dart';
import 'package:good_people/leave/leave_screen.dart';
import 'package:good_people/notifications/inbox_screen.dart';
import 'package:good_people/notifications/push_service.dart';

import 'support/fake_api.dart';

const _requested = 'f0000000-0000-4000-8000-000000000001';
const _decided = 'f0000000-0000-4000-8000-000000000002';
const _letter = 'f0000000-0000-4000-8000-000000000003';
const _probation = 'f0000000-0000-4000-8000-000000000004';

Map<String, Object?> _inbox() => inboxJson([
  notificationJson(id: _requested, createdAt: '2026-10-24T04:00:00.000Z'),
  notificationJson(
    id: _decided,
    event: 'approval.decided',
    title: 'Your request was approved',
    body: 'Casual leave, Oct 29 – Oct 30.',
    link: '/workspace/leave',
    createdAt: '2026-10-24T03:00:00.000Z',
  ),
  notificationJson(
    id: _letter,
    event: 'letter.issued',
    title: 'A letter for you: Experience certificate',
    body: 'HR issued it today.',
    link: '/workspace/profile',
    readAt: '2026-10-23T10:00:00.000Z',
    createdAt: '2026-10-23T09:00:00.000Z',
  ),
]);

void main() {
  /// Signs in through the fake API and shows the app at home.
  Future<ProviderContainer> pumpSignedIn(
    WidgetTester tester,
    FakeGoodPeopleApi api, {
    PushService push = const NoPushService(),
  }) async {
    tester.view.physicalSize = const Size(400, 1600);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final container = ProviderContainer.test(
      overrides: [
        goodPeopleApiProvider.overrideWithValue(api),
        punchQueueStoreProvider.overrideWithValue(MemoryPunchQueueStore()),
        pushServiceProvider.overrideWithValue(push),
        todayProvider.overrideWithValue(leaveToday),
      ],
    );
    await container
        .read(authProvider.notifier)
        .signIn(workspace: 'acme', email: 'rahima@acme.test', password: 'x');
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const GoodPeopleApp(),
      ),
    );
    await tester.pumpAndSettle();
    return container;
  }

  Finder badge(String count) => find.descendant(
    of: find.byKey(HomeScreen.inboxBadgeKey),
    matching: find.text(count),
  );

  bool badgeShown(WidgetTester tester) =>
      tester.widget<Badge>(find.byKey(HomeScreen.inboxBadgeKey)).isLabelVisible;

  group('inbox', () {
    testWidgets('the bell shows the unread count; none, no badge', (
      tester,
    ) async {
      final api = FakeGoodPeopleApi();
      await pumpSignedIn(tester, api);
      expect(badgeShown(tester), isFalse);

      api.inbox = _inbox();
      await tester.tap(find.byKey(HomeScreen.inboxKey));
      await tester.pumpAndSettle();
      expect(find.byKey(InboxScreen.emptyKey), findsNothing);
      await tester.pageBack();
      await tester.pumpAndSettle();

      expect(badgeShown(tester), isTrue);
      expect(badge('2'), findsOneWidget);
    });

    testWidgets('lists the newest first and marks the unread ones', (
      tester,
    ) async {
      final api = FakeGoodPeopleApi()..inbox = _inbox();
      await pumpSignedIn(tester, api);
      expect(badge('2'), findsOneWidget);

      await tester.tap(find.byKey(HomeScreen.inboxKey));
      await tester.pumpAndSettle();

      final tiles = tester
          .widgetList<ListTile>(find.byType(ListTile))
          .map((tile) => tile.key)
          .toList();
      expect(tiles, [
        InboxScreen.itemKey(_requested),
        InboxScreen.itemKey(_decided),
        InboxScreen.itemKey(_letter),
      ]);
      expect(find.byKey(InboxScreen.unreadDotKey(_requested)), findsOneWidget);
      expect(find.byKey(InboxScreen.unreadDotKey(_decided)), findsOneWidget);
      expect(find.byKey(InboxScreen.unreadDotKey(_letter)), findsNothing);
      expect(find.text('Your request was approved'), findsOneWidget);
    });

    testWidgets('tapping one marks it read and opens what it is about', (
      tester,
    ) async {
      final api = FakeGoodPeopleApi()
        ..inbox = inboxJson([
          ...(_inbox()['items']! as List<Object?>).cast(),
          notificationJson(
            id: _probation,
            event: 'probation.ending',
            title: 'Probation ends soon: Karim Uddin',
            link: '/workspace/employees/x?tab=job',
          ),
        ]);
      await pumpSignedIn(tester, api);
      await tester.tap(find.byKey(HomeScreen.inboxKey));
      await tester.pumpAndSettle();

      // A request to decide: the approvals inbox.
      await tester.tap(find.byKey(InboxScreen.itemKey(_requested)));
      await tester.pumpAndSettle();
      expect(find.byType(ApprovalsScreen), findsOneWidget);
      expect(api.readNotificationIds, [_requested]);
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(find.byKey(InboxScreen.unreadDotKey(_requested)), findsNothing);

      // A decided leave request: the user's requests.
      await tester.tap(find.byKey(InboxScreen.itemKey(_decided)));
      await tester.pumpAndSettle();
      final leave = tester.widget<LeaveScreen>(find.byType(LeaveScreen));
      expect(leave.initialTab, LeaveTab.requests);
      await tester.pageBack();
      await tester.pumpAndSettle();

      // A letter, already read: documents, and nothing to mark.
      await tester.tap(find.byKey(InboxScreen.itemKey(_letter)));
      await tester.pumpAndSettle();
      expect(find.byType(DocumentsScreen), findsOneWidget);
      await tester.pageBack();
      await tester.pumpAndSettle();

      // Probation is HR's business on the web: read, and stay here.
      await tester.tap(find.byKey(InboxScreen.itemKey(_probation)));
      await tester.pumpAndSettle();
      expect(find.byType(InboxScreen), findsOneWidget);
      expect(api.readNotificationIds, [_requested, _decided, _probation]);

      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(badgeShown(tester), isFalse);
    });

    testWidgets('mark all as read clears the badge', (tester) async {
      final api = FakeGoodPeopleApi()..inbox = _inbox();
      await pumpSignedIn(tester, api);
      await tester.tap(find.byKey(HomeScreen.inboxKey));
      await tester.pumpAndSettle();

      await tester.tap(find.byKey(InboxScreen.markAllReadKey));
      await tester.pumpAndSettle();
      expect(api.readAllCalls, 1);
      expect(find.byKey(InboxScreen.unreadDotKey(_requested)), findsNothing);

      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(badgeShown(tester), isFalse);
    });

    testWidgets('reloads when the app comes back, and on pull-to-refresh', (
      tester,
    ) async {
      final api = FakeGoodPeopleApi();
      await pumpSignedIn(tester, api);
      final before = api.inboxCalls;

      api.inbox = _inbox();
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();
      expect(api.inboxCalls, before + 1);
      expect(badge('2'), findsOneWidget);

      await tester.tap(find.byKey(HomeScreen.inboxKey));
      await tester.pumpAndSettle();
      api.inbox = inboxJson();
      await tester.fling(find.byType(ListView), const Offset(0, 400), 1000);
      await tester.pumpAndSettle();
      expect(find.byKey(InboxScreen.emptyKey), findsOneWidget);
    });
  });

  group('push', () {
    testWidgets('the phone registers after sign-in and is removed on '
        'sign-out', (tester) async {
      final api = FakeGoodPeopleApi();
      final push = FakePushService();
      await pumpSignedIn(tester, api, push: push);

      expect(push.registrations, 1);
      expect(api.registeredDevices.single, (
        platform: DevicePlatform.android,
        token: 'fcm-token-0123456789',
      ));

      // A rotated token is registered too, and is the one removed.
      push.tokens.add('fcm-token-rotated-9876543210');
      await tester.pumpAndSettle();
      expect(api.registeredDevices, hasLength(2));

      await tester.tap(find.byTooltip('Sign out'));
      await tester.pumpAndSettle();
      expect(find.byType(LoginScreen), findsOneWidget);
      expect(api.removedDevices.single, (
        accessToken: 'access-1',
        token: 'fcm-token-rotated-9876543210',
      ));
    });

    testWidgets('without push nothing is registered or removed', (
      tester,
    ) async {
      final api = FakeGoodPeopleApi();
      await pumpSignedIn(tester, api);
      await tester.tap(find.byTooltip('Sign out'));
      await tester.pumpAndSettle();
      expect(api.registeredDevices, isEmpty);
      expect(api.removedDevices, isEmpty);
    });

    testWidgets('a push while the app is open reloads the inbox and offers '
        'to open it', (tester) async {
      final api = FakeGoodPeopleApi();
      final push = FakePushService();
      await pumpSignedIn(tester, api, push: push);
      final before = api.inboxCalls;

      api.inbox = _inbox();
      push.foreground.add(
        const PushMessage(
          event: NotificationEvent.approvalRequested,
          link: '/workspace/approvals',
          notificationId: _requested,
          title: 'Leave request from Karim Uddin',
        ),
      );
      await tester.pumpAndSettle();
      expect(api.inboxCalls, before + 1);
      expect(badge('2'), findsOneWidget);
      expect(find.text('Leave request from Karim Uddin'), findsOneWidget);

      await tester.tap(find.text('View'));
      await tester.pumpAndSettle();
      expect(find.byType(ApprovalsScreen), findsOneWidget);
      expect(api.readNotificationIds, [_requested]);
    });

    testWidgets('a tapped push opens its screen and marks it read', (
      tester,
    ) async {
      final api = FakeGoodPeopleApi()..inbox = _inbox();
      final push = FakePushService();
      await pumpSignedIn(tester, api, push: push);

      push.opened.add(
        PushMessage.fromData({
          'event': 'letter.issued',
          'link': '/workspace/profile',
          'notificationId': _letter,
        }),
      );
      await tester.pumpAndSettle();
      expect(find.byType(DocumentsScreen), findsOneWidget);
      expect(api.readNotificationIds, [_letter]);
    });

    testWidgets('the push that started the app is opened once signed in', (
      tester,
    ) async {
      final api = FakeGoodPeopleApi();
      final push = FakePushService()
        ..launchedBy = const PushMessage(
          event: NotificationEvent.approvalDecided,
          link: '/workspace/attendance',
          notificationId: _decided,
        );
      await pumpSignedIn(tester, api, push: push);
      expect(api.readNotificationIds, [_decided]);
      // A decided correction: the user's corrections.
      final screen = tester.widget<AttendanceScreen>(
        find.byType(AttendanceScreen),
      );
      expect(screen.initialTab, AttendanceTab.corrections);
    });
  });

  testWidgets('changing the app language tells the API, so notifications '
      'come in it', (tester) async {
    final api = FakeGoodPeopleApi();
    await pumpSignedIn(tester, api);
    expect(api.languages, isEmpty);

    await tester.tap(find.byTooltip('Language'));
    await tester.pumpAndSettle();
    await tester.tap(
      find.widgetWithText(CheckedPopupMenuItem<Locale>, 'বাংলা'),
    );
    await tester.pumpAndSettle();

    expect(api.languages, [UserLanguage.bn]);
  });
}
