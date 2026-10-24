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

  @override
  String get myProfile => 'My profile';

  @override
  String get myProfileSubtitle => 'Your job, personal and payment details';

  @override
  String get profileJob => 'Job';

  @override
  String get profilePersonal => 'Personal';

  @override
  String get profileIdentity => 'Identity documents';

  @override
  String get profileAddresses => 'Addresses';

  @override
  String get profileNominees => 'Nominees';

  @override
  String get profilePaymentAccounts => 'Payment accounts';

  @override
  String get legalEntityLabel => 'Legal entity';

  @override
  String get locationLabel => 'Location';

  @override
  String get orgUnitLabel => 'Unit';

  @override
  String get designationLabel => 'Designation';

  @override
  String get gradeLabel => 'Grade';

  @override
  String get managerLabel => 'Manager';

  @override
  String managerValue(String name, String code) {
    return '$name ($code)';
  }

  @override
  String get employmentTypeLabel => 'Employment type';

  @override
  String get workerCategoryLabel => 'Worker category';

  @override
  String get joinedOnLabel => 'Joined';

  @override
  String get confirmedOnLabel => 'Confirmed';

  @override
  String get probationEndsOnLabel => 'Probation ends';

  @override
  String get noCurrentJob => 'No current job assignment';

  @override
  String get fatherNameLabel => 'Father\'s name';

  @override
  String get motherNameLabel => 'Mother\'s name';

  @override
  String get dateOfBirthLabel => 'Date of birth';

  @override
  String get genderLabel => 'Gender';

  @override
  String get religionLabel => 'Religion';

  @override
  String get bloodGroupLabel => 'Blood group';

  @override
  String get mobilePhoneLabel => 'Mobile phone';

  @override
  String get nidLabel => 'National ID (NID)';

  @override
  String get birthRegistrationLabel => 'Birth registration';

  @override
  String get passportLabel => 'Passport';

  @override
  String get tinLabel => 'TIN';

  @override
  String get presentAddressLabel => 'Present address';

  @override
  String get permanentAddressLabel => 'Permanent address';

  @override
  String get noneRecorded => 'None recorded';

  @override
  String nomineeDetails(String relation, num share) {
    final intl.NumberFormat shareNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String shareString = shareNumberFormat.format(share);

    return '$relation · $shareString% share';
  }

  @override
  String get primaryAccount => 'Primary';

  @override
  String get adolescentWorker => 'Adolescent worker';

  @override
  String get noEmployeeRecordTitle => 'No employee record yet';

  @override
  String get noEmployeeRecordBody =>
      'Your login is not linked to an employee record, so there is no profile to show. Workspace admins often don\'t have one. If you think you should, ask your HR team.';

  @override
  String get loadProfileFailed => 'We could not load your profile.';

  @override
  String get unknownValue => 'Unknown';

  @override
  String genderName(String gender) {
    String _temp0 = intl.Intl.selectLogic(gender, {
      'male': 'Male',
      'female': 'Female',
      'third_gender': 'Third gender',
      'other': 'Unknown',
    });
    return '$_temp0';
  }

  @override
  String religionName(String religion) {
    String _temp0 = intl.Intl.selectLogic(religion, {
      'islam': 'Islam',
      'hinduism': 'Hinduism',
      'buddhism': 'Buddhism',
      'christianity': 'Christianity',
      'unknown': 'Unknown',
      'other': 'Other',
    });
    return '$_temp0';
  }

  @override
  String employmentTypeName(String type) {
    String _temp0 = intl.Intl.selectLogic(type, {
      'permanent': 'Permanent',
      'probationer': 'Probationer',
      'apprentice': 'Apprentice',
      'badli': 'Badli (substitute)',
      'casual': 'Casual',
      'temporary': 'Temporary',
      'seasonal': 'Seasonal',
      'contractual': 'Contractual',
      'other': 'Unknown',
    });
    return '$_temp0';
  }

  @override
  String workerCategoryName(String category) {
    String _temp0 = intl.Intl.selectLogic(category, {
      'worker': 'Worker',
      'staff': 'Staff',
      'other': 'Unknown',
    });
    return '$_temp0';
  }

  @override
  String paymentMethodName(String method) {
    String _temp0 = intl.Intl.selectLogic(method, {
      'bank': 'Bank account',
      'mfs': 'Mobile banking',
      'cash': 'Cash',
      'other': 'Unknown',
    });
    return '$_temp0';
  }

  @override
  String paymentProviderName(String provider) {
    String _temp0 = intl.Intl.selectLogic(provider, {
      'bkash': 'bKash',
      'nagad': 'Nagad',
      'rocket': 'Rocket',
      'upay': 'Upay',
      'other': '$provider',
    });
    return '$_temp0';
  }

  @override
  String divisionName(String division) {
    String _temp0 = intl.Intl.selectLogic(division, {
      'barishal': 'Barishal',
      'chattogram': 'Chattogram',
      'dhaka': 'Dhaka',
      'khulna': 'Khulna',
      'mymensingh': 'Mymensingh',
      'rajshahi': 'Rajshahi',
      'rangpur': 'Rangpur',
      'sylhet': 'Sylhet',
      'other': 'Unknown',
    });
    return '$_temp0';
  }
}
