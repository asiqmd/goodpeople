// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'Good People';

  @override
  String get signIn => 'Sign in';

  @override
  String get signInSubtitle => 'Sign in to your workspace';

  @override
  String get workspace => 'Workspace';

  @override
  String get workspaceHint => 'e.g. your-company';

  @override
  String get email => 'Email';

  @override
  String get password => 'Password';

  @override
  String get showPassword => 'Show password';

  @override
  String get hidePassword => 'Hide password';

  @override
  String get workspaceRequired => 'Enter your workspace';

  @override
  String get emailRequired => 'Enter your email';

  @override
  String get emailInvalid => 'Enter a valid email address';

  @override
  String get passwordRequired => 'Enter your password';

  @override
  String get signOut => 'Sign out';

  @override
  String get language => 'Language';

  @override
  String get yourModules => 'Your modules';

  @override
  String signedInAs(String name) {
    return 'Signed in as $name';
  }

  @override
  String get planLabel => 'Plan';

  @override
  String get billingLabel => 'Billing';

  @override
  String planName(String plan) {
    String _temp0 = intl.Intl.selectLogic(plan, {
      'starter': 'Starter',
      'growth': 'Growth',
      'business': 'Business',
      'enterprise': 'Enterprise',
      'other': 'Unknown',
    });
    return '$_temp0';
  }

  @override
  String billingModeName(String mode) {
    String _temp0 = intl.Intl.selectLogic(mode, {
      'paid': 'Paid',
      'trial': 'Trial',
      'complimentary': 'Complimentary',
      'internal': 'Internal',
      'partner': 'Partner',
      'license': 'License',
      'other': 'Unknown',
    });
    return '$_temp0';
  }

  @override
  String get readOnlyTitle => 'Read-only access';

  @override
  String get readOnlyBody => 'You can view data but not change it.';

  @override
  String get suspendedTitle => 'Access suspended';

  @override
  String get suspendedBody =>
      'This workspace is suspended. Contact your administrator to restore access.';

  @override
  String get moduleEnabled => 'Enabled';

  @override
  String get moduleLocked => 'Locked';

  @override
  String get moduleCoreHr => 'Core HR';

  @override
  String get moduleLeave => 'Leave';

  @override
  String get moduleAttendance => 'Attendance';

  @override
  String get modulePayroll => 'Payroll';

  @override
  String get moduleBdTax => 'Bangladesh income tax';

  @override
  String get moduleRecruitment => 'Recruitment';

  @override
  String get modulePerformance => 'Performance';

  @override
  String get moduleLms => 'Learning';

  @override
  String get moduleMultiEntity => 'Multiple legal entities';

  @override
  String get moduleApiAccess => 'API access';

  @override
  String get moduleSso => 'Single sign-on';

  @override
  String get networkError =>
      'Could not reach the server. Check your connection and try again.';

  @override
  String get unexpectedError => 'Something went wrong. Please try again.';

  @override
  String get sessionExpired => 'Your session has ended. Please sign in again.';

  @override
  String get loadAccessFailed => 'We could not load your workspace.';

  @override
  String get retry => 'Try again';
}
