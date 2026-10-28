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
import 'package:good_people/approvals/approvals_screen.dart';
import 'package:good_people/approvals/approvals_tab.dart';
import 'package:good_people/auth/auth_controller.dart';
import 'package:good_people/documents/file_opener.dart';
import 'package:good_people/home/home_screen.dart';
import 'package:good_people/interviews/interview_screen.dart';
import 'package:good_people/interviews/interviews_screen.dart';
import 'package:good_people/interviews/link_opener.dart';
import 'package:good_people/notifications/notification_routes.dart';
import 'package:good_people/settings/locale_controller.dart';

import 'support/fake_api.dart';

/// Like [find.text], but reads a no-break space in the widget's text as a
/// plain one, so times are written `10:00 AM` here.
Finder findText(String value) => find.byWidgetPredicate(
  (widget) => widget is Text && widget.data?.replaceAll(' ', ' ') == value,
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

/// Answers every request with [status] and [body] (JSON, or bytes for a
/// file) and records it.
class _StubAdapter implements HttpClientAdapter {
  _StubAdapter(this.status, this.body, {this.headers = const {}});

  final int status;
  final Object? body;
  final Map<String, List<String>> headers;
  final requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests.add(options);
    return switch (body) {
      final List<int> bytes => ResponseBody.fromBytes(
        bytes,
        status,
        headers: headers,
      ),
      _ => ResponseBody.fromString(
        jsonEncode(body),
        status,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
      ),
    };
  }

  @override
  void close({bool force = false}) {}
}

(DioGoodPeopleApi, _StubAdapter) _client(
  Object? body, {
  int status = 200,
  Map<String, List<String>> headers = const {},
}) {
  final adapter = _StubAdapter(status, body, headers: headers);
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
  late FakeFileOpener files;
  late FakeLinkOpener links;

  setUp(() {
    api = FakeGoodPeopleApi()
      ..accessView = TenantAccessView.fromJson(
        accessJson(
          features: const ['core_hr', 'leave', 'attendance', 'recruitment'],
        ),
      );
    files = FakeFileOpener();
    links = FakeLinkOpener();
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
      overrides: [
        goodPeopleApiProvider.overrideWithValue(api),
        fileOpenerProvider.overrideWithValue(files),
        linkOpenerProvider.overrideWithValue(links),
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

  /// Lets a snack bar go, so the next one shows.
  Future<void> dismissSnackBar(WidgetTester tester) async {
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
  }

  group('the API client', () {
    test('reads the count, the interviews and one interview', () async {
      final (meApi, meAdapter) = _client(recruitmentMeJson(interviews: 3));
      final me = await meApi.fetchRecruitmentMe('access-1');
      expect(me.interviews, 3);
      expect(meAdapter.requests.single.uri.path, '/tenant/recruitment/me');
      expect(
        meAdapter.requests.single.headers['Authorization'],
        'Bearer access-1',
      );

      final (listApi, listAdapter) = _client(myInterviewsJson());
      final mine = await listApi.fetchMyInterviews('access-1');
      expect(listAdapter.requests.single.uri.path, '/tenant/interviews');
      expect(mine.upcoming.single.kind, InterviewKind.video);
      expect(mine.upcoming.single.startsAt, DateTime.utc(2026, 10, 29, 4));
      expect(
        mine.upcoming.single.opening.titleIn('bn'),
        'লাইন সুপারভাইজার (সেলাই)',
      );
      expect(mine.past.map((i) => i.status), [
        InterviewStatus.completed,
        InterviewStatus.cancelled,
      ]);

      final (oneApi, oneAdapter) = _client(
        interviewDetailJson(
          mine: scorecardJson(),
          others: [shirinScorecardJson()],
        ),
      );
      final detail = await oneApi.fetchMyInterview(
        'access-1',
        upcomingInterviewId,
      );
      expect(
        oneAdapter.requests.single.uri.path,
        '/tenant/interviews/$upcomingInterviewId',
      );
      expect(detail.criteria, scorecardCriteria);
      expect(detail.mine!.ratings['Communication'], 5);
      expect(detail.mine!.recommendation, Recommendation.yes);
      expect(
        detail.others.single.scorecard.recommendation,
        (Recommendation.strongYes),
      );
      // No panel in the contract yet.
      expect(detail.panel, isNull);
    });

    test('puts the scorecard and downloads the CV', () async {
      final (putApi, putAdapter) = _client(
        interviewDetailJson(mine: scorecardJson()),
      );
      final saved = await putApi.submitScorecard(
        'access-1',
        upcomingInterviewId,
        const ScorecardDraft(
          ratings: {'Skills for the job': 4, 'Experience': 3},
          recommendation: Recommendation.strongNo,
        ),
      );
      final put = putAdapter.requests.single;
      expect(put.method, 'PUT');
      expect(put.uri.path, '/tenant/interviews/$upcomingInterviewId/scorecard');
      expect(put.data, {
        'ratings': {'Skills for the job': 4, 'Experience': 3},
        'recommendation': 'strong_no',
        'feedback': null,
      });
      expect(saved.submitted, isTrue);

      final (cvApi, cvAdapter) = _client(
        utf8.encode('%PDF-1.7'),
        headers: {
          Headers.contentTypeHeader: ['application/pdf'],
          'content-disposition': ['attachment; filename="Farhana CV.pdf"'],
        },
      );
      final cv = await cvApi.downloadApplicationCv(
        'access-1',
        interviewApplicationId,
      );
      expect(
        cvAdapter.requests.single.uri.path,
        '/tenant/recruitment/applications/$interviewApplicationId/cv',
      );
      expect(cv.contentType, 'application/pdf');
      expect(cv.fileName, 'Farhana CV.pdf');
    });

    test('the inbox reads openings and offers', () async {
      final (client, _) = _client([openingApprovalJson(), offerApprovalJson()]);
      final [opening, offer] = await client.fetchApprovals('access-1');

      opening as OpeningApprovalItem;
      expect(opening.kind, ApprovalStepKind.manager);
      expect(opening.opening.headcount, 2);
      expect(opening.opening.reason, OpeningReason.replacement);
      expect(opening.opening.budgetMax, '40000.00');
      // The rejected first round is history.
      expect(opening.opening.currentSteps.map((s) => s.stepNo), [1, 2]);

      offer as OfferApprovalItem;
      expect(offer.kind, ApprovalStepKind.hr);
      expect(offer.offer.monthlyGross, '45000.00');
      expect(offer.offer.budgetMax, '40000.00');
      expect(offer.offer.joiningOn, DateTime.utc(2026, 12));
      expect(offer.offer.designation!.nameBn, 'লাইন সুপারভাইজার');
    });
  });

  group('approvals', () {
    testWidgets('a job opening shows the position, the budget and the hiring '
        'manager, and is approved through its step', (tester) async {
      api.approvals = [openingApprovalJson(), offerApprovalJson()];
      await pumpApp(tester);
      await push(tester, ApprovalsScreen.route());

      final card = ApprovalsTab.itemKey(openingStepId);
      for (final text in [
        'Line supervisor',
        'Your step: Manager',
        'Job opening · My Group Textiles Ltd',
        'Sewing floor 2 · Gazipur Factory · Line Supervisor',
        '2 positions, Permanent',
        'Replaces Abdul Karim',
        'Monthly gross budget',
        '৳30,000 – ৳40,000',
        'Hiring manager',
        'Shirin Akter',
        'Why it is needed',
        'Two supervisors left in September; lines 3 and 4 run without one.',
        'Manager: Kamal Hossain',
        'HR team',
      ]) {
        expect(within(card, findText(text)), findsOneWidget, reason: text);
      }
      // Only this round's steps: the rejected first round is not shown.
      expect(within(card, findText('“The budget is too high”')), findsNothing);

      await tap(tester, find.byKey(ApprovalsTab.approveKey(openingStepId)));
      expect(findText('Approve this job opening?'), findsOneWidget);
      await tap(tester, find.byKey(ApprovalsTab.confirmKey));

      expect(api.decisions, [
        (
          stepId: openingStepId,
          decision: ApprovalDecision.approve,
          comment: null,
        ),
      ]);
      expect(findText('Job opening approved'), findsOneWidget);
      expect(find.byKey(card), findsNothing);
      expect(find.byKey(ApprovalsTab.itemKey(offerStepId)), findsOneWidget);
    });

    testWidgets('an offer above budget shows the pay against the budget and '
        'the joining date, and is rejected with a comment', (tester) async {
      api.approvals = [offerApprovalJson()];
      await pumpApp(tester);
      await push(tester, ApprovalsScreen.route());

      final card = ApprovalsTab.itemKey(offerStepId);
      for (final text in [
        'Farhana Yasmin',
        'Your step: HR',
        'Offer above budget · Line supervisor',
        'My Group Textiles Ltd · Line Supervisor · Permanent',
        'Monthly gross',
        '৳45,000 · budget up to ৳40,000',
        'Joining',
        'December 1, 2026',
        'Drafted by Nasrin Sultana',
      ]) {
        expect(within(card, findText(text)), findsOneWidget, reason: text);
      }
      // No unknown-item note.
      expect(
        findText(
          "This version of the app can't show this request. "
          'Decide it on the web.',
        ),
        findsNothing,
      );

      await tap(tester, find.byKey(ApprovalsTab.rejectKey(offerStepId)));
      expect(findText('Reject this offer?'), findsOneWidget);
      await tester.enterText(
        find.byKey(ApprovalsTab.commentFieldKey),
        'Keep it within the budget',
      );
      await tap(tester, find.byKey(ApprovalsTab.confirmKey));

      expect(api.decisions, [
        (
          stepId: offerStepId,
          decision: ApprovalDecision.reject,
          comment: 'Keep it within the budget',
        ),
      ]);
      expect(findText('Offer rejected'), findsOneWidget);
      expect(find.byKey(card), findsNothing);
    });

    testWidgets('both read in Bangla, with taka in Bangla digits', (
      tester,
    ) async {
      api.approvals = [openingApprovalJson(), offerApprovalJson()];
      await pumpApp(tester, locale: const Locale('bn'));
      await push(tester, ApprovalsScreen.route());

      final opening = ApprovalsTab.itemKey(openingStepId);
      for (final text in [
        'আপনার ধাপ: ম্যানেজার',
        'নিয়োগের পদ · My Group Textiles Ltd',
        '২টি পদ, স্থায়ী',
        'আবদুল করিম-এর স্থলে',
        'মাসিক মোট বেতনের বাজেট',
        '৳৩০,০০০ – ৳৪০,০০০',
        'নিয়োগকারী ব্যবস্থাপক',
        'শিরিন আক্তার',
        'কেন প্রয়োজন',
      ]) {
        expect(within(opening, findText(text)), findsOneWidget, reason: text);
      }

      final offer = ApprovalsTab.itemKey(offerStepId);
      for (final text in [
        'বাজেটের বেশি নিয়োগ প্রস্তাব · Line supervisor',
        'My Group Textiles Ltd · লাইন সুপারভাইজার · স্থায়ী',
        'মাসিক মোট বেতন',
        '৳৪৫,০০০ · বাজেট সর্বোচ্চ ৳৪০,০০০',
        'যোগদান',
        '১ ডিসেম্বর, ২০২৬',
        'খসড়া করেছেন Nasrin Sultana',
      ]) {
        expect(within(offer, findText(text)), findsOneWidget, reason: text);
      }

      await tap(tester, find.byKey(ApprovalsTab.approveKey(offerStepId)));
      expect(findText('এই নিয়োগ প্রস্তাব অনুমোদন করবেন?'), findsOneWidget);
      await tap(tester, find.byKey(ApprovalsTab.confirmKey));
      expect(api.decisions.single.stepId, offerStepId);
      expect(
        findText('নিয়োগ প্রস্তাব অনুমোদিত। এইচআর এখন এটি পাঠাতে পারবে।'),
        findsOneWidget,
      );
    });
  });

  group('home', () {
    testWidgets('Interviews shows how many need the user and opens the list', (
      tester,
    ) async {
      await pumpApp(tester);

      expect(
        within(HomeScreen.interviewsKey, findText('Interviews')),
        findsOneWidget,
      );
      expect(
        within(HomeScreen.interviewsBadgeKey, findText('2')),
        findsOneWidget,
      );
      expect(
        find.bySemanticsLabel(RegExp('2 interviews need you')),
        findsOneWidget,
      );

      await tap(tester, find.byKey(HomeScreen.interviewsKey));
      expect(find.byType(InterviewsScreen), findsOneWidget);
      expect(findText('My interviews'), findsOneWidget);
    });

    testWidgets('is hidden when no interview needs the user', (tester) async {
      api.recruitmentMe = recruitmentMeJson(interviews: 0);
      await pumpApp(tester);
      expect(api.recruitmentMeCalls, 1);
      expect(find.byKey(HomeScreen.interviewsKey), findsNothing);
      expect(find.byKey(HomeScreen.leaveKey), findsOneWidget);
    });

    testWidgets('is hidden, without asking, when the plan has no '
        'recruitment', (tester) async {
      api.accessView = TenantAccessView.fromJson(accessJson());
      await pumpApp(tester);
      expect(api.recruitmentMeCalls, 0);
      expect(find.byKey(HomeScreen.interviewsKey), findsNothing);
    });

    testWidgets('is hidden when the API refuses with a 403', (tester) async {
      api.recruitmentMe = _refusal(403, 'feature_not_in_plan');
      await pumpApp(tester);
      expect(api.recruitmentMeCalls, 1);
      expect(find.byKey(HomeScreen.interviewsKey), findsNothing);
      // The rest of home is as usual.
      expect(find.byKey(HomeScreen.attendanceKey), findsOneWidget);
    });

    testWidgets('the badge reads in Bangla digits', (tester) async {
      await pumpApp(tester, locale: const Locale('bn'));
      expect(
        within(HomeScreen.interviewsKey, findText('সাক্ষাৎকার')),
        findsOneWidget,
      );
      expect(
        within(HomeScreen.interviewsBadgeKey, findText('২')),
        findsOneWidget,
      );
    });
  });

  group('my interviews', () {
    Future<void> openList(WidgetTester tester, {Locale? locale}) async {
      await pumpApp(tester, locale: locale ?? const Locale('en'));
      await tap(tester, find.byKey(HomeScreen.interviewsKey));
    }

    testWidgets('lists those to come, then past ones, with how and when in '
        'Bangladesh time', (tester) async {
      await openList(tester);

      final upcoming = InterviewsScreen.itemKey(upcomingInterviewId);
      for (final text in [
        'Farhana Yasmin',
        'For Line Supervisor (Sewing)',
        'Thu, Oct 29, 2026 · 10:00 AM – 11:00 AM',
        'By video',
        'Scorecard to do',
      ]) {
        expect(within(upcoming, findText(text)), findsOneWidget, reason: text);
      }
      final past = InterviewsScreen.itemKey(pastInterviewId);
      for (final text in [
        'Mizanur Rahman',
        'Tue, Oct 20, 2026 · 2:30 PM – 3:00 PM',
        'In person',
        'Completed',
        'Scorecard in',
      ]) {
        expect(within(past, findText(text)), findsOneWidget, reason: text);
      }
      final cancelled = InterviewsScreen.itemKey(cancelledInterviewId);
      expect(within(cancelled, findText('Cancelled')), findsOneWidget);
      // A cancelled interview takes no scorecard.
      expect(within(cancelled, findText('Scorecard to do')), findsNothing);

      double top(Finder finder) => tester.getTopLeft(finder).dy;
      expect(top(findText('Coming up')), lessThan(top(find.byKey(upcoming))));
      expect(top(find.byKey(upcoming)), lessThan(top(findText('Past'))));
      expect(top(findText('Past')), lessThan(top(find.byKey(past))));
      expect(top(find.byKey(past)), lessThan(top(find.byKey(cancelled))));

      await tap(tester, find.byKey(upcoming));
      expect(find.byType(InterviewScreen), findsOneWidget);
      expect(api.interviewDetailCalls, [upcomingInterviewId]);
    });

    testWidgets('says when there are none', (tester) async {
      api.myInterviews = {'upcoming': <Json>[], 'past': <Json>[]};
      await openList(tester);
      expect(findText('No interviews coming up.'), findsOneWidget);
      expect(findText('None yet.'), findsOneWidget);
    });

    testWidgets('reads in Bangla', (tester) async {
      await openList(tester, locale: const Locale('bn'));
      final upcoming = InterviewsScreen.itemKey(upcomingInterviewId);
      for (final text in [
        'লাইন সুপারভাইজার (সেলাই) পদের জন্য',
        'বৃহস্পতি, ২৯ অক্টো, ২০২৬ · ১০:০০ AM – ১১:০০ AM',
        'ভিডিওতে',
        'স্কোরকার্ড বাকি',
      ]) {
        expect(within(upcoming, findText(text)), findsOneWidget, reason: text);
      }
      expect(findText('আমার সাক্ষাৎকার'), findsOneWidget);
      expect(findText('সামনে'), findsOneWidget);
      expect(findText('আগের'), findsOneWidget);
      expect(
        within(InterviewsScreen.itemKey(pastInterviewId), findText('সম্পন্ন')),
        findsOneWidget,
      );
    });
  });

  group('an interview', () {
    Future<ProviderContainer> openInterview(
      WidgetTester tester, {
      String id = upcomingInterviewId,
      Locale locale = const Locale('en'),
    }) async {
      final container = await pumpApp(tester, locale: locale);
      await tap(tester, find.byKey(HomeScreen.interviewsKey));
      await push(tester, InterviewScreen.route(id));
      return container;
    }

    Future<void> rate(WidgetTester tester, String criterion, int rating) =>
        tap(tester, find.byKey(ScorecardForm.ratingKey(criterion, rating)));

    testWidgets('shows the candidate, when, the link, the notes and the CV; '
        'the others stay hidden', (tester) async {
      await openInterview(tester);

      for (final text in [
        'Farhana Yasmin',
        'For Line Supervisor (Sewing)',
        'When (Bangladesh time)',
        'Thu, Oct 29, 2026 · 10:00 AM – 11:00 AM',
        'Meeting link',
        'https://meet.example.com/abc-defg-hij',
        'From HR',
        'Ask about line balancing.',
        "The candidate's note",
        'I have run two lines at another factory for three years.',
        'Your scorecard',
        'Skills for the job',
        'Experience',
        'Communication',
        'Submit scorecard',
      ]) {
        expect(findText(text), findsOneWidget, reason: text);
      }
      expect(find.byKey(InterviewScreen.othersHiddenKey), findsOneWidget);
      expect(find.byKey(InterviewScreen.othersKey), findsNothing);
      // The contract has no panel for an interviewer yet.
      expect(find.byKey(InterviewScreen.panelKey), findsNothing);

      await tap(tester, find.byKey(InterviewScreen.joinKey));
      expect(links.opened, [
        Uri.parse('https://meet.example.com/abc-defg-hij'),
      ]);

      await tap(tester, find.byKey(InterviewScreen.cvKey));
      expect(api.cvDownloads, [interviewApplicationId]);
      expect(files.opened.single.fileName, 'Farhana Yasmin CV.pdf');
      expect(files.opened.single.contentType, 'application/pdf');
    });

    testWidgets('says when the link or the CV cannot be opened', (
      tester,
    ) async {
      await openInterview(tester);

      links.result = false;
      await tap(tester, find.byKey(InterviewScreen.joinKey));
      expect(findText('The link could not be opened.'), findsOneWidget);
      await dismissSnackBar(tester);

      api.cv = const ApiException(
        kind: ApiErrorKind.server,
        statusCode: 404,
        message: 'CV not found',
      );
      await tap(tester, find.byKey(InterviewScreen.cvKey));
      expect(findText('The CV is no longer available.'), findsOneWidget);
      await dismissSnackBar(tester);

      api.cv = FileDownload(
        bytes: Uint8List(4),
        contentType:
            'application/vnd.openxmlformats-officedocument.'
            'wordprocessingml.document',
      );
      files.error = const FileOpenFailed(FileOpenProblem.noApp);
      await tap(tester, find.byKey(InterviewScreen.cvKey));
      expect(
        findText(
          'No app on this phone can open this CV. Install a PDF or Word '
          'reader and try again.',
        ),
        findsOneWidget,
      );
    });

    testWidgets('the scorecard needs every criterion rated and a '
        'recommendation; once in, the others show', (tester) async {
      await openInterview(tester);
      final meCalls = api.recruitmentMeCalls;
      final listCalls = api.myInterviewsCalls;

      await tap(tester, find.byKey(ScorecardForm.submitKey));
      expect(
        findText('Rate every criterion and choose a recommendation.'),
        findsOneWidget,
      );
      for (final criterion in scorecardCriteria) {
        expect(
          find.byKey(ScorecardForm.ratingErrorKey(criterion)),
          findsOneWidget,
        );
      }
      expect(find.byKey(ScorecardForm.recommendationErrorKey), findsOneWidget);
      expect(api.scorecards, isEmpty);
      await dismissSnackBar(tester);

      await rate(tester, 'Skills for the job', 4);
      await rate(tester, 'Experience', 3);
      await tap(
        tester,
        find.byKey(ScorecardForm.recommendationKey(Recommendation.yes)),
      );
      await tap(tester, find.byKey(ScorecardForm.submitKey));
      // Only what is still missing.
      expect(
        find.byKey(ScorecardForm.ratingErrorKey('Skills for the job')),
        findsNothing,
      );
      expect(
        find.byKey(ScorecardForm.ratingErrorKey('Communication')),
        findsOneWidget,
      );
      expect(find.byKey(ScorecardForm.recommendationErrorKey), findsNothing);
      expect(api.scorecards, isEmpty);
      await dismissSnackBar(tester);

      await rate(tester, 'Communication', 5);
      await tester.enterText(
        find.byKey(ScorecardForm.feedbackKey),
        '  Knows line balancing well.  ',
      );
      await tap(tester, find.byKey(ScorecardForm.submitKey));

      expect(api.scorecards.single.interviewId, upcomingInterviewId);
      expect(api.scorecards.single.body, {
        'ratings': {
          'Skills for the job': 4,
          'Experience': 3,
          'Communication': 5,
        },
        'recommendation': 'yes',
        'feedback': 'Knows line balancing well.',
      });
      expect(findText('Scorecard submitted'), findsOneWidget);
      // The others' scorecards, now that the user's is in.
      expect(find.byKey(InterviewScreen.othersHiddenKey), findsNothing);
      final others = InterviewScreen.othersKey;
      for (final text in [
        'Shirin Akter',
        'Strong yes',
        '5 / 5',
        'Ran two lines at her last factory.',
        'Submitted Oct 29, 2026',
      ]) {
        expect(within(others, findText(text)), findsOneWidget, reason: text);
      }
      // The form keeps the user's scorecard, to update.
      expect(findText('Update scorecard'), findsOneWidget);
      // Back on the list and home, both show the scorecard is in.
      api
        ..myInterviews = {
          'upcoming': [interviewItemJson(submitted: true)],
          'past': <Json>[],
        }
        ..recruitmentMe = recruitmentMeJson(interviews: 1);
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(api.myInterviewsCalls, greaterThan(listCalls));
      expect(
        within(
          InterviewsScreen.itemKey(upcomingInterviewId),
          findText('Scorecard in'),
        ),
        findsOneWidget,
      );
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(api.recruitmentMeCalls, greaterThan(meCalls));
      expect(
        within(HomeScreen.interviewsBadgeKey, findText('1')),
        findsOneWidget,
      );
    });

    testWidgets('a scorecard already in is filled in and can be updated', (
      tester,
    ) async {
      api.interviewDetails[pastInterviewId] = interviewDetailJson(
        item: pastInterviewJson(),
        mine: scorecardJson(),
        others: [shirinScorecardJson()],
      );
      await openInterview(tester, id: pastInterviewId);

      expect(findText('Update scorecard'), findsOneWidget);
      expect(
        tester
            .widget<ChoiceChip>(
              find.byKey(ScorecardForm.recommendationKey(Recommendation.yes)),
            )
            .selected,
        isTrue,
      );
      expect(
        within(InterviewScreen.othersKey, findText('Shirin Akter')),
        (findsOneWidget),
      );

      await rate(tester, 'Communication', 3);
      await tap(tester, find.byKey(ScorecardForm.submitKey));
      expect(api.scorecards.single.body, {
        'ratings': {
          'Skills for the job': 4,
          'Experience': 3,
          'Communication': 3,
        },
        'recommendation': 'yes',
        'feedback': 'Knows line balancing well.',
      });
      expect(findText('Scorecard updated'), findsOneWidget);
    });

    testWidgets('a closed application refuses the scorecard and the page '
        'shows it read only', (tester) async {
      await openInterview(tester);
      for (final criterion in scorecardCriteria) {
        await rate(tester, criterion, 4);
      }
      await tap(
        tester,
        find.byKey(ScorecardForm.recommendationKey(Recommendation.no)),
      );
      // Closed since the page loaded.
      api
        ..scorecardError = _refusal(409, 'application_closed')
        ..interviewDetails[upcomingInterviewId] = interviewDetailJson(
          scorable: false,
        );
      await tap(tester, find.byKey(ScorecardForm.submitKey));

      expect(api.scorecards, hasLength(1));
      expect(
        findText(
          'This application is closed, so scorecards can no longer change.',
        ),
        findsWidgets,
      );
      expect(api.interviewDetailCalls, hasLength(2));
      expect(find.byKey(ScorecardForm.submitKey), findsNothing);
    });

    testWidgets('a cancelled interview takes no scorecard', (tester) async {
      api.interviewDetails[cancelledInterviewId] = interviewDetailJson(
        item: cancelledInterviewJson(),
        scorable: false,
        hasCv: false,
      );
      await openInterview(tester, id: cancelledInterviewId);

      expect(findText('This interview was cancelled.'), findsOneWidget);
      expect(findText('Phone note'), findsOneWidget);
      expect(findText('HR calls the candidate'), findsOneWidget);
      expect(findText('No CV'), findsOneWidget);
      expect(find.byKey(InterviewScreen.cvKey), findsNothing);
      expect(find.byKey(ScorecardForm.submitKey), findsNothing);
    });

    testWidgets('shows the panel when the API sends it', (tester) async {
      api.interviewDetails[upcomingInterviewId] = interviewDetailJson(
        panel: panelJson(),
      );
      await openInterview(tester);

      final panel = InterviewScreen.panelKey;
      expect(within(panel, findText('Panel')), findsOneWidget);
      expect(within(panel, findText('Shirin Akter')), findsOneWidget);
      expect(within(panel, findText('Rahima Khatun')), findsOneWidget);
      expect(within(panel, findText('Scorecard in')), findsOneWidget);
      expect(within(panel, findText('Scorecard to do')), findsOneWidget);
    });

    testWidgets('one the user is no longer on says so', (tester) async {
      await openInterview(tester, id: 'f1000000-0000-4000-8000-0000000000ff');
      expect(
        findText("You are no longer on this interview's panel."),
        findsOneWidget,
      );
    });

    testWidgets('reads in Bangla, ratings in Bangla digits', (tester) async {
      await openInterview(tester, locale: const Locale('bn'));

      for (final text in [
        'সময় (বাংলাদেশ সময়)',
        'বৃহস্পতি, ২৯ অক্টো, ২০২৬ · ১০:০০ AM – ১১:০০ AM',
        'মিটিংয়ের লিংক',
        'ভিডিও কলে যোগ দিন',
        'এইচআরের নোট',
        'প্রার্থীর বার্তা',
        'সিভি খুলুন',
        'আপনার স্কোরকার্ড',
        'প্রতিটি মানদণ্ডে ১ (দুর্বল) থেকে ৫ (চমৎকার) দিন।',
        'সুপারিশ',
        'অবশ্যই হ্যাঁ',
        'স্কোরকার্ড জমা দিন',
        'অন্য সাক্ষাৎকারগ্রহীতাদের স্কোরকার্ড',
      ]) {
        expect(findText(text), findsOneWidget, reason: text);
      }
      expect(
        tester
            .widget<Text>(
              find.byKey(ScorecardForm.ratingKey('Communication', 5)),
            )
            .data,
        '৫',
      );

      await tap(tester, find.byKey(ScorecardForm.submitKey));
      expect(
        findText('১ থেকে ৫-এর মধ্যে নম্বর দিন'),
        findsNWidgets(scorecardCriteria.length),
      );
      expect(findText('একটি সুপারিশ বেছে নিন'), findsOneWidget);
      await dismissSnackBar(tester);

      for (final criterion in scorecardCriteria) {
        await rate(tester, criterion, 5);
      }
      await tap(
        tester,
        find.byKey(ScorecardForm.recommendationKey(Recommendation.strongYes)),
      );
      await tap(tester, find.byKey(ScorecardForm.submitKey));
      expect(findText('স্কোরকার্ড জমা দেওয়া হয়েছে'), findsOneWidget);
      expect(
        within(InterviewScreen.othersKey, findText('শিরিন আক্তার')),
        findsOneWidget,
      );
      expect(
        within(InterviewScreen.othersKey, findText('৫ / ৫')),
        findsOneWidget,
      );
    });
  });

  group('notifications', () {
    test('an interview notification opens My interviews', () {
      expect(
        NotificationEvent.fromWire('recruitment.interview'),
        NotificationEvent.recruitmentInterview,
      );
      final route = notificationRoute(
        NotificationEvent.recruitmentInterview,
        '/workspace/interviews',
      );
      expect(
        (route! as MaterialPageRoute<void>).builder(_FakeContext()),
        isA<InterviewsScreen>(),
      );
    });
  });
}

class _FakeContext extends Fake implements BuildContext {}
