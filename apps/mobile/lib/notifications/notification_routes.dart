import 'package:flutter/widgets.dart';

import '../api/api_models.dart';
import '../approvals/approvals_screen.dart';
import '../attendance/attendance_screen.dart';
import '../documents/documents_screen.dart';
import '../interviews/interviews_screen.dart';
import '../leave/leave_screen.dart';
import '../payslips/my_pay_screen.dart';
import '../performance/goals_screen.dart';
import '../performance/peer_request_screen.dart';
import '../performance/peers_screen.dart';
import '../performance/performance_screen.dart';
import '../performance/review_screen.dart';
import '../performance/team_goals_screen.dart';
import '../profile/profile_screen.dart';
import '../timesheets/timesheet_screen.dart';

/// The screen a notification is about, or `null` when the app has none for
/// it (such as a probation ending, which HR handles on the web).
///
/// A performance notification says by its [link] which review, feedback or
/// goals it is about (see [_performanceRoute]).
///
/// A decided approval says by its [link] (a web app path) what it decided:
/// a leave request, an attendance correction, a resignation (shown under
/// the profile) or a timesheet.
Route<void>? notificationRoute(NotificationEvent event, String? link) =>
    switch (event) {
      NotificationEvent.approvalRequested => ApprovalsScreen.route(),
      NotificationEvent.approvalDecided => switch (link ?? '') {
        final path when path.startsWith('/workspace/leave') =>
          LeaveScreen.route(initialTab: LeaveTab.requests),
        final path when path.startsWith('/workspace/attendance') =>
          AttendanceScreen.route(initialTab: AttendanceTab.corrections),
        final path when path.startsWith('/workspace/profile') =>
          ProfileScreen.route(),
        final path when path.startsWith('/workspace/timesheets') =>
          TimesheetScreen.route(month: _monthIn(path)),
        _ => null,
      },
      NotificationEvent.documentExpiring ||
      NotificationEvent.letterIssued => DocumentsScreen.route(),
      NotificationEvent.missingPunch => AttendanceScreen.route(),
      NotificationEvent.payslipPublished => MyPayScreen.route(
        initialTab: MyPayTab.payslips,
      ),
      NotificationEvent.timesheetDue => TimesheetScreen.route(
        month: _monthIn(link ?? ''),
      ),
      NotificationEvent.recruitmentInterview => InterviewsScreen.route(),
      NotificationEvent.performanceTask ||
      NotificationEvent.performanceReleased => _performanceRoute(link ?? ''),
      NotificationEvent.probationEnding || NotificationEvent.unknown => null,
    };

/// The screen a performance link is about: a review, one request for
/// feedback or all of them, the team's goals to agree or the user's own;
/// anything else (the landing page, a team's reviews, probation reviews,
/// plans, cycles) opens the Performance screen, which says what is done on
/// the web.
Route<void> _performanceRoute(String link) {
  final uri = Uri.tryParse(link);
  return switch (uri?.pathSegments ?? const []) {
    ['workspace', 'performance', 'reviews', final id] when id.isNotEmpty =>
      ReviewScreen.route(id),
    ['workspace', 'performance', 'peers', final id] when id.isNotEmpty =>
      PeerRequestScreen.route(id),
    ['workspace', 'performance', 'peers', ...] => PeerFeedbackScreen.route(),
    ['workspace', 'performance', 'goals', ...]
        when uri!.queryParameters['tab'] == 'team' =>
      TeamGoalsScreen.route(),
    ['workspace', 'performance', 'goals', ...] => MyGoalsScreen.route(),
    _ => PerformanceScreen.route(),
  };
}

/// The month a timesheet link is about (`?month=2026-10`), or `null`.
DateTime? _monthIn(String link) =>
    switch (RegExp(r'month=(\d{4})-(\d{2})').firstMatch(link)) {
      final match? => DateTime.utc(int.parse(match[1]!), int.parse(match[2]!)),
      null => null,
    };

/// Opens [notificationRoute] on [navigator], if there is one.
void openNotificationTarget(
  NavigatorState navigator,
  NotificationEvent event,
  String? link,
) {
  if (notificationRoute(event, link) case final route?) navigator.push(route);
}
