import 'package:flutter/widgets.dart';

import '../api/api_models.dart';
import '../approvals/approvals_screen.dart';
import '../attendance/attendance_screen.dart';
import '../documents/documents_screen.dart';
import '../leave/leave_screen.dart';
import '../payslips/payslips_screen.dart';
import '../profile/profile_screen.dart';

/// The screen a notification is about, or `null` when the app has none for
/// it (such as a probation ending, which HR handles on the web).
///
/// A decided approval says by its [link] (a web app path) what it decided:
/// a leave request, an attendance correction, or a resignation (shown under
/// the profile).
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
        _ => null,
      },
      NotificationEvent.documentExpiring ||
      NotificationEvent.letterIssued => DocumentsScreen.route(),
      NotificationEvent.missingPunch => AttendanceScreen.route(),
      NotificationEvent.payslipPublished => PayslipsScreen.route(),
      NotificationEvent.probationEnding || NotificationEvent.unknown => null,
    };

/// Opens [notificationRoute] on [navigator], if there is one.
void openNotificationTarget(
  NavigatorState navigator,
  NotificationEvent event,
  String? link,
) {
  if (notificationRoute(event, link) case final route?) navigator.push(route);
}
