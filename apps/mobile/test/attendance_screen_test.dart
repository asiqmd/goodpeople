import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:good_people/api/api_exception.dart';
import 'package:good_people/api/api_models.dart';
import 'package:good_people/api/good_people_api.dart';
import 'package:good_people/app.dart';
import 'package:good_people/approvals/approvals_tab.dart';
import 'package:good_people/attendance/attendance_providers.dart';
import 'package:good_people/attendance/attendance_screen.dart';
import 'package:good_people/attendance/attendance_widgets.dart';
import 'package:good_people/attendance/camera_service.dart';
import 'package:good_people/attendance/correction_form_screen.dart';
import 'package:good_people/attendance/corrections_tab.dart';
import 'package:good_people/attendance/location_service.dart';
import 'package:good_people/attendance/month_tab.dart';
import 'package:good_people/attendance/today_tab.dart';
import 'package:good_people/auth/auth_controller.dart';
import 'package:good_people/home/home_screen.dart';
import 'package:good_people/leave/leave_providers.dart';
import 'package:good_people/settings/locale_controller.dart';

import 'support/fake_api.dart';

const _newCorrectionId = 'ad000000-0000-4000-8000-0000000000ff';

/// Like [find.text], but reads a no-break space in the widget's text as a
/// plain one, so expected times are written `8:00 AM` here while the app
/// keeps "8:00" and "AM" on one line.
Finder findText(String value) => find.byWidgetPredicate(
  (widget) => widget is Text && widget.data?.replaceAll('\u00a0', ' ') == value,
  description: 'text "$value"',
);

ApiException _refusal(int status, String code, String message) => ApiException(
  kind: ApiErrorKind.server,
  statusCode: status,
  code: code,
  message: message,
);

void main() {
  late FakeLocationService location;
  late FakeCameraService camera;

  setUp(() {
    location = FakeLocationService();
    camera = FakeCameraService();
  });

  /// Signs in through the fake API with "today" fixed at [leaveToday],
  /// [location] as the phone's GPS and [camera] as its camera, shows the
  /// app in [locale] and, if [open], opens Attendance from the home screen.
  /// The screen is phone-width, so overflow fails the test.
  Future<ProviderContainer> pumpAttendance(
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
        locationServiceProvider.overrideWithValue(location),
        cameraServiceProvider.overrideWithValue(camera),
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
      await tester.tap(find.byKey(HomeScreen.attendanceKey));
      await tester.pumpAndSettle();
    }
    return container;
  }

  /// Scrolls the tab bar to [tab], as on a phone, and taps it.
  Future<void> openTab(WidgetTester tester, AttendanceTab tab) async {
    final finder = find.byKey(AttendanceScreen.tabKey(tab));
    await tester.ensureVisible(finder);
    await tester.pumpAndSettle();
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  Future<void> punch(WidgetTester tester) async {
    await tester.tap(find.byKey(TodayTab.punchButtonKey));
    await tester.pumpAndSettle();
  }

  /// Accepts the open date or time picker as it stands.
  Future<void> tapOk(WidgetTester tester, Type dialog) async {
    final ok = MaterialLocalizations.of(tester.element(find.byType(dialog)))
        .okButtonLabel;
    await tester.tap(findText(ok));
    await tester.pumpAndSettle();
  }

  Finder within(Key key, Finder finder) =>
      find.descendant(of: find.byKey(key), matching: finder);

  String? punchLabel(WidgetTester tester) {
    final button = find.byKey(TodayTab.punchButtonKey);
    final label = find.descendant(of: button, matching: find.byType(Text));
    return tester.widget<Text>(label.first).data;
  }

  group('home', () {
    testWidgets('an Attendance card opens Attendance on Today', (tester) async {
      final api = FakeGoodPeopleApi();
      await pumpAttendance(tester, api, open: false);

      expect(
        within(HomeScreen.attendanceKey, findText('Attendance')),
        findsOneWidget,
      );
      expect(
        within(
          HomeScreen.attendanceKey,
          findText('Punch in and out, your month and corrections'),
        ),
        findsOneWidget,
      );

      await tester.tap(find.byKey(HomeScreen.attendanceKey));
      await tester.pumpAndSettle();

      expect(find.byType(AttendanceScreen), findsOneWidget);
      expect(find.widgetWithText(AppBar, 'Attendance'), findsOneWidget);
      for (final (tab, label) in [
        (AttendanceTab.today, 'Today'),
        (AttendanceTab.month, 'This month'),
        (AttendanceTab.corrections, 'Corrections'),
      ]) {
        expect(
          within(AttendanceScreen.tabKey(tab), findText(label)),
          findsOneWidget,
        );
      }
      // An empty inbox: no Approvals tab.
      expect(
        find.byKey(AttendanceScreen.tabKey(AttendanceTab.approvals)),
        findsNothing,
      );
      // Only Today and the approval inbox load at first.
      expect(api.attendanceTodayCalls, 1);
      expect(api.approvalCalls, 1);
      expect(api.attendanceQueries, isEmpty);
      expect(api.regularizationCalls, 0);
    });

    testWidgets('no Attendance card without the attendance module', (
      tester,
    ) async {
      final api = FakeGoodPeopleApi()
        ..accessView = TenantAccessView.fromJson(
          accessJson(features: const ['core_hr', 'leave']),
        );
      await pumpAttendance(tester, api, open: false);

      expect(find.byKey(HomeScreen.leaveKey), findsOneWidget);
      expect(find.byKey(HomeScreen.attendanceKey), findsNothing);
      expect(api.attendanceTodayCalls, 0);
    });
  });

  group('today', () {
    testWidgets('shows the shift, the status, the hours and the punches', (
      tester,
    ) async {
      await pumpAttendance(tester, FakeGoodPeopleApi());

      for (final text in [
        'Saturday, October 24',
        'General shift',
        '8:00 AM – 5:00 PM',
        'In progress',
        'First in',
        '7:55 AM',
        'Last out',
        '—',
        'Worked',
        '0:00',
      ]) {
        expect(
          within(TodayTab.dayCardKey, findText(text)),
          findsOneWidget,
          reason: text,
        );
      }

      // Punches with where they came from; HR's voided double tap is
      // marked.
      final device = TodayTab.punchKey(devicePunchId);
      expect(within(device, findText('7:55 AM · In')), findsOneWidget);
      expect(within(device, findText('Device · Main gate')), findsOneWidget);
      expect(within(device, find.byIcon(Icons.fingerprint)), findsOneWidget);
      final voided = TodayTab.punchKey(voidedPunchId);
      expect(within(voided, findText('7:56 AM · Out')), findsOneWidget);
      expect(within(voided, findText('Voided')), findsOneWidget);
      expect(within(voided, findText('Double tap')), findsOneWidget);

      expect(punchLabel(tester), 'Punch out');
      expect(
        findText(
          'When you punch, your location is checked against your workplace '
          'area.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('punching sends the location and shows the day the API '
        'answers with', (tester) async {
      final api = FakeGoodPeopleApi();
      await pumpAttendance(tester, api);

      await punch(tester);

      expect(location.timeLimits, [TodayTab.requiredFixTime]);
      expect(api.punchBodies.single, {
        'source': 'mobile',
        'latitude': 24.0024,
        'longitude': 90.4265,
        'accuracyM': 12.0,
      });
      // No photo asked for: no camera, and JSON as before.
      expect(camera.calls, 0);
      expect(api.punchSelfies.single, isNull);
      expect(find.byKey(TodayTab.selfieHintKey), findsNothing);
      expect(findText('Punched out'), findsOneWidget);
      // The answer is shown without loading today again.
      expect(api.attendanceTodayCalls, 1);
      expect(punchLabel(tester), 'Punch in');
      expect(within(TodayTab.dayCardKey, findText('5:10 PM')), findsOneWidget);
      expect(within(TodayTab.dayCardKey, findText('8:15')), findsOneWidget);
      final mobile = TodayTab.punchKey(mobilePunchId);
      expect(within(mobile, findText('5:10 PM · Out')), findsOneWidget);
      expect(within(mobile, findText('Mobile app')), findsOneWidget);
      expect(within(mobile, find.byIcon(Icons.smartphone)), findsOneWidget);
      expect(find.byKey(TodayTab.punchErrorKey), findsNothing);
    });

    testWidgets('refusals show a message for their code, else the API '
        'message', (tester) async {
      final api = FakeGoodPeopleApi()
        ..punchErrors.addAll([
          _refusal(
            400,
            'outside_geofence',
            'You are about 801 m away, outside the 200 m allowed',
          ),
          _refusal(409, 'too_soon', 'You punched less than a minute ago'),
          _refusal(400, 'brand_new_rule', 'Punching is paused for the audit'),
        ]);
      location.result = atTheBazaar;
      await pumpAttendance(tester, api);

      Finder error(String text) =>
          within(TodayTab.punchErrorKey, findText(text));

      await punch(tester);
      expect(
        error(
          'You are about 801 m from your workplace. You can punch within '
          '200 m of it.',
        ),
        findsOneWidget,
      );
      expect(api.punchBodies.single['latitude'], 24.0095);

      await punch(tester);
      expect(
        error(
          'You punched less than a minute ago. Wait a moment before punching '
          'again.',
        ),
        findsOneWidget,
      );
      expect(find.textContaining('801 m'), findsNothing);

      // A code this app does not know: the API's own message.
      await punch(tester);
      expect(error('Punching is paused for the audit'), findsOneWidget);

      // The next punch goes through and clears the message.
      location.result = atTheFactory;
      await punch(tester);
      expect(find.byKey(TodayTab.punchErrorKey), findsNothing);
      expect(findText('Punched out'), findsOneWidget);
      expect(api.punchBodies, hasLength(4));
    });

    testWidgets('with a geofence, no location means no punch', (tester) async {
      final api = FakeGoodPeopleApi();
      await pumpAttendance(tester, api);

      Finder error(String text) =>
          within(TodayTab.punchErrorKey, findText(text));

      location.result = const LocationUnavailable(
        LocationProblem.permissionDenied,
      );
      await punch(tester);
      expect(
        error(
          'Allow location access so the app can check that you are at your '
          'workplace.',
        ),
        findsOneWidget,
      );
      // Asking again may work, so no trip to the settings.
      expect(find.byKey(TodayTab.openSettingsKey), findsNothing);

      location.result = const LocationUnavailable(
        LocationProblem.permissionDeniedForever,
      );
      await punch(tester);
      expect(
        error(
          'Location access is blocked for this app. Allow it in Settings to '
          'punch.',
        ),
        findsOneWidget,
      );
      await tester.tap(find.byKey(TodayTab.openSettingsKey));
      await tester.pumpAndSettle();

      location.result = const LocationUnavailable(LocationProblem.servicesOff);
      await punch(tester);
      expect(
        error('Location is turned off on this phone. Turn it on to punch.'),
        findsOneWidget,
      );
      await tester.tap(find.byKey(TodayTab.openSettingsKey));
      await tester.pumpAndSettle();

      expect(location.openedSettings, [
        LocationProblem.permissionDeniedForever,
        LocationProblem.servicesOff,
      ]);
      expect(api.punchBodies, isEmpty);
      expect(punchLabel(tester), 'Punch out');
    });

    testWidgets('anywhere: without a location the punch goes without '
        'coordinates', (tester) async {
      final api = FakeGoodPeopleApi()
        ..attendanceToday = attendanceTodayJson(
          mode: 'anywhere',
          geofence: null,
        );
      location.result = const LocationUnavailable(LocationProblem.servicesOff);
      await pumpAttendance(tester, api);

      expect(
        findText(
          'You can punch from anywhere. If you allow it, your location is '
          'sent too.',
        ),
        findsOneWidget,
      );
      await punch(tester);

      expect(location.timeLimits, [TodayTab.optionalFixTime]);
      expect(api.punchBodies.single, {'source': 'mobile'});
      expect(find.byKey(TodayTab.punchErrorKey), findsNothing);
      expect(findText('Punched out'), findsOneWidget);
    });

    testWidgets('when punching from the app is not possible, says why '
        'instead of the button', (tester) async {
      final api = FakeGoodPeopleApi()
        ..attendanceToday = attendanceTodayJson(
          mode: 'off',
          blockedReason: 'disabled',
          geofence: null,
        );
      final container = await pumpAttendance(tester, api);

      expect(find.byKey(TodayTab.punchButtonKey), findsNothing);
      expect(
        within(
          TodayTab.blockedKey,
          findText(
            'Punching from the app is turned off for your workspace. Use the '
            'attendance device at work.',
          ),
        ),
        findsOneWidget,
      );
      // The day still shows.
      expect(within(TodayTab.dayCardKey, findText('7:55 AM')), findsOneWidget);

      api.attendanceToday = attendanceTodayJson(
        blockedReason: 'no_geofence',
        geofence: null,
      );
      container.invalidate(attendanceTodayProvider);
      await tester.pumpAndSettle();

      expect(find.byKey(TodayTab.punchButtonKey), findsNothing);
      expect(
        within(
          TodayTab.blockedKey,
          findText(
            "Your workplace has no punch area set yet, so you can't punch "
            'from the app. Ask HR to set one.',
          ),
        ),
        findsOneWidget,
      );
      expect(location.timeLimits, isEmpty);
    });

    testWidgets('a login with no employee record sees an empty state', (
      tester,
    ) async {
      final api = FakeGoodPeopleApi()
        ..attendanceTodayErrors.add(noEmployeeRecord);
      await pumpAttendance(tester, api);

      expect(findText('No employee record'), findsOneWidget);
      expect(
        find.textContaining('Attendance belongs to an employee record'),
        findsOneWidget,
      );
      expect(findText('We could not load your attendance.'), findsNothing);
    });
  });

  group('selfie', () {
    FakeGoodPeopleApi selfieApi() =>
        FakeGoodPeopleApi()
          ..attendanceToday = attendanceTodayJson(requireSelfie: true);

    Finder error(String text) => within(TodayTab.punchErrorKey, findText(text));

    testWidgets('the front camera opens first, then the punch goes with the '
        'photo and the location', (tester) async {
      final api = selfieApi();
      await pumpAttendance(tester, api);

      expect(
        tester.widget<Text>(find.byKey(TodayTab.selfieHintKey)).data,
        'Your workspace asks for a photo with each punch. The front camera '
        'opens when you punch.',
      );
      await punch(tester);

      expect(camera.calls, 1);
      expect(location.timeLimits, [TodayTab.requiredFixTime]);
      final selfie = api.punchSelfies.single!;
      expect(selfie.bytes, tinyPng);
      expect(selfie.fileName, 'selfie.jpg');
      // Sent as a form: every field is text.
      expect(api.punchBodies.single, {
        'source': 'mobile',
        'latitude': '24.0024',
        'longitude': '90.4265',
        'accuracyM': '12.0',
      });
      expect(findText('Punched out'), findsOneWidget);
      expect(find.byKey(TodayTab.punchErrorKey), findsNothing);
      // The new punch is marked as having a photo; the device's is not.
      expect(find.byKey(TodayTab.punchPhotoKey(mobilePunchId)), findsOneWidget);
      expect(find.byKey(TodayTab.punchPhotoKey(devicePunchId)), findsNothing);
    });

    testWidgets('backing out of the camera punches nothing and says so', (
      tester,
    ) async {
      final api = selfieApi();
      camera.result = null;
      await pumpAttendance(tester, api);

      await punch(tester);

      expect(camera.calls, 1);
      expect(api.punchBodies, isEmpty);
      // Not even the location was read.
      expect(location.timeLimits, isEmpty);
      expect(
        error(
          "No photo was taken, so you weren't punched. Punch again and take "
          'the photo.',
        ),
        findsOneWidget,
      );
      expect(punchLabel(tester), 'Punch out');

      camera.result = PunchSelfie(bytes: tinyPng);
      await punch(tester);
      expect(api.punchSelfies.single, isNotNull);
      expect(find.byKey(TodayTab.punchErrorKey), findsNothing);
      expect(findText('Punched out'), findsOneWidget);
    });

    testWidgets('camera refused: says so with Open settings; a photo too '
        'large is not sent', (tester) async {
      final api = selfieApi();
      camera.result = const CameraUnavailable(CameraProblem.permissionDenied);
      await pumpAttendance(tester, api);

      await punch(tester);
      expect(
        error(
          'Camera access is off for this app. Allow it in Settings to take '
          'the photo for your punch.',
        ),
        findsOneWidget,
      );
      await tester.tap(find.byKey(TodayTab.openSettingsKey));
      await tester.pumpAndSettle();
      expect(camera.openedSettings, 1);
      expect(location.openedSettings, isEmpty);

      camera.result = PunchSelfie(bytes: Uint8List(PunchSelfie.maxBytes + 1));
      await punch(tester);
      expect(
        error('The photo is too large to send. Please take it again.'),
        findsOneWidget,
      );
      expect(find.byKey(TodayTab.openSettingsKey), findsNothing);
      expect(api.punchBodies, isEmpty);

      // The API's own size limit reads the same.
      camera.result = PunchSelfie(bytes: tinyPng);
      api.punchErrors.add(
        const ApiException(
          kind: ApiErrorKind.server,
          statusCode: 413,
          message: 'File too large',
        ),
      );
      await punch(tester);
      expect(
        error('The photo is too large to send. Please take it again.'),
        findsOneWidget,
      );
      expect(api.punchSelfies, hasLength(1));
    });

    testWidgets('selfie_required: the workspace turned it on since the day '
        'loaded; the next punch takes the photo', (tester) async {
      final api = FakeGoodPeopleApi()
        ..punchErrors.add(
          _refusal(400, 'selfie_required', 'Take a photo to punch'),
        );
      await pumpAttendance(tester, api);
      api.attendanceToday = attendanceTodayJson(requireSelfie: true);

      await punch(tester);

      expect(camera.calls, 0);
      expect(api.punchSelfies.single, isNull);
      expect(
        error(
          'Your workspace now asks for a photo with each punch. Punch again '
          'to take one.',
        ),
        findsOneWidget,
      );
      // Today reloads, and now asks for the photo.
      expect(api.attendanceTodayCalls, 2);
      expect(find.byKey(TodayTab.selfieHintKey), findsOneWidget);

      await punch(tester);
      expect(camera.calls, 1);
      expect(api.punchSelfies.last, isNotNull);
      expect(findText('Punched out'), findsOneWidget);
    });
  });

  group('this month', () {
    testWidgets('totals, then days newest first with statuses and badges; '
        'off days muted', (tester) async {
      // The API projects the rest of the month; only days so far show.
      final api = FakeGoodPeopleApi()
        ..attendanceRange = (from, to) =>
            attendanceRangeJson(from, '2026-10-31');
      await pumpAttendance(tester, api);
      await openTab(tester, AttendanceTab.month);

      expect(api.attendanceQueries, [(from: '2026-10-01', to: '2026-10-24')]);
      expect(findText('October 2026'), findsOneWidget);

      Finder total(String text) => within(MonthTab.totalsKey, findText(text));
      for (final label in [
        'Present',
        'Half day',
        'Absent',
        'On leave',
        'Missing punch',
        'Late',
        'Worked',
        'Overtime',
      ]) {
        expect(total(label), findsOneWidget, reason: label);
      }
      expect(total('14'), findsOneWidget);
      // Half day, absent, on leave, missing punch and late.
      expect(total('1'), findsNWidgets(5));
      expect(total('120:50'), findsOneWidget);
      expect(total('2:00'), findsOneWidget);

      Key day(int n) => MonthTab.dayKey(DateTime.utc(2026, 10, n));
      void expectDay(int n, List<String> texts) {
        for (final text in texts) {
          expect(
            within(day(n), findText(text)),
            findsOneWidget,
            reason: 'Oct $n: $text',
          );
        }
      }

      expectDay(24, ['Sat, Oct 24', 'In progress', '7:55 AM – …']);
      expectDay(23, ['Fri, Oct 23', 'Off', 'Weekly off']);
      expectDay(22, ['Present', '8:25 AM – 5:05 PM · 7:40', 'Late 0:25']);
      expectDay(21, ['Off', 'Durga Puja']);
      expectDay(20, ['Missing punch', '7:58 AM – …', 'Correction: Pending']);
      expectDay(19, ['Present', '7:50 AM – 7:10 PM · 10:20', 'OT 2:00']);
      expectDay(14, ['On leave', 'Leave: CL']);
      expectDay(12, ['Half day', 'Left early 4:00']);
      expectDay(8, ['Present', 'On duty']);
      // An approved correction is not flagged as waiting.
      expect(within(day(8), find.textContaining('Correction')), findsNothing);

      expect(find.byKey(day(25)), findsNothing);
      expect(
        tester.getTopLeft(find.byKey(day(24))).dy,
        lessThan(tester.getTopLeft(find.byKey(day(20))).dy),
      );

      BoxDecoration? background(int n) =>
          tester
                  .widget<Ink>(
                    find.descendant(
                      of: find.byKey(day(n)),
                      matching: find.byType(Ink),
                    ),
                  )
                  .decoration
              as BoxDecoration?;
      expect(background(23)?.color, isNotNull);
      expect(background(21)?.color, isNotNull);
      expect(background(22), isNull);
    });

    testWidgets('tapping a day opens the correction form for that day; '
        'sending shows it under Corrections', (tester) async {
      final api = FakeGoodPeopleApi();
      await pumpAttendance(tester, api);
      await openTab(tester, AttendanceTab.month);

      await tester.tap(find.byKey(MonthTab.dayKey(DateTime.utc(2026, 10, 20))));
      await tester.pumpAndSettle();

      expect(find.byType(CorrectionFormScreen), findsOneWidget);
      expect(
        within(CorrectionFormScreen.dateFieldKey, findText('October 20, 2026')),
        findsOneWidget,
      );

      // The out-time picker opens at the shift's end.
      await tester.tap(find.byKey(CorrectionFormScreen.outTimeKey));
      await tester.pumpAndSettle();
      await tapOk(tester, TimePickerDialog);
      expect(
        within(CorrectionFormScreen.outTimeKey, findText('5:00 PM')),
        findsOneWidget,
      );

      await tester.enterText(
        find.byKey(CorrectionFormScreen.reasonFieldKey),
        '  Card reader at the gate was down  ',
      );
      await tester.tap(find.byKey(CorrectionFormScreen.submitKey));
      await tester.pumpAndSettle();

      expect(api.regularizationBodies.single, {
        'date': '2026-10-20',
        'kind': 'missed_punch',
        'outTime': '17:00',
        'reason': 'Card reader at the gate was down',
      });
      expect(find.byType(CorrectionFormScreen), findsNothing);
      expect(findText('Correction sent for approval'), findsOneWidget);
      // Corrections is open and shows it first.
      expect(
        find.byKey(CorrectionsTab.correctionKey(_newCorrectionId)),
        findsOneWidget,
      );
      expect(
        within(
          CorrectionsTab.correctionKey(_newCorrectionId),
          findText('Out 5:00 PM'),
        ),
        findsOneWidget,
      );
      // The month reloads to show the correction on its day.
      expect(api.attendanceQueries, hasLength(2));
    });
  });

  group('corrections', () {
    testWidgets('list statuses, times and the trail; cancel a pending one', (
      tester,
    ) async {
      final api = FakeGoodPeopleApi();
      await pumpAttendance(tester, api);
      await openTab(tester, AttendanceTab.corrections);

      expect(api.regularizationCalls, 1);
      void expectIn(String id, List<String> texts) {
        for (final text in texts) {
          expect(
            within(CorrectionsTab.correctionKey(id), findText(text)),
            findsOneWidget,
            reason: '$id: $text',
          );
        }
      }

      // The status pill; the trail repeats words such as "Approved".
      Finder statusOf(String id, String label) => within(
        CorrectionsTab.correctionKey(id),
        find.descendant(
          of: find.byType(RegularizationStatusPill),
          matching: findText(label),
        ),
      );

      expect(statusOf(pendingCorrectionId, 'Pending'), findsOneWidget);
      expect(statusOf(approvedCorrectionId, 'Approved'), findsOneWidget);
      expect(statusOf(rejectedCorrectionId, 'Rejected'), findsOneWidget);
      expectIn(pendingCorrectionId, [
        'Oct 20, 2026',
        'Missed punch',
        'Out 5:40 PM',
        'The card reader at the gate was down',
        'Manager: Shirin Akter',
        'Awaiting decision',
        'HR team',
      ]);
      expectIn(approvedCorrectionId, [
        'Oct 8, 2026',
        'On duty',
        'Buyer inspection at the Ashulia unit',
        'Shirin Akter, Oct 9, 2026',
      ]);
      expectIn(rejectedCorrectionId, [
        'In 8:00 AM · Out 5:00 PM',
        '“The device has you at 9:40”',
        'Skipped',
      ]);
      expect(
        find.byKey(CorrectionsTab.cancelKey(approvedCorrectionId)),
        findsNothing,
      );
      expect(
        find.byKey(CorrectionsTab.cancelKey(rejectedCorrectionId)),
        findsNothing,
      );

      final cancel = find.byKey(CorrectionsTab.cancelKey(pendingCorrectionId));
      await tester.tap(cancel);
      await tester.pumpAndSettle();
      expect(findText('Cancel this correction?'), findsOneWidget);
      expect(
        findText('Your correction for Oct 20, 2026 will be withdrawn.'),
        findsOneWidget,
      );
      await tester.tap(findText('Keep it'));
      await tester.pumpAndSettle();
      expect(api.cancelledRegularizationIds, isEmpty);

      await tester.tap(cancel);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(CorrectionsTab.confirmCancelKey));
      await tester.pumpAndSettle();

      expect(api.cancelledRegularizationIds, [pendingCorrectionId]);
      expect(findText('Correction cancelled'), findsOneWidget);
      expect(api.regularizationCalls, 2);
      expect(statusOf(pendingCorrectionId, 'Cancelled'), findsOneWidget);
      expect(cancel, findsNothing);
    });

    testWidgets('the form: a missed punch needs a time, then Send posts the '
        'body', (tester) async {
      final api = FakeGoodPeopleApi();
      await pumpAttendance(tester, api);
      await openTab(tester, AttendanceTab.corrections);

      await tester.tap(find.byKey(CorrectionsTab.requestKey));
      await tester.pumpAndSettle();
      expect(find.widgetWithText(AppBar, 'Request correction'), findsOneWidget);

      // Nothing filled in.
      await tester.tap(find.byKey(CorrectionFormScreen.submitKey));
      await tester.pumpAndSettle();
      expect(findText('Choose the day to correct'), findsOneWidget);
      expect(
        findText('Give the in time, the out time or both.'),
        findsOneWidget,
      );
      expect(findText('Write at least 3 characters'), findsOneWidget);
      expect(api.regularizationBodies, isEmpty);

      // A day and a reason, but still no time.
      await tester.tap(find.byKey(CorrectionFormScreen.dateFieldKey));
      await tester.pumpAndSettle();
      await tester.tap(findText('22'));
      await tapOk(tester, DatePickerDialog);
      expect(
        within(CorrectionFormScreen.dateFieldKey, findText('October 22, 2026')),
        findsOneWidget,
      );
      await tester.enterText(
        find.byKey(CorrectionFormScreen.reasonFieldKey),
        'The device did not read my finger',
      );
      await tester.tap(find.byKey(CorrectionFormScreen.submitKey));
      await tester.pumpAndSettle();
      expect(findText('Choose the day to correct'), findsNothing);
      expect(
        findText('Give the in time, the out time or both.'),
        findsOneWidget,
      );
      expect(api.regularizationBodies, isEmpty);

      // The in-time picker opens at today's shift start. A time can be
      // cleared again.
      await tester.tap(find.byKey(CorrectionFormScreen.inTimeKey));
      await tester.pumpAndSettle();
      await tapOk(tester, TimePickerDialog);
      expect(
        within(CorrectionFormScreen.inTimeKey, findText('8:00 AM')),
        findsOneWidget,
      );
      expect(findText('Give the in time, the out time or both.'), findsNothing);
      await tester.tap(find.byKey(CorrectionFormScreen.clearInKey));
      await tester.pumpAndSettle();
      expect(findText('8:00 AM'), findsNothing);
      await tester.tap(find.byKey(CorrectionFormScreen.inTimeKey));
      await tester.pumpAndSettle();
      await tapOk(tester, TimePickerDialog);

      await tester.tap(find.byKey(CorrectionFormScreen.submitKey));
      await tester.pumpAndSettle();

      expect(api.regularizationBodies.single, {
        'date': '2026-10-22',
        'kind': 'missed_punch',
        'inTime': '08:00',
        'reason': 'The device did not read my finger',
      });
      expect(find.byType(CorrectionFormScreen), findsNothing);
      expect(findText('Correction sent for approval'), findsOneWidget);
      expect(
        within(
          CorrectionsTab.correctionKey(_newCorrectionId),
          findText('In 8:00 AM'),
        ),
        findsOneWidget,
      );
    });

    testWidgets('the form: on duty sends no times; a refusal shows a message '
        'for its code', (tester) async {
      final api = FakeGoodPeopleApi()
        ..regularizationError = _refusal(
          409,
          'already_pending',
          'A correction for this day is already waiting',
        );
      await pumpAttendance(tester, api);
      await openTab(tester, AttendanceTab.month);
      await tester.tap(find.byKey(MonthTab.dayKey(DateTime.utc(2026, 10, 22))));
      await tester.pumpAndSettle();

      // A time chosen before switching to on duty is not sent.
      await tester.tap(find.byKey(CorrectionFormScreen.outTimeKey));
      await tester.pumpAndSettle();
      await tapOk(tester, TimePickerDialog);
      await tester.tap(
        within(CorrectionFormScreen.kindKey, findText('On duty')),
      );
      await tester.pumpAndSettle();
      expect(find.byKey(CorrectionFormScreen.outTimeKey), findsNothing);
      expect(
        findText(
          'An on-duty day counts as your whole shift, so no times are needed.',
        ),
        findsOneWidget,
      );
      await tester.enterText(
        find.byKey(CorrectionFormScreen.reasonFieldKey),
        'Buyer visit at the Ashulia unit',
      );
      await tester.tap(find.byKey(CorrectionFormScreen.submitKey));
      await tester.pumpAndSettle();

      expect(api.regularizationBodies.single, {
        'date': '2026-10-22',
        'kind': 'on_duty',
        'reason': 'Buyer visit at the Ashulia unit',
      });
      expect(
        within(
          CorrectionFormScreen.errorKey,
          findText(
            'A correction for this day is already waiting for approval.',
          ),
        ),
        findsOneWidget,
      );
      expect(find.byType(CorrectionFormScreen), findsOneWidget);

      api.regularizationError = null;
      await tester.tap(find.byKey(CorrectionFormScreen.submitKey));
      await tester.pumpAndSettle();
      expect(api.regularizationBodies, hasLength(2));
      expect(find.byType(CorrectionFormScreen), findsNothing);
      expect(
        within(
          CorrectionsTab.correctionKey(_newCorrectionId),
          findText('On duty'),
        ),
        findsOneWidget,
      );
    });
  });

  testWidgets('approvals: a mixed inbox shows leave, a correction and an '
      'unknown item; deciding the correction calls its step', (tester) async {
    final api = FakeGoodPeopleApi()..approvals = mixedApprovalsJson();
    await pumpAttendance(tester, api);

    expect(
      within(AttendanceScreen.approvalsBadgeKey, findText('3')),
      findsOneWidget,
    );
    await openTab(tester, AttendanceTab.approvals);

    void expectIn(String stepId, List<String> texts) {
      for (final text in texts) {
        expect(
          within(ApprovalsTab.itemKey(stepId), findText(text)),
          findsOneWidget,
          reason: '$stepId: $text',
        );
      }
    }

    expectIn(managerStepId, [
      'Jamal Uddin',
      'Casual leave',
      'Oct 28 – Oct 29, 2026 · 2 days',
      '6 days available',
    ]);
    expectIn(correctionStepId, [
      'Kulsum Akter',
      'MG-0012',
      'Your step: Manager',
      'Attendance correction · Missed punch',
      'Thu, Oct 22',
      'Asked for',
      'In 8:02 AM',
      'The device did not read my finger',
      'Recorded now',
      'Missing punch',
      '5:06 PM – …',
      'Manager: Shirin Akter',
    ]);
    expectIn(unknownStepId, [
      'Your step: HR',
      "This version of the app can't show this request. Decide it on the web.",
    ]);
    expect(find.byKey(ApprovalsTab.approveKey(unknownStepId)), findsNothing);
    expect(find.byKey(ApprovalsTab.rejectKey(unknownStepId)), findsNothing);

    await tester.tap(find.byKey(ApprovalsTab.approveKey(correctionStepId)));
    await tester.pumpAndSettle();
    expect(findText('Approve this correction?'), findsOneWidget);
    await tester.tap(find.byKey(ApprovalsTab.confirmKey));
    await tester.pumpAndSettle();

    expect(api.decisions, [
      (
        stepId: correctionStepId,
        decision: ApprovalDecision.approve,
        comment: null,
      ),
    ]);
    expect(findText('Correction approved'), findsOneWidget);
    expect(find.byKey(ApprovalsTab.itemKey(correctionStepId)), findsNothing);
    expect(
      within(AttendanceScreen.approvalsBadgeKey, findText('2')),
      findsOneWidget,
    );

    // Leave decided from the same inbox keeps its own wording.
    await tester.tap(find.byKey(ApprovalsTab.rejectKey(managerStepId)));
    await tester.pumpAndSettle();
    expect(findText('Reject this leave?'), findsOneWidget);
    await tester.tap(find.byKey(ApprovalsTab.confirmKey));
    await tester.pumpAndSettle();
    expect(api.decisions.last.stepId, managerStepId);
    expect(api.decisions.last.decision, ApprovalDecision.reject);
    // The unknown item stays, so the tab does too.
    expect(
      within(AttendanceScreen.approvalsBadgeKey, findText('1')),
      findsOneWidget,
    );
  });

  testWidgets('approvals: a resignation shows the notice and the shortfall, '
      'and is decided through its step', (tester) async {
    final api = FakeGoodPeopleApi()
      ..approvals = [separationApprovalJson(), approvalsJson().first];
    await pumpAttendance(tester, api);
    await openTab(tester, AttendanceTab.approvals);

    final card = ApprovalsTab.itemKey(separationStepId);
    for (final text in [
      'Kulsum Akter',
      'MG-0012',
      'Your step: Manager',
      'Resignation',
      'Notice Oct 24, 2026 → last day Nov 24, 2026',
      'Notice short by 29 days',
      'Getting married and moving to Sylhet',
      'Manager: Shirin Akter',
    ]) {
      expect(within(card, findText(text)), findsOneWidget, reason: text);
    }

    // Reject asks its own question; backing out decides nothing.
    await tester.tap(find.byKey(ApprovalsTab.rejectKey(separationStepId)));
    await tester.pumpAndSettle();
    expect(findText('Reject this resignation?'), findsOneWidget);
    final cancel = MaterialLocalizations.of(
      tester.element(find.byType(AlertDialog)),
    ).cancelButtonLabel;
    await tester.tap(findText(cancel));
    await tester.pumpAndSettle();
    expect(api.decisions, isEmpty);

    await tester.tap(find.byKey(ApprovalsTab.approveKey(separationStepId)));
    await tester.pumpAndSettle();
    expect(findText('Approve this resignation?'), findsOneWidget);
    await tester.enterText(
      find.byKey(ApprovalsTab.commentFieldKey),
      'Best wishes',
    );
    await tester.tap(find.byKey(ApprovalsTab.confirmKey));
    await tester.pumpAndSettle();

    expect(api.decisions, [
      (
        stepId: separationStepId,
        decision: ApprovalDecision.approve,
        comment: 'Best wishes',
      ),
    ]);
    expect(findText('Resignation approved'), findsOneWidget);
    expect(find.byKey(card), findsNothing);
    expect(
      within(AttendanceScreen.approvalsBadgeKey, findText('1')),
      findsOneWidget,
    );
  });

  testWidgets('Bangla: labels, statuses, mapped errors and Bangla digits', (
    tester,
  ) async {
    final api = FakeGoodPeopleApi()
      ..punchErrors.add(
        _refusal(409, 'too_soon', 'You punched less than a minute ago'),
      );
    await pumpAttendance(tester, api, locale: const Locale('bn'), open: false);

    expect(
      within(HomeScreen.attendanceKey, findText('হাজিরা')),
      findsOneWidget,
    );
    await tester.tap(find.byKey(HomeScreen.attendanceKey));
    await tester.pumpAndSettle();

    expect(find.widgetWithText(AppBar, 'হাজিরা'), findsOneWidget);
    for (final (tab, label) in [
      (AttendanceTab.today, 'আজ'),
      (AttendanceTab.month, 'এই মাস'),
      (AttendanceTab.corrections, 'সংশোধন'),
    ]) {
      expect(
        within(AttendanceScreen.tabKey(tab), findText(label)),
        findsOneWidget,
      );
    }

    // Today: the shift's Bangla name, times and hours in Bangla digits.
    for (final text in [
      'সাধারণ শিফট',
      '৮:০০ AM – ৫:০০ PM',
      'চলমান',
      'প্রথম প্রবেশ',
      '৭:৫৫ AM',
      '০:০০',
    ]) {
      expect(
        within(TodayTab.dayCardKey, findText(text)),
        findsOneWidget,
        reason: text,
      );
    }
    expect(
      within(TodayTab.punchKey(devicePunchId), findText('ডিভাইস · Main gate')),
      findsOneWidget,
    );
    expect(punchLabel(tester), 'পাঞ্চ আউট');
    await punch(tester);
    expect(
      within(
        TodayTab.punchErrorKey,
        findText(
          'আপনি এক মিনিটেরও কম সময় আগে পাঞ্চ করেছেন। আবার পাঞ্চ করার আগে '
          'একটু অপেক্ষা করুন।',
        ),
      ),
      findsOneWidget,
    );

    // This month: totals and badges in Bangla digits.
    await openTab(tester, AttendanceTab.month);
    expect(findText('অক্টোবর ২০২৬'), findsOneWidget);
    Finder total(String text) => within(MonthTab.totalsKey, findText(text));
    expect(total('উপস্থিত'), findsOneWidget);
    expect(total('১৪'), findsOneWidget);
    expect(total('১২০:৫০'), findsOneWidget);
    Finder onDay(int n, String text) =>
        within(MonthTab.dayKey(DateTime.utc(2026, 10, n)), findText(text));
    expect(onDay(22, 'দেরি ০:২৫'), findsOneWidget);
    expect(onDay(23, 'সাপ্তাহিক ছুটি'), findsOneWidget);
    expect(onDay(20, 'পাঞ্চ অসম্পূর্ণ'), findsOneWidget);
    expect(onDay(20, 'সংশোধন: অপেক্ষমাণ'), findsOneWidget);
    expect(onDay(19, 'ওটি ২:০০'), findsOneWidget);

    // Corrections: kinds, statuses and times.
    await openTab(tester, AttendanceTab.corrections);
    Finder inCorrection(String id, String text) =>
        within(CorrectionsTab.correctionKey(id), findText(text));
    expect(inCorrection(pendingCorrectionId, 'বাদ পড়া পাঞ্চ'), findsOneWidget);
    expect(inCorrection(pendingCorrectionId, 'অপেক্ষমাণ'), findsOneWidget);
    expect(
      inCorrection(pendingCorrectionId, 'প্রস্থান ৫:৪০ PM'),
      findsOneWidget,
    );
    expect(
      inCorrection(approvedCorrectionId, 'অফিসের কাজে বাইরে'),
      findsOneWidget,
    );

    for (final english in ['In progress', 'Present', 'Missed punch', 'Today']) {
      expect(findText(english), findsNothing, reason: english);
    }

    // The form fits a phone in Bangla, and its errors are Bangla too.
    await tester.tap(find.byKey(CorrectionsTab.requestKey));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(AppBar, 'সংশোধনের আবেদন'), findsOneWidget);
    for (final label in ['বাদ পড়া পাঞ্চ', 'অফিসের কাজে বাইরে']) {
      expect(
        within(CorrectionFormScreen.kindKey, findText(label)),
        findsOneWidget,
      );
    }
    await tester.tap(find.byKey(CorrectionFormScreen.submitKey));
    await tester.pumpAndSettle();
    expect(findText('কোন দিনটি সংশোধন করবেন, বেছে নিন'), findsOneWidget);
    expect(
      findText('প্রবেশের সময়, প্রস্থানের সময় অথবা দুটোই দিন।'),
      findsOneWidget,
    );
    await tester.tap(find.byKey(CorrectionFormScreen.inTimeKey));
    await tester.pumpAndSettle();
    await tapOk(tester, TimePickerDialog);
    expect(
      within(CorrectionFormScreen.inTimeKey, findText('৮:০০ AM')),
      findsOneWidget,
    );
  });
}
