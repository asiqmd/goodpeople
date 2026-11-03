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

  @override
  String get punchSelfieHint =>
      'Your workspace asks for a photo with each punch. The front camera opens when you punch.';

  @override
  String get punchTakingPhoto => 'Taking your photo…';

  @override
  String get punchNoPhoto =>
      'No photo was taken, so you weren\'t punched. Punch again and take the photo.';

  @override
  String get punchWithPhoto => 'With photo';

  @override
  String get punchErrorSelfieRequired =>
      'Your workspace now asks for a photo with each punch. Punch again to take one.';

  @override
  String get punchErrorSelfieTooLarge =>
      'The photo is too large to send. Please take it again.';

  @override
  String get punchErrorSelfieUnreadable =>
      'The photo could not be read. Please take it again.';

  @override
  String get cameraPermissionDenied =>
      'Camera access is off for this app. Allow it in Settings to take the photo for your punch.';

  @override
  String get cameraUnavailable =>
      'This phone has no camera the app can use, so you can\'t punch with a photo.';

  @override
  String get cameraFailed =>
      'The camera could not be opened. Please try again.';

  @override
  String get documentsTitle => 'My documents';

  @override
  String get documentsSubtitle => 'Letters, certificates and your service book';

  @override
  String get documentsLoadFailed => 'We could not load your documents.';

  @override
  String get documentsEmpty => 'HR hasn\'t shared any documents with you yet.';

  @override
  String get documentsNoEmployeeBody =>
      'Documents belong to an employee record, but none is linked to your login. If you think you should have one, ask your HR team.';

  @override
  String documentCategoryName(String category) {
    String _temp0 = intl.Intl.selectLogic(category, {
      'photo': 'Photo',
      'nid': 'National ID card',
      'birth_certificate': 'Birth certificate',
      'passport': 'Passport',
      'educational_certificate': 'Educational certificate',
      'experience_certificate': 'Experience certificate',
      'appointment_letter': 'Appointment letter',
      'contract': 'Contract',
      'medical_certificate': 'Medical certificate',
      'police_verification': 'Police verification',
      'nominee_form': 'Nominee form',
      'letter': 'Letter',
      'punch_selfie': 'Punch photo',
      'other': 'Document',
    });
    return '$_temp0';
  }

  @override
  String documentIssuedOn(String date) {
    return 'Issued $date';
  }

  @override
  String documentExpiresOn(String date) {
    return 'Expires $date';
  }

  @override
  String get documentExpired => 'Expired';

  @override
  String get documentExpiresSoon => 'Expires soon';

  @override
  String get documentSourceLetter => 'Letter from HR';

  @override
  String get documentSourceUpload => 'Uploaded by HR';

  @override
  String documentRefNo(String refNo) {
    return 'Ref. $refNo';
  }

  @override
  String get documentErrorNotShared =>
      'This document is no longer shared with you.';

  @override
  String get documentErrorGone => 'This document has been removed.';

  @override
  String get fileNoApp =>
      'No app on this phone can open this file. Install a PDF reader and try again.';

  @override
  String get fileOpenFailed =>
      'The file could not be opened. Please try again.';

  @override
  String get imageLoadFailed => 'This image could not be shown.';

  @override
  String get serviceBookTitle => 'My service book';

  @override
  String get serviceBookBody =>
      'Your service record, kept under section 6 of the Labour Act. It opens as a PDF in the app\'s language.';

  @override
  String get serviceBookOpen => 'Open PDF';

  @override
  String get payslipsTitle => 'Payslips';

  @override
  String get payslipsLoadFailed => 'We could not load your payslips.';

  @override
  String get payslipsEmpty =>
      'No payslips yet. They appear here once payroll publishes them.';

  @override
  String get payslipNetPay => 'Net pay';

  @override
  String payslipPaidOn(String date) {
    return 'Paid on $date';
  }

  @override
  String get payslipAdjustment => 'Adjustment';

  @override
  String get payslipOpenEnglish => 'Open in English';

  @override
  String get payslipOpenBangla => 'Open in Bangla';

  @override
  String get payslipErrorGone => 'This payslip is no longer available.';

  @override
  String get myPayTitle => 'My pay';

  @override
  String get myPaySubtitle => 'Payslips, tax, provident fund and loans';

  @override
  String get myPayTabTax => 'Tax';

  @override
  String get myPayTabProvidentFund => 'Provident fund';

  @override
  String get myPayTabLoans => 'Loans';

  @override
  String get payrollRunKindBonus => 'Bonus';

  @override
  String get payrollRunKindSettlement => 'Final settlement';

  @override
  String get payrollRunKindWppf => 'Participation fund';

  @override
  String get taxLoadFailed => 'We could not load your tax.';

  @override
  String get taxNoEmployeeBody =>
      'Salary tax belongs to an employee record, and your login is not linked to one. If you think it should be, ask your HR team.';

  @override
  String get taxYearSoFar => 'Year so far';

  @override
  String get taxSalaryPaid => 'Salary paid';

  @override
  String get taxDeducted => 'Tax deducted';

  @override
  String taxIncludesOpening(String salary, String tax) {
    return 'Includes $salary salary and $tax tax from earlier in the year, such as from a previous employer.';
  }

  @override
  String get taxForYear => 'Tax for the year (estimated)';

  @override
  String get taxThisMonth => 'This month';

  @override
  String get taxRebate => 'Rebate';

  @override
  String get taxThreshold => 'Tax-free threshold';

  @override
  String get taxMonthsLeft => 'Months left';

  @override
  String get taxNotWorkedOut =>
      'The year\'s tax shows here once payroll works it out from your salary.';

  @override
  String get taxMonthsTitle => 'Month by month';

  @override
  String get taxNoMonths => 'No salary paid in this year yet.';

  @override
  String taxMonthLine(String salary, String tax) {
    return 'Salary $salary · Tax $tax';
  }

  @override
  String taxChallan(String number) {
    return 'Challan $number';
  }

  @override
  String taxChallanOn(String number, String date) {
    return 'Challan $number, deposited $date';
  }

  @override
  String get taxCertificateTitle => 'Salary and tax certificate';

  @override
  String get taxCertificateBody =>
      'For your income tax return: your salary this year and the tax deducted from it. It opens as a PDF.';

  @override
  String get taxCertificateEnglish => 'Certificate (English)';

  @override
  String get taxCertificateBangla => 'Certificate (Bangla)';

  @override
  String get declarationTitle => 'Investment declaration';

  @override
  String get declarationHint =>
      'Declared investments lower the tax deducted each month; payroll checks your proofs and the accepted amounts then count instead.';

  @override
  String declarationStatusName(String status) {
    String _temp0 = intl.Intl.selectLogic(status, {
      'draft': 'Draft',
      'submitted': 'Submitted',
      'verified': 'Verified',
      'other': 'Unknown',
    });
    return '$_temp0';
  }

  @override
  String declarationSubmittedOn(String date) {
    return 'Submitted on $date';
  }

  @override
  String declarationVerifiedOn(String date) {
    return 'Verified on $date';
  }

  @override
  String investmentKindName(String kind) {
    String _temp0 = intl.Intl.selectLogic(kind, {
      'savings_certificate': 'Savings certificates',
      'dps': 'DPS',
      'life_insurance': 'Life insurance premium',
      'provident_fund_other': 'Other provident fund',
      'superannuation': 'Superannuation or benevolent fund',
      'universal_pension': 'Universal pension',
      'listed_shares': 'Listed shares',
      'mutual_fund': 'Mutual funds',
      'zakat': 'Zakat',
      'donation': 'Approved donations',
      'other': 'Other',
    });
    return '$_temp0';
  }

  @override
  String get declarationKind => 'Investment';

  @override
  String get declarationKindRequired => 'Choose what you invested in';

  @override
  String get declarationAmount => 'Amount (taka)';

  @override
  String get declarationAmountInvalid =>
      'Enter an amount like 12500 or 12500.50';

  @override
  String get declarationNote => 'Note (optional)';

  @override
  String get declarationAddRow => 'Add investment';

  @override
  String get declarationRemoveRow => 'Remove';

  @override
  String get declarationSaveDraft => 'Save draft';

  @override
  String get declarationSubmit => 'Submit to payroll';

  @override
  String get declarationSaved => 'Draft saved.';

  @override
  String get declarationSent => 'Sent to payroll.';

  @override
  String get declarationErrorVerified =>
      'Payroll has verified this declaration, so it can no longer be changed.';

  @override
  String get declarationErrorInvalid => 'Check the amounts and try again.';

  @override
  String get declarationTotal => 'Declared in all';

  @override
  String get declarationDeclared => 'Declared';

  @override
  String get declarationAccepted => 'Accepted';

  @override
  String get declarationEmpty => 'No investments declared.';

  @override
  String get pfLoadFailed => 'We could not load your provident fund.';

  @override
  String get pfNotMember => 'You are not a member of the provident fund.';

  @override
  String get pfTotal => 'Total balance';

  @override
  String get pfOwn => 'Your contributions';

  @override
  String get pfEmployer => 'Employer\'s contributions';

  @override
  String get pfPayable => 'Payable if you left today';

  @override
  String pfVested(String percent) {
    return 'Your contributions and $percent% of the employer\'s share';
  }

  @override
  String pfMemberSince(String date) {
    return 'Member since $date';
  }

  @override
  String pfLeftOn(String date) {
    return 'Left the fund on $date';
  }

  @override
  String get pfEntriesTitle => 'Statement';

  @override
  String get pfNoEntries => 'No entries yet.';

  @override
  String pfEntryKindName(String kind) {
    String _temp0 = intl.Intl.selectLogic(kind, {
      'opening': 'Opening balance',
      'contribution': 'Contribution',
      'interest': 'Interest',
      'loan_out': 'Loan taken',
      'loan_repaid': 'Loan repaid',
      'withdrawal': 'Withdrawal',
      'forfeited': 'Forfeited',
      'other': 'Entry',
    });
    return '$_temp0';
  }

  @override
  String pfAccountName(String account) {
    String _temp0 = intl.Intl.selectLogic(account, {
      'own': 'Your account',
      'employer': 'Employer\'s account',
      'other': 'Account',
    });
    return '$_temp0';
  }

  @override
  String get loansLoadFailed => 'We could not load your advances and loans.';

  @override
  String get loansEmpty => 'No advances or loans.';

  @override
  String loanKindName(String kind) {
    String _temp0 = intl.Intl.selectLogic(kind, {
      'advance': 'Salary advance',
      'loan': 'Loan',
      'pf_loan': 'Provident fund loan',
      'other': 'Loan',
    });
    return '$_temp0';
  }

  @override
  String loanStatusName(String status) {
    String _temp0 = intl.Intl.selectLogic(status, {
      'pending': 'Pending',
      'active': 'Active',
      'closed': 'Closed',
      'rejected': 'Rejected',
      'cancelled': 'Cancelled',
      'other': 'Unknown',
    });
    return '$_temp0';
  }

  @override
  String get loanPrincipal => 'Principal';

  @override
  String get loanInstallment => 'Per month';

  @override
  String get loanOutstanding => 'Outstanding';

  @override
  String get loanRepaid => 'Repaid';

  @override
  String get loanStartMonth => 'First deduction';

  @override
  String loanRepayments(num count) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Repayments ($countString)',
      zero: 'Repayments',
    );
    return '$_temp0';
  }

  @override
  String get loanNoRepayments => 'No repayments yet.';

  @override
  String get loanFromSalary => 'Deducted from salary';

  @override
  String get loanPaidIn => 'Paid in';

  @override
  String get resignationTitle => 'Resignation';

  @override
  String get resignationEntrySubtitle =>
      'Give notice, or follow your resignation';

  @override
  String get separationsLoadFailed => 'We could not load your resignation.';

  @override
  String get separationsNoEmployeeBody =>
      'Resigning needs an employee record, but none is linked to your login. If you think you should have one, ask your HR team.';

  @override
  String get separationsEarlier => 'Earlier';

  @override
  String separationTypeName(String type) {
    String _temp0 = intl.Intl.selectLogic(type, {
      'resignation': 'Resignation',
      'termination': 'Termination',
      'dismissal': 'Dismissal',
      'discharge': 'Discharge',
      'retrenchment': 'Retrenchment',
      'retirement': 'Retirement',
      'death': 'Death',
      'contract_end': 'End of contract',
      'other': 'Separation',
    });
    return '$_temp0';
  }

  @override
  String separationStatusName(String status) {
    String _temp0 = intl.Intl.selectLogic(status, {
      'pending': 'Pending',
      'approved': 'Approved',
      'completed': 'Completed',
      'rejected': 'Rejected',
      'cancelled': 'Cancelled',
      'other': 'Unknown',
    });
    return '$_temp0';
  }

  @override
  String get separationNoticeDate => 'Notice given on';

  @override
  String get separationLastWorkingDay => 'Last working day';

  @override
  String get separationNoticeRequired => 'Notice required';

  @override
  String get separationNoticeGiven => 'Notice given';

  @override
  String get separationNoNoticeRequired => 'None';

  @override
  String separationShortfall(String days) {
    return 'That is $days short of the notice the Labour Act asks for. Wages for the missing days may be deducted from your final settlement.';
  }

  @override
  String get resignationCancel => 'Withdraw resignation';

  @override
  String get resignationCancelTitle => 'Withdraw your resignation?';

  @override
  String resignationCancelBody(String date) {
    return 'Your resignation with the last working day $date will be withdrawn, and you stay in your job.';
  }

  @override
  String get resignationCancelled => 'Resignation withdrawn';

  @override
  String get resignHeading => 'Resign from your job';

  @override
  String get resignNoticeInfo =>
      'Under the Bangladesh Labour Act (section 27), a permanent worker gives 60 days\' written notice to resign, and a temporary worker on monthly wages 30 days. Your notice starts today. If you give less, wages for the missing days may be deducted from your final settlement.';

  @override
  String get resignLastDayRequired => 'Choose your last working day';

  @override
  String resignNoticeGiven(String days) {
    return 'That gives $days of notice.';
  }

  @override
  String get resignSubmit => 'Send resignation';

  @override
  String get resignConfirmTitle => 'Send your resignation?';

  @override
  String resignConfirmBody(String date) {
    return 'Your last working day will be $date. It goes to your manager, then HR. You can withdraw it while it is pending.';
  }

  @override
  String get resignConfirm => 'Resign';

  @override
  String get resignSent => 'Resignation sent for approval';

  @override
  String get resignErrorOpen =>
      'A resignation or separation is already in progress.';

  @override
  String get resignErrorSeparated => 'Your employment has already ended.';

  @override
  String get resignErrorPastLastDay =>
      'The last working day can\'t be in the past.';

  @override
  String get resignErrorNotOpen =>
      'This resignation has already been decided, so it can\'t be withdrawn.';

  @override
  String approvalSeparationDates(String notice, String lastDay) {
    return 'Notice $notice → last day $lastDay';
  }

  @override
  String approvalNoticeShort(String days) {
    return 'Notice short by $days';
  }

  @override
  String get approveSeparationTitle => 'Approve this resignation?';

  @override
  String get rejectSeparationTitle => 'Reject this resignation?';

  @override
  String get separationApproved => 'Resignation approved';

  @override
  String get separationRejected => 'Resignation rejected';

  @override
  String get signInWithEmail => 'Email';

  @override
  String get signInWithPhone => 'Mobile';

  @override
  String get mobileNumber => 'Mobile number';

  @override
  String get mobileNumberHint => 'e.g. 01712345678';

  @override
  String get mobileNumberRequired => 'Enter your mobile number';

  @override
  String get mobileNumberInvalid =>
      'Enter a Bangladesh mobile number, e.g. 01712345678';

  @override
  String get sendCode => 'Send code';

  @override
  String get otpTitle => 'Enter the code we sent';

  @override
  String otpSentBody(String phone, num minutes) {
    final intl.NumberFormat minutesNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String minutesString = minutesNumberFormat.format(minutes);

    String _temp0 = intl.Intl.pluralLogic(
      minutes,
      locale: localeName,
      other: '$minutesString minutes',
      one: '$minutesString minute',
    );
    return 'If $phone has a Good People login, a 6-digit code is on its way by SMS. It works for $_temp0.';
  }

  @override
  String get codeLabel => '6-digit code';

  @override
  String get codeRequired => 'Enter the 6-digit code';

  @override
  String get codeWrongOrExpired =>
      'That code is wrong or has expired. Check it, or ask for a new one.';

  @override
  String get sendCodeAgain => 'Send again';

  @override
  String sendCodeAgainHint(String seconds) {
    return 'Didn\'t get it? You can ask for a new code after $seconds seconds.';
  }

  @override
  String get codeSentAgain => 'A new code is on its way.';

  @override
  String get useDifferentNumber => 'Use a different number';

  @override
  String get twoStepTitle => 'Two-step sign-in';

  @override
  String get twoStepBody =>
      'Enter the 6-digit code from your authenticator app.';

  @override
  String get twoStepRecoveryBody =>
      'Enter one of your recovery codes, like k7qm-2xpd. Each one works once.';

  @override
  String get recoveryCodeLabel => 'Recovery code';

  @override
  String get recoveryCodeInvalid => 'Enter a recovery code like k7qm-2xpd';

  @override
  String get useRecoveryCode => 'Use a recovery code instead';

  @override
  String get useAuthenticatorCode => 'Use a code from the app instead';

  @override
  String get twoStepWrongCode =>
      'That code is wrong or has expired. Try again, or go back and sign in again.';

  @override
  String get verify => 'Verify';

  @override
  String get twoStepSetupTitle => 'Set up two-step sign-in first';

  @override
  String get twoStepSetupBody =>
      'Your role must use two-step sign-in. Set it up in the Good People web app, then sign in here.';

  @override
  String get back => 'Back';

  @override
  String get loginWrongCredentials => 'Wrong workspace, email or password';

  @override
  String get errorTooManyAttempts =>
      'Too many attempts. Please wait a few minutes and try again.';

  @override
  String errorTooManyAttemptsWait(num minutes) {
    final intl.NumberFormat minutesNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String minutesString = minutesNumberFormat.format(minutes);

    String _temp0 = intl.Intl.pluralLogic(
      minutes,
      locale: localeName,
      other: 'Too many attempts. Try again in $minutesString minutes.',
      one: 'Too many attempts. Try again in $minutesString minute.',
    );
    return '$_temp0';
  }

  @override
  String get errorLoginDisabled =>
      'This login is no longer active. Ask your HR team.';

  @override
  String get errorWrongPassword => 'Your current password is not right.';

  @override
  String get errorTenantSuspended =>
      'This workspace is suspended. Contact your administrator.';

  @override
  String get errorTenantReadOnly =>
      'This workspace is read-only for now, so changes can\'t be saved.';

  @override
  String get errorRoleNotAllowed => 'Your role can\'t do this.';

  @override
  String get errorFeatureNotInPlan =>
      'Your workspace\'s plan doesn\'t include this.';

  @override
  String get punchErrorOfflineTooOld =>
      'This punch was saved more than 72 hours ago, so it can\'t be added now. Ask for a correction instead.';

  @override
  String punchSavedOffline(String time) {
    return 'No connection. Your punch at $time is saved on this phone and will be sent when you\'re back online.';
  }

  @override
  String punchesWaiting(num count) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countString punches waiting to be sent',
      one: '$countString punch waiting to be sent',
    );
    return '$_temp0';
  }

  @override
  String punchesWaitingBody(String times) {
    return 'Taken without a connection at $times. The app sends them as soon as it can reach the server.';
  }

  @override
  String get punchesSendNow => 'Send now';

  @override
  String punchesSent(num count) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countString saved punches sent',
      one: '$countString saved punch sent',
    );
    return '$_temp0';
  }

  @override
  String punchRefusedTitle(String time, String date) {
    return 'Your punch at $time on $date was not recorded';
  }

  @override
  String get punchRefusedHint => 'To fix the day, ask for a correction.';

  @override
  String get dismiss => 'Dismiss';

  @override
  String get homePunchRefused =>
      'A punch saved without a connection was not recorded. Open Attendance to see why.';

  @override
  String get notificationsTitle => 'Notifications';

  @override
  String get notificationsEmpty => 'No notifications yet.';

  @override
  String get notificationsLoadFailed => 'We could not load your notifications.';

  @override
  String get notificationsMarkAllRead => 'Mark all as read';

  @override
  String notificationsUnread(num count) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Notifications, $countString unread',
      one: 'Notifications, $countString unread',
      zero: 'Notifications',
    );
    return '$_temp0';
  }

  @override
  String get notificationUnread => 'Unread';

  @override
  String get pushOpen => 'View';

  @override
  String get teamTitle => 'Team';

  @override
  String get teamSubtitle => 'Who is in today, and who is on leave';

  @override
  String get teamLoadFailed => 'We could not load your team.';

  @override
  String get teamEmpty => 'Nobody to show here.';

  @override
  String get teamAll => 'All';

  @override
  String get teamOnLeave => 'On leave this week';

  @override
  String get teamNoLeave => 'Nobody is on leave this week.';

  @override
  String get teamLeaveLoadFailed => 'We could not load who is on leave.';

  @override
  String get teamNoEmployeeBody =>
      'Team views need an employee record linked to your login.';

  @override
  String get accountTitle => 'Account';

  @override
  String get accountSubtitle => 'Sign-in, password and two-step sign-in';

  @override
  String get accountLoadFailed => 'We could not load your account.';

  @override
  String get accountName => 'Name';

  @override
  String get accountRole => 'Role';

  @override
  String get accountNotSet => 'Not set';

  @override
  String roleName(String role) {
    String _temp0 = intl.Intl.selectLogic(role, {
      'tenant_admin': 'Workspace admin',
      'hr_admin': 'HR admin',
      'hr_officer': 'HR officer',
      'attendance_officer': 'Attendance officer',
      'auditor': 'Auditor',
      'employee': 'Employee',
      'other': 'Unknown',
    });
    return '$_temp0';
  }

  @override
  String get accountTwoStep => 'Two-step sign-in';

  @override
  String get accountTwoStepOn => 'On';

  @override
  String get accountTwoStepOff => 'Off';

  @override
  String get accountTwoStepRequired => 'Required for your role.';

  @override
  String get accountTwoStepHint =>
      'Turn it on or off in the Good People web app.';

  @override
  String get accountNoPassword =>
      'You sign in with a code sent to your mobile, so there is no password to change.';

  @override
  String get changePassword => 'Change password';

  @override
  String get currentPassword => 'Current password';

  @override
  String get currentPasswordRequired => 'Enter your current password';

  @override
  String get newPassword => 'New password';

  @override
  String get newPasswordHint => 'At least 10 characters';

  @override
  String get confirmNewPassword => 'New password again';

  @override
  String get newPasswordTooShort => 'Use at least 10 characters';

  @override
  String get newPasswordSame => 'Choose a password you have not been using';

  @override
  String get newPasswordMismatch => 'The two new passwords are not the same';

  @override
  String get passwordChanged =>
      'Password changed. You stay signed in here; other phones and browsers were signed out.';

  @override
  String get timesheetTitle => 'Timesheet';

  @override
  String get timesheetSubtitle => 'Your hours on each project, even offline';

  @override
  String get timesheetPreviousMonth => 'Previous month';

  @override
  String get timesheetNextMonth => 'Next month';

  @override
  String get timesheetNoEmployeeBody =>
      'Timesheets belong to an employee record, but none is linked to your login. If you think you should have one, ask your HR team.';

  @override
  String get timesheetLoadFailed => 'We could not load your timesheet.';

  @override
  String get timesheetOffline =>
      'You are offline. This is the copy saved on your phone; hours you type are sent when you are back online.';

  @override
  String timesheetStatus(String status) {
    String _temp0 = intl.Intl.selectLogic(status, {
      'draft': 'Draft',
      'submitted': 'Submitted',
      'approved': 'Approved',
      'rejected': 'Returned',
      'other': 'Unknown',
    });
    return '$_temp0';
  }

  @override
  String get timesheetDue =>
      'You are allocated to a project this month. Fill in your hours and submit them at the end of the month.';

  @override
  String timesheetSubmittedNotice(String date) {
    return 'Submitted on $date. Waiting for approval.';
  }

  @override
  String timesheetApprovedNotice(String name, String date) {
    return 'Approved by $name on $date.';
  }

  @override
  String get timesheetRejectedNotice =>
      'Returned for correction. Change your hours and submit again.';

  @override
  String timesheetReopenedNotice(String note) {
    return 'HR reopened it: $note';
  }

  @override
  String get timesheetWeekend => 'Weekly holiday';

  @override
  String get timesheetOffDay => 'Day off';

  @override
  String timesheetLeave(String name) {
    return 'Leave: $name';
  }

  @override
  String timesheetWorked(String hours) {
    return 'Attendance $hours h';
  }

  @override
  String timesheetHours(String hours) {
    return '$hours h';
  }

  @override
  String get timesheetHoursUnit => 'h';

  @override
  String get timesheetOtherWork => 'Other work';

  @override
  String timesheetPlanned(String percent) {
    return 'Planned $percent%';
  }

  @override
  String timesheetShare(String hours, String percent) {
    return '$hours h · $percent%';
  }

  @override
  String timesheetTotal(String hours) {
    return 'Total $hours h';
  }

  @override
  String get timesheetNoHours => 'No hours';

  @override
  String timesheetEditDay(String date) {
    return 'Hours on $date';
  }

  @override
  String get timesheetHoursInvalid => 'Enter hours from 0 to 24, like 7.5';

  @override
  String get timesheetDayTooLong => 'A day cannot have more than 24 hours';

  @override
  String get timesheetSaveDay => 'Save';

  @override
  String get timesheetCancel => 'Cancel';

  @override
  String get timesheetAddProject => 'Add a project';

  @override
  String get timesheetUnsent => 'Not sent yet';

  @override
  String timesheetWaiting(num count) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countString changes waiting to be sent',
      one: '$countString change waiting to be sent',
    );
    return '$_temp0';
  }

  @override
  String get timesheetSendNow => 'Send now';

  @override
  String timesheetSent(num count) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countString changes sent',
      one: '$countString change sent',
    );
    return '$_temp0';
  }

  @override
  String get timesheetSavedOffline =>
      'Saved on your phone. It will be sent when you are online.';

  @override
  String timesheetRefusedTitle(String project, String date) {
    return 'Your hours for $project on $date were not saved';
  }

  @override
  String get timesheetPrefill => 'Fill from attendance';

  @override
  String timesheetPrefilled(num count) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countString days filled from attendance',
      one: '$countString day filled from attendance',
      zero: 'No day needed filling',
    );
    return '$_temp0';
  }

  @override
  String get timesheetSubmit => 'Submit';

  @override
  String get timesheetSubmitTitle => 'Submit your timesheet';

  @override
  String get timesheetDeclaration =>
      'I certify that the hours in this timesheet are the work I actually did in this month, on the projects shown.';

  @override
  String get timesheetDeclarationConfirm => 'I make this declaration';

  @override
  String get timesheetSubmitted => 'Timesheet submitted';

  @override
  String get timesheetSendFirst =>
      'Your changes have not reached the server yet. Send them before submitting.';

  @override
  String get timesheetNoProjects =>
      'There are no projects to charge hours to this month.';

  @override
  String get timesheetErrorLocked =>
      'This timesheet is submitted or approved, so it cannot change.';

  @override
  String get timesheetErrorEmpty => 'Enter your hours before submitting.';

  @override
  String get timesheetErrorMonthNotStarted =>
      'A month can be submitted once it has started.';

  @override
  String get timesheetErrorOutsideMonth => 'That day is not in this month.';

  @override
  String get timesheetErrorProjectUnknown => 'That project does not exist.';

  @override
  String get timesheetErrorProjectClosed => 'The project is closed.';

  @override
  String get timesheetErrorOtherCompany =>
      'The project belongs to another company.';

  @override
  String get timesheetErrorOutsidePeriod =>
      'The project was not running that day.';

  @override
  String get timesheetErrorDayOver24 => 'A day cannot have more than 24 hours.';

  @override
  String get timesheetErrorClientIdTaken =>
      'This entry belongs to someone else.';

  @override
  String get approvalTimesheetTitle => 'Project timesheet';

  @override
  String get approveTimesheetTitle => 'Approve this timesheet?';

  @override
  String get rejectTimesheetTitle => 'Reject this timesheet?';

  @override
  String get timesheetApproved => 'Timesheet approved';

  @override
  String get timesheetRejected => 'Timesheet returned for correction';

  @override
  String get approvalOpeningTitle => 'Job opening';

  @override
  String approvalOpeningPositions(num count, String type) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countString positions',
      one: '$countString position',
    );
    return '$_temp0, $type';
  }

  @override
  String get approvalOpeningNew => 'New position';

  @override
  String approvalOpeningReplaces(String name) {
    return 'Replaces $name';
  }

  @override
  String get approvalBudget => 'Monthly gross budget';

  @override
  String approvalBudgetUpTo(String amount) {
    return 'Up to $amount';
  }

  @override
  String approvalBudgetFrom(String amount) {
    return 'From $amount';
  }

  @override
  String get approvalHiringManager => 'Hiring manager';

  @override
  String get approvalJustification => 'Why it is needed';

  @override
  String get approveOpeningTitle => 'Approve this job opening?';

  @override
  String get rejectOpeningTitle => 'Reject this job opening?';

  @override
  String get openingApproved => 'Job opening approved';

  @override
  String get openingRejected => 'Job opening rejected';

  @override
  String get approvalOfferTitle => 'Offer above budget';

  @override
  String get approvalOfferPay => 'Monthly gross';

  @override
  String approvalOfferAgainstBudget(String amount, String budget) {
    return '$amount · budget up to $budget';
  }

  @override
  String get approvalOfferJoining => 'Joining';

  @override
  String approvalOfferDraftedBy(String name) {
    return 'Drafted by $name';
  }

  @override
  String get approveOfferTitle => 'Approve this offer?';

  @override
  String get rejectOfferTitle => 'Reject this offer?';

  @override
  String get offerApproved => 'Offer approved. HR can send it now.';

  @override
  String get offerRejected => 'Offer rejected';

  @override
  String get interviewsTitle => 'Interviews';

  @override
  String get interviewsSubtitle =>
      'The candidates you interview, their CVs and your scorecards';

  @override
  String interviewsToDo(num count) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countString interviews need you',
      one: '$countString interview needs you',
    );
    return '$_temp0';
  }

  @override
  String get myInterviewsTitle => 'My interviews';

  @override
  String get interviewsUpcoming => 'Coming up';

  @override
  String get interviewsPast => 'Past';

  @override
  String get interviewsNoUpcoming => 'No interviews coming up.';

  @override
  String get interviewsNoPast => 'None yet.';

  @override
  String get interviewsLoadFailed => 'We could not load your interviews.';

  @override
  String interviewKindName(String kind) {
    String _temp0 = intl.Intl.selectLogic(kind, {
      'in_person': 'In person',
      'phone': 'By phone',
      'video': 'By video',
      'other': 'Interview',
    });
    return '$_temp0';
  }

  @override
  String interviewStatusName(String status) {
    String _temp0 = intl.Intl.selectLogic(status, {
      'scheduled': 'Scheduled',
      'completed': 'Completed',
      'cancelled': 'Cancelled',
      'other': 'Unknown',
    });
    return '$_temp0';
  }

  @override
  String get interviewScorecardIn => 'Scorecard in';

  @override
  String get interviewScorecardToDo => 'Scorecard to do';

  @override
  String interviewForOpening(String title) {
    return 'For $title';
  }

  @override
  String get interviewTitle => 'Interview';

  @override
  String get interviewLoadFailed => 'We could not load this interview.';

  @override
  String get interviewGone => 'You are no longer on this interview\'s panel.';

  @override
  String get interviewWhen => 'When (Bangladesh time)';

  @override
  String get interviewPlace => 'Place';

  @override
  String get interviewPhoneNote => 'Phone note';

  @override
  String get interviewMeetingLink => 'Meeting link';

  @override
  String get interviewJoinCall => 'Join the video call';

  @override
  String get interviewLinkFailed => 'The link could not be opened.';

  @override
  String get interviewHrNotes => 'From HR';

  @override
  String get interviewCoverNote => 'The candidate\'s note';

  @override
  String get interviewOpenCv => 'Open the CV';

  @override
  String get interviewNoCv => 'No CV';

  @override
  String get interviewCvGone => 'The CV is no longer available.';

  @override
  String get interviewCvNoApp =>
      'No app on this phone can open this CV. Install a PDF or Word reader and try again.';

  @override
  String get interviewPanel => 'Panel';

  @override
  String get scorecardTitle => 'Your scorecard';

  @override
  String get scorecardIntro =>
      'Rate each criterion from 1 (poor) to 5 (excellent).';

  @override
  String get scorecardRateThis => 'Rate this from 1 to 5';

  @override
  String scorecardRatingOption(int rating) {
    final intl.NumberFormat ratingNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String ratingString = ratingNumberFormat.format(rating);

    return '$ratingString out of 5';
  }

  @override
  String scorecardRating(int rating) {
    final intl.NumberFormat ratingNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String ratingString = ratingNumberFormat.format(rating);

    return '$ratingString / 5';
  }

  @override
  String get scorecardRecommendation => 'Recommendation';

  @override
  String get scorecardChooseRecommendation => 'Choose a recommendation';

  @override
  String recommendationName(String value) {
    String _temp0 = intl.Intl.selectLogic(value, {
      'strong_no': 'Strong no',
      'no': 'No',
      'yes': 'Yes',
      'strong_yes': 'Strong yes',
      'other': 'Unknown',
    });
    return '$_temp0';
  }

  @override
  String get scorecardFeedback => 'Notes';

  @override
  String get scorecardFeedbackHint =>
      'About the interview and the work. The candidate can ask for these notes to be erased.';

  @override
  String get scorecardSubmit => 'Submit scorecard';

  @override
  String get scorecardUpdate => 'Update scorecard';

  @override
  String get scorecardSubmitted => 'Scorecard submitted';

  @override
  String get scorecardUpdated => 'Scorecard updated';

  @override
  String get scorecardIncomplete =>
      'Rate every criterion and choose a recommendation.';

  @override
  String scorecardSubmittedOn(String date) {
    return 'Submitted $date';
  }

  @override
  String get scorecardClosed =>
      'This application is closed, so scorecards can no longer change.';

  @override
  String get scorecardCancelled => 'This interview was cancelled.';

  @override
  String get scorecardCriteriaChanged =>
      'The criteria for this position have changed. Check your ratings and submit again.';

  @override
  String get scorecardOthersTitle => 'The other interviewers\' scorecards';

  @override
  String get scorecardOthersHidden =>
      'You will see the other interviewers\' scorecards once you have submitted yours, so that yours is your own view.';

  @override
  String get scorecardOthersNone =>
      'No one else has submitted a scorecard yet.';

  @override
  String get performanceTitle => 'Performance';

  @override
  String get performanceSubtitle =>
      'Your goals and reviews, and the feedback colleagues ask of you';

  @override
  String performanceTasksWaiting(num count) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countString tasks wait for you',
      one: '$countString task waits for you',
    );
    return '$_temp0';
  }

  @override
  String get performanceLoadFailed =>
      'We could not load your performance page.';

  @override
  String get performanceTasksTitle => 'What waits for you';

  @override
  String get performanceNoTasks => 'Nothing waits for you.';

  @override
  String performanceDueBy(String date) {
    return 'By $date';
  }

  @override
  String get performanceTaskOnWeb => 'Done in the Good People web app';

  @override
  String get performanceOnTheWeb =>
      'Writing your team\'s reviews, calibration, review cycles, improvement plans and probation reviews are done in the Good People web app.';

  @override
  String performancePercent(String value) {
    return '$value%';
  }

  @override
  String get performanceChooseRating => 'Choose a rating';

  @override
  String ratingName(String rating) {
    String _temp0 = intl.Intl.selectLogic(rating, {
      '1': 'Well below expectations',
      '2': 'Below expectations',
      '3': 'Meets expectations',
      '4': 'Above expectations',
      '5': 'Well above expectations',
      'other': 'Not rated',
    });
    return '$_temp0';
  }

  @override
  String taskSelfReview(String cycle) {
    return 'Your self review · $cycle';
  }

  @override
  String taskAcknowledge(String cycle) {
    return 'Read and acknowledge your review · $cycle';
  }

  @override
  String taskPeerAnswer(String person, String cycle) {
    return 'Feedback on $person · $cycle';
  }

  @override
  String taskPeerApprove(num count, String person) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Approve $countString peers for $person',
      one: 'Approve $countString peer for $person',
    );
    return '$_temp0';
  }

  @override
  String taskGoalsAgree(num count, String person) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'Agree $countString goals of $person',
      one: 'Agree $countString goal of $person',
    );
    return '$_temp0';
  }

  @override
  String taskManagerReview(String person, String cycle) {
    return 'Review $person · $cycle';
  }

  @override
  String taskNoManager(num count, String cycle) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countString reviews without a manager · $cycle',
      one: '$countString review without a manager · $cycle',
    );
    return '$_temp0';
  }

  @override
  String taskProbationReview(String person) {
    return 'Probation review of $person';
  }

  @override
  String get taskOther => 'A performance task';

  @override
  String get myGoalsTitle => 'My goals';

  @override
  String get myGoalsNone => 'You have no goals yet.';

  @override
  String myGoalsCounts(
    num total,
    String agreed,
    String draft,
    String completed,
  ) {
    final intl.NumberFormat totalNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String totalString = totalNumberFormat.format(total);

    String _temp0 = intl.Intl.pluralLogic(
      total,
      locale: localeName,
      other: '$totalString goals',
      one: '$totalString goal',
    );
    return '$_temp0: $agreed agreed, $draft still to agree, $completed completed.';
  }

  @override
  String get myReviewsTitle => 'My reviews';

  @override
  String get myReviewsNone => 'You have not been in a review cycle yet.';

  @override
  String get goalsLoadFailed => 'We could not load your goals.';

  @override
  String get goalsNoEmployee =>
      'This login has no employee record, so it has no goals of its own.';

  @override
  String get goalsNone => 'No goals yet.';

  @override
  String goalsAgreedWith(String name) {
    return 'Your goals are agreed with $name.';
  }

  @override
  String get goalsOutsideCycles => 'Outside review cycles';

  @override
  String get goalsDraftOnWeb =>
      'New goals are drafted, and goals changed, completed or dropped, in the Good People web app.';

  @override
  String get goalsSubmit => 'Submit for agreement';

  @override
  String goalsSubmitted(num count) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countString goals sent',
      one: '$countString goal sent',
    );
    return '$_temp0 to your manager for agreement.';
  }

  @override
  String get goalsSubmittedAlready =>
      'These goals were already sent; your manager has them.';

  @override
  String goalsReportsTo(String name) {
    return 'Reports to $name';
  }

  @override
  String goalKindName(String kind) {
    String _temp0 = intl.Intl.selectLogic(kind, {
      'objective': 'Objective',
      'kpi': 'KPI',
      'other': 'Goal',
    });
    return '$_temp0';
  }

  @override
  String goalStatusName(String status) {
    String _temp0 = intl.Intl.selectLogic(status, {
      'draft': 'Draft',
      'agreed': 'Agreed',
      'completed': 'Completed',
      'dropped': 'Dropped',
      'other': 'Unknown',
    });
    return '$_temp0';
  }

  @override
  String goalWeight(String weight) {
    return 'weight $weight';
  }

  @override
  String goalDue(String date) {
    return 'due $date';
  }

  @override
  String goalKeyResultsDone(String done, String total) {
    return '$done of $total key results done';
  }

  @override
  String goalMeasure(String value, String target, String unit) {
    return '$value $unit against a target of $target $unit';
  }

  @override
  String goalMeasureNone(String target, String unit) {
    return 'Target $target $unit; no value yet';
  }

  @override
  String goalMeasureShort(String current, String target, String unit) {
    return '$current of $target $unit';
  }

  @override
  String goalDirectionName(String direction) {
    String _temp0 = intl.Intl.selectLogic(direction, {
      'higher': 'higher is better',
      'lower': 'lower is better',
      'other': '',
    });
    return '$_temp0';
  }

  @override
  String get goalProgressLabel => 'Progress';

  @override
  String get goalTitle => 'Goal';

  @override
  String get goalLoadFailed => 'We could not load this goal.';

  @override
  String get goalGone => 'This goal is not open to you.';

  @override
  String goalDropped(String note) {
    return 'Dropped: $note';
  }

  @override
  String get goalProgressTitle => 'Progress';

  @override
  String goalReadingAttendance(
    String present,
    String working,
    String people,
    String from,
    String to,
  ) {
    return 'From attendance: present on $present of $working working days$people, $from to $to.';
  }

  @override
  String goalReadingPeople(String count) {
    return ' ($count people)';
  }

  @override
  String goalReadingNoAttendance(String from, String to) {
    return 'From attendance: no working days processed yet, $from to $to.';
  }

  @override
  String goalReadingProduction(
    String pieces,
    String target,
    String people,
    String from,
    String to,
  ) {
    return 'From production: $pieces pieces against a target of $target$people, $from to $to.';
  }

  @override
  String goalReadingNoProduction(String from, String to) {
    return 'From production: no work against a day target yet, $from to $to.';
  }

  @override
  String get goalReadingClosed =>
      'This goal is closed; its value is as it was last read.';

  @override
  String goalSourceHint(String source) {
    String _temp0 = intl.Intl.selectLogic(source, {
      'attendance_rate': 'Read from processed attendance: the share of scheduled working days present. Approved leave, weekly offs and holidays do not count against it.',
      'production_target': 'Read from daily production: pieces made against the day targets of the operations worked.',
      'other': 'The value is typed at each check-in.',
    });
    return '$_temp0';
  }

  @override
  String goalSourceName(String source) {
    String _temp0 = intl.Intl.selectLogic(source, {
      'manual': 'Typed in check-ins',
      'attendance_rate': 'Attendance rate, from attendance',
      'production_target': 'Output against target, from production',
      'other': 'Unknown',
    });
    return '$_temp0';
  }

  @override
  String get goalKeyResultDone => 'done';

  @override
  String get goalKeyResultOpen => 'not done yet';

  @override
  String get goalDetailsTitle => 'Details';

  @override
  String get goalStartsOn => 'Starts';

  @override
  String get goalDueOn => 'Due';

  @override
  String get goalValueFrom => 'Value from';

  @override
  String get goalServes => 'Serves';

  @override
  String get goalServesNothing => 'No other goal';

  @override
  String get goalCheckinsTitle => 'Check-ins';

  @override
  String get goalNoCheckins => 'No check-ins yet.';

  @override
  String goalCheckinValue(String value, String unit) {
    return 'value $value $unit';
  }

  @override
  String get goalAgree => 'Agree';

  @override
  String get goalAgreed => 'Agreed.';

  @override
  String goalAgreeAll(String count, String total) {
    return 'Agree all $count ($total)';
  }

  @override
  String goalAgreeAllNoCycle(String count) {
    return 'Agree all $count';
  }

  @override
  String goalWeights(String total) {
    return 'Weights: $total of 100%';
  }

  @override
  String goalWeightsSplit(String agreed, String draft) {
    return 'agreed $agreed, drafts $draft';
  }

  @override
  String get goalCheckinKeyResults => 'Key results done';

  @override
  String get goalCheckinProgress => 'Progress, in percent';

  @override
  String get goalCheckinProgressHint => 'How far the goal has come, 0 to 100.';

  @override
  String get goalCheckinProgressInvalid => 'Give a whole number from 0 to 100';

  @override
  String goalCheckinValueLabel(String unit) {
    return 'Value now ($unit)';
  }

  @override
  String get goalCheckinValueInvalid =>
      'Give a number, with at most two decimals';

  @override
  String get goalCheckinEmpty => 'Give the progress, a value or a note';

  @override
  String get goalCheckinFromRecords =>
      'The value comes from the records; add a note on how it is going.';

  @override
  String get goalCheckinNote => 'Note';

  @override
  String get goalCheckinNoteRequired => 'Write a note on how it is going';

  @override
  String get goalCheckinAdd => 'Add check-in';

  @override
  String get goalCheckinSaved => 'Check-in added.';

  @override
  String get goalErrorClosed => 'This goal is closed and no longer changes.';

  @override
  String get goalErrorCycleClosed =>
      'This review cycle is past setting goals; its goals no longer change.';

  @override
  String get goalErrorNotDraft => 'This goal is no longer a draft.';

  @override
  String get goalErrorWeightRequired =>
      'Give each goal of the cycle a weight, on the web, before agreeing it.';

  @override
  String get goalErrorWeightsOver =>
      'The agreed goals for this cycle would weigh more than 100%.';

  @override
  String get goalErrorWeightsTotal =>
      'A person\'s agreed goals for a cycle must weigh 100% together.';

  @override
  String get goalErrorNoDrafts => 'There are no draft goals to send or agree.';

  @override
  String get teamGoalsTitle => 'Goals to agree';

  @override
  String get teamGoalsLoadFailed => 'We could not load your team\'s goals.';

  @override
  String get teamGoalsNone => 'Nothing waits for your agreement.';

  @override
  String teamGoalsToAgree(num count) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countString goals wait for your agreement.',
      one: '$countString goal waits for your agreement.',
      zero: 'Nothing waits for your agreement.',
    );
    return '$_temp0';
  }

  @override
  String get reviewTitle => 'Review';

  @override
  String get reviewLoadFailed => 'We could not load this review.';

  @override
  String get reviewGone => 'This review is not open to you.';

  @override
  String reviewMine(String cycle) {
    return 'My review: $cycle';
  }

  @override
  String reviewManager(String name) {
    return 'Manager: $name';
  }

  @override
  String get reviewNoManager => 'No manager: HR writes it';

  @override
  String reviewStatusName(String status) {
    String _temp0 = intl.Intl.selectLogic(status, {
      'self': 'Self review',
      'manager': 'With the manager',
      'calibration': 'In calibration',
      'released': 'Released',
      'acknowledged': 'Acknowledged',
      'other': 'Unknown',
    });
    return '$_temp0';
  }

  @override
  String get reviewOnWeb =>
      'You read and write this review in the Good People web app.';

  @override
  String get reviewOutcome => 'Outcome';

  @override
  String get reviewFinalRating => 'Final rating';

  @override
  String get reviewGoalScore => 'Goal score';

  @override
  String get reviewReleasedOn => 'Released on';

  @override
  String get reviewNotRated => 'Not rated';

  @override
  String get reviewGoalsTitle => 'Goals';

  @override
  String get reviewNoGoals =>
      'No agreed goals for this cycle: the review rates the competencies only.';

  @override
  String get reviewSelfTitle => 'Self review';

  @override
  String get reviewWithManager =>
      'Submitted. Your manager reviews it next; you read the outcome once HR releases it.';

  @override
  String get reviewManagerOnly =>
      'Your manager reviews you for this cycle. You read the outcome once HR releases it.';

  @override
  String get reviewNoSelf => 'No self review in this review.';

  @override
  String get reviewManagerTitle => 'Manager\'s review';

  @override
  String get reviewNothingWritten => 'Nothing written yet.';

  @override
  String get reviewOverall => 'Overall';

  @override
  String get reviewNamePeersOnWeb =>
      'You can name colleagues to give feedback in the Good People web app.';

  @override
  String get reviewErrorStepClosed =>
      'This step of the review is no longer open for changes.';

  @override
  String get selfReviewIntro =>
      'Rate each goal and competency from 1 to 5, and say why. You can save a draft and come back; once submitted, your self review goes to your manager and cannot change.';

  @override
  String get selfReviewGoals => 'Goals';

  @override
  String get selfReviewCompetencies => 'Competencies';

  @override
  String get selfReviewComment => 'Comment (optional)';

  @override
  String get selfReviewOverall => 'Overall comment';

  @override
  String get selfReviewIncomplete =>
      'Rate every goal and competency before submitting.';

  @override
  String get selfReviewCommentUnrated =>
      'A comment is kept with its rating: choose one, or clear the comment.';

  @override
  String get selfReviewSaveDraft => 'Save draft';

  @override
  String get selfReviewSubmit => 'Submit to my manager';

  @override
  String get selfReviewSaved => 'Saved.';

  @override
  String get selfReviewSubmitted => 'Submitted. Your manager reviews it next.';

  @override
  String get selfReviewConfirmTitle => 'Submit your self review?';

  @override
  String get selfReviewConfirmBody =>
      'It goes to your manager, and your ratings and comments can no longer change.';

  @override
  String get acknowledgeTitle => 'Acknowledgement';

  @override
  String get acknowledgeIntro =>
      'Please read your review, then acknowledge it. You can say whether you agree, and add your comments; they stay on record with it.';

  @override
  String get acknowledgeQuestion => 'Do you agree with your review?';

  @override
  String get acknowledgeAgree => 'I agree';

  @override
  String get acknowledgeDisagree => 'I do not agree';

  @override
  String get acknowledgeComment => 'Your comments';

  @override
  String get acknowledgeCommentHint =>
      'Optional. Your manager and HR read them.';

  @override
  String get acknowledgeSubmit => 'Acknowledge';

  @override
  String get acknowledgeConfirmTitle => 'Acknowledge your review?';

  @override
  String get acknowledgeConfirmBody =>
      'Your answer and comments stay on record with the review and cannot change.';

  @override
  String get acknowledgeDone => 'Acknowledged.';

  @override
  String get acknowledgedAgreeing => 'Acknowledged, agreeing';

  @override
  String get acknowledgedDisagreeing => 'Acknowledged, not agreeing';

  @override
  String get acknowledgeErrorAlready =>
      'You have already acknowledged this review.';

  @override
  String get acknowledgeErrorNotReleased =>
      'This review has not been released yet.';

  @override
  String get peerFeedbackTitle => 'Peer feedback';

  @override
  String get peersLoadFailed => 'We could not load your peer feedback.';

  @override
  String get peersToApprove => 'Peers to approve';

  @override
  String get peersToAnswer => 'Feedback you are asked for';

  @override
  String get peersNoneToAnswer => 'Nobody has asked for your feedback.';

  @override
  String peerApproveLine(String peer, String person) {
    return '$peer for $person';
  }

  @override
  String get peerApprove => 'Approve';

  @override
  String get peerDecline => 'Decline';

  @override
  String get peerApproved => 'Approved. They have been asked for feedback.';

  @override
  String get peerDeclined => 'Declined.';

  @override
  String peerFeedbackOn(String person) {
    return 'Feedback on $person';
  }

  @override
  String get peerStatusAnswered => 'Answered';

  @override
  String get peerStatusWaiting => 'Waiting for you';

  @override
  String get peerStatusClosed => 'Closed';

  @override
  String get peerRequestLoadFailed => 'We could not load this request.';

  @override
  String get peerRequestGone => 'This request is not open to you.';

  @override
  String get peerRequestClosed => 'This feedback can no longer be given.';

  @override
  String get peerAnswerPrivacy =>
      'Answer honestly and kindly. The person sees your answers only together with those of other peers, and only when at least three have answered, never who wrote what; their manager sees each with its writer\'s name.';

  @override
  String peerQuestion(String question) {
    String _temp0 = intl.Intl.selectLogic(question, {
      'strengths': 'What does this person do well?',
      'improvements': 'What could they do better?',
      'other': 'Question',
    });
    return '$_temp0';
  }

  @override
  String get peerAnswerRequired => 'Write a few words';

  @override
  String get peerRating => 'Your overall rating';

  @override
  String get peerSend => 'Send my feedback';

  @override
  String get peerConfirmTitle => 'Send your feedback?';

  @override
  String get peerConfirmBody =>
      'Feedback is given once: it cannot be changed after it is sent.';

  @override
  String get peerThanks => 'Thank you. Your feedback has been sent.';

  @override
  String get peerYourAnswer => 'Your feedback';

  @override
  String get peerSummaryTooFew =>
      'Peer feedback is shown only when at least three peers have answered.';

  @override
  String peerSummaryAverage(String average) {
    return 'Average peer rating: $average';
  }

  @override
  String get peerSummaryTogether =>
      'Answers are shown together, never who wrote what.';

  @override
  String get peerErrorAnswered => 'You have already given your feedback.';

  @override
  String get peerErrorClosed => 'This review\'s peer feedback is closed.';

  @override
  String get peerErrorDecided =>
      'This peer has already been approved or declined.';

  @override
  String get learningTitle => 'Learning';

  @override
  String get learningSubtitle =>
      'Your training, required courses and completion records.';

  @override
  String get learningRequirements => 'My required training';

  @override
  String get learningNoneRequirements => 'No required courses in this view.';

  @override
  String get learningSessions => 'Sessions';

  @override
  String get learningNoneSessions => 'No sessions to show.';

  @override
  String get learningCertificates => 'Completion records';

  @override
  String get learningNoneCertificates => 'No completion records yet.';

  @override
  String get learningEnrol => 'Enrol me';

  @override
  String get learningWithdraw => 'Withdraw enrolment';

  @override
  String get learningCurrent => 'Current';

  @override
  String get learningDue => 'Due';

  @override
  String get learningOverdue => 'Overdue';

  @override
  String get learningEnrolled => 'Enrolled';

  @override
  String get learningWithdrawn => 'Withdrawn';

  @override
  String get learningAttended => 'Attended';

  @override
  String get learningAbsent => 'Absent';

  @override
  String get learningRevoked => 'Revoked';

  @override
  String get learningNoExpiry => 'No expiry';

  @override
  String get learningExpires => 'Valid through';

  @override
  String get learningDownload => 'Download English PDF';

  @override
  String get learningFull => 'This session is full.';

  @override
  String get learningStarted =>
      'Self enrolment and withdrawal close when the session starts.';

  @override
  String get learningFixed =>
      'Completed or cancelled sessions no longer accept changes.';

  @override
  String get learningManageOnWeb =>
      'Manage courses, attendance and fire drills on the web.';

  @override
  String get learningLoadFailed => 'Could not load training';

  @override
  String get learningUnknown => 'Recorded';

  @override
  String get learningExpired => 'Expired';

  @override
  String get serviceEngagement => 'Engagement';

  @override
  String get serviceServices => 'Employee services';

  @override
  String get serviceAnnouncements => 'Announcements';

  @override
  String get serviceSurveys => 'Surveys and eNPS';

  @override
  String get serviceRecognition => 'Recognition';

  @override
  String get serviceRequests => 'HR requests';

  @override
  String get serviceAssets => 'My issued assets';

  @override
  String get serviceInventory => 'Company inventory';

  @override
  String get serviceIntroEngagement =>
      'Company news, anonymous surveys and appreciation for colleagues.';

  @override
  String get serviceIntroServices =>
      'Private requests to your HR team and your issued assets.';

  @override
  String get serviceNoEmployee =>
      'An active employee record is needed to submit or acknowledge. HR tools are available below.';

  @override
  String get serviceEmpty => 'Nothing to show yet.';

  @override
  String get serviceSaved => 'Saved.';

  @override
  String get serviceHelp => 'Help';

  @override
  String get serviceHrOnWeb =>
      'HR authoring and management are available on the web.';

  @override
  String get serviceNewSurvey => 'Create survey';

  @override
  String get serviceNewAnnouncement => 'Create announcement';

  @override
  String get serviceNewRecognition => 'Recognize a colleague';

  @override
  String get serviceNewRequest => 'Open HR request';

  @override
  String get serviceNewAsset => 'Register asset';

  @override
  String get serviceAllRequests => 'HR service queue';

  @override
  String get serviceMyRequests => 'My requests';

  @override
  String get serviceCompany => 'Company';

  @override
  String get serviceEmployee => 'Employee';

  @override
  String get serviceEmployeeCode => 'Employee code';

  @override
  String get serviceTitle => 'Title (English)';

  @override
  String get serviceTitleBn => 'Title (Bangla)';

  @override
  String get serviceDescription => 'Description (English)';

  @override
  String get serviceDescriptionBn => 'Description (Bangla)';

  @override
  String get serviceBody => 'Text (English)';

  @override
  String get serviceBodyBn => 'Text (Bangla)';

  @override
  String get serviceClosesAt => 'Closes at (Dhaka time)';

  @override
  String get serviceThreshold => 'Minimum responses for results';

  @override
  String get serviceAnonymousNote =>
      'Anonymous: no individual answers are stored. HR sees only the fixed cohort’s totals after closing and at least five responses. There are no subgroup reports.';

  @override
  String get serviceCohortNote =>
      'Publishing freezes the company’s active employee audience. People without logins cannot respond by proxy.';

  @override
  String get serviceEnpsQuestion =>
      'How likely are you to recommend this company as a place to work?';

  @override
  String get serviceEnpsScale => '0 = not at all likely; 10 = extremely likely';

  @override
  String get servicePulseScale => '1 = strongly disagree; 5 = strongly agree';

  @override
  String get servicePulseQuestions => 'Pulse questions (optional, maximum 10)';

  @override
  String get serviceQuestion => 'Question (English)';

  @override
  String get serviceQuestionBn => 'Question (Bangla)';

  @override
  String get serviceAddQuestion => 'Add question';

  @override
  String get serviceRemove => 'Remove';

  @override
  String get serviceChoose => 'Choose';

  @override
  String get serviceSaveDraft => 'Save draft';

  @override
  String get serviceEditDraft => 'Edit draft';

  @override
  String get servicePublish => 'Publish';

  @override
  String get serviceCloseSurvey => 'Close survey';

  @override
  String get serviceSubmitSurvey => 'Submit anonymous response';

  @override
  String get serviceAlreadyResponded =>
      'Your anonymous response has been recorded.';

  @override
  String get serviceResults => 'Survey results';

  @override
  String serviceResultsProtected(Object minimum) {
    return 'Results are protected until the survey closes and at least $minimum people respond. No response count is disclosed before then.';
  }

  @override
  String get serviceResultsEmployee =>
      'Individual responses and survey results are not shown to employees.';

  @override
  String get serviceEnps => 'eNPS';

  @override
  String get serviceResponses => 'Responses';

  @override
  String get serviceEligible => 'Eligible employees';

  @override
  String get servicePromoters => 'Promoters (9–10)';

  @override
  String get servicePassives => 'Passives (7–8)';

  @override
  String get serviceDetractors => 'Detractors (0–6)';

  @override
  String get serviceMean => 'Mean';

  @override
  String get serviceDistribution => 'Counts for scores 1–5';

  @override
  String get serviceClosed => 'This survey is closed.';

  @override
  String get serviceFixed =>
      'Published wording is fixed. For a correction, retire this notice and publish a replacement.';

  @override
  String get serviceRequiresAcknowledgement =>
      'Require a policy acknowledgement';

  @override
  String get serviceDueOn => 'Due on';

  @override
  String get serviceExpiresOn => 'Expires after';

  @override
  String get servicePolicyNote =>
      'Acknowledgement records that you read this notice. It is not agreement to changed employment terms or an electronic signature.';

  @override
  String get serviceAcknowledge => 'I have read this notice';

  @override
  String get serviceAcknowledged => 'Acknowledged';

  @override
  String get serviceOutstanding => 'Outstanding';

  @override
  String get serviceRetire => 'Retire';

  @override
  String get serviceReason => 'Reason';

  @override
  String get serviceReceipts => 'Policy acknowledgement register';

  @override
  String get serviceExpired => 'Expired';

  @override
  String get servicePending => 'Pending';

  @override
  String get serviceValue => 'Value';

  @override
  String get serviceMessage => 'Message';

  @override
  String get serviceRecognitionNote =>
      'Your name and message will be visible to colleagues in your company.';

  @override
  String get serviceWithdrawRecognition => 'Withdraw / moderate';

  @override
  String get serviceFrom => 'From';

  @override
  String get serviceTo => 'To';

  @override
  String get serviceCategory => 'Category';

  @override
  String get servicePriority => 'Priority';

  @override
  String get serviceSubject => 'Subject';

  @override
  String get serviceRequestBody => 'Your request';

  @override
  String get serviceRequestPrivacy =>
      'Visible only to you and authorized HR handlers of this company. Managers do not inherit access. For a statutory grievance or harassment concern, use the dedicated grievance channel.';

  @override
  String get serviceGrievances => 'Grievance channel';

  @override
  String get serviceStatus => 'Status';

  @override
  String get serviceAssignee => 'HR handler';

  @override
  String get serviceUnassigned => 'Unassigned';

  @override
  String get serviceUpdateRequest => 'Update request';

  @override
  String get serviceReply => 'Send reply';

  @override
  String get serviceReplyBody => 'Reply';

  @override
  String get serviceInternal => 'HR-only internal note';

  @override
  String get serviceInternalLabel => 'Internal note — HR only';

  @override
  String get serviceResolve => 'Resolve request';

  @override
  String get serviceCloseRequest => 'Close resolved request';

  @override
  String get serviceReopen => 'Reopen request';

  @override
  String get serviceCreatedAt => 'Opened';

  @override
  String get serviceUpdatedAt => 'Updated';

  @override
  String get serviceRequestClosed =>
      'This request is closed. Reopen it to continue.';

  @override
  String get serviceTag => 'Asset tag';

  @override
  String get serviceName => 'Name (English)';

  @override
  String get serviceNameBn => 'Name (Bangla)';

  @override
  String get serviceKind => 'Kind';

  @override
  String get serviceSerialNumber => 'Serial number';

  @override
  String get serviceIssueAsset => 'Issue asset';

  @override
  String get serviceIssuedOn => 'Issued on';

  @override
  String get serviceCondition => 'Condition / notes';

  @override
  String get serviceIssueCondition => 'Condition when issued';

  @override
  String get serviceReturnCondition => 'Condition when returned';

  @override
  String get serviceReturnedOn => 'Returned on';

  @override
  String get serviceReturnAsset => 'Record return';

  @override
  String get serviceAcknowledgeAsset => 'I received this asset';

  @override
  String get serviceAssetNote =>
      'Receipt only; no automatic payroll deduction. HR records returns and corrections.';

  @override
  String get serviceOverdue => 'Overdue';

  @override
  String get serviceIssued => 'Issued';

  @override
  String get serviceAvailable => 'Available';

  @override
  String get serviceHistory => 'Issue history';

  @override
  String get serviceStatesDraft => 'Draft';

  @override
  String get serviceStatesOpen => 'Open';

  @override
  String get serviceStatesInProgress => 'In progress';

  @override
  String get serviceStatesResolved => 'Resolved';

  @override
  String get serviceStatesClosed => 'Closed';

  @override
  String get serviceStatesPublished => 'Published';

  @override
  String get serviceStatesRetired => 'Retired';

  @override
  String get serviceValuesTeamwork => 'Teamwork';

  @override
  String get serviceValuesService => 'Service';

  @override
  String get serviceValuesQuality => 'Quality';

  @override
  String get serviceValuesInitiative => 'Initiative';

  @override
  String get serviceCategoriesLetters => 'Letters';

  @override
  String get serviceCategoriesPay => 'Pay';

  @override
  String get serviceCategoriesLeave => 'Leave';

  @override
  String get serviceCategoriesBenefits => 'Benefits';

  @override
  String get serviceCategoriesOther => 'Other';

  @override
  String get servicePrioritiesNormal => 'Normal';

  @override
  String get servicePrioritiesUrgent => 'Urgent';

  @override
  String get serviceKindsLaptop => 'Laptop';

  @override
  String get serviceKindsPhone => 'Phone';

  @override
  String get serviceKindsIdCard => 'ID card';

  @override
  String get serviceKindsVehicle => 'Vehicle';

  @override
  String get serviceKindsEquipment => 'Equipment';

  @override
  String get serviceKindsOther => 'Other';

  @override
  String get serviceErrorsServiceEmployeeRequired =>
      'An active employee record is required.';

  @override
  String get serviceErrorsSurveyDates => 'Choose a future closing time.';

  @override
  String get serviceErrorsSurveyCohort =>
      'This company’s audience is smaller than the minimum reporting threshold.';

  @override
  String get serviceErrorsSurveyFixed => 'Published surveys are fixed.';

  @override
  String get serviceErrorsSurveyClosed => 'The survey is closed.';

  @override
  String get serviceErrorsSurveySubmitted => 'You already responded.';

  @override
  String get serviceErrorsSurveyAnswers => 'Answer every question.';

  @override
  String get serviceErrorsAnnouncementDates =>
      'Choose a valid current or future date.';

  @override
  String get serviceErrorsAnnouncementFixed =>
      'This notice is fixed or no longer accepts acknowledgements.';

  @override
  String get serviceErrorsRecognitionSelf =>
      'Recognize a colleague, not yourself.';

  @override
  String get serviceErrorsRecognitionHidden =>
      'This recognition was already withdrawn.';

  @override
  String get serviceErrorsHrHandler =>
      'Choose an active HR handler with access to this company.';

  @override
  String get serviceErrorsHrRequestClosed =>
      'Reopen the request before replying or changing it.';

  @override
  String get serviceErrorsHrRequestTransition =>
      'This status change is not available.';

  @override
  String get serviceErrorsAssetRetired => 'This asset is retired.';

  @override
  String get serviceErrorsAssetIssued =>
      'This asset is already issued. Record its return first.';

  @override
  String get serviceErrorsAssetReturned => 'This issue was already returned.';

  @override
  String get serviceErrorsAssetDates =>
      'Check the issue, due and return dates. Recorded events cannot be future dated.';

  @override
  String get serviceErrorsAssetEmployeeScope =>
      'The employee must work for this company on the issue date.';

  @override
  String get serviceUnknown => 'Not available';

  @override
  String get serviceCancel => 'Cancel';

  @override
  String get serviceFieldRequired => 'Complete this field.';

  @override
  String get ssoMethod => 'Organisation';

  @override
  String get ssoContinue => 'Continue with single sign-on';

  @override
  String get ssoFinish => 'Finish browser sign-in';

  @override
  String get ssoBrowserHint =>
      'Sign in through your organisation in the browser, then return here and finish.';

  @override
  String get ssoPending =>
      'Browser sign-in is not complete yet. Finish there, then try again.';
}
