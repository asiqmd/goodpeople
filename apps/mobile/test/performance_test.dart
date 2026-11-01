import 'dart:convert';
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
import 'package:good_people/notifications/notification_routes.dart';
import 'package:good_people/performance/goal_screen.dart';
import 'package:good_people/performance/goals_screen.dart';
import 'package:good_people/performance/peer_request_screen.dart';
import 'package:good_people/performance/peers_screen.dart';
import 'package:good_people/performance/performance_screen.dart';
import 'package:good_people/performance/performance_widgets.dart';
import 'package:good_people/performance/review_screen.dart';
import 'package:good_people/performance/team_goals_screen.dart';
import 'package:good_people/settings/locale_controller.dart';

import 'support/fake_api.dart';

/// Like [find.text], but reads a no-break space in the widget's text as a
/// plain one, so times are written `10:30 AM` here.
Finder findText(String value) => find.byWidgetPredicate(
  (widget) => widget is Text && widget.data?.replaceAll('\u00a0', ' ') == value,
  description: 'text "$value"',
);

Finder within(Key key, Finder finder) =>
    find.descendant(of: find.byKey(key), matching: finder);

ApiException _refusal(int status, String code) => ApiException(
  kind: ApiErrorKind.server,
  statusCode: status,
  code: code,
  message: 'Refused: $code',
);

/// Answers every request with [status] and [body] and records it.
class _StubAdapter implements HttpClientAdapter {
  _StubAdapter(this.status, this.body);

  final int status;
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
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

(DioGoodPeopleApi, _StubAdapter) _client(Object? body, {int status = 200}) {
  final adapter = _StubAdapter(status, body);
  final dio = Dio(
    BaseOptions(
      baseUrl: 'http://localhost:4000',
      contentType: Headers.jsonContentType,
      responseType: ResponseType.json,
    ),
  )..httpClientAdapter = adapter;
  return (DioGoodPeopleApi(dio), adapter);
}

void main() {
  late FakeGoodPeopleApi api;

  setUp(() {
    api = FakeGoodPeopleApi()
      ..accessView = TenantAccessView.fromJson(
        accessJson(
          features: const ['core_hr', 'leave', 'attendance', 'performance'],
        ),
      );
  });

  /// Signs in through the fake API and shows the app in [locale] on a
  /// phone-wide screen, so overflow fails the test.
  Future<ProviderContainer> pumpApp(
    WidgetTester tester, {
    Locale locale = const Locale('en'),
  }) async {
    tester.view.physicalSize = const Size(360, 2400);
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
    return container;
  }

  Future<void> push(WidgetTester tester, Route<void> route) async {
    Navigator.of(tester.element(find.byType(HomeScreen, skipOffstage: false)))
        .push(route);
    await tester.pumpAndSettle();
  }

  Future<void> tap(WidgetTester tester, Finder finder) async {
    await tester.ensureVisible(finder);
    await tester.pumpAndSettle();
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  Future<void> enter(WidgetTester tester, Key key, String text) async {
    await tester.ensureVisible(find.byKey(key));
    await tester.enterText(find.byKey(key), text);
    await tester.pump();
  }

  /// Goes back one screen. Providers of screens out of sight are paused,
  /// so they reload only once shown again.
  Future<void> back(WidgetTester tester) async {
    await tester.pageBack();
    await tester.pumpAndSettle();
  }

  /// Scrolls the screen's list until [finder] is built and in view.
  Future<void> scrollTo(WidgetTester tester, Finder finder) =>
      tester.scrollUntilVisible(
        finder,
        300,
        scrollable: find.byType(Scrollable).first,
      );

  /// Lets a snack bar go, so the next one shows.
  Future<void> dismissSnackBar(WidgetTester tester) async {
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
  }

  Future<void> openPerformance(
    WidgetTester tester, {
    Locale locale = const Locale('en'),
  }) async {
    await pumpApp(tester, locale: locale);
    await tap(tester, find.byKey(HomeScreen.performanceKey));
  }

  group('the API client', () {
    test('reads what waits, a goal, a review and the peer inbox', () async {
      final (meApi, meAdapter) = _client(performanceMeJson());
      final me = await meApi.fetchPerformanceMe('access-1');
      expect(meAdapter.requests.single.uri.path, '/tenant/performance/me');
      expect(
        meAdapter.requests.single.headers['Authorization'],
        'Bearer access-1',
      );
      expect(me.tasks, 6);
      expect(me.items.first.kind, PerformanceTaskKind.selfReview);
      expect(me.items.first.dueOn, DateTime.utc(2026, 11, 15));
      expect(me.items[1].person!.fullNameBn, 'শিরিন আক্তার');
      expect(me.goals.progress, 55);
      expect(me.reviews.last.finalRating, 4);

      final (goalApi, goalAdapter) = _client(
        goalDetailJson(recordsKpiGoalJson()),
      );
      final goal = await goalApi.fetchGoal('access-1', recordsKpiGoalId);
      expect(
        goalAdapter.requests.single.uri.path,
        '/tenant/performance/goals/$recordsKpiGoalId',
      );
      expect(goal.fromRecords, isTrue);
      expect((goal.reading! as AttendanceReading).presentDays, 235.5);
      expect(goal.can.checkin, isTrue);

      final (reviewApi, reviewAdapter) = _client(releasedReviewJson());
      final review = await reviewApi.fetchReview('access-1', releasedReviewId);
      expect(
        reviewAdapter.requests.single.uri.path,
        '/tenant/performance/reviews/$releasedReviewId',
      );
      expect(review.status.isReleased, isTrue);
      expect(review.cycle.competencies.map((c) => c.nameIn('bn')), [
        'কাজের মান',
        'দলগত কাজ ও যোগাযোগ',
      ]);
      expect(review.managerReview!.answers!.goals[objectiveGoalId]!.rating, 4);
      expect(review.peerSummary!.answers[PeerQuestion.improvements], [
        'Could share the plan earlier.',
      ]);

      final (peersApi, peersAdapter) = _client(peerInboxJson());
      final inbox = await peersApi.fetchPeerInbox('access-1');
      expect(
        peersAdapter.requests.single.uri.path,
        '/tenant/performance/peers',
      );
      expect(inbox.toAnswer.map((r) => r.status), [
        PeerStatus.approved,
        PeerStatus.submitted,
      ]);
      expect(
        inbox.toAnswer.last.answers[PeerQuestion.strengths],
        'Plans the week well.',
      );
      expect(inbox.toApprove.single.peer.fullName, 'Shirin Akter');
    });

    test('sends check-ins, agreements, the self review, the '
        'acknowledgement, peer answers and decisions', () async {
      Future<RequestOptions> sent(
        Object? body,
        Future<void> Function(DioGoodPeopleApi api) call,
      ) async {
        final (client, adapter) = _client(body);
        await call(client);
        return adapter.requests.single;
      }

      final checkin = await sent(
        goalDetailJson(manualKpiGoalJson()),
        (c) => c.checkinGoal(
          'access-1',
          manualKpiGoalId,
          const GoalCheckinDraft(value: '93.5', note: 'Two re-runs.'),
        ),
      );
      expect(checkin.method, 'POST');
      expect(
        checkin.uri.path,
        '/tenant/performance/goals/$manualKpiGoalId/checkins',
      );
      expect(checkin.data, {'value': '93.5', 'note': 'Two re-runs.'});

      final submit = await sent({
        'goals': 1,
        'notified': 1,
      }, (c) => c.submitGoals('access-1', annualCycleId));
      expect(submit.uri.path, '/tenant/performance/goals/submit');
      expect(submit.data, {'cycleId': annualCycleId});

      final agree = await sent(
        goalDetailJson(nasimaGoalsJson().first),
        (c) => c.agreeGoal('access-1', nasimaGoalAId),
      );
      expect(agree.method, 'POST');
      expect(agree.uri.path, '/tenant/performance/goals/$nasimaGoalAId/agree');

      final agreeAll = await sent(
        nasimaGoalsJson(),
        (c) => c.agreeAllGoals(
          'access-1',
          employeeId: nasimaRef['id']!,
          cycleId: null,
        ),
      );
      expect(agreeAll.uri.path, '/tenant/performance/goals/agree');
      expect(agreeAll.data, {'employeeId': nasimaRef['id'], 'cycleId': null});

      final self = await sent(
        selfReviewJson(),
        (c) => c.saveSelfReview(
          'access-1',
          selfReviewId,
          const SelfReviewDraft(
            answers: ReviewAnswers(
              goals: {
                objectiveGoalId: ReviewAnswer(rating: 4, comment: 'On plan'),
              },
              competencies: {'quality': ReviewAnswer(rating: 3)},
            ),
            submit: true,
          ),
        ),
      );
      expect(self.method, 'PUT');
      expect(self.uri.path, '/tenant/performance/reviews/$selfReviewId/self');
      expect(self.data, {
        'answers': {
          'goals': {
            objectiveGoalId: {'rating': 4, 'comment': 'On plan'},
          },
          'competencies': {
            'quality': {'rating': 3},
          },
        },
        'submit': true,
      });

      final acknowledge = await sent(
        releasedReviewJson(),
        (c) => c.acknowledgeReview(
          'access-1',
          releasedReviewId,
          const AcknowledgementDraft(agrees: false),
        ),
      );
      expect(
        acknowledge.uri.path,
        '/tenant/performance/reviews/$releasedReviewId/acknowledge',
      );
      expect(acknowledge.data, {'agrees': false});

      final answer = await sent(
        answeredPeerRequestJson(),
        (c) => c.answerPeerRequest(
          'access-1',
          openPeerRequestId,
          const PeerAnswerDraft(
            strengths: 'Calm',
            improvements: 'Plan earlier',
            rating: 5,
          ),
        ),
      );
      expect(answer.method, 'PUT');
      expect(answer.uri.path, '/tenant/performance/peers/$openPeerRequestId');
      expect(answer.data, {
        'answers': {'strengths': 'Calm', 'improvements': 'Plan earlier'},
        'rating': 5,
      });

      final decision = await sent(
        selfReviewJson(),
        (c) => c.decidePeer('access-1', peerApprovalId, approve: false),
      );
      expect(
        decision.uri.path,
        '/tenant/performance/peers/$peerApprovalId/decision',
      );
      expect(decision.data, {'approve': false});
    });
  });

  group('home', () {
    testWidgets('Performance shows how many tasks wait and opens the '
        'Performance screen', (tester) async {
      await pumpApp(tester);

      expect(
        within(HomeScreen.performanceKey, findText('Performance')),
        findsOneWidget,
      );
      expect(
        within(HomeScreen.performanceBadgeKey, findText('6')),
        findsOneWidget,
      );
      expect(
        find.bySemanticsLabel(RegExp('6 tasks wait for you')),
        findsOneWidget,
      );

      await tap(tester, find.byKey(HomeScreen.performanceKey));
      expect(find.byType(PerformanceScreen), findsOneWidget);
    });

    testWidgets('is there without a badge when nothing waits, or the API '
        'refuses', (tester) async {
      api.performanceMe = performanceMeJson(items: []);
      await pumpApp(tester);
      expect(find.byKey(HomeScreen.performanceKey), findsOneWidget);
      expect(find.byKey(HomeScreen.performanceBadgeKey), findsNothing);
    });

    testWidgets('a 403 hides only the badge', (tester) async {
      api.performanceMe = _refusal(403, 'feature_not_in_plan');
      await pumpApp(tester);
      expect(api.performanceMeCalls, 1);
      expect(find.byKey(HomeScreen.performanceKey), findsOneWidget);
      expect(find.byKey(HomeScreen.performanceBadgeKey), findsNothing);
      expect(find.byKey(HomeScreen.attendanceKey), findsOneWidget);
    });

    testWidgets('is hidden, without asking, when the plan has no '
        'performance', (tester) async {
      api.accessView = TenantAccessView.fromJson(accessJson());
      await pumpApp(tester);
      expect(api.performanceMeCalls, 0);
      expect(find.byKey(HomeScreen.performanceKey), findsNothing);
    });
  });

  group('the Performance screen', () {
    testWidgets('lists the tasks, the goals and the reviews; tasks done on '
        'the web say so and open nothing', (tester) async {
      await openPerformance(tester);

      final self = PerformanceScreen.taskKey(
        PerformanceTask.fromJson(performanceTasksJson()[0]),
      );
      expect(
        within(self, findText('Your self review · Annual review 2026')),
        findsOneWidget,
      );
      expect(within(self, findText('By Nov 15, 2026')), findsOneWidget);
      expect(within(self, find.byIcon(Icons.chevron_right)), findsOneWidget);

      for (final (index, text) in [
        (1, 'Feedback on Shirin Akter · Annual review 2026'),
        (3, 'Read and acknowledge your review · Mid-year review 2026'),
        (4, 'Agree 2 goals of Nasima Begum'),
      ]) {
        final key = PerformanceScreen.taskKey(
          PerformanceTask.fromJson(performanceTasksJson()[index]),
        );
        expect(within(key, findText(text)), findsOneWidget, reason: text);
        expect(
          within(key, findText('Done in the Good People web app')),
          findsNothing,
          reason: text,
        );
      }
      for (final (index, text) in [
        (2, 'Review Nasima Begum · Annual review 2026'),
        (5, 'Probation review of Nasima Begum'),
      ]) {
        final key = PerformanceScreen.taskKey(
          PerformanceTask.fromJson(performanceTasksJson()[index]),
        );
        expect(within(key, findText(text)), findsOneWidget, reason: text);
        expect(
          within(key, findText('Done in the Good People web app')),
          findsOneWidget,
          reason: text,
        );
        expect(within(key, find.byIcon(Icons.chevron_right)), findsNothing);
        await tap(tester, find.byKey(key));
        expect(find.byType(PerformanceScreen), findsOneWidget);
        expect(find.byType(ReviewScreen), findsNothing);
      }

      expect(
        within(
          PerformanceScreen.goalsKey,
          findText('4 goals: 3 agreed, 1 still to agree, 0 completed.'),
        ),
        findsOneWidget,
      );
      expect(
        within(PerformanceScreen.goalsKey, findText('55%')),
        findsOneWidget,
      );
      expect(find.byKey(PerformanceScreen.teamGoalsKey), findsOneWidget);

      final released = PerformanceScreen.reviewKey(releasedReviewId);
      for (final text in [
        'Mid-year review 2026',
        'Jan 1 – Jun 30, 2026',
        '4 · Above expectations',
        'Released',
      ]) {
        expect(within(released, findText(text)), findsOneWidget, reason: text);
      }
      expect(
        within(
          PerformanceScreen.reviewKey(selfReviewId),
          findText('Jan 1 – Dec 31, 2026'),
        ),
        findsOneWidget,
      );
      expect(
        findText(
          "Writing your team's reviews, calibration, review cycles, "
          'improvement plans and probation reviews are done in the Good '
          'People web app.',
        ),
        findsOneWidget,
      );

      await tap(tester, find.byKey(self));
      expect(find.byType(ReviewScreen), findsOneWidget);
      expect(api.reviewDetailCalls, [selfReviewId]);
    });

    testWidgets('says when nothing waits, and offers no team goals to '
        'someone without a team', (tester) async {
      api.performanceMe = performanceMeJson(items: [], manager: false);
      await openPerformance(tester);
      expect(findText('Nothing waits for you.'), findsOneWidget);
      expect(find.byKey(PerformanceScreen.teamGoalsKey), findsNothing);
      expect(find.byKey(PerformanceScreen.peersKey), findsOneWidget);
    });

    testWidgets('reads in Bangla, with Bangla digits and rating words', (
      tester,
    ) async {
      await openPerformance(tester, locale: const Locale('bn'));

      for (final text in [
        'কর্মমূল্যায়ন',
        'আপনার জন্য অপেক্ষা করছে',
        'আপনার আত্মমূল্যায়ন · Annual review 2026',
        'শিরিন আক্তার সম্পর্কে মতামত · Annual review 2026',
        'নাসিমা বেগম-এর ২টি লক্ষ্যে সম্মতি দিন',
        'আমার লক্ষ্য',
        '৪টি লক্ষ্য: ৩টি সম্মত, ১টি সম্মতির অপেক্ষায়, ০টি সম্পন্ন।',
        '৫৫%',
        'সম্মতির অপেক্ষায় লক্ষ্য',
        'সহকর্মীর মতামত',
        'আমার মূল্যায়ন',
        '৪ · প্রত্যাশার চেয়ে ভালো',
        'প্রকাশিত',
      ]) {
        expect(findText(text), findsOneWidget, reason: text);
      }
      expect(findText('গুড পিপলের ওয়েব অ্যাপে করতে হয়'), findsNWidgets(2));
      expect(
        within(
          PerformanceScreen.taskKey(
            PerformanceTask.fromJson(performanceTasksJson()[0]),
          ),
          find.textContaining('২০২৬-এর মধ্যে'),
        ),
        findsOneWidget,
      );
    });
  });

  group('goals', () {
    Future<void> openMyGoals(WidgetTester tester) async {
      await openPerformance(tester);
      await tap(tester, find.byKey(PerformanceScreen.goalsKey));
    }

    testWidgets('lists the goals of a cycle with their weights; drafts go '
        'to the manager', (tester) async {
      await openMyGoals(tester);

      expect(
        findText('Your goals are agreed with Kamal Hossain.'),
        findsOneWidget,
      );
      expect(findText('Annual review 2026'), findsOneWidget);
      expect(
        findText('Weights: 100% of 100% · agreed 90%, drafts 10%'),
        findsOneWidget,
      );
      final objective = MyGoalsScreen.goalKey(objectiveGoalId);
      for (final text in [
        'Train two new operators on line 3',
        'Objective · weight 40% · due Dec 31, 2026',
        '1 of 3 key results done',
        '33%',
        'Agreed',
      ]) {
        expect(within(objective, findText(text)), findsOneWidget, reason: text);
      }
      expect(
        within(
          MyGoalsScreen.goalKey(manualKpiGoalId),
          findText('92 % against a target of 95 % · higher is better'),
        ),
        findsOneWidget,
      );
      expect(
        within(MyGoalsScreen.goalKey(draftGoalId), findText('Draft')),
        findsOneWidget,
      );

      await tap(tester, find.byKey(MyGoalsScreen.submitKey(annualCycleId)));
      expect(api.goalSubmissions, [annualCycleId]);
      expect(
        findText('1 goal sent to your manager for agreement.'),
        findsOneWidget,
      );
      await dismissSnackBar(tester);

      api.goalSubmitResult = {'goals': 1, 'notified': 0};
      await tap(tester, find.byKey(MyGoalsScreen.submitKey(annualCycleId)));
      expect(
        findText('These goals were already sent; your manager has them.'),
        findsOneWidget,
      );
    });

    testWidgets('a KPI typed by hand takes its value and a note at a '
        'check-in', (tester) async {
      await openMyGoals(tester);
      final meCalls = api.performanceMeCalls;
      await tap(tester, find.byKey(MyGoalsScreen.goalKey(manualKpiGoalId)));
      expect(find.byType(GoalScreen), findsOneWidget);
      expect(findText('First-pass quality on line 3'), findsOneWidget);
      expect(findText('KPI · Annual review 2026 · weight 30%'), findsOneWidget);
      expect(findText('Typed in check-ins'), findsOneWidget);
      expect(findText('No check-ins yet.'), findsOneWidget);
      expect(find.byKey(CheckinForm.progressKey), findsNothing);

      // Neither a value nor a note: nothing is sent.
      await tap(tester, find.byKey(CheckinForm.submitKey));
      expect(findText('Give the progress, a value or a note'), findsOneWidget);
      expect(api.checkins, isEmpty);

      await enter(tester, CheckinForm.valueKey, 'x');
      await tap(tester, find.byKey(CheckinForm.submitKey));
      expect(
        findText('Give a number, with at most two decimals'),
        findsOneWidget,
      );
      expect(api.checkins, isEmpty);

      await enter(tester, CheckinForm.valueKey, '93.5');
      await enter(tester, CheckinForm.noteKey, '  Two re-runs this week.  ');
      await tap(tester, find.byKey(CheckinForm.submitKey));

      expect(api.checkins.single.goalId, manualKpiGoalId);
      expect(api.checkins.single.body, {
        'value': '93.5',
        'note': 'Two re-runs this week.',
      });
      expect(findText('Check-in added.'), findsOneWidget);
      final checkins = GoalScreen.checkinsKey;
      for (final text in [
        'Nov 1, 2026 · 10:30 AM · Rahima Akter',
        '98% · value 93.5 %',
        'Two re-runs this week.',
      ]) {
        expect(within(checkins, findText(text)), findsOneWidget, reason: text);
      }
      expect(
        findText('93.5 % against a target of 95 % · higher is better'),
        findsOneWidget,
      );
      // A new, empty form.
      expect(
        tester
            .widget<EditableText>(
              find.descendant(
                of: find.byKey(CheckinForm.valueKey),
                matching: find.byType(EditableText),
              ),
            )
            .controller
            .text,
        isEmpty,
      );
      // Back on the list and the Performance screen, the progress moved.
      await back(tester);
      expect(api.myGoalsCalls, 2);
      await back(tester);
      expect(api.performanceMeCalls, greaterThan(meCalls));
    });

    testWidgets('a KPI from the records shows its reading and takes a note '
        'only', (tester) async {
      await openMyGoals(tester);
      await tap(tester, find.byKey(MyGoalsScreen.goalKey(recordsKpiGoalId)));

      expect(
        findText(
          'From attendance: present on 235.5 of 250 working days, '
          'Jan 1, 2026 to Oct 31, 2026.',
        ),
        findsOneWidget,
      );
      expect(findText('Attendance rate, from attendance'), findsOneWidget);
      expect(
        findText(
          'The value comes from the records; add a note on how it is going.',
        ),
        findsOneWidget,
      );
      expect(find.byKey(CheckinForm.valueKey), findsNothing);

      await tap(tester, find.byKey(CheckinForm.submitKey));
      expect(findText('Write a note on how it is going'), findsOneWidget);
      expect(api.checkins, isEmpty);

      await enter(tester, CheckinForm.noteKey, 'Two days off sick in May.');
      await tap(tester, find.byKey(CheckinForm.submitKey));
      expect(api.checkins.single.body, {'note': 'Two days off sick in May.'});
    });

    testWidgets('an objective ticks its key results', (tester) async {
      await openMyGoals(tester);
      await tap(tester, find.byKey(MyGoalsScreen.goalKey(objectiveGoalId)));
      expect(findText('Write the training plan (done)'), findsOneWidget);
      expect(
        findText('Train the first operator (not done yet)'),
        findsOneWidget,
      );

      await tap(tester, find.byKey(CheckinForm.keyResultKey(1)));
      await tap(tester, find.byKey(CheckinForm.submitKey));
      expect(api.checkins.single.body, {
        'done': [0, 1],
      });
      expect(findText('Train the first operator (done)'), findsOneWidget);
      expect(within(GoalScreen.checkinsKey, findText('67%')), findsOneWidget);
    });

    testWidgets('a check-in on a closed goal is refused and the goal '
        'reloads', (tester) async {
      await openMyGoals(tester);
      await tap(tester, find.byKey(MyGoalsScreen.goalKey(objectiveGoalId)));
      api.goalError = _refusal(409, 'goal_closed');
      await tap(tester, find.byKey(CheckinForm.submitKey));
      expect(
        findText('This goal is closed and no longer changes.'),
        findsOneWidget,
      );
    });
  });

  group('goals to agree', () {
    Future<void> openTeamGoals(WidgetTester tester) async {
      await openPerformance(tester);
      await tap(tester, find.byKey(PerformanceScreen.teamGoalsKey));
    }

    testWidgets("lists the team's drafts with their weights; agreeing all "
        'clears them', (tester) async {
      await openTeamGoals(tester);
      final meCalls = api.performanceMeCalls;

      expect(findText('2 goals wait for your agreement.'), findsOneWidget);
      final nasima = TeamGoalsScreen.personKey(nasimaRef['id']!);
      for (final text in [
        'Nasima Begum · MG-0012',
        'Annual review 2026',
        'Weights: 100% of 100% · agreed 0%, drafts 100%',
        'Hit 1,200 pieces a day',
        'Learn the overlock machine',
        'Agree all 2 (100%)',
      ]) {
        expect(within(nasima, findText(text)), findsOneWidget, reason: text);
      }
      // Nothing of Shirin's waits.
      expect(
        find.byKey(TeamGoalsScreen.personKey(shirinRef['id']!)),
        findsNothing,
      );

      await tap(
        tester,
        find.byKey(
          TeamGoalsScreen.agreeAllKey(nasimaRef['id']!, annualCycleId),
        ),
      );
      expect(api.goalsAgreedAll.single, (
        employeeId: nasimaRef['id']!,
        cycleId: annualCycleId,
      ));
      expect(findText('Agreed.'), findsOneWidget);
      expect(findText('Nothing waits for your agreement.'), findsOneWidget);
      // The Performance screen's tasks reload.
      await back(tester);
      expect(api.performanceMeCalls, greaterThan(meCalls));
    });

    testWidgets('agrees one goal; a refusal over the weights says why', (
      tester,
    ) async {
      await openTeamGoals(tester);

      await tap(tester, find.byKey(TeamGoalsScreen.agreeKey(nasimaGoalAId)));
      expect(api.goalsAgreed, [nasimaGoalAId]);
      expect(find.byKey(TeamGoalsScreen.agreeKey(nasimaGoalAId)), findsNothing);
      expect(
        findText('Weights: 100% of 100% · agreed 60%, drafts 40%'),
        findsOneWidget,
      );
      // One draft left: no Agree all.
      expect(
        find.byKey(
          TeamGoalsScreen.agreeAllKey(nasimaRef['id']!, annualCycleId),
        ),
        findsNothing,
      );
      await dismissSnackBar(tester);

      api.goalError = _refusal(409, 'goal_weights_total');
      await tap(tester, find.byKey(TeamGoalsScreen.agreeKey(nasimaGoalBId)));
      expect(
        findText(
          "A person's agreed goals for a cycle must weigh 100% together.",
        ),
        findsOneWidget,
      );
    });

    testWidgets('a draft opens with Agree', (tester) async {
      await openTeamGoals(tester);
      await tap(tester, findText('Learn the overlock machine'));
      expect(find.byType(GoalScreen), findsOneWidget);
      await tap(tester, find.byKey(GoalScreen.agreeKey));
      expect(api.goalsAgreed, [nasimaGoalBId]);
      expect(find.byKey(GoalScreen.agreeKey), findsNothing);
      expect(findText('Agreed'), findsOneWidget);
    });
  });

  group('the self review', () {
    Future<void> openSelfReview(
      WidgetTester tester, {
      Locale locale = const Locale('en'),
    }) async {
      await pumpApp(tester, locale: locale);
      await push(tester, ReviewScreen.route(selfReviewId));
    }

    Future<void> rate(WidgetTester tester, String id, int rating) =>
        tap(tester, find.byKey(RatingChoice.ratingKey(id, rating)));

    testWidgets('is saved as a draft, then submitted after a confirmation, '
        'and is then read only', (tester) async {
      await openSelfReview(tester);
      final meCalls = api.performanceMeCalls;

      for (final text in [
        'My review: Annual review 2026',
        'Jan 1 – Dec 31, 2026',
        'Manager: Kamal Hossain',
        'By Nov 15, 2026',
        'Quality of work',
        'Teamwork and communication',
      ]) {
        expect(findText(text), findsOneWidget, reason: text);
      }
      // Each rating with its words.
      expect(
        within(
          RatingChoice.ratingKey(objectiveGoalId, 3),
          findText('3 · Meets expectations'),
        ),
        findsOneWidget,
      );

      // Submitting needs every rating.
      await tap(tester, find.byKey(SelfReviewForm.submitKey));
      expect(
        findText('Rate every goal and competency before submitting.'),
        findsOneWidget,
      );
      for (final id in [
        objectiveGoalId,
        manualKpiGoalId,
        'quality',
        'teamwork',
      ]) {
        expect(find.byKey(RatingChoice.errorKey(id)), findsOneWidget);
      }
      expect(api.selfReviews, isEmpty);
      await dismissSnackBar(tester);

      // A draft keeps no comment without its rating.
      await enter(
        tester,
        SelfReviewForm.commentKey('teamwork'),
        'I cover line 4 too.',
      );
      await rate(tester, objectiveGoalId, 4);
      await enter(
        tester,
        SelfReviewForm.commentKey(objectiveGoalId),
        '  The plan is written.  ',
      );
      await tap(tester, find.byKey(SelfReviewForm.saveKey));
      expect(
        findText(
          'A comment is kept with its rating: choose one, or clear the comment.',
        ),
        findsOneWidget,
      );
      expect(find.byKey(RatingChoice.errorKey('teamwork')), findsOneWidget);
      expect(find.byKey(RatingChoice.errorKey('quality')), findsNothing);
      expect(api.selfReviews, isEmpty);
      await dismissSnackBar(tester);

      await rate(tester, 'teamwork', 5);
      await tap(tester, find.byKey(SelfReviewForm.saveKey));
      expect(api.selfReviews.single.reviewId, selfReviewId);
      expect(api.selfReviews.single.body, {
        'answers': {
          'goals': {
            objectiveGoalId: {'rating': 4, 'comment': 'The plan is written.'},
          },
          'competencies': {
            'teamwork': {'rating': 5, 'comment': 'I cover line 4 too.'},
          },
        },
        'submit': false,
      });
      expect(findText('Saved.'), findsOneWidget);
      await dismissSnackBar(tester);

      await rate(tester, manualKpiGoalId, 3);
      await rate(tester, 'quality', 4);
      await enter(tester, SelfReviewForm.overallKey, 'A good year.');
      await tap(tester, find.byKey(SelfReviewForm.submitKey));
      expect(findText('Submit your self review?'), findsOneWidget);
      expect(api.selfReviews, hasLength(1));
      await tap(tester, find.byKey(SelfReviewForm.confirmKey));

      expect(api.selfReviews, hasLength(2));
      expect(api.selfReviews.last.body, {
        'answers': {
          'goals': {
            objectiveGoalId: {'rating': 4, 'comment': 'The plan is written.'},
            manualKpiGoalId: {'rating': 3},
          },
          'competencies': {
            'quality': {'rating': 4},
            'teamwork': {'rating': 5, 'comment': 'I cover line 4 too.'},
          },
          'overall': 'A good year.',
        },
        'submit': true,
      });
      expect(
        findText('Submitted. Your manager reviews it next.'),
        findsOneWidget,
      );
      expect(find.byKey(SelfReviewForm.submitKey), findsNothing);
      final self = ReviewScreen.selfKey;
      for (final text in [
        'Submitted. Your manager reviews it next; you read the outcome once '
            'HR releases it.',
        '4 · Above expectations',
        'The plan is written.',
        '3 · Meets expectations',
        '5 · Well above expectations',
        'A good year.',
      ]) {
        expect(within(self, findText(text)), findsWidgets, reason: text);
      }
      const namePeers =
          'You can name colleagues to give feedback in the Good People web '
          'app.';
      await scrollTo(tester, findText(namePeers));
      expect(findText(namePeers), findsOneWidget);
      // One task fewer on the home screen's badge.
      await back(tester);
      expect(api.performanceMeCalls, greaterThan(meCalls));
    });

    testWidgets('cancelling the confirmation sends nothing', (tester) async {
      api.reviewDetails[selfReviewId] = selfReviewJson(
        answers: answersJson(
          goals: {objectiveGoalId: 4, manualKpiGoalId: 3},
          competencies: {'quality': 4, 'teamwork': 5},
        ),
      );
      await openSelfReview(tester);
      // The saved draft is filled in.
      expect(
        tester
            .widget<ChoiceChip>(
              find.byKey(RatingChoice.ratingKey(manualKpiGoalId, 3)),
            )
            .selected,
        isTrue,
      );
      await tap(tester, find.byKey(SelfReviewForm.submitKey));
      await tap(tester, find.text('Cancel'));
      expect(api.selfReviews, isEmpty);
      expect(find.byKey(SelfReviewForm.submitKey), findsOneWidget);
    });

    testWidgets('a closed step is refused and the review reloads', (
      tester,
    ) async {
      api.reviewDetails[selfReviewId] = selfReviewJson(
        answers: answersJson(goals: {}, competencies: {'quality': 4}),
      );
      await openSelfReview(tester);
      api.reviewError = _refusal(409, 'review_step_closed');
      await tap(tester, find.byKey(SelfReviewForm.saveKey));
      expect(
        findText('This step of the review is no longer open for changes.'),
        findsOneWidget,
      );
      expect(api.reviewDetailCalls, [selfReviewId, selfReviewId]);
    });

    testWidgets("someone else's review is on the web", (tester) async {
      await pumpApp(tester);
      await push(tester, ReviewScreen.route(teamReviewId));
      expect(findText('Nasima Begum · Annual review 2026'), findsOneWidget);
      expect(
        within(
          ReviewScreen.onWebKey,
          findText(
            'You read and write this review in the Good People web app.',
          ),
        ),
        findsOneWidget,
      );
      expect(find.byType(SelfReviewForm), findsNothing);
      // Not the self review she wrote for her manager.
      expect(find.byKey(ReviewScreen.selfKey), findsNothing);
    });

    testWidgets('reads in Bangla, the ratings in words and Bangla digits', (
      tester,
    ) async {
      await openSelfReview(tester, locale: const Locale('bn'));
      for (final text in [
        'আমার মূল্যায়ন: Annual review 2026',
        'ম্যানেজার: কামাল হোসেন',
        'আত্মমূল্যায়ন',
        'দক্ষতা',
        'কাজের মান',
        'দলগত কাজ ও যোগাযোগ',
        'খসড়া সংরক্ষণ',
        'ম্যানেজারের কাছে জমা দিন',
      ]) {
        expect(findText(text), findsWidgets, reason: text);
      }
      expect(
        within(
          RatingChoice.ratingKey('quality', 3),
          findText('৩ · প্রত্যাশা পূরণ করেছে'),
        ),
        findsOneWidget,
      );
      expect(
        within(
          RatingChoice.ratingKey('quality', 1),
          findText('১ · প্রত্যাশার অনেক নিচে'),
        ),
        findsOneWidget,
      );
      await tap(tester, find.byKey(SelfReviewForm.submitKey));
      expect(
        findText('জমা দেওয়ার আগে প্রতিটি লক্ষ্য ও দক্ষতার রেটিং দিন।'),
        findsOneWidget,
      );
      expect(findText('একটি রেটিং বেছে নিন'), findsNWidgets(4));
    });
  });

  group('a released review', () {
    testWidgets('shows the outcome, the comments and peer feedback '
        'together, and is acknowledged once', (tester) async {
      await openPerformance(tester);
      final meCalls = api.performanceMeCalls;
      await tap(
        tester,
        find.byKey(PerformanceScreen.reviewKey(releasedReviewId)),
      );

      final outcome = ReviewScreen.outcomeKey;
      for (final text in [
        'Final rating',
        '4 · Above expectations',
        'Goal score',
        '4',
        'Released on',
        'Oct 20, 2026',
      ]) {
        expect(within(outcome, findText(text)), findsOneWidget, reason: text);
      }
      final manager = ReviewScreen.managerKey;
      for (final text in [
        'Both operators trained ahead of plan.',
        'A strong half year; ready for a second line.',
        '5 · Well above expectations',
      ]) {
        expect(within(manager, findText(text)), findsOneWidget, reason: text);
      }
      final peers = ReviewScreen.peersKey;
      for (final text in [
        'Average peer rating: 4.3',
        'What does this person do well?',
        '• Calm when the line is behind.',
        '• Could share the plan earlier.',
        'Answers are shown together, never who wrote what.',
      ]) {
        expect(within(peers, findText(text)), findsOneWidget, reason: text);
      }
      expect(
        within(ReviewScreen.selfKey, findText('3 · Meets expectations')),
        findsOneWidget,
      );

      await tap(tester, find.byKey(AcknowledgeForm.disagreeKey));
      await enter(
        tester,
        AcknowledgeForm.commentKey,
        ' I trained both operators myself. ',
      );
      await tap(tester, find.byKey(AcknowledgeForm.submitKey));
      expect(findText('Acknowledge your review?'), findsOneWidget);
      await tap(tester, find.byKey(AcknowledgeForm.confirmKey));

      expect(api.acknowledgements.single.reviewId, releasedReviewId);
      expect(api.acknowledgements.single.body, {
        'agrees': false,
        'comment': 'I trained both operators myself.',
      });
      expect(findText('Acknowledged.'), findsOneWidget);
      expect(find.byType(AcknowledgeForm), findsNothing);
      final acknowledgement = ReviewScreen.acknowledgementKey;
      expect(
        within(
          acknowledgement,
          findText('Acknowledged, not agreeing · Nov 1, 2026'),
        ),
        findsOneWidget,
      );
      expect(
        within(acknowledgement, findText('I trained both operators myself.')),
        findsOneWidget,
      );
      // The task is gone from the Performance screen.
      api.performanceMe = performanceMeJson(
        items: performanceTasksJson()
            .where((task) => task['kind'] != 'acknowledge')
            .toList(),
      );
      await back(tester);
      expect(api.performanceMeCalls, greaterThan(meCalls));
      expect(
        findText('Read and acknowledge your review · Mid-year review 2026'),
        findsNothing,
      );
    });

    testWidgets('from too few peers shows no peer feedback', (tester) async {
      api.reviewDetails[releasedReviewId] = {
        ...releasedReviewJson(),
        'peerSummary': {
          'shown': false,
          'answers': {'strengths': <String>[], 'improvements': <String>[]},
          'averageRating': null,
        },
      };
      await pumpApp(tester);
      await push(tester, ReviewScreen.route(releasedReviewId));
      expect(
        within(
          ReviewScreen.peersKey,
          findText(
            'Peer feedback is shown only when at least three peers have '
            'answered.',
          ),
        ),
        findsOneWidget,
      );
      expect(findText('• Calm when the line is behind.'), findsNothing);
    });
  });

  group('peer feedback', () {
    Future<void> openPeers(WidgetTester tester) async {
      await openPerformance(tester);
      await tap(tester, find.byKey(PerformanceScreen.peersKey));
    }

    testWidgets('lists the requests; one is answered after a '
        'confirmation, and is then read only', (tester) async {
      await openPeers(tester);
      final meCalls = api.performanceMeCalls;

      final open = PeerFeedbackScreen.requestKey(openPeerRequestId);
      for (final text in [
        'Feedback on Shirin Akter',
        'Annual review 2026 · By Nov 20, 2026',
        'Waiting for you',
      ]) {
        expect(within(open, findText(text)), findsOneWidget, reason: text);
      }
      final answered = PeerFeedbackScreen.requestKey(answeredPeerRequestId);
      expect(
        within(answered, findText('Feedback on Kamal Hossain')),
        findsOneWidget,
      );
      expect(within(answered, findText('Answered')), findsOneWidget);

      await tap(tester, find.byKey(open));
      expect(find.byType(PeerRequestScreen), findsOneWidget);
      expect(
        within(
          PeerRequestScreen.privacyKey,
          find.textContaining(
            'The person sees your answers only together with those of '
            'other peers',
          ),
        ),
        findsOneWidget,
      );

      await tap(tester, find.byKey(PeerAnswerForm.sendKey));
      expect(findText('Write a few words'), findsNWidgets(2));
      expect(
        find.byKey(RatingChoice.errorKey(PeerAnswerForm.ratingId)),
        findsOneWidget,
      );
      expect(api.peerAnswers, isEmpty);

      await enter(
        tester,
        PeerAnswerForm.questionKey(PeerQuestion.strengths),
        'Calm when the line is behind.',
      );
      await enter(
        tester,
        PeerAnswerForm.questionKey(PeerQuestion.improvements),
        ' Could share the plan earlier. ',
      );
      await tap(
        tester,
        find.byKey(RatingChoice.ratingKey(PeerAnswerForm.ratingId, 4)),
      );
      await tap(tester, find.byKey(PeerAnswerForm.sendKey));
      expect(findText('Send your feedback?'), findsOneWidget);
      await tap(tester, find.byKey(PeerAnswerForm.confirmKey));

      expect(api.peerAnswers.single.peerId, openPeerRequestId);
      expect(api.peerAnswers.single.body, {
        'answers': {
          'strengths': 'Calm when the line is behind.',
          'improvements': 'Could share the plan earlier.',
        },
        'rating': 4,
      });
      expect(
        findText('Thank you. Your feedback has been sent.'),
        findsOneWidget,
      );
      expect(find.byType(PeerAnswerForm), findsNothing);
      for (final text in [
        'Your feedback',
        'Calm when the line is behind.',
        'Could share the plan earlier.',
        '4 · Above expectations',
      ]) {
        expect(
          within(PeerRequestScreen.answerKey, findText(text)),
          findsOneWidget,
          reason: text,
        );
      }

      await back(tester);
      expect(within(open, findText('Answered')), findsOneWidget);
      await back(tester);
      expect(api.performanceMeCalls, greaterThan(meCalls));
    });

    testWidgets('an answer given meanwhile is refused', (tester) async {
      await pumpApp(tester);
      await push(tester, PeerRequestScreen.route(openPeerRequestId));
      api.peerError = _refusal(409, 'peer_answered');
      await enter(
        tester,
        PeerAnswerForm.questionKey(PeerQuestion.strengths),
        'Calm.',
      );
      await enter(
        tester,
        PeerAnswerForm.questionKey(PeerQuestion.improvements),
        'Plan earlier.',
      );
      await tap(
        tester,
        find.byKey(RatingChoice.ratingKey(PeerAnswerForm.ratingId, 5)),
      );
      await tap(tester, find.byKey(PeerAnswerForm.sendKey));
      await tap(tester, find.byKey(PeerAnswerForm.confirmKey));
      expect(findText('You have already given your feedback.'), findsOneWidget);
    });

    testWidgets('a manager approves or declines a peer named for their '
        "team's review", (tester) async {
      await openPeers(tester);
      expect(findText('Peers to approve'), findsOneWidget);
      expect(findText('Shirin Akter for Nasima Begum'), findsOneWidget);

      await tap(
        tester,
        find.byKey(PeerFeedbackScreen.declineKey(peerApprovalId)),
      );
      expect(api.peerDecisions.single, (
        peerId: peerApprovalId,
        approve: false,
      ));
      expect(findText('Declined.'), findsOneWidget);
      expect(findText('Peers to approve'), findsNothing);
    });
  });

  group('notifications', () {
    Widget screenFor(NotificationEvent event, String? link) =>
        (notificationRoute(event, link)! as MaterialPageRoute<void>).builder(
          _FakeContext(),
        );

    test('performance events are known', () {
      expect(
        NotificationEvent.fromWire('performance.task'),
        NotificationEvent.performanceTask,
      );
      expect(
        NotificationEvent.fromWire('performance.released'),
        NotificationEvent.performanceReleased,
      );
    });

    test('a task opens what its link is about', () {
      const task = NotificationEvent.performanceTask;
      expect(
        screenFor(task, '/workspace/performance/reviews/$selfReviewId'),
        isA<ReviewScreen>().having((s) => s.reviewId, 'reviewId', selfReviewId),
      );
      expect(
        screenFor(task, '/workspace/performance/peers/$openPeerRequestId'),
        isA<PeerRequestScreen>().having(
          (s) => s.peerId,
          'peerId',
          openPeerRequestId,
        ),
      );
      expect(
        screenFor(task, '/workspace/performance/peers'),
        isA<PeerFeedbackScreen>(),
      );
      expect(
        screenFor(
          task,
          '/workspace/performance/goals?tab=team&cycle=$annualCycleId',
        ),
        isA<TeamGoalsScreen>(),
      );
      expect(
        screenFor(task, '/workspace/performance/goals'),
        isA<MyGoalsScreen>(),
      );
      // Done on the web: the Performance screen, which says so.
      for (final link in [
        '/workspace/performance',
        '/workspace/performance/team',
        '/workspace/performance/probation/f2000000-0000-4000-8000-000000000001',
        '/workspace/performance/plans/f3000000-0000-4000-8000-000000000001',
        '/workspace/performance/cycles/$annualCycleId?status=manager',
        null,
      ]) {
        expect(screenFor(task, link), isA<PerformanceScreen>(), reason: link);
      }
    });

    test('a released review opens the Performance screen', () {
      expect(
        screenFor(
          NotificationEvent.performanceReleased,
          '/workspace/performance',
        ),
        isA<PerformanceScreen>(),
      );
    });
  });
}

class _FakeContext extends Fake implements BuildContext {}
