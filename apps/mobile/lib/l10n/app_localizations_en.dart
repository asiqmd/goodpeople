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

  @override
  String get leaveTitle => 'Leave';

  @override
  String get leaveSubtitle => 'Balances, requests and holidays';

  @override
  String get leaveTabBalances => 'Balances';

  @override
  String get leaveTabApply => 'Apply';

  @override
  String get leaveTabRequests => 'My requests';

  @override
  String get leaveTabApprovals => 'Approvals';

  @override
  String get leaveTabHolidays => 'Holidays';

  @override
  String get leaveLoadFailed => 'We could not load your leave.';

  @override
  String get approvalsLoadFailed => 'We could not load your approvals.';

  @override
  String get holidaysLoadFailed => 'We could not load the holidays.';

  @override
  String get leaveNoEmployeeTitle => 'No employee record';

  @override
  String get leaveNoEmployeeBody =>
      'Leave belongs to an employee record, and your login is not linked to one. If you think it should be, ask your HR team.';

  @override
  String leaveDays(num count) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countString days',
      one: '$countString day',
    );
    return '$_temp0';
  }

  @override
  String get leaveAvailable => 'Available';

  @override
  String get leaveOnRequest => 'On request';

  @override
  String get leaveEntitlement => 'Entitlement';

  @override
  String get leaveCarriedForward => 'Carried forward';

  @override
  String get leaveAdjustments => 'Adjustments';

  @override
  String get leaveTaken => 'Taken';

  @override
  String get leavePendingDays => 'Pending';

  @override
  String get leaveUnpaid => 'Unpaid';

  @override
  String leaveEligibleFrom(String date) {
    return 'Eligible from $date';
  }

  @override
  String get leaveNoTypes => 'No leave types are set up yet.';

  @override
  String get leaveTypeLabel => 'Leave type';

  @override
  String get leaveTypeRequired => 'Choose a leave type';

  @override
  String get leaveStartDate => 'From';

  @override
  String get leaveEndDate => 'To';

  @override
  String get leaveChooseDate => 'Choose a date';

  @override
  String get leaveFullDay => 'Full day';

  @override
  String halfDayName(String part) {
    String _temp0 = intl.Intl.selectLogic(part, {
      'first_half': 'First half',
      'second_half': 'Second half',
      'other': 'Half day',
    });
    return '$_temp0';
  }

  @override
  String get leaveReason => 'Reason';

  @override
  String get leaveReasonTooShort => 'Write at least 3 characters';

  @override
  String leaveDocumentHint(num days) {
    final intl.NumberFormat daysNumberFormat = intl.NumberFormat.decimalPattern(
      localeName,
    );
    final String daysString = daysNumberFormat.format(days);

    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: 'A supporting document is needed for more than $daysString days.',
      one: 'A supporting document is needed for more than $daysString day.',
    );
    return '$_temp0';
  }

  @override
  String get leaveCountsOffDaysHint =>
      'Weekly offs and holidays between the dates count as leave days.';

  @override
  String get leavePreviewHint =>
      'Choose a leave type and dates to see how many days this takes.';

  @override
  String get leaveDaysLabel => 'Leave days';

  @override
  String get leaveNotCounted => 'Not counted';

  @override
  String excludedDayReason(String reason) {
    String _temp0 = intl.Intl.selectLogic(reason, {
      'weekly_off': 'Weekly off',
      'holiday': 'Holiday',
      'other': 'Not counted',
    });
    return '$_temp0';
  }

  @override
  String excludedDayWithName(String reason, String name) {
    return '$reason: $name';
  }

  @override
  String get leaveProblemsTitle => 'This request can\'t be sent yet:';

  @override
  String get leaveSubmit => 'Send request';

  @override
  String get leaveSubmitted => 'Leave request sent';

  @override
  String get leaveSubmittedBody =>
      'Your approvers can see it now. Follow it under My requests.';

  @override
  String get leaveViewRequests => 'See my requests';

  @override
  String get leaveApplyAgain => 'Apply for more leave';

  @override
  String leaveNoRequests(String year) {
    return 'No leave requests in $year.';
  }

  @override
  String leaveStatusName(String status) {
    String _temp0 = intl.Intl.selectLogic(status, {
      'pending': 'Pending',
      'approved': 'Approved',
      'rejected': 'Rejected',
      'cancelled': 'Cancelled',
      'other': 'Unknown',
    });
    return '$_temp0';
  }

  @override
  String approvalStepKindName(String kind) {
    String _temp0 = intl.Intl.selectLogic(kind, {
      'manager': 'Manager',
      'hr': 'HR',
      'other': 'Approver',
    });
    return '$_temp0';
  }

  @override
  String approvalStepStatusName(String status) {
    String _temp0 = intl.Intl.selectLogic(status, {
      'waiting': 'Waiting for previous step',
      'pending': 'Awaiting decision',
      'approved': 'Approved',
      'rejected': 'Rejected',
      'skipped': 'Skipped',
      'cancelled': 'Cancelled',
      'other': 'Unknown',
    });
    return '$_temp0';
  }

  @override
  String get approvalHrTeam => 'HR team';

  @override
  String get approvalTrail => 'Approval';

  @override
  String approvalStepTitle(String kind, String approver) {
    return '$kind: $approver';
  }

  @override
  String approvalDecidedBy(String name, String date) {
    return '$name, $date';
  }

  @override
  String get leaveNeedsDocument => 'Supporting document needed';

  @override
  String get leaveCancelRequest => 'Cancel request';

  @override
  String get leaveCancelTitle => 'Cancel this request?';

  @override
  String leaveCancelBody(String type, String dates) {
    return '$type, $dates. Days not yet taken go back to your balance.';
  }

  @override
  String get leaveKeepRequest => 'Keep it';

  @override
  String get leaveCancelled => 'Request cancelled';

  @override
  String approvalYourStep(String kind) {
    return 'Your step: $kind';
  }

  @override
  String get approvalBalance => 'Their balance';

  @override
  String approvalAvailable(String days) {
    return '$days available';
  }

  @override
  String get approve => 'Approve';

  @override
  String get reject => 'Reject';

  @override
  String get approveTitle => 'Approve this leave?';

  @override
  String get rejectTitle => 'Reject this leave?';

  @override
  String get decisionComment => 'Comment (optional)';

  @override
  String get leaveApproved => 'Leave approved';

  @override
  String get leaveRejected => 'Leave rejected';

  @override
  String get approvalsEmpty => 'Nothing is waiting for you.';

  @override
  String holidayKindName(String kind) {
    String _temp0 = intl.Intl.selectLogic(kind, {
      'public': 'Public holiday',
      'festival': 'Festival holiday',
      'optional': 'Optional holiday',
      'company': 'Company holiday',
      'other': 'Holiday',
    });
    return '$_temp0';
  }

  @override
  String get holidayTentative => 'Tentative';

  @override
  String get holidaysTentativeNote =>
      'Tentative dates depend on the moon sighting and can move.';

  @override
  String holidaysNone(String year) {
    return 'No holidays in $year.';
  }

  @override
  String get holidaysNoCalendar => 'No holiday calendar has been set up yet.';

  @override
  String get attendanceTitle => 'Attendance';

  @override
  String get attendanceSubtitle =>
      'Punch in and out, your month and corrections';

  @override
  String get attendanceTabToday => 'Today';

  @override
  String get attendanceTabMonth => 'This month';

  @override
  String get attendanceTabCorrections => 'Corrections';

  @override
  String get attendanceLoadFailed => 'We could not load your attendance.';

  @override
  String get attendanceNoEmployeeBody =>
      'Attendance belongs to an employee record, but none is linked to your login. If you think you should have one, ask your HR team.';

  @override
  String attendanceStatusName(String status) {
    String _temp0 = intl.Intl.selectLogic(status, {
      'present': 'Present',
      'half_day': 'Half day',
      'absent': 'Absent',
      'on_leave': 'On leave',
      'missing_punch': 'Missing punch',
      'off': 'Off',
      'pending': 'In progress',
      'other': 'Unknown',
    });
    return '$_temp0';
  }

  @override
  String attendanceFlagName(String flag) {
    String _temp0 = intl.Intl.selectLogic(flag, {
      'late': 'Late',
      'early_out': 'Left early',
      'over_daily_limit': 'Over daily limit',
      'regularized': 'Corrected',
      'on_duty': 'On duty',
      'outside_geofence': 'Outside work area',
      'other': 'Note',
    });
    return '$_temp0';
  }

  @override
  String dayTypeName(String type) {
    String _temp0 = intl.Intl.selectLogic(type, {
      'working': 'Working day',
      'weekly_off': 'Weekly off',
      'holiday': 'Holiday',
      'other': 'Day',
    });
    return '$_temp0';
  }

  @override
  String punchSourceName(String source) {
    String _temp0 = intl.Intl.selectLogic(source, {
      'device': 'Device',
      'web': 'Web',
      'mobile': 'Mobile app',
      'manual': 'Added by HR',
      'regularization': 'Correction',
      'other': 'Other',
    });
    return '$_temp0';
  }

  @override
  String punchDirectionName(String direction) {
    String _temp0 = intl.Intl.selectLogic(direction, {
      'in': 'In',
      'out': 'Out',
      'other': 'Punch',
    });
    return '$_temp0';
  }

  @override
  String regularizationKindName(String kind) {
    String _temp0 = intl.Intl.selectLogic(kind, {
      'missed_punch': 'Missed punch',
      'on_duty': 'On duty',
      'other': 'Correction',
    });
    return '$_temp0';
  }

  @override
  String get attendanceNoShift => 'No shift scheduled';

  @override
  String get attendanceFirstIn => 'First in';

  @override
  String get attendanceLastOut => 'Last out';

  @override
  String get attendanceWorked => 'Worked';

  @override
  String get attendanceOvertime => 'Overtime';

  @override
  String attendanceLateBy(String duration) {
    return 'Late $duration';
  }

  @override
  String attendanceEarlyOutBy(String duration) {
    return 'Left early $duration';
  }

  @override
  String attendanceOvertimeBy(String duration) {
    return 'OT $duration';
  }

  @override
  String attendanceLeaveCode(String code) {
    return 'Leave: $code';
  }

  @override
  String attendanceHolidayNamed(String name) {
    return 'Holiday: $name';
  }

  @override
  String attendanceCorrectionStatus(String status) {
    return 'Correction: $status';
  }

  @override
  String get punchIn => 'Punch in';

  @override
  String get punchOut => 'Punch out';

  @override
  String get punchedIn => 'Punched in';

  @override
  String get punchedOut => 'Punched out';

  @override
  String get punchLocating => 'Finding your location…';

  @override
  String get punchGeofencedHint =>
      'When you punch, your location is checked against your workplace area.';

  @override
  String get punchAnywhereHint =>
      'You can punch from anywhere. If you allow it, your location is sent too.';

  @override
  String get punchBlockedDisabled =>
      'Punching from the app is turned off for your workspace. Use the attendance device at work.';

  @override
  String get punchBlockedNoGeofence =>
      'Your workplace has no punch area set yet, so you can\'t punch from the app. Ask HR to set one.';

  @override
  String get punchBlockedOther =>
      'Punching from the app isn\'t available right now.';

  @override
  String get todaysPunches => 'Today\'s punches';

  @override
  String get noPunchesYet => 'No punches yet.';

  @override
  String get punchVoided => 'Voided';

  @override
  String get locationServicesOff =>
      'Location is turned off on this phone. Turn it on to punch.';

  @override
  String get locationPermissionDenied =>
      'Allow location access so the app can check that you are at your workplace.';

  @override
  String get locationPermissionBlocked =>
      'Location access is blocked for this app. Allow it in Settings to punch.';

  @override
  String get locationTimeout =>
      'Your location could not be found. Move to an open area and try again.';

  @override
  String get locationFailed =>
      'Your location could not be read. Please try again.';

  @override
  String get openSettings => 'Open settings';

  @override
  String punchErrorOutsideGeofence(String distance, String radius) {
    return 'You are about $distance m from your workplace. You can punch within $radius m of it.';
  }

  @override
  String get punchErrorOutsideArea =>
      'You are outside your workplace area, so you can\'t punch here.';

  @override
  String get punchErrorLocationRequired =>
      'Allow location access to punch in or out.';

  @override
  String get punchErrorTooSoon =>
      'You punched less than a minute ago. Wait a moment before punching again.';

  @override
  String get punchErrorSeparated =>
      'Your employment has ended, so you can\'t punch.';

  @override
  String get correctionErrorFutureDay =>
      'You can only correct days that have already started.';

  @override
  String get correctionErrorOutsideWindow =>
      'This day is too far back to correct from the app. Ask HR to fix it.';

  @override
  String get correctionErrorNotTracked =>
      'Attendance wasn\'t tracked on that day, so there is nothing to correct.';

  @override
  String get correctionErrorWrongDay =>
      'That time belongs to another day\'s shift. Check the date and times.';

  @override
  String get correctionErrorFuturePunch =>
      'A punch time can\'t be in the future.';

  @override
  String get correctionErrorAlreadyPending =>
      'A correction for this day is already waiting for approval.';

  @override
  String get correctionErrorNotPending =>
      'This correction has already been decided.';

  @override
  String get attendanceMonthEmpty => 'No attendance days yet this month.';

  @override
  String get attendanceCorrectDay => 'Request a correction for this day';

  @override
  String get correctionRequest => 'Request correction';

  @override
  String get correctionsEmpty => 'You haven\'t asked for any corrections.';

  @override
  String get correctionsLoadFailed => 'We could not load your corrections.';

  @override
  String correctionInAt(String time) {
    return 'In $time';
  }

  @override
  String correctionOutAt(String time) {
    return 'Out $time';
  }

  @override
  String get correctionCancel => 'Cancel correction';

  @override
  String get correctionCancelTitle => 'Cancel this correction?';

  @override
  String correctionCancelBody(String date) {
    return 'Your correction for $date will be withdrawn.';
  }

  @override
  String get correctionCancelled => 'Correction cancelled';

  @override
  String get correctionDate => 'Day';

  @override
  String get correctionDateRequired => 'Choose the day to correct';

  @override
  String get correctionInTime => 'In time';

  @override
  String get correctionOutTime => 'Out time';

  @override
  String get correctionChooseTime => 'Choose a time';

  @override
  String get correctionClearTime => 'Clear time';

  @override
  String get correctionTimesHint =>
      'Give the time you came in, the time you left, or both.';

  @override
  String get correctionTimesRequired =>
      'Give the in time, the out time or both.';

  @override
  String get correctionOnDutyHint =>
      'An on-duty day counts as your whole shift, so no times are needed.';

  @override
  String get correctionSubmit => 'Send correction';

  @override
  String get correctionSent => 'Correction sent for approval';

  @override
  String get approvalCorrectionTitle => 'Attendance correction';

  @override
  String get approvalAskedFor => 'Asked for';

  @override
  String get approvalDayNow => 'Recorded now';

  @override
  String get approveCorrectionTitle => 'Approve this correction?';

  @override
  String get rejectCorrectionTitle => 'Reject this correction?';

  @override
  String get correctionApproved => 'Correction approved';

  @override
  String get correctionRejected => 'Correction rejected';

  @override
  String get approvalUnknownItem =>
      'This version of the app can\'t show this request. Decide it on the web.';
}
