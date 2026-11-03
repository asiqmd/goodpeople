import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_ar.dart';
import 'app_localizations_bn.dart';
import 'app_localizations_en.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('ar'),
    Locale('bn'),
    Locale('en'),
  ];

  /// Product name, shown on the login screen and in the OS task switcher.
  ///
  /// In en, this message translates to:
  /// **'Good People'**
  String get appTitle;

  /// No description provided for @signIn.
  ///
  /// In en, this message translates to:
  /// **'Sign in'**
  String get signIn;

  /// No description provided for @signInSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Sign in to your workspace'**
  String get signInSubtitle;

  /// No description provided for @workspace.
  ///
  /// In en, this message translates to:
  /// **'Workspace'**
  String get workspace;

  /// Hint for the workspace slug field. Keep the example slug in Latin letters.
  ///
  /// In en, this message translates to:
  /// **'e.g. your-company'**
  String get workspaceHint;

  /// No description provided for @email.
  ///
  /// In en, this message translates to:
  /// **'Email'**
  String get email;

  /// No description provided for @password.
  ///
  /// In en, this message translates to:
  /// **'Password'**
  String get password;

  /// No description provided for @showPassword.
  ///
  /// In en, this message translates to:
  /// **'Show password'**
  String get showPassword;

  /// No description provided for @hidePassword.
  ///
  /// In en, this message translates to:
  /// **'Hide password'**
  String get hidePassword;

  /// No description provided for @workspaceRequired.
  ///
  /// In en, this message translates to:
  /// **'Enter your workspace'**
  String get workspaceRequired;

  /// No description provided for @emailRequired.
  ///
  /// In en, this message translates to:
  /// **'Enter your email'**
  String get emailRequired;

  /// No description provided for @emailInvalid.
  ///
  /// In en, this message translates to:
  /// **'Enter a valid email address'**
  String get emailInvalid;

  /// No description provided for @passwordRequired.
  ///
  /// In en, this message translates to:
  /// **'Enter your password'**
  String get passwordRequired;

  /// No description provided for @signOut.
  ///
  /// In en, this message translates to:
  /// **'Sign out'**
  String get signOut;

  /// No description provided for @language.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get language;

  /// No description provided for @yourModules.
  ///
  /// In en, this message translates to:
  /// **'Your modules'**
  String get yourModules;

  /// No description provided for @signedInAs.
  ///
  /// In en, this message translates to:
  /// **'Signed in as {name}'**
  String signedInAs(String name);

  /// No description provided for @planLabel.
  ///
  /// In en, this message translates to:
  /// **'Plan'**
  String get planLabel;

  /// No description provided for @billingLabel.
  ///
  /// In en, this message translates to:
  /// **'Billing'**
  String get billingLabel;

  /// Subscription plan name for a plan code from the API.
  ///
  /// In en, this message translates to:
  /// **'{plan, select, starter{Starter} growth{Growth} business{Business} enterprise{Enterprise} other{Unknown}}'**
  String planName(String plan);

  /// How the workspace is billed, for a billing mode from the API.
  ///
  /// In en, this message translates to:
  /// **'{mode, select, paid{Paid} trial{Trial} complimentary{Complimentary} internal{Internal} partner{Partner} license{License} other{Unknown}}'**
  String billingModeName(String mode);

  /// No description provided for @readOnlyTitle.
  ///
  /// In en, this message translates to:
  /// **'Read-only access'**
  String get readOnlyTitle;

  /// No description provided for @readOnlyBody.
  ///
  /// In en, this message translates to:
  /// **'You can view data but not change it.'**
  String get readOnlyBody;

  /// No description provided for @suspendedTitle.
  ///
  /// In en, this message translates to:
  /// **'Access suspended'**
  String get suspendedTitle;

  /// No description provided for @suspendedBody.
  ///
  /// In en, this message translates to:
  /// **'This workspace is suspended. Contact your administrator to restore access.'**
  String get suspendedBody;

  /// No description provided for @moduleEnabled.
  ///
  /// In en, this message translates to:
  /// **'Enabled'**
  String get moduleEnabled;

  /// No description provided for @moduleLocked.
  ///
  /// In en, this message translates to:
  /// **'Locked'**
  String get moduleLocked;

  /// No description provided for @moduleCoreHr.
  ///
  /// In en, this message translates to:
  /// **'Core HR'**
  String get moduleCoreHr;

  /// No description provided for @moduleLeave.
  ///
  /// In en, this message translates to:
  /// **'Leave'**
  String get moduleLeave;

  /// No description provided for @moduleAttendance.
  ///
  /// In en, this message translates to:
  /// **'Attendance'**
  String get moduleAttendance;

  /// No description provided for @modulePayroll.
  ///
  /// In en, this message translates to:
  /// **'Payroll'**
  String get modulePayroll;

  /// No description provided for @moduleBdTax.
  ///
  /// In en, this message translates to:
  /// **'Bangladesh income tax'**
  String get moduleBdTax;

  /// No description provided for @moduleRecruitment.
  ///
  /// In en, this message translates to:
  /// **'Recruitment'**
  String get moduleRecruitment;

  /// No description provided for @modulePerformance.
  ///
  /// In en, this message translates to:
  /// **'Performance'**
  String get modulePerformance;

  /// No description provided for @moduleLms.
  ///
  /// In en, this message translates to:
  /// **'Learning'**
  String get moduleLms;

  /// No description provided for @moduleMultiEntity.
  ///
  /// In en, this message translates to:
  /// **'Multiple legal entities'**
  String get moduleMultiEntity;

  /// No description provided for @moduleApiAccess.
  ///
  /// In en, this message translates to:
  /// **'API access'**
  String get moduleApiAccess;

  /// No description provided for @moduleSso.
  ///
  /// In en, this message translates to:
  /// **'Single sign-on'**
  String get moduleSso;

  /// No description provided for @networkError.
  ///
  /// In en, this message translates to:
  /// **'Could not reach the server. Check your connection and try again.'**
  String get networkError;

  /// No description provided for @unexpectedError.
  ///
  /// In en, this message translates to:
  /// **'Something went wrong. Please try again.'**
  String get unexpectedError;

  /// No description provided for @sessionExpired.
  ///
  /// In en, this message translates to:
  /// **'Your session has ended. Please sign in again.'**
  String get sessionExpired;

  /// No description provided for @loadAccessFailed.
  ///
  /// In en, this message translates to:
  /// **'We could not load your workspace.'**
  String get loadAccessFailed;

  /// No description provided for @retry.
  ///
  /// In en, this message translates to:
  /// **'Try again'**
  String get retry;

  /// No description provided for @myProfile.
  ///
  /// In en, this message translates to:
  /// **'My profile'**
  String get myProfile;

  /// Under "My profile" on the home screen.
  ///
  /// In en, this message translates to:
  /// **'Your job, personal and payment details'**
  String get myProfileSubtitle;

  /// Profile section heading.
  ///
  /// In en, this message translates to:
  /// **'Job'**
  String get profileJob;

  /// Profile section heading.
  ///
  /// In en, this message translates to:
  /// **'Personal'**
  String get profilePersonal;

  /// Profile section heading.
  ///
  /// In en, this message translates to:
  /// **'Identity documents'**
  String get profileIdentity;

  /// Profile section heading.
  ///
  /// In en, this message translates to:
  /// **'Addresses'**
  String get profileAddresses;

  /// Profile section heading: people who receive the employee's dues if they die.
  ///
  /// In en, this message translates to:
  /// **'Nominees'**
  String get profileNominees;

  /// Profile section heading: where salary is paid.
  ///
  /// In en, this message translates to:
  /// **'Payment accounts'**
  String get profilePaymentAccounts;

  /// No description provided for @legalEntityLabel.
  ///
  /// In en, this message translates to:
  /// **'Legal entity'**
  String get legalEntityLabel;

  /// No description provided for @locationLabel.
  ///
  /// In en, this message translates to:
  /// **'Location'**
  String get locationLabel;

  /// Department, section, line or team.
  ///
  /// In en, this message translates to:
  /// **'Unit'**
  String get orgUnitLabel;

  /// No description provided for @designationLabel.
  ///
  /// In en, this message translates to:
  /// **'Designation'**
  String get designationLabel;

  /// No description provided for @gradeLabel.
  ///
  /// In en, this message translates to:
  /// **'Grade'**
  String get gradeLabel;

  /// No description provided for @managerLabel.
  ///
  /// In en, this message translates to:
  /// **'Manager'**
  String get managerLabel;

  /// No description provided for @managerValue.
  ///
  /// In en, this message translates to:
  /// **'{name} ({code})'**
  String managerValue(String name, String code);

  /// No description provided for @employmentTypeLabel.
  ///
  /// In en, this message translates to:
  /// **'Employment type'**
  String get employmentTypeLabel;

  /// No description provided for @workerCategoryLabel.
  ///
  /// In en, this message translates to:
  /// **'Worker category'**
  String get workerCategoryLabel;

  /// No description provided for @joinedOnLabel.
  ///
  /// In en, this message translates to:
  /// **'Joined'**
  String get joinedOnLabel;

  /// Date the employee was made permanent after probation.
  ///
  /// In en, this message translates to:
  /// **'Confirmed'**
  String get confirmedOnLabel;

  /// No description provided for @probationEndsOnLabel.
  ///
  /// In en, this message translates to:
  /// **'Probation ends'**
  String get probationEndsOnLabel;

  /// No description provided for @noCurrentJob.
  ///
  /// In en, this message translates to:
  /// **'No current job assignment'**
  String get noCurrentJob;

  /// No description provided for @fatherNameLabel.
  ///
  /// In en, this message translates to:
  /// **'Father\'s name'**
  String get fatherNameLabel;

  /// No description provided for @motherNameLabel.
  ///
  /// In en, this message translates to:
  /// **'Mother\'s name'**
  String get motherNameLabel;

  /// No description provided for @dateOfBirthLabel.
  ///
  /// In en, this message translates to:
  /// **'Date of birth'**
  String get dateOfBirthLabel;

  /// No description provided for @genderLabel.
  ///
  /// In en, this message translates to:
  /// **'Gender'**
  String get genderLabel;

  /// No description provided for @religionLabel.
  ///
  /// In en, this message translates to:
  /// **'Religion'**
  String get religionLabel;

  /// No description provided for @bloodGroupLabel.
  ///
  /// In en, this message translates to:
  /// **'Blood group'**
  String get bloodGroupLabel;

  /// No description provided for @mobilePhoneLabel.
  ///
  /// In en, this message translates to:
  /// **'Mobile phone'**
  String get mobilePhoneLabel;

  /// No description provided for @nidLabel.
  ///
  /// In en, this message translates to:
  /// **'National ID (NID)'**
  String get nidLabel;

  /// No description provided for @birthRegistrationLabel.
  ///
  /// In en, this message translates to:
  /// **'Birth registration'**
  String get birthRegistrationLabel;

  /// No description provided for @passportLabel.
  ///
  /// In en, this message translates to:
  /// **'Passport'**
  String get passportLabel;

  /// Bangladesh taxpayer identification number (e-TIN).
  ///
  /// In en, this message translates to:
  /// **'TIN'**
  String get tinLabel;

  /// No description provided for @presentAddressLabel.
  ///
  /// In en, this message translates to:
  /// **'Present address'**
  String get presentAddressLabel;

  /// No description provided for @permanentAddressLabel.
  ///
  /// In en, this message translates to:
  /// **'Permanent address'**
  String get permanentAddressLabel;

  /// Shown in a profile section that has no entries.
  ///
  /// In en, this message translates to:
  /// **'None recorded'**
  String get noneRecorded;

  /// Under a nominee's name. relation is free text entered by HR.
  ///
  /// In en, this message translates to:
  /// **'{relation} · {share}% share'**
  String nomineeDetails(String relation, num share);

  /// Marks the account salary is paid into by default.
  ///
  /// In en, this message translates to:
  /// **'Primary'**
  String get primaryAccount;

  /// Chip for a worker aged 14 to 17, whose hours the Labour Act limits.
  ///
  /// In en, this message translates to:
  /// **'Adolescent worker'**
  String get adolescentWorker;

  /// No description provided for @noEmployeeRecordTitle.
  ///
  /// In en, this message translates to:
  /// **'No employee record yet'**
  String get noEmployeeRecordTitle;

  /// No description provided for @noEmployeeRecordBody.
  ///
  /// In en, this message translates to:
  /// **'Your login is not linked to an employee record, so there is no profile to show. Workspace admins often don\'t have one. If you think you should, ask your HR team.'**
  String get noEmployeeRecordBody;

  /// No description provided for @loadProfileFailed.
  ///
  /// In en, this message translates to:
  /// **'We could not load your profile.'**
  String get loadProfileFailed;

  /// A value from the API that this app version does not recognise.
  ///
  /// In en, this message translates to:
  /// **'Unknown'**
  String get unknownValue;

  /// Gender for a gender code from the API.
  ///
  /// In en, this message translates to:
  /// **'{gender, select, male{Male} female{Female} third_gender{Third gender} other{Unknown}}'**
  String genderName(String gender);

  /// Religion for a religion code from the API. "other" is a real code; unknown codes arrive as "unknown".
  ///
  /// In en, this message translates to:
  /// **'{religion, select, islam{Islam} hinduism{Hinduism} buddhism{Buddhism} christianity{Christianity} unknown{Unknown} other{Other}}'**
  String religionName(String religion);

  /// Worker class from Bangladesh Labour Act s.4. Use the Act's Bangla terms.
  ///
  /// In en, this message translates to:
  /// **'{type, select, permanent{Permanent} probationer{Probationer} apprentice{Apprentice} badli{Badli (substitute)} casual{Casual} temporary{Temporary} seasonal{Seasonal} contractual{Contractual} other{Unknown}}'**
  String employmentTypeName(String type);

  /// A worker in the Labour Act sense, or officer and management staff.
  ///
  /// In en, this message translates to:
  /// **'{category, select, worker{Worker} staff{Staff} other{Unknown}}'**
  String workerCategoryName(String category);

  /// How salary is paid. mfs is a mobile financial service such as bKash.
  ///
  /// In en, this message translates to:
  /// **'{method, select, bank{Bank account} mfs{Mobile banking} cash{Cash} other{Unknown}}'**
  String paymentMethodName(String method);

  /// Mobile financial service brand for a provider key. Anything else, such as a bank name, is shown as sent.
  ///
  /// In en, this message translates to:
  /// **'{provider, select, bkash{bKash} nagad{Nagad} rocket{Rocket} upay{Upay} other{{provider}}}'**
  String paymentProviderName(String provider);

  /// Name of a Bangladesh division for a division code from the API.
  ///
  /// In en, this message translates to:
  /// **'{division, select, barishal{Barishal} chattogram{Chattogram} dhaka{Dhaka} khulna{Khulna} mymensingh{Mymensingh} rajshahi{Rajshahi} rangpur{Rangpur} sylhet{Sylhet} other{Unknown}}'**
  String divisionName(String division);

  /// Home card and screen title for leave (time off work).
  ///
  /// In en, this message translates to:
  /// **'Leave'**
  String get leaveTitle;

  /// Under "Leave" on the home screen.
  ///
  /// In en, this message translates to:
  /// **'Balances, requests and holidays'**
  String get leaveSubtitle;

  /// Leave screen tab.
  ///
  /// In en, this message translates to:
  /// **'Balances'**
  String get leaveTabBalances;

  /// Leave screen tab: the form to ask for leave.
  ///
  /// In en, this message translates to:
  /// **'Apply'**
  String get leaveTabApply;

  /// Leave screen tab.
  ///
  /// In en, this message translates to:
  /// **'My requests'**
  String get leaveTabRequests;

  /// Leave screen tab: other people's leave waiting for the user's decision.
  ///
  /// In en, this message translates to:
  /// **'Approvals'**
  String get leaveTabApprovals;

  /// Leave screen tab: the holiday calendar.
  ///
  /// In en, this message translates to:
  /// **'Holidays'**
  String get leaveTabHolidays;

  /// No description provided for @leaveLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'We could not load your leave.'**
  String get leaveLoadFailed;

  /// No description provided for @approvalsLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'We could not load your approvals.'**
  String get approvalsLoadFailed;

  /// No description provided for @holidaysLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'We could not load the holidays.'**
  String get holidaysLoadFailed;

  /// No description provided for @leaveNoEmployeeTitle.
  ///
  /// In en, this message translates to:
  /// **'No employee record'**
  String get leaveNoEmployeeTitle;

  /// No description provided for @leaveNoEmployeeBody.
  ///
  /// In en, this message translates to:
  /// **'Leave belongs to an employee record, and your login is not linked to one. If you think it should be, ask your HR team.'**
  String get leaveNoEmployeeBody;

  /// A number of leave days. count can be a half, such as 1.5.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{{count} day} other{{count} days}}'**
  String leaveDays(num count);

  /// Leave days the employee can still take.
  ///
  /// In en, this message translates to:
  /// **'Available'**
  String get leaveAvailable;

  /// In place of a balance, for leave granted per event (maternity).
  ///
  /// In en, this message translates to:
  /// **'On request'**
  String get leaveOnRequest;

  /// Leave days granted for the year.
  ///
  /// In en, this message translates to:
  /// **'Entitlement'**
  String get leaveEntitlement;

  /// No description provided for @leaveCarriedForward.
  ///
  /// In en, this message translates to:
  /// **'Carried forward'**
  String get leaveCarriedForward;

  /// Days HR added or removed by hand.
  ///
  /// In en, this message translates to:
  /// **'Adjustments'**
  String get leaveAdjustments;

  /// No description provided for @leaveTaken.
  ///
  /// In en, this message translates to:
  /// **'Taken'**
  String get leaveTaken;

  /// Days in requests still waiting for approval.
  ///
  /// In en, this message translates to:
  /// **'Pending'**
  String get leavePendingDays;

  /// Marks a leave type without pay.
  ///
  /// In en, this message translates to:
  /// **'Unpaid'**
  String get leaveUnpaid;

  /// No description provided for @leaveEligibleFrom.
  ///
  /// In en, this message translates to:
  /// **'Eligible from {date}'**
  String leaveEligibleFrom(String date);

  /// No description provided for @leaveNoTypes.
  ///
  /// In en, this message translates to:
  /// **'No leave types are set up yet.'**
  String get leaveNoTypes;

  /// No description provided for @leaveTypeLabel.
  ///
  /// In en, this message translates to:
  /// **'Leave type'**
  String get leaveTypeLabel;

  /// No description provided for @leaveTypeRequired.
  ///
  /// In en, this message translates to:
  /// **'Choose a leave type'**
  String get leaveTypeRequired;

  /// First day of the leave.
  ///
  /// In en, this message translates to:
  /// **'From'**
  String get leaveStartDate;

  /// Last day of the leave.
  ///
  /// In en, this message translates to:
  /// **'To'**
  String get leaveEndDate;

  /// No description provided for @leaveChooseDate.
  ///
  /// In en, this message translates to:
  /// **'Choose a date'**
  String get leaveChooseDate;

  /// No description provided for @leaveFullDay.
  ///
  /// In en, this message translates to:
  /// **'Full day'**
  String get leaveFullDay;

  /// Which half of the day a half-day leave covers.
  ///
  /// In en, this message translates to:
  /// **'{part, select, first_half{First half} second_half{Second half} other{Half day}}'**
  String halfDayName(String part);

  /// No description provided for @leaveReason.
  ///
  /// In en, this message translates to:
  /// **'Reason'**
  String get leaveReason;

  /// No description provided for @leaveReasonTooShort.
  ///
  /// In en, this message translates to:
  /// **'Write at least 3 characters'**
  String get leaveReasonTooShort;

  /// No description provided for @leaveDocumentHint.
  ///
  /// In en, this message translates to:
  /// **'{days, plural, one{A supporting document is needed for more than {days} day.} other{A supporting document is needed for more than {days} days.}}'**
  String leaveDocumentHint(num days);

  /// No description provided for @leaveCountsOffDaysHint.
  ///
  /// In en, this message translates to:
  /// **'Weekly offs and holidays between the dates count as leave days.'**
  String get leaveCountsOffDaysHint;

  /// No description provided for @leavePreviewHint.
  ///
  /// In en, this message translates to:
  /// **'Choose a leave type and dates to see how many days this takes.'**
  String get leavePreviewHint;

  /// No description provided for @leaveDaysLabel.
  ///
  /// In en, this message translates to:
  /// **'Leave days'**
  String get leaveDaysLabel;

  /// Heading over the weekly offs and holidays inside the dates.
  ///
  /// In en, this message translates to:
  /// **'Not counted'**
  String get leaveNotCounted;

  /// Why a date inside the leave is not counted.
  ///
  /// In en, this message translates to:
  /// **'{reason, select, weekly_off{Weekly off} holiday{Holiday} other{Not counted}}'**
  String excludedDayReason(String reason);

  /// No description provided for @excludedDayWithName.
  ///
  /// In en, this message translates to:
  /// **'{reason}: {name}'**
  String excludedDayWithName(String reason, String name);

  /// Above the reasons, from the API in English, that the request would be refused.
  ///
  /// In en, this message translates to:
  /// **'This request can\'t be sent yet:'**
  String get leaveProblemsTitle;

  /// No description provided for @leaveSubmit.
  ///
  /// In en, this message translates to:
  /// **'Send request'**
  String get leaveSubmit;

  /// No description provided for @leaveSubmitted.
  ///
  /// In en, this message translates to:
  /// **'Leave request sent'**
  String get leaveSubmitted;

  /// No description provided for @leaveSubmittedBody.
  ///
  /// In en, this message translates to:
  /// **'Your approvers can see it now. Follow it under My requests.'**
  String get leaveSubmittedBody;

  /// No description provided for @leaveViewRequests.
  ///
  /// In en, this message translates to:
  /// **'See my requests'**
  String get leaveViewRequests;

  /// No description provided for @leaveApplyAgain.
  ///
  /// In en, this message translates to:
  /// **'Apply for more leave'**
  String get leaveApplyAgain;

  /// No description provided for @leaveNoRequests.
  ///
  /// In en, this message translates to:
  /// **'No leave requests in {year}.'**
  String leaveNoRequests(String year);

  /// A leave request's status from the API.
  ///
  /// In en, this message translates to:
  /// **'{status, select, pending{Pending} approved{Approved} rejected{Rejected} cancelled{Cancelled} other{Unknown}}'**
  String leaveStatusName(String status);

  /// Who decides an approval step.
  ///
  /// In en, this message translates to:
  /// **'{kind, select, manager{Manager} hr{HR} other{Approver}}'**
  String approvalStepKindName(String kind);

  /// One approval step's status from the API.
  ///
  /// In en, this message translates to:
  /// **'{status, select, waiting{Waiting for previous step} pending{Awaiting decision} approved{Approved} rejected{Rejected} skipped{Skipped} cancelled{Cancelled} other{Unknown}}'**
  String approvalStepStatusName(String status);

  /// Approver of an HR step, which any HR admin can decide.
  ///
  /// In en, this message translates to:
  /// **'HR team'**
  String get approvalHrTeam;

  /// Heading over a request's approval steps.
  ///
  /// In en, this message translates to:
  /// **'Approval'**
  String get approvalTrail;

  /// No description provided for @approvalStepTitle.
  ///
  /// In en, this message translates to:
  /// **'{kind}: {approver}'**
  String approvalStepTitle(String kind, String approver);

  /// Who decided an approval step, and when.
  ///
  /// In en, this message translates to:
  /// **'{name}, {date}'**
  String approvalDecidedBy(String name, String date);

  /// No description provided for @leaveNeedsDocument.
  ///
  /// In en, this message translates to:
  /// **'Supporting document needed'**
  String get leaveNeedsDocument;

  /// No description provided for @leaveCancelRequest.
  ///
  /// In en, this message translates to:
  /// **'Cancel request'**
  String get leaveCancelRequest;

  /// No description provided for @leaveCancelTitle.
  ///
  /// In en, this message translates to:
  /// **'Cancel this request?'**
  String get leaveCancelTitle;

  /// No description provided for @leaveCancelBody.
  ///
  /// In en, this message translates to:
  /// **'{type}, {dates}. Days not yet taken go back to your balance.'**
  String leaveCancelBody(String type, String dates);

  /// Closes the cancel dialog without cancelling.
  ///
  /// In en, this message translates to:
  /// **'Keep it'**
  String get leaveKeepRequest;

  /// No description provided for @leaveCancelled.
  ///
  /// In en, this message translates to:
  /// **'Request cancelled'**
  String get leaveCancelled;

  /// No description provided for @approvalYourStep.
  ///
  /// In en, this message translates to:
  /// **'Your step: {kind}'**
  String approvalYourStep(String kind);

  /// The requester's balance for this leave type.
  ///
  /// In en, this message translates to:
  /// **'Their balance'**
  String get approvalBalance;

  /// No description provided for @approvalAvailable.
  ///
  /// In en, this message translates to:
  /// **'{days} available'**
  String approvalAvailable(String days);

  /// No description provided for @approve.
  ///
  /// In en, this message translates to:
  /// **'Approve'**
  String get approve;

  /// No description provided for @reject.
  ///
  /// In en, this message translates to:
  /// **'Reject'**
  String get reject;

  /// No description provided for @approveTitle.
  ///
  /// In en, this message translates to:
  /// **'Approve this leave?'**
  String get approveTitle;

  /// No description provided for @rejectTitle.
  ///
  /// In en, this message translates to:
  /// **'Reject this leave?'**
  String get rejectTitle;

  /// No description provided for @decisionComment.
  ///
  /// In en, this message translates to:
  /// **'Comment (optional)'**
  String get decisionComment;

  /// No description provided for @leaveApproved.
  ///
  /// In en, this message translates to:
  /// **'Leave approved'**
  String get leaveApproved;

  /// No description provided for @leaveRejected.
  ///
  /// In en, this message translates to:
  /// **'Leave rejected'**
  String get leaveRejected;

  /// No description provided for @approvalsEmpty.
  ///
  /// In en, this message translates to:
  /// **'Nothing is waiting for you.'**
  String get approvalsEmpty;

  /// Kind of holiday from the API.
  ///
  /// In en, this message translates to:
  /// **'{kind, select, public{Public holiday} festival{Festival holiday} optional{Optional holiday} company{Company holiday} other{Holiday}}'**
  String holidayKindName(String kind);

  /// A lunar holiday date not yet confirmed by the moon sighting.
  ///
  /// In en, this message translates to:
  /// **'Tentative'**
  String get holidayTentative;

  /// No description provided for @holidaysTentativeNote.
  ///
  /// In en, this message translates to:
  /// **'Tentative dates depend on the moon sighting and can move.'**
  String get holidaysTentativeNote;

  /// No description provided for @holidaysNone.
  ///
  /// In en, this message translates to:
  /// **'No holidays in {year}.'**
  String holidaysNone(String year);

  /// No description provided for @holidaysNoCalendar.
  ///
  /// In en, this message translates to:
  /// **'No holiday calendar has been set up yet.'**
  String get holidaysNoCalendar;

  /// No description provided for @attendanceTitle.
  ///
  /// In en, this message translates to:
  /// **'Attendance'**
  String get attendanceTitle;

  /// Under "Attendance" on the home screen.
  ///
  /// In en, this message translates to:
  /// **'Punch in and out, your month and corrections'**
  String get attendanceSubtitle;

  /// No description provided for @attendanceTabToday.
  ///
  /// In en, this message translates to:
  /// **'Today'**
  String get attendanceTabToday;

  /// No description provided for @attendanceTabMonth.
  ///
  /// In en, this message translates to:
  /// **'This month'**
  String get attendanceTabMonth;

  /// Tab with the user's attendance corrections (regularizations).
  ///
  /// In en, this message translates to:
  /// **'Corrections'**
  String get attendanceTabCorrections;

  /// No description provided for @attendanceLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'We could not load your attendance.'**
  String get attendanceLoadFailed;

  /// No description provided for @attendanceNoEmployeeBody.
  ///
  /// In en, this message translates to:
  /// **'Attendance belongs to an employee record, but none is linked to your login. If you think you should have one, ask your HR team.'**
  String get attendanceNoEmployeeBody;

  /// A day's attendance status from the API. pending: the day is not over yet. missing_punch: only one punch, so the hours are unknown.
  ///
  /// In en, this message translates to:
  /// **'{status, select, present{Present} half_day{Half day} absent{Absent} on_leave{On leave} missing_punch{Missing punch} off{Off} pending{In progress} other{Unknown}}'**
  String attendanceStatusName(String status);

  /// A mark on an attendance day. over_daily_limit: worked more hours than the Labour Act allows in a day.
  ///
  /// In en, this message translates to:
  /// **'{flag, select, late{Late} early_out{Left early} over_daily_limit{Over daily limit} regularized{Corrected} on_duty{On duty} outside_geofence{Outside work area} other{Note}}'**
  String attendanceFlagName(String flag);

  /// No description provided for @dayTypeName.
  ///
  /// In en, this message translates to:
  /// **'{type, select, working{Working day} weekly_off{Weekly off} holiday{Holiday} other{Day}}'**
  String dayTypeName(String type);

  /// Where a punch came from: an attendance device, the web or mobile app, HR by hand, or an approved correction.
  ///
  /// In en, this message translates to:
  /// **'{source, select, device{Device} web{Web} mobile{Mobile app} manual{Added by HR} regularization{Correction} other{Other}}'**
  String punchSourceName(String source);

  /// No description provided for @punchDirectionName.
  ///
  /// In en, this message translates to:
  /// **'{direction, select, in{In} out{Out} other{Punch}}'**
  String punchDirectionName(String direction);

  /// missed_punch: add a punch the device missed. on_duty: official work away from the workplace.
  ///
  /// In en, this message translates to:
  /// **'{kind, select, missed_punch{Missed punch} on_duty{On duty} other{Correction}}'**
  String regularizationKindName(String kind);

  /// No description provided for @attendanceNoShift.
  ///
  /// In en, this message translates to:
  /// **'No shift scheduled'**
  String get attendanceNoShift;

  /// No description provided for @attendanceFirstIn.
  ///
  /// In en, this message translates to:
  /// **'First in'**
  String get attendanceFirstIn;

  /// No description provided for @attendanceLastOut.
  ///
  /// In en, this message translates to:
  /// **'Last out'**
  String get attendanceLastOut;

  /// Hours and minutes worked, shown as h:mm.
  ///
  /// In en, this message translates to:
  /// **'Worked'**
  String get attendanceWorked;

  /// No description provided for @attendanceOvertime.
  ///
  /// In en, this message translates to:
  /// **'Overtime'**
  String get attendanceOvertime;

  /// No description provided for @attendanceLateBy.
  ///
  /// In en, this message translates to:
  /// **'Late {duration}'**
  String attendanceLateBy(String duration);

  /// No description provided for @attendanceEarlyOutBy.
  ///
  /// In en, this message translates to:
  /// **'Left early {duration}'**
  String attendanceEarlyOutBy(String duration);

  /// Overtime badge on a day.
  ///
  /// In en, this message translates to:
  /// **'OT {duration}'**
  String attendanceOvertimeBy(String duration);

  /// No description provided for @attendanceLeaveCode.
  ///
  /// In en, this message translates to:
  /// **'Leave: {code}'**
  String attendanceLeaveCode(String code);

  /// No description provided for @attendanceHolidayNamed.
  ///
  /// In en, this message translates to:
  /// **'Holiday: {name}'**
  String attendanceHolidayNamed(String name);

  /// A correction asked for this day, and its status.
  ///
  /// In en, this message translates to:
  /// **'Correction: {status}'**
  String attendanceCorrectionStatus(String status);

  /// No description provided for @punchIn.
  ///
  /// In en, this message translates to:
  /// **'Punch in'**
  String get punchIn;

  /// No description provided for @punchOut.
  ///
  /// In en, this message translates to:
  /// **'Punch out'**
  String get punchOut;

  /// No description provided for @punchedIn.
  ///
  /// In en, this message translates to:
  /// **'Punched in'**
  String get punchedIn;

  /// No description provided for @punchedOut.
  ///
  /// In en, this message translates to:
  /// **'Punched out'**
  String get punchedOut;

  /// No description provided for @punchLocating.
  ///
  /// In en, this message translates to:
  /// **'Finding your location…'**
  String get punchLocating;

  /// No description provided for @punchGeofencedHint.
  ///
  /// In en, this message translates to:
  /// **'When you punch, your location is checked against your workplace area.'**
  String get punchGeofencedHint;

  /// No description provided for @punchAnywhereHint.
  ///
  /// In en, this message translates to:
  /// **'You can punch from anywhere. If you allow it, your location is sent too.'**
  String get punchAnywhereHint;

  /// No description provided for @punchBlockedDisabled.
  ///
  /// In en, this message translates to:
  /// **'Punching from the app is turned off for your workspace. Use the attendance device at work.'**
  String get punchBlockedDisabled;

  /// No description provided for @punchBlockedNoGeofence.
  ///
  /// In en, this message translates to:
  /// **'Your workplace has no punch area set yet, so you can\'t punch from the app. Ask HR to set one.'**
  String get punchBlockedNoGeofence;

  /// No description provided for @punchBlockedOther.
  ///
  /// In en, this message translates to:
  /// **'Punching from the app isn\'t available right now.'**
  String get punchBlockedOther;

  /// No description provided for @todaysPunches.
  ///
  /// In en, this message translates to:
  /// **'Today\'s punches'**
  String get todaysPunches;

  /// No description provided for @noPunchesYet.
  ///
  /// In en, this message translates to:
  /// **'No punches yet.'**
  String get noPunchesYet;

  /// A punch HR voided: kept on record but not counted.
  ///
  /// In en, this message translates to:
  /// **'Voided'**
  String get punchVoided;

  /// No description provided for @locationServicesOff.
  ///
  /// In en, this message translates to:
  /// **'Location is turned off on this phone. Turn it on to punch.'**
  String get locationServicesOff;

  /// No description provided for @locationPermissionDenied.
  ///
  /// In en, this message translates to:
  /// **'Allow location access so the app can check that you are at your workplace.'**
  String get locationPermissionDenied;

  /// No description provided for @locationPermissionBlocked.
  ///
  /// In en, this message translates to:
  /// **'Location access is blocked for this app. Allow it in Settings to punch.'**
  String get locationPermissionBlocked;

  /// No description provided for @locationTimeout.
  ///
  /// In en, this message translates to:
  /// **'Your location could not be found. Move to an open area and try again.'**
  String get locationTimeout;

  /// No description provided for @locationFailed.
  ///
  /// In en, this message translates to:
  /// **'Your location could not be read. Please try again.'**
  String get locationFailed;

  /// No description provided for @openSettings.
  ///
  /// In en, this message translates to:
  /// **'Open settings'**
  String get openSettings;

  /// No description provided for @punchErrorOutsideGeofence.
  ///
  /// In en, this message translates to:
  /// **'You are about {distance} m from your workplace. You can punch within {radius} m of it.'**
  String punchErrorOutsideGeofence(String distance, String radius);

  /// No description provided for @punchErrorOutsideArea.
  ///
  /// In en, this message translates to:
  /// **'You are outside your workplace area, so you can\'t punch here.'**
  String get punchErrorOutsideArea;

  /// No description provided for @punchErrorLocationRequired.
  ///
  /// In en, this message translates to:
  /// **'Allow location access to punch in or out.'**
  String get punchErrorLocationRequired;

  /// No description provided for @punchErrorTooSoon.
  ///
  /// In en, this message translates to:
  /// **'You punched less than a minute ago. Wait a moment before punching again.'**
  String get punchErrorTooSoon;

  /// No description provided for @punchErrorSeparated.
  ///
  /// In en, this message translates to:
  /// **'Your employment has ended, so you can\'t punch.'**
  String get punchErrorSeparated;

  /// No description provided for @correctionErrorFutureDay.
  ///
  /// In en, this message translates to:
  /// **'You can only correct days that have already started.'**
  String get correctionErrorFutureDay;

  /// No description provided for @correctionErrorOutsideWindow.
  ///
  /// In en, this message translates to:
  /// **'This day is too far back to correct from the app. Ask HR to fix it.'**
  String get correctionErrorOutsideWindow;

  /// No description provided for @correctionErrorNotTracked.
  ///
  /// In en, this message translates to:
  /// **'Attendance wasn\'t tracked on that day, so there is nothing to correct.'**
  String get correctionErrorNotTracked;

  /// No description provided for @correctionErrorWrongDay.
  ///
  /// In en, this message translates to:
  /// **'That time belongs to another day\'s shift. Check the date and times.'**
  String get correctionErrorWrongDay;

  /// No description provided for @correctionErrorFuturePunch.
  ///
  /// In en, this message translates to:
  /// **'A punch time can\'t be in the future.'**
  String get correctionErrorFuturePunch;

  /// No description provided for @correctionErrorAlreadyPending.
  ///
  /// In en, this message translates to:
  /// **'A correction for this day is already waiting for approval.'**
  String get correctionErrorAlreadyPending;

  /// No description provided for @correctionErrorNotPending.
  ///
  /// In en, this message translates to:
  /// **'This correction has already been decided.'**
  String get correctionErrorNotPending;

  /// No description provided for @attendanceMonthEmpty.
  ///
  /// In en, this message translates to:
  /// **'No attendance days yet this month.'**
  String get attendanceMonthEmpty;

  /// Spoken hint on a day in the month list; tapping it opens the correction form.
  ///
  /// In en, this message translates to:
  /// **'Request a correction for this day'**
  String get attendanceCorrectDay;

  /// No description provided for @correctionRequest.
  ///
  /// In en, this message translates to:
  /// **'Request correction'**
  String get correctionRequest;

  /// No description provided for @correctionsEmpty.
  ///
  /// In en, this message translates to:
  /// **'You haven\'t asked for any corrections.'**
  String get correctionsEmpty;

  /// No description provided for @correctionsLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'We could not load your corrections.'**
  String get correctionsLoadFailed;

  /// No description provided for @correctionInAt.
  ///
  /// In en, this message translates to:
  /// **'In {time}'**
  String correctionInAt(String time);

  /// No description provided for @correctionOutAt.
  ///
  /// In en, this message translates to:
  /// **'Out {time}'**
  String correctionOutAt(String time);

  /// No description provided for @correctionCancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel correction'**
  String get correctionCancel;

  /// No description provided for @correctionCancelTitle.
  ///
  /// In en, this message translates to:
  /// **'Cancel this correction?'**
  String get correctionCancelTitle;

  /// No description provided for @correctionCancelBody.
  ///
  /// In en, this message translates to:
  /// **'Your correction for {date} will be withdrawn.'**
  String correctionCancelBody(String date);

  /// No description provided for @correctionCancelled.
  ///
  /// In en, this message translates to:
  /// **'Correction cancelled'**
  String get correctionCancelled;

  /// The day the correction is for.
  ///
  /// In en, this message translates to:
  /// **'Day'**
  String get correctionDate;

  /// No description provided for @correctionDateRequired.
  ///
  /// In en, this message translates to:
  /// **'Choose the day to correct'**
  String get correctionDateRequired;

  /// No description provided for @correctionInTime.
  ///
  /// In en, this message translates to:
  /// **'In time'**
  String get correctionInTime;

  /// No description provided for @correctionOutTime.
  ///
  /// In en, this message translates to:
  /// **'Out time'**
  String get correctionOutTime;

  /// No description provided for @correctionChooseTime.
  ///
  /// In en, this message translates to:
  /// **'Choose a time'**
  String get correctionChooseTime;

  /// No description provided for @correctionClearTime.
  ///
  /// In en, this message translates to:
  /// **'Clear time'**
  String get correctionClearTime;

  /// No description provided for @correctionTimesHint.
  ///
  /// In en, this message translates to:
  /// **'Give the time you came in, the time you left, or both.'**
  String get correctionTimesHint;

  /// No description provided for @correctionTimesRequired.
  ///
  /// In en, this message translates to:
  /// **'Give the in time, the out time or both.'**
  String get correctionTimesRequired;

  /// No description provided for @correctionOnDutyHint.
  ///
  /// In en, this message translates to:
  /// **'An on-duty day counts as your whole shift, so no times are needed.'**
  String get correctionOnDutyHint;

  /// No description provided for @correctionSubmit.
  ///
  /// In en, this message translates to:
  /// **'Send correction'**
  String get correctionSubmit;

  /// No description provided for @correctionSent.
  ///
  /// In en, this message translates to:
  /// **'Correction sent for approval'**
  String get correctionSent;

  /// No description provided for @approvalCorrectionTitle.
  ///
  /// In en, this message translates to:
  /// **'Attendance correction'**
  String get approvalCorrectionTitle;

  /// Label over the times an employee asks to add.
  ///
  /// In en, this message translates to:
  /// **'Asked for'**
  String get approvalAskedFor;

  /// Label over the day as the system has it now, to compare with the correction.
  ///
  /// In en, this message translates to:
  /// **'Recorded now'**
  String get approvalDayNow;

  /// No description provided for @approveCorrectionTitle.
  ///
  /// In en, this message translates to:
  /// **'Approve this correction?'**
  String get approveCorrectionTitle;

  /// No description provided for @rejectCorrectionTitle.
  ///
  /// In en, this message translates to:
  /// **'Reject this correction?'**
  String get rejectCorrectionTitle;

  /// No description provided for @correctionApproved.
  ///
  /// In en, this message translates to:
  /// **'Correction approved'**
  String get correctionApproved;

  /// No description provided for @correctionRejected.
  ///
  /// In en, this message translates to:
  /// **'Correction rejected'**
  String get correctionRejected;

  /// No description provided for @approvalUnknownItem.
  ///
  /// In en, this message translates to:
  /// **'This version of the app can\'t show this request. Decide it on the web.'**
  String get approvalUnknownItem;

  /// No description provided for @punchSelfieHint.
  ///
  /// In en, this message translates to:
  /// **'Your workspace asks for a photo with each punch. The front camera opens when you punch.'**
  String get punchSelfieHint;

  /// On the punch button while the camera is open.
  ///
  /// In en, this message translates to:
  /// **'Taking your photo…'**
  String get punchTakingPhoto;

  /// No description provided for @punchNoPhoto.
  ///
  /// In en, this message translates to:
  /// **'No photo was taken, so you weren\'t punched. Punch again and take the photo.'**
  String get punchNoPhoto;

  /// Spoken label of the camera icon on a punch that came with a selfie.
  ///
  /// In en, this message translates to:
  /// **'With photo'**
  String get punchWithPhoto;

  /// No description provided for @punchErrorSelfieRequired.
  ///
  /// In en, this message translates to:
  /// **'Your workspace now asks for a photo with each punch. Punch again to take one.'**
  String get punchErrorSelfieRequired;

  /// No description provided for @punchErrorSelfieTooLarge.
  ///
  /// In en, this message translates to:
  /// **'The photo is too large to send. Please take it again.'**
  String get punchErrorSelfieTooLarge;

  /// No description provided for @punchErrorSelfieUnreadable.
  ///
  /// In en, this message translates to:
  /// **'The photo could not be read. Please take it again.'**
  String get punchErrorSelfieUnreadable;

  /// No description provided for @cameraPermissionDenied.
  ///
  /// In en, this message translates to:
  /// **'Camera access is off for this app. Allow it in Settings to take the photo for your punch.'**
  String get cameraPermissionDenied;

  /// No description provided for @cameraUnavailable.
  ///
  /// In en, this message translates to:
  /// **'This phone has no camera the app can use, so you can\'t punch with a photo.'**
  String get cameraUnavailable;

  /// No description provided for @cameraFailed.
  ///
  /// In en, this message translates to:
  /// **'The camera could not be opened. Please try again.'**
  String get cameraFailed;

  /// Home card and screen title: files HR shared with the employee.
  ///
  /// In en, this message translates to:
  /// **'My documents'**
  String get documentsTitle;

  /// Under "My documents" on the home screen.
  ///
  /// In en, this message translates to:
  /// **'Letters, certificates and your service book'**
  String get documentsSubtitle;

  /// No description provided for @documentsLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'We could not load your documents.'**
  String get documentsLoadFailed;

  /// No description provided for @documentsEmpty.
  ///
  /// In en, this message translates to:
  /// **'HR hasn\'t shared any documents with you yet.'**
  String get documentsEmpty;

  /// No description provided for @documentsNoEmployeeBody.
  ///
  /// In en, this message translates to:
  /// **'Documents belong to an employee record, but none is linked to your login. If you think you should have one, ask your HR team.'**
  String get documentsNoEmployeeBody;

  /// What a document is, for a category from the API. "other" is a real category and also covers unknown ones.
  ///
  /// In en, this message translates to:
  /// **'{category, select, photo{Photo} nid{National ID card} birth_certificate{Birth certificate} passport{Passport} educational_certificate{Educational certificate} experience_certificate{Experience certificate} appointment_letter{Appointment letter} contract{Contract} medical_certificate{Medical certificate} police_verification{Police verification} nominee_form{Nominee form} letter{Letter} punch_selfie{Punch photo} other{Document}}'**
  String documentCategoryName(String category);

  /// No description provided for @documentIssuedOn.
  ///
  /// In en, this message translates to:
  /// **'Issued {date}'**
  String documentIssuedOn(String date);

  /// No description provided for @documentExpiresOn.
  ///
  /// In en, this message translates to:
  /// **'Expires {date}'**
  String documentExpiresOn(String date);

  /// No description provided for @documentExpired.
  ///
  /// In en, this message translates to:
  /// **'Expired'**
  String get documentExpired;

  /// A document that expires within 60 days.
  ///
  /// In en, this message translates to:
  /// **'Expires soon'**
  String get documentExpiresSoon;

  /// A document the system generated from a letter template.
  ///
  /// In en, this message translates to:
  /// **'Letter from HR'**
  String get documentSourceLetter;

  /// No description provided for @documentSourceUpload.
  ///
  /// In en, this message translates to:
  /// **'Uploaded by HR'**
  String get documentSourceUpload;

  /// A letter's reference number.
  ///
  /// In en, this message translates to:
  /// **'Ref. {refNo}'**
  String documentRefNo(String refNo);

  /// No description provided for @documentErrorNotShared.
  ///
  /// In en, this message translates to:
  /// **'This document is no longer shared with you.'**
  String get documentErrorNotShared;

  /// No description provided for @documentErrorGone.
  ///
  /// In en, this message translates to:
  /// **'This document has been removed.'**
  String get documentErrorGone;

  /// No description provided for @fileNoApp.
  ///
  /// In en, this message translates to:
  /// **'No app on this phone can open this file. Install a PDF reader and try again.'**
  String get fileNoApp;

  /// No description provided for @fileOpenFailed.
  ///
  /// In en, this message translates to:
  /// **'The file could not be opened. Please try again.'**
  String get fileOpenFailed;

  /// No description provided for @imageLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'This image could not be shown.'**
  String get imageLoadFailed;

  /// The employee's service record that the Labour Act (s.6) requires.
  ///
  /// In en, this message translates to:
  /// **'My service book'**
  String get serviceBookTitle;

  /// No description provided for @serviceBookBody.
  ///
  /// In en, this message translates to:
  /// **'Your service record, kept under section 6 of the Labour Act. It opens as a PDF in the app\'s language.'**
  String get serviceBookBody;

  /// No description provided for @serviceBookOpen.
  ///
  /// In en, this message translates to:
  /// **'Open PDF'**
  String get serviceBookOpen;

  /// Tab in My pay: the employee's published payslips.
  ///
  /// In en, this message translates to:
  /// **'Payslips'**
  String get payslipsTitle;

  /// No description provided for @payslipsLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'We could not load your payslips.'**
  String get payslipsLoadFailed;

  /// No description provided for @payslipsEmpty.
  ///
  /// In en, this message translates to:
  /// **'No payslips yet. They appear here once payroll publishes them.'**
  String get payslipsEmpty;

  /// Label above the amount paid after deductions.
  ///
  /// In en, this message translates to:
  /// **'Net pay'**
  String get payslipNetPay;

  /// The payslip's payment date.
  ///
  /// In en, this message translates to:
  /// **'Paid on {date}'**
  String payslipPaidOn(String date);

  /// Mark on a payslip from an adjustment run, which corrects an earlier one.
  ///
  /// In en, this message translates to:
  /// **'Adjustment'**
  String get payslipAdjustment;

  /// Opens the payslip as a PDF printed in English.
  ///
  /// In en, this message translates to:
  /// **'Open in English'**
  String get payslipOpenEnglish;

  /// Opens the payslip as a PDF printed in Bangla.
  ///
  /// In en, this message translates to:
  /// **'Open in Bangla'**
  String get payslipOpenBangla;

  /// The payslip was withdrawn since the list loaded (a 404).
  ///
  /// In en, this message translates to:
  /// **'This payslip is no longer available.'**
  String get payslipErrorGone;

  /// Home card and screen title: the employee's payslips, salary tax, provident fund and loans.
  ///
  /// In en, this message translates to:
  /// **'My pay'**
  String get myPayTitle;

  /// Under "My pay" on the home screen.
  ///
  /// In en, this message translates to:
  /// **'Payslips, tax, provident fund and loans'**
  String get myPaySubtitle;

  /// Tab in My pay: the employee's salary tax for the income year.
  ///
  /// In en, this message translates to:
  /// **'Tax'**
  String get myPayTabTax;

  /// Tab in My pay: the employee's provident fund statement.
  ///
  /// In en, this message translates to:
  /// **'Provident fund'**
  String get myPayTabProvidentFund;

  /// Tab in My pay: the employee's salary advances and loans.
  ///
  /// In en, this message translates to:
  /// **'Loans'**
  String get myPayTabLoans;

  /// Mark on a month from a festival bonus run.
  ///
  /// In en, this message translates to:
  /// **'Bonus'**
  String get payrollRunKindBonus;

  /// Mark on a payslip or month from a final settlement run, which pays what a leaver is owed.
  ///
  /// In en, this message translates to:
  /// **'Final settlement'**
  String get payrollRunKindSettlement;

  /// Mark on a payslip or month from a workers' participation fund (WPPF) payout run.
  ///
  /// In en, this message translates to:
  /// **'Participation fund'**
  String get payrollRunKindWppf;

  /// No description provided for @taxLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'We could not load your tax.'**
  String get taxLoadFailed;

  /// No description provided for @taxNoEmployeeBody.
  ///
  /// In en, this message translates to:
  /// **'Salary tax belongs to an employee record, and your login is not linked to one. If you think it should be, ask your HR team.'**
  String get taxNoEmployeeBody;

  /// Heading of the card with salary paid and tax deducted in the income year so far.
  ///
  /// In en, this message translates to:
  /// **'Year so far'**
  String get taxYearSoFar;

  /// No description provided for @taxSalaryPaid.
  ///
  /// In en, this message translates to:
  /// **'Salary paid'**
  String get taxSalaryPaid;

  /// Tax deducted at source from the salary.
  ///
  /// In en, this message translates to:
  /// **'Tax deducted'**
  String get taxDeducted;

  /// No description provided for @taxIncludesOpening.
  ///
  /// In en, this message translates to:
  /// **'Includes {salary} salary and {tax} tax from earlier in the year, such as from a previous employer.'**
  String taxIncludesOpening(String salary, String tax);

  /// The year's tax as the latest payroll run worked it out.
  ///
  /// In en, this message translates to:
  /// **'Tax for the year (estimated)'**
  String get taxForYear;

  /// Tax deducted from this month's salary.
  ///
  /// In en, this message translates to:
  /// **'This month'**
  String get taxThisMonth;

  /// Tax rebate earned by declared investments.
  ///
  /// In en, this message translates to:
  /// **'Rebate'**
  String get taxRebate;

  /// Income up to which no tax is due for this employee.
  ///
  /// In en, this message translates to:
  /// **'Tax-free threshold'**
  String get taxThreshold;

  /// This month and the months after it in the income year.
  ///
  /// In en, this message translates to:
  /// **'Months left'**
  String get taxMonthsLeft;

  /// No description provided for @taxNotWorkedOut.
  ///
  /// In en, this message translates to:
  /// **'The year\'s tax shows here once payroll works it out from your salary.'**
  String get taxNotWorkedOut;

  /// No description provided for @taxMonthsTitle.
  ///
  /// In en, this message translates to:
  /// **'Month by month'**
  String get taxMonthsTitle;

  /// No description provided for @taxNoMonths.
  ///
  /// In en, this message translates to:
  /// **'No salary paid in this year yet.'**
  String get taxNoMonths;

  /// One payroll run of the year: the salary paid and the tax deducted.
  ///
  /// In en, this message translates to:
  /// **'Salary {salary} · Tax {tax}'**
  String taxMonthLine(String salary, String tax);

  /// The treasury challan the month's tax was deposited with.
  ///
  /// In en, this message translates to:
  /// **'Challan {number}'**
  String taxChallan(String number);

  /// The treasury challan the month's tax was deposited with, and when.
  ///
  /// In en, this message translates to:
  /// **'Challan {number}, deposited {date}'**
  String taxChallanOn(String number, String date);

  /// No description provided for @taxCertificateTitle.
  ///
  /// In en, this message translates to:
  /// **'Salary and tax certificate'**
  String get taxCertificateTitle;

  /// No description provided for @taxCertificateBody.
  ///
  /// In en, this message translates to:
  /// **'For your income tax return: your salary this year and the tax deducted from it. It opens as a PDF.'**
  String get taxCertificateBody;

  /// Opens the salary and tax certificate as a PDF printed in English.
  ///
  /// In en, this message translates to:
  /// **'Certificate (English)'**
  String get taxCertificateEnglish;

  /// Opens the salary and tax certificate as a PDF printed in Bangla.
  ///
  /// In en, this message translates to:
  /// **'Certificate (Bangla)'**
  String get taxCertificateBangla;

  /// The employee's investments and donations for the income year, which earn a tax rebate.
  ///
  /// In en, this message translates to:
  /// **'Investment declaration'**
  String get declarationTitle;

  /// No description provided for @declarationHint.
  ///
  /// In en, this message translates to:
  /// **'Declared investments lower the tax deducted each month; payroll checks your proofs and the accepted amounts then count instead.'**
  String get declarationHint;

  /// Where an investment declaration stands.
  ///
  /// In en, this message translates to:
  /// **'{status, select, draft{Draft} submitted{Submitted} verified{Verified} other{Unknown}}'**
  String declarationStatusName(String status);

  /// No description provided for @declarationSubmittedOn.
  ///
  /// In en, this message translates to:
  /// **'Submitted on {date}'**
  String declarationSubmittedOn(String date);

  /// No description provided for @declarationVerifiedOn.
  ///
  /// In en, this message translates to:
  /// **'Verified on {date}'**
  String declarationVerifiedOn(String date);

  /// A kind of investment or donation that earns a tax rebate.
  ///
  /// In en, this message translates to:
  /// **'{kind, select, savings_certificate{Savings certificates} dps{DPS} life_insurance{Life insurance premium} provident_fund_other{Other provident fund} superannuation{Superannuation or benevolent fund} universal_pension{Universal pension} listed_shares{Listed shares} mutual_fund{Mutual funds} zakat{Zakat} donation{Approved donations} other{Other}}'**
  String investmentKindName(String kind);

  /// No description provided for @declarationKind.
  ///
  /// In en, this message translates to:
  /// **'Investment'**
  String get declarationKind;

  /// No description provided for @declarationKindRequired.
  ///
  /// In en, this message translates to:
  /// **'Choose what you invested in'**
  String get declarationKindRequired;

  /// No description provided for @declarationAmount.
  ///
  /// In en, this message translates to:
  /// **'Amount (taka)'**
  String get declarationAmount;

  /// No description provided for @declarationAmountInvalid.
  ///
  /// In en, this message translates to:
  /// **'Enter an amount like 12500 or 12500.50'**
  String get declarationAmountInvalid;

  /// No description provided for @declarationNote.
  ///
  /// In en, this message translates to:
  /// **'Note (optional)'**
  String get declarationNote;

  /// No description provided for @declarationAddRow.
  ///
  /// In en, this message translates to:
  /// **'Add investment'**
  String get declarationAddRow;

  /// No description provided for @declarationRemoveRow.
  ///
  /// In en, this message translates to:
  /// **'Remove'**
  String get declarationRemoveRow;

  /// No description provided for @declarationSaveDraft.
  ///
  /// In en, this message translates to:
  /// **'Save draft'**
  String get declarationSaveDraft;

  /// No description provided for @declarationSubmit.
  ///
  /// In en, this message translates to:
  /// **'Submit to payroll'**
  String get declarationSubmit;

  /// No description provided for @declarationSaved.
  ///
  /// In en, this message translates to:
  /// **'Draft saved.'**
  String get declarationSaved;

  /// No description provided for @declarationSent.
  ///
  /// In en, this message translates to:
  /// **'Sent to payroll.'**
  String get declarationSent;

  /// No description provided for @declarationErrorVerified.
  ///
  /// In en, this message translates to:
  /// **'Payroll has verified this declaration, so it can no longer be changed.'**
  String get declarationErrorVerified;

  /// The API refused the declaration; its problems are listed below.
  ///
  /// In en, this message translates to:
  /// **'Check the amounts and try again.'**
  String get declarationErrorInvalid;

  /// No description provided for @declarationTotal.
  ///
  /// In en, this message translates to:
  /// **'Declared in all'**
  String get declarationTotal;

  /// No description provided for @declarationDeclared.
  ///
  /// In en, this message translates to:
  /// **'Declared'**
  String get declarationDeclared;

  /// What payroll accepted of a declared investment after checking the proofs.
  ///
  /// In en, this message translates to:
  /// **'Accepted'**
  String get declarationAccepted;

  /// No description provided for @declarationEmpty.
  ///
  /// In en, this message translates to:
  /// **'No investments declared.'**
  String get declarationEmpty;

  /// No description provided for @pfLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'We could not load your provident fund.'**
  String get pfLoadFailed;

  /// No description provided for @pfNotMember.
  ///
  /// In en, this message translates to:
  /// **'You are not a member of the provident fund.'**
  String get pfNotMember;

  /// No description provided for @pfTotal.
  ///
  /// In en, this message translates to:
  /// **'Total balance'**
  String get pfTotal;

  /// No description provided for @pfOwn.
  ///
  /// In en, this message translates to:
  /// **'Your contributions'**
  String get pfOwn;

  /// No description provided for @pfEmployer.
  ///
  /// In en, this message translates to:
  /// **'Employer\'s contributions'**
  String get pfEmployer;

  /// No description provided for @pfPayable.
  ///
  /// In en, this message translates to:
  /// **'Payable if you left today'**
  String get pfPayable;

  /// How the amount payable on leaving is made up.
  ///
  /// In en, this message translates to:
  /// **'Your contributions and {percent}% of the employer\'s share'**
  String pfVested(String percent);

  /// No description provided for @pfMemberSince.
  ///
  /// In en, this message translates to:
  /// **'Member since {date}'**
  String pfMemberSince(String date);

  /// No description provided for @pfLeftOn.
  ///
  /// In en, this message translates to:
  /// **'Left the fund on {date}'**
  String pfLeftOn(String date);

  /// Heading of the list of provident fund entries.
  ///
  /// In en, this message translates to:
  /// **'Statement'**
  String get pfEntriesTitle;

  /// No description provided for @pfNoEntries.
  ///
  /// In en, this message translates to:
  /// **'No entries yet.'**
  String get pfNoEntries;

  /// What moved money in or out of a provident fund account.
  ///
  /// In en, this message translates to:
  /// **'{kind, select, opening{Opening balance} contribution{Contribution} interest{Interest} loan_out{Loan taken} loan_repaid{Loan repaid} withdrawal{Withdrawal} forfeited{Forfeited} other{Entry}}'**
  String pfEntryKindName(String kind);

  /// A provident fund account: the member's own contributions, or the employer's.
  ///
  /// In en, this message translates to:
  /// **'{account, select, own{Your account} employer{Employer\'s account} other{Account}}'**
  String pfAccountName(String account);

  /// No description provided for @loansLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'We could not load your advances and loans.'**
  String get loansLoadFailed;

  /// No description provided for @loansEmpty.
  ///
  /// In en, this message translates to:
  /// **'No advances or loans.'**
  String get loansEmpty;

  /// No description provided for @loanKindName.
  ///
  /// In en, this message translates to:
  /// **'{kind, select, advance{Salary advance} loan{Loan} pf_loan{Provident fund loan} other{Loan}}'**
  String loanKindName(String kind);

  /// Where a salary advance or loan stands. Closed means paid back in full.
  ///
  /// In en, this message translates to:
  /// **'{status, select, pending{Pending} active{Active} closed{Closed} rejected{Rejected} cancelled{Cancelled} other{Unknown}}'**
  String loanStatusName(String status);

  /// The amount advanced or lent.
  ///
  /// In en, this message translates to:
  /// **'Principal'**
  String get loanPrincipal;

  /// The instalment deducted from each month's salary.
  ///
  /// In en, this message translates to:
  /// **'Per month'**
  String get loanInstallment;

  /// What is still to be paid back.
  ///
  /// In en, this message translates to:
  /// **'Outstanding'**
  String get loanOutstanding;

  /// No description provided for @loanRepaid.
  ///
  /// In en, this message translates to:
  /// **'Repaid'**
  String get loanRepaid;

  /// The month the first instalment is deducted from salary.
  ///
  /// In en, this message translates to:
  /// **'First deduction'**
  String get loanStartMonth;

  /// Expands to the list of a loan's repayments.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =0{Repayments} other{Repayments ({count})}}'**
  String loanRepayments(num count);

  /// No description provided for @loanNoRepayments.
  ///
  /// In en, this message translates to:
  /// **'No repayments yet.'**
  String get loanNoRepayments;

  /// No description provided for @loanFromSalary.
  ///
  /// In en, this message translates to:
  /// **'Deducted from salary'**
  String get loanFromSalary;

  /// A repayment made directly, not deducted from salary.
  ///
  /// In en, this message translates to:
  /// **'Paid in'**
  String get loanPaidIn;

  /// No description provided for @resignationTitle.
  ///
  /// In en, this message translates to:
  /// **'Resignation'**
  String get resignationTitle;

  /// Under "Resignation" at the bottom of My profile.
  ///
  /// In en, this message translates to:
  /// **'Give notice, or follow your resignation'**
  String get resignationEntrySubtitle;

  /// No description provided for @separationsLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'We could not load your resignation.'**
  String get separationsLoadFailed;

  /// No description provided for @separationsNoEmployeeBody.
  ///
  /// In en, this message translates to:
  /// **'Resigning needs an employee record, but none is linked to your login. If you think you should have one, ask your HR team.'**
  String get separationsNoEmployeeBody;

  /// Heading over resignations that are withdrawn, rejected or completed.
  ///
  /// In en, this message translates to:
  /// **'Earlier'**
  String get separationsEarlier;

  /// How employment ends, in the Bangladesh Labour Act's terms (ss.19–28). Use the Act's Bangla terms.
  ///
  /// In en, this message translates to:
  /// **'{type, select, resignation{Resignation} termination{Termination} dismissal{Dismissal} discharge{Discharge} retrenchment{Retrenchment} retirement{Retirement} death{Death} contract_end{End of contract} other{Separation}}'**
  String separationTypeName(String type);

  /// A separation's status. approved: decided, waiting for the last working day. completed: the employee has left.
  ///
  /// In en, this message translates to:
  /// **'{status, select, pending{Pending} approved{Approved} completed{Completed} rejected{Rejected} cancelled{Cancelled} other{Unknown}}'**
  String separationStatusName(String status);

  /// No description provided for @separationNoticeDate.
  ///
  /// In en, this message translates to:
  /// **'Notice given on'**
  String get separationNoticeDate;

  /// No description provided for @separationLastWorkingDay.
  ///
  /// In en, this message translates to:
  /// **'Last working day'**
  String get separationLastWorkingDay;

  /// Days of notice the Labour Act asks for.
  ///
  /// In en, this message translates to:
  /// **'Notice required'**
  String get separationNoticeRequired;

  /// Days from the notice to the last working day.
  ///
  /// In en, this message translates to:
  /// **'Notice given'**
  String get separationNoticeGiven;

  /// No description provided for @separationNoNoticeRequired.
  ///
  /// In en, this message translates to:
  /// **'None'**
  String get separationNoNoticeRequired;

  /// No description provided for @separationShortfall.
  ///
  /// In en, this message translates to:
  /// **'That is {days} short of the notice the Labour Act asks for. Wages for the missing days may be deducted from your final settlement.'**
  String separationShortfall(String days);

  /// No description provided for @resignationCancel.
  ///
  /// In en, this message translates to:
  /// **'Withdraw resignation'**
  String get resignationCancel;

  /// No description provided for @resignationCancelTitle.
  ///
  /// In en, this message translates to:
  /// **'Withdraw your resignation?'**
  String get resignationCancelTitle;

  /// No description provided for @resignationCancelBody.
  ///
  /// In en, this message translates to:
  /// **'Your resignation with the last working day {date} will be withdrawn, and you stay in your job.'**
  String resignationCancelBody(String date);

  /// No description provided for @resignationCancelled.
  ///
  /// In en, this message translates to:
  /// **'Resignation withdrawn'**
  String get resignationCancelled;

  /// No description provided for @resignHeading.
  ///
  /// In en, this message translates to:
  /// **'Resign from your job'**
  String get resignHeading;

  /// No description provided for @resignNoticeInfo.
  ///
  /// In en, this message translates to:
  /// **'Under the Bangladesh Labour Act (section 27), a permanent worker gives 60 days\' written notice to resign, and a temporary worker on monthly wages 30 days. Your notice starts today. If you give less, wages for the missing days may be deducted from your final settlement.'**
  String get resignNoticeInfo;

  /// No description provided for @resignLastDayRequired.
  ///
  /// In en, this message translates to:
  /// **'Choose your last working day'**
  String get resignLastDayRequired;

  /// Under the last working day: days from today to it.
  ///
  /// In en, this message translates to:
  /// **'That gives {days} of notice.'**
  String resignNoticeGiven(String days);

  /// No description provided for @resignSubmit.
  ///
  /// In en, this message translates to:
  /// **'Send resignation'**
  String get resignSubmit;

  /// No description provided for @resignConfirmTitle.
  ///
  /// In en, this message translates to:
  /// **'Send your resignation?'**
  String get resignConfirmTitle;

  /// No description provided for @resignConfirmBody.
  ///
  /// In en, this message translates to:
  /// **'Your last working day will be {date}. It goes to your manager, then HR. You can withdraw it while it is pending.'**
  String resignConfirmBody(String date);

  /// No description provided for @resignConfirm.
  ///
  /// In en, this message translates to:
  /// **'Resign'**
  String get resignConfirm;

  /// No description provided for @resignSent.
  ///
  /// In en, this message translates to:
  /// **'Resignation sent for approval'**
  String get resignSent;

  /// No description provided for @resignErrorOpen.
  ///
  /// In en, this message translates to:
  /// **'A resignation or separation is already in progress.'**
  String get resignErrorOpen;

  /// No description provided for @resignErrorSeparated.
  ///
  /// In en, this message translates to:
  /// **'Your employment has already ended.'**
  String get resignErrorSeparated;

  /// No description provided for @resignErrorPastLastDay.
  ///
  /// In en, this message translates to:
  /// **'The last working day can\'t be in the past.'**
  String get resignErrorPastLastDay;

  /// No description provided for @resignErrorNotOpen.
  ///
  /// In en, this message translates to:
  /// **'This resignation has already been decided, so it can\'t be withdrawn.'**
  String get resignErrorNotOpen;

  /// No description provided for @approvalSeparationDates.
  ///
  /// In en, this message translates to:
  /// **'Notice {notice} → last day {lastDay}'**
  String approvalSeparationDates(String notice, String lastDay);

  /// No description provided for @approvalNoticeShort.
  ///
  /// In en, this message translates to:
  /// **'Notice short by {days}'**
  String approvalNoticeShort(String days);

  /// No description provided for @approveSeparationTitle.
  ///
  /// In en, this message translates to:
  /// **'Approve this resignation?'**
  String get approveSeparationTitle;

  /// No description provided for @rejectSeparationTitle.
  ///
  /// In en, this message translates to:
  /// **'Reject this resignation?'**
  String get rejectSeparationTitle;

  /// No description provided for @separationApproved.
  ///
  /// In en, this message translates to:
  /// **'Resignation approved'**
  String get separationApproved;

  /// No description provided for @separationRejected.
  ///
  /// In en, this message translates to:
  /// **'Resignation rejected'**
  String get separationRejected;

  /// Login method switch: sign in with email and password.
  ///
  /// In en, this message translates to:
  /// **'Email'**
  String get signInWithEmail;

  /// Login method switch: sign in with a code sent to a mobile number.
  ///
  /// In en, this message translates to:
  /// **'Mobile'**
  String get signInWithPhone;

  /// No description provided for @mobileNumber.
  ///
  /// In en, this message translates to:
  /// **'Mobile number'**
  String get mobileNumber;

  /// Keep the example number in Latin digits.
  ///
  /// In en, this message translates to:
  /// **'e.g. 01712345678'**
  String get mobileNumberHint;

  /// No description provided for @mobileNumberRequired.
  ///
  /// In en, this message translates to:
  /// **'Enter your mobile number'**
  String get mobileNumberRequired;

  /// No description provided for @mobileNumberInvalid.
  ///
  /// In en, this message translates to:
  /// **'Enter a Bangladesh mobile number, e.g. 01712345678'**
  String get mobileNumberInvalid;

  /// Button: text a sign-in code to the mobile number.
  ///
  /// In en, this message translates to:
  /// **'Send code'**
  String get sendCode;

  /// No description provided for @otpTitle.
  ///
  /// In en, this message translates to:
  /// **'Enter the code we sent'**
  String get otpTitle;

  /// The API answers the same for numbers without a login, so this cannot say for sure that a code was sent.
  ///
  /// In en, this message translates to:
  /// **'If {phone} has a Good People login, a 6-digit code is on its way by SMS. It works for {minutes, plural, one{{minutes} minute} other{{minutes} minutes}}.'**
  String otpSentBody(String phone, num minutes);

  /// No description provided for @codeLabel.
  ///
  /// In en, this message translates to:
  /// **'6-digit code'**
  String get codeLabel;

  /// No description provided for @codeRequired.
  ///
  /// In en, this message translates to:
  /// **'Enter the 6-digit code'**
  String get codeRequired;

  /// No description provided for @codeWrongOrExpired.
  ///
  /// In en, this message translates to:
  /// **'That code is wrong or has expired. Check it, or ask for a new one.'**
  String get codeWrongOrExpired;

  /// No description provided for @sendCodeAgain.
  ///
  /// In en, this message translates to:
  /// **'Send again'**
  String get sendCodeAgain;

  /// No description provided for @sendCodeAgainHint.
  ///
  /// In en, this message translates to:
  /// **'Didn\'t get it? You can ask for a new code after {seconds} seconds.'**
  String sendCodeAgainHint(String seconds);

  /// No description provided for @codeSentAgain.
  ///
  /// In en, this message translates to:
  /// **'A new code is on its way.'**
  String get codeSentAgain;

  /// No description provided for @useDifferentNumber.
  ///
  /// In en, this message translates to:
  /// **'Use a different number'**
  String get useDifferentNumber;

  /// No description provided for @twoStepTitle.
  ///
  /// In en, this message translates to:
  /// **'Two-step sign-in'**
  String get twoStepTitle;

  /// No description provided for @twoStepBody.
  ///
  /// In en, this message translates to:
  /// **'Enter the 6-digit code from your authenticator app.'**
  String get twoStepBody;

  /// Keep the example code as it is.
  ///
  /// In en, this message translates to:
  /// **'Enter one of your recovery codes, like k7qm-2xpd. Each one works once.'**
  String get twoStepRecoveryBody;

  /// No description provided for @recoveryCodeLabel.
  ///
  /// In en, this message translates to:
  /// **'Recovery code'**
  String get recoveryCodeLabel;

  /// No description provided for @recoveryCodeInvalid.
  ///
  /// In en, this message translates to:
  /// **'Enter a recovery code like k7qm-2xpd'**
  String get recoveryCodeInvalid;

  /// No description provided for @useRecoveryCode.
  ///
  /// In en, this message translates to:
  /// **'Use a recovery code instead'**
  String get useRecoveryCode;

  /// No description provided for @useAuthenticatorCode.
  ///
  /// In en, this message translates to:
  /// **'Use a code from the app instead'**
  String get useAuthenticatorCode;

  /// No description provided for @twoStepWrongCode.
  ///
  /// In en, this message translates to:
  /// **'That code is wrong or has expired. Try again, or go back and sign in again.'**
  String get twoStepWrongCode;

  /// No description provided for @verify.
  ///
  /// In en, this message translates to:
  /// **'Verify'**
  String get verify;

  /// No description provided for @twoStepSetupTitle.
  ///
  /// In en, this message translates to:
  /// **'Set up two-step sign-in first'**
  String get twoStepSetupTitle;

  /// No description provided for @twoStepSetupBody.
  ///
  /// In en, this message translates to:
  /// **'Your role must use two-step sign-in. Set it up in the Good People web app, then sign in here.'**
  String get twoStepSetupBody;

  /// No description provided for @back.
  ///
  /// In en, this message translates to:
  /// **'Back'**
  String get back;

  /// No description provided for @loginWrongCredentials.
  ///
  /// In en, this message translates to:
  /// **'Wrong workspace, email or password'**
  String get loginWrongCredentials;

  /// No description provided for @errorTooManyAttempts.
  ///
  /// In en, this message translates to:
  /// **'Too many attempts. Please wait a few minutes and try again.'**
  String get errorTooManyAttempts;

  /// No description provided for @errorTooManyAttemptsWait.
  ///
  /// In en, this message translates to:
  /// **'{minutes, plural, one{Too many attempts. Try again in {minutes} minute.} other{Too many attempts. Try again in {minutes} minutes.}}'**
  String errorTooManyAttemptsWait(num minutes);

  /// No description provided for @errorLoginDisabled.
  ///
  /// In en, this message translates to:
  /// **'This login is no longer active. Ask your HR team.'**
  String get errorLoginDisabled;

  /// No description provided for @errorWrongPassword.
  ///
  /// In en, this message translates to:
  /// **'Your current password is not right.'**
  String get errorWrongPassword;

  /// No description provided for @errorTenantSuspended.
  ///
  /// In en, this message translates to:
  /// **'This workspace is suspended. Contact your administrator.'**
  String get errorTenantSuspended;

  /// No description provided for @errorTenantReadOnly.
  ///
  /// In en, this message translates to:
  /// **'This workspace is read-only for now, so changes can\'t be saved.'**
  String get errorTenantReadOnly;

  /// No description provided for @errorRoleNotAllowed.
  ///
  /// In en, this message translates to:
  /// **'Your role can\'t do this.'**
  String get errorRoleNotAllowed;

  /// No description provided for @errorFeatureNotInPlan.
  ///
  /// In en, this message translates to:
  /// **'Your workspace\'s plan doesn\'t include this.'**
  String get errorFeatureNotInPlan;

  /// No description provided for @punchErrorOfflineTooOld.
  ///
  /// In en, this message translates to:
  /// **'This punch was saved more than 72 hours ago, so it can\'t be added now. Ask for a correction instead.'**
  String get punchErrorOfflineTooOld;

  /// No description provided for @punchSavedOffline.
  ///
  /// In en, this message translates to:
  /// **'No connection. Your punch at {time} is saved on this phone and will be sent when you\'re back online.'**
  String punchSavedOffline(String time);

  /// No description provided for @punchesWaiting.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{{count} punch waiting to be sent} other{{count} punches waiting to be sent}}'**
  String punchesWaiting(num count);

  /// No description provided for @punchesWaitingBody.
  ///
  /// In en, this message translates to:
  /// **'Taken without a connection at {times}. The app sends them as soon as it can reach the server.'**
  String punchesWaitingBody(String times);

  /// No description provided for @punchesSendNow.
  ///
  /// In en, this message translates to:
  /// **'Send now'**
  String get punchesSendNow;

  /// No description provided for @punchesSent.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{{count} saved punch sent} other{{count} saved punches sent}}'**
  String punchesSent(num count);

  /// No description provided for @punchRefusedTitle.
  ///
  /// In en, this message translates to:
  /// **'Your punch at {time} on {date} was not recorded'**
  String punchRefusedTitle(String time, String date);

  /// No description provided for @punchRefusedHint.
  ///
  /// In en, this message translates to:
  /// **'To fix the day, ask for a correction.'**
  String get punchRefusedHint;

  /// Hides a message the user has read.
  ///
  /// In en, this message translates to:
  /// **'Dismiss'**
  String get dismiss;

  /// No description provided for @homePunchRefused.
  ///
  /// In en, this message translates to:
  /// **'A punch saved without a connection was not recorded. Open Attendance to see why.'**
  String get homePunchRefused;

  /// No description provided for @notificationsTitle.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get notificationsTitle;

  /// No description provided for @notificationsEmpty.
  ///
  /// In en, this message translates to:
  /// **'No notifications yet.'**
  String get notificationsEmpty;

  /// No description provided for @notificationsLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'We could not load your notifications.'**
  String get notificationsLoadFailed;

  /// No description provided for @notificationsMarkAllRead.
  ///
  /// In en, this message translates to:
  /// **'Mark all as read'**
  String get notificationsMarkAllRead;

  /// Tooltip of the bell on the home screen.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =0{Notifications} one{Notifications, {count} unread} other{Notifications, {count} unread}}'**
  String notificationsUnread(num count);

  /// No description provided for @notificationUnread.
  ///
  /// In en, this message translates to:
  /// **'Unread'**
  String get notificationUnread;

  /// Action on a notification shown while the app is open.
  ///
  /// In en, this message translates to:
  /// **'View'**
  String get pushOpen;

  /// No description provided for @teamTitle.
  ///
  /// In en, this message translates to:
  /// **'Team'**
  String get teamTitle;

  /// No description provided for @teamSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Who is in today, and who is on leave'**
  String get teamSubtitle;

  /// No description provided for @teamLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'We could not load your team.'**
  String get teamLoadFailed;

  /// No description provided for @teamEmpty.
  ///
  /// In en, this message translates to:
  /// **'Nobody to show here.'**
  String get teamEmpty;

  /// Filter chip: everyone in the team.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get teamAll;

  /// No description provided for @teamOnLeave.
  ///
  /// In en, this message translates to:
  /// **'On leave this week'**
  String get teamOnLeave;

  /// No description provided for @teamNoLeave.
  ///
  /// In en, this message translates to:
  /// **'Nobody is on leave this week.'**
  String get teamNoLeave;

  /// No description provided for @teamLeaveLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'We could not load who is on leave.'**
  String get teamLeaveLoadFailed;

  /// No description provided for @teamNoEmployeeBody.
  ///
  /// In en, this message translates to:
  /// **'Team views need an employee record linked to your login.'**
  String get teamNoEmployeeBody;

  /// No description provided for @accountTitle.
  ///
  /// In en, this message translates to:
  /// **'Account'**
  String get accountTitle;

  /// No description provided for @accountSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Sign-in, password and two-step sign-in'**
  String get accountSubtitle;

  /// No description provided for @accountLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'We could not load your account.'**
  String get accountLoadFailed;

  /// No description provided for @accountName.
  ///
  /// In en, this message translates to:
  /// **'Name'**
  String get accountName;

  /// The login's access role, such as HR admin or Employee.
  ///
  /// In en, this message translates to:
  /// **'Role'**
  String get accountRole;

  /// No description provided for @accountNotSet.
  ///
  /// In en, this message translates to:
  /// **'Not set'**
  String get accountNotSet;

  /// A workspace access role from the API.
  ///
  /// In en, this message translates to:
  /// **'{role, select, tenant_admin{Workspace admin} hr_admin{HR admin} hr_officer{HR officer} attendance_officer{Attendance officer} auditor{Auditor} employee{Employee} other{Unknown}}'**
  String roleName(String role);

  /// No description provided for @accountTwoStep.
  ///
  /// In en, this message translates to:
  /// **'Two-step sign-in'**
  String get accountTwoStep;

  /// No description provided for @accountTwoStepOn.
  ///
  /// In en, this message translates to:
  /// **'On'**
  String get accountTwoStepOn;

  /// No description provided for @accountTwoStepOff.
  ///
  /// In en, this message translates to:
  /// **'Off'**
  String get accountTwoStepOff;

  /// No description provided for @accountTwoStepRequired.
  ///
  /// In en, this message translates to:
  /// **'Required for your role.'**
  String get accountTwoStepRequired;

  /// No description provided for @accountTwoStepHint.
  ///
  /// In en, this message translates to:
  /// **'Turn it on or off in the Good People web app.'**
  String get accountTwoStepHint;

  /// No description provided for @accountNoPassword.
  ///
  /// In en, this message translates to:
  /// **'You sign in with a code sent to your mobile, so there is no password to change.'**
  String get accountNoPassword;

  /// No description provided for @changePassword.
  ///
  /// In en, this message translates to:
  /// **'Change password'**
  String get changePassword;

  /// No description provided for @currentPassword.
  ///
  /// In en, this message translates to:
  /// **'Current password'**
  String get currentPassword;

  /// No description provided for @currentPasswordRequired.
  ///
  /// In en, this message translates to:
  /// **'Enter your current password'**
  String get currentPasswordRequired;

  /// No description provided for @newPassword.
  ///
  /// In en, this message translates to:
  /// **'New password'**
  String get newPassword;

  /// No description provided for @newPasswordHint.
  ///
  /// In en, this message translates to:
  /// **'At least 10 characters'**
  String get newPasswordHint;

  /// No description provided for @confirmNewPassword.
  ///
  /// In en, this message translates to:
  /// **'New password again'**
  String get confirmNewPassword;

  /// No description provided for @newPasswordTooShort.
  ///
  /// In en, this message translates to:
  /// **'Use at least 10 characters'**
  String get newPasswordTooShort;

  /// No description provided for @newPasswordSame.
  ///
  /// In en, this message translates to:
  /// **'Choose a password you have not been using'**
  String get newPasswordSame;

  /// No description provided for @newPasswordMismatch.
  ///
  /// In en, this message translates to:
  /// **'The two new passwords are not the same'**
  String get newPasswordMismatch;

  /// No description provided for @passwordChanged.
  ///
  /// In en, this message translates to:
  /// **'Password changed. You stay signed in here; other phones and browsers were signed out.'**
  String get passwordChanged;

  /// No description provided for @timesheetTitle.
  ///
  /// In en, this message translates to:
  /// **'Timesheet'**
  String get timesheetTitle;

  /// Under "Timesheet" on the home screen.
  ///
  /// In en, this message translates to:
  /// **'Your hours on each project, even offline'**
  String get timesheetSubtitle;

  /// No description provided for @timesheetPreviousMonth.
  ///
  /// In en, this message translates to:
  /// **'Previous month'**
  String get timesheetPreviousMonth;

  /// No description provided for @timesheetNextMonth.
  ///
  /// In en, this message translates to:
  /// **'Next month'**
  String get timesheetNextMonth;

  /// No description provided for @timesheetNoEmployeeBody.
  ///
  /// In en, this message translates to:
  /// **'Timesheets belong to an employee record, but none is linked to your login. If you think you should have one, ask your HR team.'**
  String get timesheetNoEmployeeBody;

  /// No description provided for @timesheetLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'We could not load your timesheet.'**
  String get timesheetLoadFailed;

  /// No description provided for @timesheetOffline.
  ///
  /// In en, this message translates to:
  /// **'You are offline. This is the copy saved on your phone; hours you type are sent when you are back online.'**
  String get timesheetOffline;

  /// No description provided for @timesheetStatus.
  ///
  /// In en, this message translates to:
  /// **'{status, select, draft{Draft} submitted{Submitted} approved{Approved} rejected{Returned} other{Unknown}}'**
  String timesheetStatus(String status);

  /// No description provided for @timesheetDue.
  ///
  /// In en, this message translates to:
  /// **'You are allocated to a project this month. Fill in your hours and submit them at the end of the month.'**
  String get timesheetDue;

  /// No description provided for @timesheetSubmittedNotice.
  ///
  /// In en, this message translates to:
  /// **'Submitted on {date}. Waiting for approval.'**
  String timesheetSubmittedNotice(String date);

  /// No description provided for @timesheetApprovedNotice.
  ///
  /// In en, this message translates to:
  /// **'Approved by {name} on {date}.'**
  String timesheetApprovedNotice(String name, String date);

  /// No description provided for @timesheetRejectedNotice.
  ///
  /// In en, this message translates to:
  /// **'Returned for correction. Change your hours and submit again.'**
  String get timesheetRejectedNotice;

  /// No description provided for @timesheetReopenedNotice.
  ///
  /// In en, this message translates to:
  /// **'HR reopened it: {note}'**
  String timesheetReopenedNotice(String note);

  /// No description provided for @timesheetWeekend.
  ///
  /// In en, this message translates to:
  /// **'Weekly holiday'**
  String get timesheetWeekend;

  /// No description provided for @timesheetOffDay.
  ///
  /// In en, this message translates to:
  /// **'Day off'**
  String get timesheetOffDay;

  /// No description provided for @timesheetLeave.
  ///
  /// In en, this message translates to:
  /// **'Leave: {name}'**
  String timesheetLeave(String name);

  /// The hours attendance recorded on a day, a hint for what to enter.
  ///
  /// In en, this message translates to:
  /// **'Attendance {hours} h'**
  String timesheetWorked(String hours);

  /// No description provided for @timesheetHours.
  ///
  /// In en, this message translates to:
  /// **'{hours} h'**
  String timesheetHours(String hours);

  /// After an hours field, as in "7.5 h".
  ///
  /// In en, this message translates to:
  /// **'h'**
  String get timesheetHoursUnit;

  /// Work not charged to any project.
  ///
  /// In en, this message translates to:
  /// **'Other work'**
  String get timesheetOtherWork;

  /// No description provided for @timesheetPlanned.
  ///
  /// In en, this message translates to:
  /// **'Planned {percent}%'**
  String timesheetPlanned(String percent);

  /// No description provided for @timesheetShare.
  ///
  /// In en, this message translates to:
  /// **'{hours} h · {percent}%'**
  String timesheetShare(String hours, String percent);

  /// No description provided for @timesheetTotal.
  ///
  /// In en, this message translates to:
  /// **'Total {hours} h'**
  String timesheetTotal(String hours);

  /// No description provided for @timesheetNoHours.
  ///
  /// In en, this message translates to:
  /// **'No hours'**
  String get timesheetNoHours;

  /// No description provided for @timesheetEditDay.
  ///
  /// In en, this message translates to:
  /// **'Hours on {date}'**
  String timesheetEditDay(String date);

  /// No description provided for @timesheetHoursInvalid.
  ///
  /// In en, this message translates to:
  /// **'Enter hours from 0 to 24, like 7.5'**
  String get timesheetHoursInvalid;

  /// No description provided for @timesheetDayTooLong.
  ///
  /// In en, this message translates to:
  /// **'A day cannot have more than 24 hours'**
  String get timesheetDayTooLong;

  /// No description provided for @timesheetSaveDay.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get timesheetSaveDay;

  /// No description provided for @timesheetCancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get timesheetCancel;

  /// No description provided for @timesheetAddProject.
  ///
  /// In en, this message translates to:
  /// **'Add a project'**
  String get timesheetAddProject;

  /// No description provided for @timesheetUnsent.
  ///
  /// In en, this message translates to:
  /// **'Not sent yet'**
  String get timesheetUnsent;

  /// No description provided for @timesheetWaiting.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{{count} change waiting to be sent} other{{count} changes waiting to be sent}}'**
  String timesheetWaiting(num count);

  /// No description provided for @timesheetSendNow.
  ///
  /// In en, this message translates to:
  /// **'Send now'**
  String get timesheetSendNow;

  /// No description provided for @timesheetSent.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{{count} change sent} other{{count} changes sent}}'**
  String timesheetSent(num count);

  /// No description provided for @timesheetSavedOffline.
  ///
  /// In en, this message translates to:
  /// **'Saved on your phone. It will be sent when you are online.'**
  String get timesheetSavedOffline;

  /// No description provided for @timesheetRefusedTitle.
  ///
  /// In en, this message translates to:
  /// **'Your hours for {project} on {date} were not saved'**
  String timesheetRefusedTitle(String project, String date);

  /// No description provided for @timesheetPrefill.
  ///
  /// In en, this message translates to:
  /// **'Fill from attendance'**
  String get timesheetPrefill;

  /// No description provided for @timesheetPrefilled.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =0{No day needed filling} one{{count} day filled from attendance} other{{count} days filled from attendance}}'**
  String timesheetPrefilled(num count);

  /// No description provided for @timesheetSubmit.
  ///
  /// In en, this message translates to:
  /// **'Submit'**
  String get timesheetSubmit;

  /// No description provided for @timesheetSubmitTitle.
  ///
  /// In en, this message translates to:
  /// **'Submit your timesheet'**
  String get timesheetSubmitTitle;

  /// The employee's declaration on submitting; the same words as on the web and the PDF.
  ///
  /// In en, this message translates to:
  /// **'I certify that the hours in this timesheet are the work I actually did in this month, on the projects shown.'**
  String get timesheetDeclaration;

  /// No description provided for @timesheetDeclarationConfirm.
  ///
  /// In en, this message translates to:
  /// **'I make this declaration'**
  String get timesheetDeclarationConfirm;

  /// No description provided for @timesheetSubmitted.
  ///
  /// In en, this message translates to:
  /// **'Timesheet submitted'**
  String get timesheetSubmitted;

  /// No description provided for @timesheetSendFirst.
  ///
  /// In en, this message translates to:
  /// **'Your changes have not reached the server yet. Send them before submitting.'**
  String get timesheetSendFirst;

  /// No description provided for @timesheetNoProjects.
  ///
  /// In en, this message translates to:
  /// **'There are no projects to charge hours to this month.'**
  String get timesheetNoProjects;

  /// No description provided for @timesheetErrorLocked.
  ///
  /// In en, this message translates to:
  /// **'This timesheet is submitted or approved, so it cannot change.'**
  String get timesheetErrorLocked;

  /// No description provided for @timesheetErrorEmpty.
  ///
  /// In en, this message translates to:
  /// **'Enter your hours before submitting.'**
  String get timesheetErrorEmpty;

  /// No description provided for @timesheetErrorMonthNotStarted.
  ///
  /// In en, this message translates to:
  /// **'A month can be submitted once it has started.'**
  String get timesheetErrorMonthNotStarted;

  /// No description provided for @timesheetErrorOutsideMonth.
  ///
  /// In en, this message translates to:
  /// **'That day is not in this month.'**
  String get timesheetErrorOutsideMonth;

  /// No description provided for @timesheetErrorProjectUnknown.
  ///
  /// In en, this message translates to:
  /// **'That project does not exist.'**
  String get timesheetErrorProjectUnknown;

  /// No description provided for @timesheetErrorProjectClosed.
  ///
  /// In en, this message translates to:
  /// **'The project is closed.'**
  String get timesheetErrorProjectClosed;

  /// No description provided for @timesheetErrorOtherCompany.
  ///
  /// In en, this message translates to:
  /// **'The project belongs to another company.'**
  String get timesheetErrorOtherCompany;

  /// No description provided for @timesheetErrorOutsidePeriod.
  ///
  /// In en, this message translates to:
  /// **'The project was not running that day.'**
  String get timesheetErrorOutsidePeriod;

  /// No description provided for @timesheetErrorDayOver24.
  ///
  /// In en, this message translates to:
  /// **'A day cannot have more than 24 hours.'**
  String get timesheetErrorDayOver24;

  /// No description provided for @timesheetErrorClientIdTaken.
  ///
  /// In en, this message translates to:
  /// **'This entry belongs to someone else.'**
  String get timesheetErrorClientIdTaken;

  /// A month's timesheet in the approvals inbox, followed by the month, as in "Project timesheet · October 2026".
  ///
  /// In en, this message translates to:
  /// **'Project timesheet'**
  String get approvalTimesheetTitle;

  /// No description provided for @approveTimesheetTitle.
  ///
  /// In en, this message translates to:
  /// **'Approve this timesheet?'**
  String get approveTimesheetTitle;

  /// No description provided for @rejectTimesheetTitle.
  ///
  /// In en, this message translates to:
  /// **'Reject this timesheet?'**
  String get rejectTimesheetTitle;

  /// No description provided for @timesheetApproved.
  ///
  /// In en, this message translates to:
  /// **'Timesheet approved'**
  String get timesheetApproved;

  /// After a manager rejects a timesheet: it goes back to the employee to correct and submit again.
  ///
  /// In en, this message translates to:
  /// **'Timesheet returned for correction'**
  String get timesheetRejected;

  /// An opening to fill in the approvals inbox, followed by its company, as in "Job opening · My Group Textiles Ltd".
  ///
  /// In en, this message translates to:
  /// **'Job opening'**
  String get approvalOpeningTitle;

  /// How many people an opening is for, and the employment type.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{{count} position} other{{count} positions}}, {type}'**
  String approvalOpeningPositions(num count, String type);

  /// No description provided for @approvalOpeningNew.
  ///
  /// In en, this message translates to:
  /// **'New position'**
  String get approvalOpeningNew;

  /// No description provided for @approvalOpeningReplaces.
  ///
  /// In en, this message translates to:
  /// **'Replaces {name}'**
  String approvalOpeningReplaces(String name);

  /// No description provided for @approvalBudget.
  ///
  /// In en, this message translates to:
  /// **'Monthly gross budget'**
  String get approvalBudget;

  /// No description provided for @approvalBudgetUpTo.
  ///
  /// In en, this message translates to:
  /// **'Up to {amount}'**
  String approvalBudgetUpTo(String amount);

  /// No description provided for @approvalBudgetFrom.
  ///
  /// In en, this message translates to:
  /// **'From {amount}'**
  String approvalBudgetFrom(String amount);

  /// No description provided for @approvalHiringManager.
  ///
  /// In en, this message translates to:
  /// **'Hiring manager'**
  String get approvalHiringManager;

  /// No description provided for @approvalJustification.
  ///
  /// In en, this message translates to:
  /// **'Why it is needed'**
  String get approvalJustification;

  /// No description provided for @approveOpeningTitle.
  ///
  /// In en, this message translates to:
  /// **'Approve this job opening?'**
  String get approveOpeningTitle;

  /// No description provided for @rejectOpeningTitle.
  ///
  /// In en, this message translates to:
  /// **'Reject this job opening?'**
  String get rejectOpeningTitle;

  /// No description provided for @openingApproved.
  ///
  /// In en, this message translates to:
  /// **'Job opening approved'**
  String get openingApproved;

  /// No description provided for @openingRejected.
  ///
  /// In en, this message translates to:
  /// **'Job opening rejected'**
  String get openingRejected;

  /// An offer to a candidate whose pay is above the opening's budget, in the approvals inbox, followed by the opening, as in "Offer above budget · Line supervisor".
  ///
  /// In en, this message translates to:
  /// **'Offer above budget'**
  String get approvalOfferTitle;

  /// No description provided for @approvalOfferPay.
  ///
  /// In en, this message translates to:
  /// **'Monthly gross'**
  String get approvalOfferPay;

  /// No description provided for @approvalOfferAgainstBudget.
  ///
  /// In en, this message translates to:
  /// **'{amount} · budget up to {budget}'**
  String approvalOfferAgainstBudget(String amount, String budget);

  /// No description provided for @approvalOfferJoining.
  ///
  /// In en, this message translates to:
  /// **'Joining'**
  String get approvalOfferJoining;

  /// No description provided for @approvalOfferDraftedBy.
  ///
  /// In en, this message translates to:
  /// **'Drafted by {name}'**
  String approvalOfferDraftedBy(String name);

  /// No description provided for @approveOfferTitle.
  ///
  /// In en, this message translates to:
  /// **'Approve this offer?'**
  String get approveOfferTitle;

  /// No description provided for @rejectOfferTitle.
  ///
  /// In en, this message translates to:
  /// **'Reject this offer?'**
  String get rejectOfferTitle;

  /// No description provided for @offerApproved.
  ///
  /// In en, this message translates to:
  /// **'Offer approved. HR can send it now.'**
  String get offerApproved;

  /// No description provided for @offerRejected.
  ///
  /// In en, this message translates to:
  /// **'Offer rejected'**
  String get offerRejected;

  /// No description provided for @interviewsTitle.
  ///
  /// In en, this message translates to:
  /// **'Interviews'**
  String get interviewsTitle;

  /// No description provided for @interviewsSubtitle.
  ///
  /// In en, this message translates to:
  /// **'The candidates you interview, their CVs and your scorecards'**
  String get interviewsSubtitle;

  /// Read out for the badge on the home screen's Interviews card.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{{count} interview needs you} other{{count} interviews need you}}'**
  String interviewsToDo(num count);

  /// No description provided for @myInterviewsTitle.
  ///
  /// In en, this message translates to:
  /// **'My interviews'**
  String get myInterviewsTitle;

  /// No description provided for @interviewsUpcoming.
  ///
  /// In en, this message translates to:
  /// **'Coming up'**
  String get interviewsUpcoming;

  /// No description provided for @interviewsPast.
  ///
  /// In en, this message translates to:
  /// **'Past'**
  String get interviewsPast;

  /// No description provided for @interviewsNoUpcoming.
  ///
  /// In en, this message translates to:
  /// **'No interviews coming up.'**
  String get interviewsNoUpcoming;

  /// No description provided for @interviewsNoPast.
  ///
  /// In en, this message translates to:
  /// **'None yet.'**
  String get interviewsNoPast;

  /// No description provided for @interviewsLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'We could not load your interviews.'**
  String get interviewsLoadFailed;

  /// How an interview is held.
  ///
  /// In en, this message translates to:
  /// **'{kind, select, in_person{In person} phone{By phone} video{By video} other{Interview}}'**
  String interviewKindName(String kind);

  /// No description provided for @interviewStatusName.
  ///
  /// In en, this message translates to:
  /// **'{status, select, scheduled{Scheduled} completed{Completed} cancelled{Cancelled} other{Unknown}}'**
  String interviewStatusName(String status);

  /// No description provided for @interviewScorecardIn.
  ///
  /// In en, this message translates to:
  /// **'Scorecard in'**
  String get interviewScorecardIn;

  /// No description provided for @interviewScorecardToDo.
  ///
  /// In en, this message translates to:
  /// **'Scorecard to do'**
  String get interviewScorecardToDo;

  /// The position a candidate is interviewed for.
  ///
  /// In en, this message translates to:
  /// **'For {title}'**
  String interviewForOpening(String title);

  /// No description provided for @interviewTitle.
  ///
  /// In en, this message translates to:
  /// **'Interview'**
  String get interviewTitle;

  /// No description provided for @interviewLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'We could not load this interview.'**
  String get interviewLoadFailed;

  /// No description provided for @interviewGone.
  ///
  /// In en, this message translates to:
  /// **'You are no longer on this interview\'s panel.'**
  String get interviewGone;

  /// No description provided for @interviewWhen.
  ///
  /// In en, this message translates to:
  /// **'When (Bangladesh time)'**
  String get interviewWhen;

  /// No description provided for @interviewPlace.
  ///
  /// In en, this message translates to:
  /// **'Place'**
  String get interviewPlace;

  /// No description provided for @interviewPhoneNote.
  ///
  /// In en, this message translates to:
  /// **'Phone note'**
  String get interviewPhoneNote;

  /// No description provided for @interviewMeetingLink.
  ///
  /// In en, this message translates to:
  /// **'Meeting link'**
  String get interviewMeetingLink;

  /// No description provided for @interviewJoinCall.
  ///
  /// In en, this message translates to:
  /// **'Join the video call'**
  String get interviewJoinCall;

  /// No description provided for @interviewLinkFailed.
  ///
  /// In en, this message translates to:
  /// **'The link could not be opened.'**
  String get interviewLinkFailed;

  /// No description provided for @interviewHrNotes.
  ///
  /// In en, this message translates to:
  /// **'From HR'**
  String get interviewHrNotes;

  /// No description provided for @interviewCoverNote.
  ///
  /// In en, this message translates to:
  /// **'The candidate\'s note'**
  String get interviewCoverNote;

  /// No description provided for @interviewOpenCv.
  ///
  /// In en, this message translates to:
  /// **'Open the CV'**
  String get interviewOpenCv;

  /// No description provided for @interviewNoCv.
  ///
  /// In en, this message translates to:
  /// **'No CV'**
  String get interviewNoCv;

  /// No description provided for @interviewCvGone.
  ///
  /// In en, this message translates to:
  /// **'The CV is no longer available.'**
  String get interviewCvGone;

  /// No description provided for @interviewCvNoApp.
  ///
  /// In en, this message translates to:
  /// **'No app on this phone can open this CV. Install a PDF or Word reader and try again.'**
  String get interviewCvNoApp;

  /// No description provided for @interviewPanel.
  ///
  /// In en, this message translates to:
  /// **'Panel'**
  String get interviewPanel;

  /// No description provided for @scorecardTitle.
  ///
  /// In en, this message translates to:
  /// **'Your scorecard'**
  String get scorecardTitle;

  /// No description provided for @scorecardIntro.
  ///
  /// In en, this message translates to:
  /// **'Rate each criterion from 1 (poor) to 5 (excellent).'**
  String get scorecardIntro;

  /// No description provided for @scorecardRateThis.
  ///
  /// In en, this message translates to:
  /// **'Rate this from 1 to 5'**
  String get scorecardRateThis;

  /// Read out for each rating button.
  ///
  /// In en, this message translates to:
  /// **'{rating} out of 5'**
  String scorecardRatingOption(int rating);

  /// A criterion's rating on a submitted scorecard.
  ///
  /// In en, this message translates to:
  /// **'{rating} / 5'**
  String scorecardRating(int rating);

  /// No description provided for @scorecardRecommendation.
  ///
  /// In en, this message translates to:
  /// **'Recommendation'**
  String get scorecardRecommendation;

  /// No description provided for @scorecardChooseRecommendation.
  ///
  /// In en, this message translates to:
  /// **'Choose a recommendation'**
  String get scorecardChooseRecommendation;

  /// An interviewer's recommendation on a candidate.
  ///
  /// In en, this message translates to:
  /// **'{value, select, strong_no{Strong no} no{No} yes{Yes} strong_yes{Strong yes} other{Unknown}}'**
  String recommendationName(String value);

  /// No description provided for @scorecardFeedback.
  ///
  /// In en, this message translates to:
  /// **'Notes'**
  String get scorecardFeedback;

  /// No description provided for @scorecardFeedbackHint.
  ///
  /// In en, this message translates to:
  /// **'About the interview and the work. The candidate can ask for these notes to be erased.'**
  String get scorecardFeedbackHint;

  /// No description provided for @scorecardSubmit.
  ///
  /// In en, this message translates to:
  /// **'Submit scorecard'**
  String get scorecardSubmit;

  /// No description provided for @scorecardUpdate.
  ///
  /// In en, this message translates to:
  /// **'Update scorecard'**
  String get scorecardUpdate;

  /// No description provided for @scorecardSubmitted.
  ///
  /// In en, this message translates to:
  /// **'Scorecard submitted'**
  String get scorecardSubmitted;

  /// No description provided for @scorecardUpdated.
  ///
  /// In en, this message translates to:
  /// **'Scorecard updated'**
  String get scorecardUpdated;

  /// No description provided for @scorecardIncomplete.
  ///
  /// In en, this message translates to:
  /// **'Rate every criterion and choose a recommendation.'**
  String get scorecardIncomplete;

  /// No description provided for @scorecardSubmittedOn.
  ///
  /// In en, this message translates to:
  /// **'Submitted {date}'**
  String scorecardSubmittedOn(String date);

  /// No description provided for @scorecardClosed.
  ///
  /// In en, this message translates to:
  /// **'This application is closed, so scorecards can no longer change.'**
  String get scorecardClosed;

  /// No description provided for @scorecardCancelled.
  ///
  /// In en, this message translates to:
  /// **'This interview was cancelled.'**
  String get scorecardCancelled;

  /// No description provided for @scorecardCriteriaChanged.
  ///
  /// In en, this message translates to:
  /// **'The criteria for this position have changed. Check your ratings and submit again.'**
  String get scorecardCriteriaChanged;

  /// No description provided for @scorecardOthersTitle.
  ///
  /// In en, this message translates to:
  /// **'The other interviewers\' scorecards'**
  String get scorecardOthersTitle;

  /// No description provided for @scorecardOthersHidden.
  ///
  /// In en, this message translates to:
  /// **'You will see the other interviewers\' scorecards once you have submitted yours, so that yours is your own view.'**
  String get scorecardOthersHidden;

  /// No description provided for @scorecardOthersNone.
  ///
  /// In en, this message translates to:
  /// **'No one else has submitted a scorecard yet.'**
  String get scorecardOthersNone;

  /// No description provided for @performanceTitle.
  ///
  /// In en, this message translates to:
  /// **'Performance'**
  String get performanceTitle;

  /// No description provided for @performanceSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Your goals and reviews, and the feedback colleagues ask of you'**
  String get performanceSubtitle;

  /// Read out for the badge on the home screen's Performance card.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{{count} task waits for you} other{{count} tasks wait for you}}'**
  String performanceTasksWaiting(num count);

  /// No description provided for @performanceLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'We could not load your performance page.'**
  String get performanceLoadFailed;

  /// No description provided for @performanceTasksTitle.
  ///
  /// In en, this message translates to:
  /// **'What waits for you'**
  String get performanceTasksTitle;

  /// No description provided for @performanceNoTasks.
  ///
  /// In en, this message translates to:
  /// **'Nothing waits for you.'**
  String get performanceNoTasks;

  /// When a task or step is due.
  ///
  /// In en, this message translates to:
  /// **'By {date}'**
  String performanceDueBy(String date);

  /// Under a task the app does not handle, such as writing a manager review.
  ///
  /// In en, this message translates to:
  /// **'Done in the Good People web app'**
  String get performanceTaskOnWeb;

  /// No description provided for @performanceOnTheWeb.
  ///
  /// In en, this message translates to:
  /// **'Writing your team\'s reviews, calibration, review cycles, improvement plans and probation reviews are done in the Good People web app.'**
  String get performanceOnTheWeb;

  /// A percent; value is already in the UI language's digits.
  ///
  /// In en, this message translates to:
  /// **'{value}%'**
  String performancePercent(String value);

  /// No description provided for @performanceChooseRating.
  ///
  /// In en, this message translates to:
  /// **'Choose a rating'**
  String get performanceChooseRating;

  /// The words for a rating from 1 to 5, always shown beside the number.
  ///
  /// In en, this message translates to:
  /// **'{rating, select, 1{Well below expectations} 2{Below expectations} 3{Meets expectations} 4{Above expectations} 5{Well above expectations} other{Not rated}}'**
  String ratingName(String rating);

  /// No description provided for @taskSelfReview.
  ///
  /// In en, this message translates to:
  /// **'Your self review · {cycle}'**
  String taskSelfReview(String cycle);

  /// No description provided for @taskAcknowledge.
  ///
  /// In en, this message translates to:
  /// **'Read and acknowledge your review · {cycle}'**
  String taskAcknowledge(String cycle);

  /// No description provided for @taskPeerAnswer.
  ///
  /// In en, this message translates to:
  /// **'Feedback on {person} · {cycle}'**
  String taskPeerAnswer(String person, String cycle);

  /// No description provided for @taskPeerApprove.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{Approve {count} peer for {person}} other{Approve {count} peers for {person}}}'**
  String taskPeerApprove(num count, String person);

  /// No description provided for @taskGoalsAgree.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{Agree {count} goal of {person}} other{Agree {count} goals of {person}}}'**
  String taskGoalsAgree(num count, String person);

  /// No description provided for @taskManagerReview.
  ///
  /// In en, this message translates to:
  /// **'Review {person} · {cycle}'**
  String taskManagerReview(String person, String cycle);

  /// No description provided for @taskNoManager.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{{count} review without a manager · {cycle}} other{{count} reviews without a manager · {cycle}}}'**
  String taskNoManager(num count, String cycle);

  /// No description provided for @taskProbationReview.
  ///
  /// In en, this message translates to:
  /// **'Probation review of {person}'**
  String taskProbationReview(String person);

  /// A task of a kind this version of the app does not know.
  ///
  /// In en, this message translates to:
  /// **'A performance task'**
  String get taskOther;

  /// No description provided for @myGoalsTitle.
  ///
  /// In en, this message translates to:
  /// **'My goals'**
  String get myGoalsTitle;

  /// No description provided for @myGoalsNone.
  ///
  /// In en, this message translates to:
  /// **'You have no goals yet.'**
  String get myGoalsNone;

  /// No description provided for @myGoalsCounts.
  ///
  /// In en, this message translates to:
  /// **'{total, plural, one{{total} goal} other{{total} goals}}: {agreed} agreed, {draft} still to agree, {completed} completed.'**
  String myGoalsCounts(
    num total,
    String agreed,
    String draft,
    String completed,
  );

  /// No description provided for @myReviewsTitle.
  ///
  /// In en, this message translates to:
  /// **'My reviews'**
  String get myReviewsTitle;

  /// No description provided for @myReviewsNone.
  ///
  /// In en, this message translates to:
  /// **'You have not been in a review cycle yet.'**
  String get myReviewsNone;

  /// No description provided for @goalsLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'We could not load your goals.'**
  String get goalsLoadFailed;

  /// No description provided for @goalsNoEmployee.
  ///
  /// In en, this message translates to:
  /// **'This login has no employee record, so it has no goals of its own.'**
  String get goalsNoEmployee;

  /// No description provided for @goalsNone.
  ///
  /// In en, this message translates to:
  /// **'No goals yet.'**
  String get goalsNone;

  /// No description provided for @goalsAgreedWith.
  ///
  /// In en, this message translates to:
  /// **'Your goals are agreed with {name}.'**
  String goalsAgreedWith(String name);

  /// No description provided for @goalsOutsideCycles.
  ///
  /// In en, this message translates to:
  /// **'Outside review cycles'**
  String get goalsOutsideCycles;

  /// No description provided for @goalsDraftOnWeb.
  ///
  /// In en, this message translates to:
  /// **'New goals are drafted, and goals changed, completed or dropped, in the Good People web app.'**
  String get goalsDraftOnWeb;

  /// No description provided for @goalsSubmit.
  ///
  /// In en, this message translates to:
  /// **'Submit for agreement'**
  String get goalsSubmit;

  /// No description provided for @goalsSubmitted.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, one{{count} goal sent} other{{count} goals sent}} to your manager for agreement.'**
  String goalsSubmitted(num count);

  /// No description provided for @goalsSubmittedAlready.
  ///
  /// In en, this message translates to:
  /// **'These goals were already sent; your manager has them.'**
  String get goalsSubmittedAlready;

  /// No description provided for @goalsReportsTo.
  ///
  /// In en, this message translates to:
  /// **'Reports to {name}'**
  String goalsReportsTo(String name);

  /// An objective has key results; a KPI has a measure and a target.
  ///
  /// In en, this message translates to:
  /// **'{kind, select, objective{Objective} kpi{KPI} other{Goal}}'**
  String goalKindName(String kind);

  /// No description provided for @goalStatusName.
  ///
  /// In en, this message translates to:
  /// **'{status, select, draft{Draft} agreed{Agreed} completed{Completed} dropped{Dropped} other{Unknown}}'**
  String goalStatusName(String status);

  /// A goal's share of the person's goals for a cycle.
  ///
  /// In en, this message translates to:
  /// **'weight {weight}'**
  String goalWeight(String weight);

  /// No description provided for @goalDue.
  ///
  /// In en, this message translates to:
  /// **'due {date}'**
  String goalDue(String date);

  /// No description provided for @goalKeyResultsDone.
  ///
  /// In en, this message translates to:
  /// **'{done} of {total} key results done'**
  String goalKeyResultsDone(String done, String total);

  /// No description provided for @goalMeasure.
  ///
  /// In en, this message translates to:
  /// **'{value} {unit} against a target of {target} {unit}'**
  String goalMeasure(String value, String target, String unit);

  /// No description provided for @goalMeasureNone.
  ///
  /// In en, this message translates to:
  /// **'Target {target} {unit}; no value yet'**
  String goalMeasureNone(String target, String unit);

  /// No description provided for @goalMeasureShort.
  ///
  /// In en, this message translates to:
  /// **'{current} of {target} {unit}'**
  String goalMeasureShort(String current, String target, String unit);

  /// No description provided for @goalDirectionName.
  ///
  /// In en, this message translates to:
  /// **'{direction, select, higher{higher is better} lower{lower is better} other{}}'**
  String goalDirectionName(String direction);

  /// No description provided for @goalProgressLabel.
  ///
  /// In en, this message translates to:
  /// **'Progress'**
  String get goalProgressLabel;

  /// No description provided for @goalTitle.
  ///
  /// In en, this message translates to:
  /// **'Goal'**
  String get goalTitle;

  /// No description provided for @goalLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'We could not load this goal.'**
  String get goalLoadFailed;

  /// No description provided for @goalGone.
  ///
  /// In en, this message translates to:
  /// **'This goal is not open to you.'**
  String get goalGone;

  /// No description provided for @goalDropped.
  ///
  /// In en, this message translates to:
  /// **'Dropped: {note}'**
  String goalDropped(String note);

  /// No description provided for @goalProgressTitle.
  ///
  /// In en, this message translates to:
  /// **'Progress'**
  String get goalProgressTitle;

  /// people is empty for one person, else goalReadingPeople.
  ///
  /// In en, this message translates to:
  /// **'From attendance: present on {present} of {working} working days{people}, {from} to {to}.'**
  String goalReadingAttendance(
    String present,
    String working,
    String people,
    String from,
    String to,
  );

  /// Whose records a unit goal reads.
  ///
  /// In en, this message translates to:
  /// **' ({count} people)'**
  String goalReadingPeople(String count);

  /// No description provided for @goalReadingNoAttendance.
  ///
  /// In en, this message translates to:
  /// **'From attendance: no working days processed yet, {from} to {to}.'**
  String goalReadingNoAttendance(String from, String to);

  /// people is empty for one person, else goalReadingPeople.
  ///
  /// In en, this message translates to:
  /// **'From production: {pieces} pieces against a target of {target}{people}, {from} to {to}.'**
  String goalReadingProduction(
    String pieces,
    String target,
    String people,
    String from,
    String to,
  );

  /// No description provided for @goalReadingNoProduction.
  ///
  /// In en, this message translates to:
  /// **'From production: no work against a day target yet, {from} to {to}.'**
  String goalReadingNoProduction(String from, String to);

  /// No description provided for @goalReadingClosed.
  ///
  /// In en, this message translates to:
  /// **'This goal is closed; its value is as it was last read.'**
  String get goalReadingClosed;

  /// No description provided for @goalSourceHint.
  ///
  /// In en, this message translates to:
  /// **'{source, select, attendance_rate{Read from processed attendance: the share of scheduled working days present. Approved leave, weekly offs and holidays do not count against it.} production_target{Read from daily production: pieces made against the day targets of the operations worked.} other{The value is typed at each check-in.}}'**
  String goalSourceHint(String source);

  /// Where a KPI's value comes from.
  ///
  /// In en, this message translates to:
  /// **'{source, select, manual{Typed in check-ins} attendance_rate{Attendance rate, from attendance} production_target{Output against target, from production} other{Unknown}}'**
  String goalSourceName(String source);

  /// No description provided for @goalKeyResultDone.
  ///
  /// In en, this message translates to:
  /// **'done'**
  String get goalKeyResultDone;

  /// No description provided for @goalKeyResultOpen.
  ///
  /// In en, this message translates to:
  /// **'not done yet'**
  String get goalKeyResultOpen;

  /// No description provided for @goalDetailsTitle.
  ///
  /// In en, this message translates to:
  /// **'Details'**
  String get goalDetailsTitle;

  /// No description provided for @goalStartsOn.
  ///
  /// In en, this message translates to:
  /// **'Starts'**
  String get goalStartsOn;

  /// No description provided for @goalDueOn.
  ///
  /// In en, this message translates to:
  /// **'Due'**
  String get goalDueOn;

  /// No description provided for @goalValueFrom.
  ///
  /// In en, this message translates to:
  /// **'Value from'**
  String get goalValueFrom;

  /// No description provided for @goalServes.
  ///
  /// In en, this message translates to:
  /// **'Serves'**
  String get goalServes;

  /// No description provided for @goalServesNothing.
  ///
  /// In en, this message translates to:
  /// **'No other goal'**
  String get goalServesNothing;

  /// No description provided for @goalCheckinsTitle.
  ///
  /// In en, this message translates to:
  /// **'Check-ins'**
  String get goalCheckinsTitle;

  /// No description provided for @goalNoCheckins.
  ///
  /// In en, this message translates to:
  /// **'No check-ins yet.'**
  String get goalNoCheckins;

  /// A KPI value typed at a check-in.
  ///
  /// In en, this message translates to:
  /// **'value {value} {unit}'**
  String goalCheckinValue(String value, String unit);

  /// No description provided for @goalAgree.
  ///
  /// In en, this message translates to:
  /// **'Agree'**
  String get goalAgree;

  /// No description provided for @goalAgreed.
  ///
  /// In en, this message translates to:
  /// **'Agreed.'**
  String get goalAgreed;

  /// Agrees every draft of one person for a cycle; total is the cycle's weight once agreed.
  ///
  /// In en, this message translates to:
  /// **'Agree all {count} ({total})'**
  String goalAgreeAll(String count, String total);

  /// No description provided for @goalAgreeAllNoCycle.
  ///
  /// In en, this message translates to:
  /// **'Agree all {count}'**
  String goalAgreeAllNoCycle(String count);

  /// No description provided for @goalWeights.
  ///
  /// In en, this message translates to:
  /// **'Weights: {total} of 100%'**
  String goalWeights(String total);

  /// No description provided for @goalWeightsSplit.
  ///
  /// In en, this message translates to:
  /// **'agreed {agreed}, drafts {draft}'**
  String goalWeightsSplit(String agreed, String draft);

  /// No description provided for @goalCheckinKeyResults.
  ///
  /// In en, this message translates to:
  /// **'Key results done'**
  String get goalCheckinKeyResults;

  /// No description provided for @goalCheckinProgress.
  ///
  /// In en, this message translates to:
  /// **'Progress, in percent'**
  String get goalCheckinProgress;

  /// No description provided for @goalCheckinProgressHint.
  ///
  /// In en, this message translates to:
  /// **'How far the goal has come, 0 to 100.'**
  String get goalCheckinProgressHint;

  /// No description provided for @goalCheckinProgressInvalid.
  ///
  /// In en, this message translates to:
  /// **'Give a whole number from 0 to 100'**
  String get goalCheckinProgressInvalid;

  /// No description provided for @goalCheckinValueLabel.
  ///
  /// In en, this message translates to:
  /// **'Value now ({unit})'**
  String goalCheckinValueLabel(String unit);

  /// No description provided for @goalCheckinValueInvalid.
  ///
  /// In en, this message translates to:
  /// **'Give a number, with at most two decimals'**
  String get goalCheckinValueInvalid;

  /// No description provided for @goalCheckinEmpty.
  ///
  /// In en, this message translates to:
  /// **'Give the progress, a value or a note'**
  String get goalCheckinEmpty;

  /// No description provided for @goalCheckinFromRecords.
  ///
  /// In en, this message translates to:
  /// **'The value comes from the records; add a note on how it is going.'**
  String get goalCheckinFromRecords;

  /// No description provided for @goalCheckinNote.
  ///
  /// In en, this message translates to:
  /// **'Note'**
  String get goalCheckinNote;

  /// No description provided for @goalCheckinNoteRequired.
  ///
  /// In en, this message translates to:
  /// **'Write a note on how it is going'**
  String get goalCheckinNoteRequired;

  /// No description provided for @goalCheckinAdd.
  ///
  /// In en, this message translates to:
  /// **'Add check-in'**
  String get goalCheckinAdd;

  /// No description provided for @goalCheckinSaved.
  ///
  /// In en, this message translates to:
  /// **'Check-in added.'**
  String get goalCheckinSaved;

  /// No description provided for @goalErrorClosed.
  ///
  /// In en, this message translates to:
  /// **'This goal is closed and no longer changes.'**
  String get goalErrorClosed;

  /// No description provided for @goalErrorCycleClosed.
  ///
  /// In en, this message translates to:
  /// **'This review cycle is past setting goals; its goals no longer change.'**
  String get goalErrorCycleClosed;

  /// No description provided for @goalErrorNotDraft.
  ///
  /// In en, this message translates to:
  /// **'This goal is no longer a draft.'**
  String get goalErrorNotDraft;

  /// No description provided for @goalErrorWeightRequired.
  ///
  /// In en, this message translates to:
  /// **'Give each goal of the cycle a weight, on the web, before agreeing it.'**
  String get goalErrorWeightRequired;

  /// No description provided for @goalErrorWeightsOver.
  ///
  /// In en, this message translates to:
  /// **'The agreed goals for this cycle would weigh more than 100%.'**
  String get goalErrorWeightsOver;

  /// No description provided for @goalErrorWeightsTotal.
  ///
  /// In en, this message translates to:
  /// **'A person\'s agreed goals for a cycle must weigh 100% together.'**
  String get goalErrorWeightsTotal;

  /// No description provided for @goalErrorNoDrafts.
  ///
  /// In en, this message translates to:
  /// **'There are no draft goals to send or agree.'**
  String get goalErrorNoDrafts;

  /// No description provided for @teamGoalsTitle.
  ///
  /// In en, this message translates to:
  /// **'Goals to agree'**
  String get teamGoalsTitle;

  /// No description provided for @teamGoalsLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'We could not load your team\'s goals.'**
  String get teamGoalsLoadFailed;

  /// No description provided for @teamGoalsNone.
  ///
  /// In en, this message translates to:
  /// **'Nothing waits for your agreement.'**
  String get teamGoalsNone;

  /// No description provided for @teamGoalsToAgree.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =0{Nothing waits for your agreement.} one{{count} goal waits for your agreement.} other{{count} goals wait for your agreement.}}'**
  String teamGoalsToAgree(num count);

  /// No description provided for @reviewTitle.
  ///
  /// In en, this message translates to:
  /// **'Review'**
  String get reviewTitle;

  /// No description provided for @reviewLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'We could not load this review.'**
  String get reviewLoadFailed;

  /// No description provided for @reviewGone.
  ///
  /// In en, this message translates to:
  /// **'This review is not open to you.'**
  String get reviewGone;

  /// No description provided for @reviewMine.
  ///
  /// In en, this message translates to:
  /// **'My review: {cycle}'**
  String reviewMine(String cycle);

  /// No description provided for @reviewManager.
  ///
  /// In en, this message translates to:
  /// **'Manager: {name}'**
  String reviewManager(String name);

  /// No description provided for @reviewNoManager.
  ///
  /// In en, this message translates to:
  /// **'No manager: HR writes it'**
  String get reviewNoManager;

  /// Where a review is.
  ///
  /// In en, this message translates to:
  /// **'{status, select, self{Self review} manager{With the manager} calibration{In calibration} released{Released} acknowledged{Acknowledged} other{Unknown}}'**
  String reviewStatusName(String status);

  /// Someone else's review, such as one the login writes as a manager.
  ///
  /// In en, this message translates to:
  /// **'You read and write this review in the Good People web app.'**
  String get reviewOnWeb;

  /// No description provided for @reviewOutcome.
  ///
  /// In en, this message translates to:
  /// **'Outcome'**
  String get reviewOutcome;

  /// No description provided for @reviewFinalRating.
  ///
  /// In en, this message translates to:
  /// **'Final rating'**
  String get reviewFinalRating;

  /// No description provided for @reviewGoalScore.
  ///
  /// In en, this message translates to:
  /// **'Goal score'**
  String get reviewGoalScore;

  /// No description provided for @reviewReleasedOn.
  ///
  /// In en, this message translates to:
  /// **'Released on'**
  String get reviewReleasedOn;

  /// No description provided for @reviewNotRated.
  ///
  /// In en, this message translates to:
  /// **'Not rated'**
  String get reviewNotRated;

  /// No description provided for @reviewGoalsTitle.
  ///
  /// In en, this message translates to:
  /// **'Goals'**
  String get reviewGoalsTitle;

  /// No description provided for @reviewNoGoals.
  ///
  /// In en, this message translates to:
  /// **'No agreed goals for this cycle: the review rates the competencies only.'**
  String get reviewNoGoals;

  /// No description provided for @reviewSelfTitle.
  ///
  /// In en, this message translates to:
  /// **'Self review'**
  String get reviewSelfTitle;

  /// No description provided for @reviewWithManager.
  ///
  /// In en, this message translates to:
  /// **'Submitted. Your manager reviews it next; you read the outcome once HR releases it.'**
  String get reviewWithManager;

  /// No description provided for @reviewManagerOnly.
  ///
  /// In en, this message translates to:
  /// **'Your manager reviews you for this cycle. You read the outcome once HR releases it.'**
  String get reviewManagerOnly;

  /// No description provided for @reviewNoSelf.
  ///
  /// In en, this message translates to:
  /// **'No self review in this review.'**
  String get reviewNoSelf;

  /// No description provided for @reviewManagerTitle.
  ///
  /// In en, this message translates to:
  /// **'Manager\'s review'**
  String get reviewManagerTitle;

  /// No description provided for @reviewNothingWritten.
  ///
  /// In en, this message translates to:
  /// **'Nothing written yet.'**
  String get reviewNothingWritten;

  /// No description provided for @reviewOverall.
  ///
  /// In en, this message translates to:
  /// **'Overall'**
  String get reviewOverall;

  /// No description provided for @reviewNamePeersOnWeb.
  ///
  /// In en, this message translates to:
  /// **'You can name colleagues to give feedback in the Good People web app.'**
  String get reviewNamePeersOnWeb;

  /// No description provided for @reviewErrorStepClosed.
  ///
  /// In en, this message translates to:
  /// **'This step of the review is no longer open for changes.'**
  String get reviewErrorStepClosed;

  /// No description provided for @selfReviewIntro.
  ///
  /// In en, this message translates to:
  /// **'Rate each goal and competency from 1 to 5, and say why. You can save a draft and come back; once submitted, your self review goes to your manager and cannot change.'**
  String get selfReviewIntro;

  /// No description provided for @selfReviewGoals.
  ///
  /// In en, this message translates to:
  /// **'Goals'**
  String get selfReviewGoals;

  /// No description provided for @selfReviewCompetencies.
  ///
  /// In en, this message translates to:
  /// **'Competencies'**
  String get selfReviewCompetencies;

  /// No description provided for @selfReviewComment.
  ///
  /// In en, this message translates to:
  /// **'Comment (optional)'**
  String get selfReviewComment;

  /// No description provided for @selfReviewOverall.
  ///
  /// In en, this message translates to:
  /// **'Overall comment'**
  String get selfReviewOverall;

  /// No description provided for @selfReviewIncomplete.
  ///
  /// In en, this message translates to:
  /// **'Rate every goal and competency before submitting.'**
  String get selfReviewIncomplete;

  /// No description provided for @selfReviewCommentUnrated.
  ///
  /// In en, this message translates to:
  /// **'A comment is kept with its rating: choose one, or clear the comment.'**
  String get selfReviewCommentUnrated;

  /// No description provided for @selfReviewSaveDraft.
  ///
  /// In en, this message translates to:
  /// **'Save draft'**
  String get selfReviewSaveDraft;

  /// No description provided for @selfReviewSubmit.
  ///
  /// In en, this message translates to:
  /// **'Submit to my manager'**
  String get selfReviewSubmit;

  /// No description provided for @selfReviewSaved.
  ///
  /// In en, this message translates to:
  /// **'Saved.'**
  String get selfReviewSaved;

  /// No description provided for @selfReviewSubmitted.
  ///
  /// In en, this message translates to:
  /// **'Submitted. Your manager reviews it next.'**
  String get selfReviewSubmitted;

  /// No description provided for @selfReviewConfirmTitle.
  ///
  /// In en, this message translates to:
  /// **'Submit your self review?'**
  String get selfReviewConfirmTitle;

  /// No description provided for @selfReviewConfirmBody.
  ///
  /// In en, this message translates to:
  /// **'It goes to your manager, and your ratings and comments can no longer change.'**
  String get selfReviewConfirmBody;

  /// No description provided for @acknowledgeTitle.
  ///
  /// In en, this message translates to:
  /// **'Acknowledgement'**
  String get acknowledgeTitle;

  /// No description provided for @acknowledgeIntro.
  ///
  /// In en, this message translates to:
  /// **'Please read your review, then acknowledge it. You can say whether you agree, and add your comments; they stay on record with it.'**
  String get acknowledgeIntro;

  /// No description provided for @acknowledgeQuestion.
  ///
  /// In en, this message translates to:
  /// **'Do you agree with your review?'**
  String get acknowledgeQuestion;

  /// No description provided for @acknowledgeAgree.
  ///
  /// In en, this message translates to:
  /// **'I agree'**
  String get acknowledgeAgree;

  /// No description provided for @acknowledgeDisagree.
  ///
  /// In en, this message translates to:
  /// **'I do not agree'**
  String get acknowledgeDisagree;

  /// No description provided for @acknowledgeComment.
  ///
  /// In en, this message translates to:
  /// **'Your comments'**
  String get acknowledgeComment;

  /// No description provided for @acknowledgeCommentHint.
  ///
  /// In en, this message translates to:
  /// **'Optional. Your manager and HR read them.'**
  String get acknowledgeCommentHint;

  /// No description provided for @acknowledgeSubmit.
  ///
  /// In en, this message translates to:
  /// **'Acknowledge'**
  String get acknowledgeSubmit;

  /// No description provided for @acknowledgeConfirmTitle.
  ///
  /// In en, this message translates to:
  /// **'Acknowledge your review?'**
  String get acknowledgeConfirmTitle;

  /// No description provided for @acknowledgeConfirmBody.
  ///
  /// In en, this message translates to:
  /// **'Your answer and comments stay on record with the review and cannot change.'**
  String get acknowledgeConfirmBody;

  /// No description provided for @acknowledgeDone.
  ///
  /// In en, this message translates to:
  /// **'Acknowledged.'**
  String get acknowledgeDone;

  /// No description provided for @acknowledgedAgreeing.
  ///
  /// In en, this message translates to:
  /// **'Acknowledged, agreeing'**
  String get acknowledgedAgreeing;

  /// No description provided for @acknowledgedDisagreeing.
  ///
  /// In en, this message translates to:
  /// **'Acknowledged, not agreeing'**
  String get acknowledgedDisagreeing;

  /// No description provided for @acknowledgeErrorAlready.
  ///
  /// In en, this message translates to:
  /// **'You have already acknowledged this review.'**
  String get acknowledgeErrorAlready;

  /// No description provided for @acknowledgeErrorNotReleased.
  ///
  /// In en, this message translates to:
  /// **'This review has not been released yet.'**
  String get acknowledgeErrorNotReleased;

  /// No description provided for @peerFeedbackTitle.
  ///
  /// In en, this message translates to:
  /// **'Peer feedback'**
  String get peerFeedbackTitle;

  /// No description provided for @peersLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'We could not load your peer feedback.'**
  String get peersLoadFailed;

  /// No description provided for @peersToApprove.
  ///
  /// In en, this message translates to:
  /// **'Peers to approve'**
  String get peersToApprove;

  /// No description provided for @peersToAnswer.
  ///
  /// In en, this message translates to:
  /// **'Feedback you are asked for'**
  String get peersToAnswer;

  /// No description provided for @peersNoneToAnswer.
  ///
  /// In en, this message translates to:
  /// **'Nobody has asked for your feedback.'**
  String get peersNoneToAnswer;

  /// A peer named to give feedback on someone's review.
  ///
  /// In en, this message translates to:
  /// **'{peer} for {person}'**
  String peerApproveLine(String peer, String person);

  /// No description provided for @peerApprove.
  ///
  /// In en, this message translates to:
  /// **'Approve'**
  String get peerApprove;

  /// No description provided for @peerDecline.
  ///
  /// In en, this message translates to:
  /// **'Decline'**
  String get peerDecline;

  /// No description provided for @peerApproved.
  ///
  /// In en, this message translates to:
  /// **'Approved. They have been asked for feedback.'**
  String get peerApproved;

  /// No description provided for @peerDeclined.
  ///
  /// In en, this message translates to:
  /// **'Declined.'**
  String get peerDeclined;

  /// No description provided for @peerFeedbackOn.
  ///
  /// In en, this message translates to:
  /// **'Feedback on {person}'**
  String peerFeedbackOn(String person);

  /// No description provided for @peerStatusAnswered.
  ///
  /// In en, this message translates to:
  /// **'Answered'**
  String get peerStatusAnswered;

  /// No description provided for @peerStatusWaiting.
  ///
  /// In en, this message translates to:
  /// **'Waiting for you'**
  String get peerStatusWaiting;

  /// No description provided for @peerStatusClosed.
  ///
  /// In en, this message translates to:
  /// **'Closed'**
  String get peerStatusClosed;

  /// No description provided for @peerRequestLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'We could not load this request.'**
  String get peerRequestLoadFailed;

  /// No description provided for @peerRequestGone.
  ///
  /// In en, this message translates to:
  /// **'This request is not open to you.'**
  String get peerRequestGone;

  /// No description provided for @peerRequestClosed.
  ///
  /// In en, this message translates to:
  /// **'This feedback can no longer be given.'**
  String get peerRequestClosed;

  /// No description provided for @peerAnswerPrivacy.
  ///
  /// In en, this message translates to:
  /// **'Answer honestly and kindly. The person sees your answers only together with those of other peers, and only when at least three have answered, never who wrote what; their manager sees each with its writer\'s name.'**
  String get peerAnswerPrivacy;

  /// The two questions every peer answers.
  ///
  /// In en, this message translates to:
  /// **'{question, select, strengths{What does this person do well?} improvements{What could they do better?} other{Question}}'**
  String peerQuestion(String question);

  /// No description provided for @peerAnswerRequired.
  ///
  /// In en, this message translates to:
  /// **'Write a few words'**
  String get peerAnswerRequired;

  /// No description provided for @peerRating.
  ///
  /// In en, this message translates to:
  /// **'Your overall rating'**
  String get peerRating;

  /// No description provided for @peerSend.
  ///
  /// In en, this message translates to:
  /// **'Send my feedback'**
  String get peerSend;

  /// No description provided for @peerConfirmTitle.
  ///
  /// In en, this message translates to:
  /// **'Send your feedback?'**
  String get peerConfirmTitle;

  /// No description provided for @peerConfirmBody.
  ///
  /// In en, this message translates to:
  /// **'Feedback is given once: it cannot be changed after it is sent.'**
  String get peerConfirmBody;

  /// No description provided for @peerThanks.
  ///
  /// In en, this message translates to:
  /// **'Thank you. Your feedback has been sent.'**
  String get peerThanks;

  /// No description provided for @peerYourAnswer.
  ///
  /// In en, this message translates to:
  /// **'Your feedback'**
  String get peerYourAnswer;

  /// No description provided for @peerSummaryTooFew.
  ///
  /// In en, this message translates to:
  /// **'Peer feedback is shown only when at least three peers have answered.'**
  String get peerSummaryTooFew;

  /// No description provided for @peerSummaryAverage.
  ///
  /// In en, this message translates to:
  /// **'Average peer rating: {average}'**
  String peerSummaryAverage(String average);

  /// No description provided for @peerSummaryTogether.
  ///
  /// In en, this message translates to:
  /// **'Answers are shown together, never who wrote what.'**
  String get peerSummaryTogether;

  /// No description provided for @peerErrorAnswered.
  ///
  /// In en, this message translates to:
  /// **'You have already given your feedback.'**
  String get peerErrorAnswered;

  /// No description provided for @peerErrorClosed.
  ///
  /// In en, this message translates to:
  /// **'This review\'s peer feedback is closed.'**
  String get peerErrorClosed;

  /// No description provided for @peerErrorDecided.
  ///
  /// In en, this message translates to:
  /// **'This peer has already been approved or declined.'**
  String get peerErrorDecided;

  /// No description provided for @learningTitle.
  ///
  /// In en, this message translates to:
  /// **'Learning'**
  String get learningTitle;

  /// No description provided for @learningSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Your training, required courses and completion records.'**
  String get learningSubtitle;

  /// No description provided for @learningRequirements.
  ///
  /// In en, this message translates to:
  /// **'My required training'**
  String get learningRequirements;

  /// No description provided for @learningNoneRequirements.
  ///
  /// In en, this message translates to:
  /// **'No required courses in this view.'**
  String get learningNoneRequirements;

  /// No description provided for @learningSessions.
  ///
  /// In en, this message translates to:
  /// **'Sessions'**
  String get learningSessions;

  /// No description provided for @learningNoneSessions.
  ///
  /// In en, this message translates to:
  /// **'No sessions to show.'**
  String get learningNoneSessions;

  /// No description provided for @learningCertificates.
  ///
  /// In en, this message translates to:
  /// **'Completion records'**
  String get learningCertificates;

  /// No description provided for @learningNoneCertificates.
  ///
  /// In en, this message translates to:
  /// **'No completion records yet.'**
  String get learningNoneCertificates;

  /// No description provided for @learningEnrol.
  ///
  /// In en, this message translates to:
  /// **'Enrol me'**
  String get learningEnrol;

  /// No description provided for @learningWithdraw.
  ///
  /// In en, this message translates to:
  /// **'Withdraw enrolment'**
  String get learningWithdraw;

  /// No description provided for @learningCurrent.
  ///
  /// In en, this message translates to:
  /// **'Current'**
  String get learningCurrent;

  /// No description provided for @learningDue.
  ///
  /// In en, this message translates to:
  /// **'Due'**
  String get learningDue;

  /// No description provided for @learningOverdue.
  ///
  /// In en, this message translates to:
  /// **'Overdue'**
  String get learningOverdue;

  /// No description provided for @learningEnrolled.
  ///
  /// In en, this message translates to:
  /// **'Enrolled'**
  String get learningEnrolled;

  /// No description provided for @learningWithdrawn.
  ///
  /// In en, this message translates to:
  /// **'Withdrawn'**
  String get learningWithdrawn;

  /// No description provided for @learningAttended.
  ///
  /// In en, this message translates to:
  /// **'Attended'**
  String get learningAttended;

  /// No description provided for @learningAbsent.
  ///
  /// In en, this message translates to:
  /// **'Absent'**
  String get learningAbsent;

  /// No description provided for @learningRevoked.
  ///
  /// In en, this message translates to:
  /// **'Revoked'**
  String get learningRevoked;

  /// No description provided for @learningNoExpiry.
  ///
  /// In en, this message translates to:
  /// **'No expiry'**
  String get learningNoExpiry;

  /// No description provided for @learningExpires.
  ///
  /// In en, this message translates to:
  /// **'Valid through'**
  String get learningExpires;

  /// No description provided for @learningDownload.
  ///
  /// In en, this message translates to:
  /// **'Download English PDF'**
  String get learningDownload;

  /// No description provided for @learningFull.
  ///
  /// In en, this message translates to:
  /// **'This session is full.'**
  String get learningFull;

  /// No description provided for @learningStarted.
  ///
  /// In en, this message translates to:
  /// **'Self enrolment and withdrawal close when the session starts.'**
  String get learningStarted;

  /// No description provided for @learningFixed.
  ///
  /// In en, this message translates to:
  /// **'Completed or cancelled sessions no longer accept changes.'**
  String get learningFixed;

  /// No description provided for @learningManageOnWeb.
  ///
  /// In en, this message translates to:
  /// **'Manage courses, attendance and fire drills on the web.'**
  String get learningManageOnWeb;

  /// No description provided for @learningLoadFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not load training'**
  String get learningLoadFailed;

  /// No description provided for @learningUnknown.
  ///
  /// In en, this message translates to:
  /// **'Recorded'**
  String get learningUnknown;

  /// No description provided for @learningExpired.
  ///
  /// In en, this message translates to:
  /// **'Expired'**
  String get learningExpired;

  /// No description provided for @serviceEngagement.
  ///
  /// In en, this message translates to:
  /// **'Engagement'**
  String get serviceEngagement;

  /// No description provided for @serviceServices.
  ///
  /// In en, this message translates to:
  /// **'Employee services'**
  String get serviceServices;

  /// No description provided for @serviceAnnouncements.
  ///
  /// In en, this message translates to:
  /// **'Announcements'**
  String get serviceAnnouncements;

  /// No description provided for @serviceSurveys.
  ///
  /// In en, this message translates to:
  /// **'Surveys and eNPS'**
  String get serviceSurveys;

  /// No description provided for @serviceRecognition.
  ///
  /// In en, this message translates to:
  /// **'Recognition'**
  String get serviceRecognition;

  /// No description provided for @serviceRequests.
  ///
  /// In en, this message translates to:
  /// **'HR requests'**
  String get serviceRequests;

  /// No description provided for @serviceAssets.
  ///
  /// In en, this message translates to:
  /// **'My issued assets'**
  String get serviceAssets;

  /// No description provided for @serviceInventory.
  ///
  /// In en, this message translates to:
  /// **'Company inventory'**
  String get serviceInventory;

  /// No description provided for @serviceIntroEngagement.
  ///
  /// In en, this message translates to:
  /// **'Company news, anonymous surveys and appreciation for colleagues.'**
  String get serviceIntroEngagement;

  /// No description provided for @serviceIntroServices.
  ///
  /// In en, this message translates to:
  /// **'Private requests to your HR team and your issued assets.'**
  String get serviceIntroServices;

  /// No description provided for @serviceNoEmployee.
  ///
  /// In en, this message translates to:
  /// **'An active employee record is needed to submit or acknowledge. HR tools are available below.'**
  String get serviceNoEmployee;

  /// No description provided for @serviceEmpty.
  ///
  /// In en, this message translates to:
  /// **'Nothing to show yet.'**
  String get serviceEmpty;

  /// No description provided for @serviceSaved.
  ///
  /// In en, this message translates to:
  /// **'Saved.'**
  String get serviceSaved;

  /// No description provided for @serviceHelp.
  ///
  /// In en, this message translates to:
  /// **'Help'**
  String get serviceHelp;

  /// No description provided for @serviceHrOnWeb.
  ///
  /// In en, this message translates to:
  /// **'HR authoring and management are available on the web.'**
  String get serviceHrOnWeb;

  /// No description provided for @serviceNewSurvey.
  ///
  /// In en, this message translates to:
  /// **'Create survey'**
  String get serviceNewSurvey;

  /// No description provided for @serviceNewAnnouncement.
  ///
  /// In en, this message translates to:
  /// **'Create announcement'**
  String get serviceNewAnnouncement;

  /// No description provided for @serviceNewRecognition.
  ///
  /// In en, this message translates to:
  /// **'Recognize a colleague'**
  String get serviceNewRecognition;

  /// No description provided for @serviceNewRequest.
  ///
  /// In en, this message translates to:
  /// **'Open HR request'**
  String get serviceNewRequest;

  /// No description provided for @serviceNewAsset.
  ///
  /// In en, this message translates to:
  /// **'Register asset'**
  String get serviceNewAsset;

  /// No description provided for @serviceAllRequests.
  ///
  /// In en, this message translates to:
  /// **'HR service queue'**
  String get serviceAllRequests;

  /// No description provided for @serviceMyRequests.
  ///
  /// In en, this message translates to:
  /// **'My requests'**
  String get serviceMyRequests;

  /// No description provided for @serviceCompany.
  ///
  /// In en, this message translates to:
  /// **'Company'**
  String get serviceCompany;

  /// No description provided for @serviceEmployee.
  ///
  /// In en, this message translates to:
  /// **'Employee'**
  String get serviceEmployee;

  /// No description provided for @serviceEmployeeCode.
  ///
  /// In en, this message translates to:
  /// **'Employee code'**
  String get serviceEmployeeCode;

  /// No description provided for @serviceTitle.
  ///
  /// In en, this message translates to:
  /// **'Title (English)'**
  String get serviceTitle;

  /// No description provided for @serviceTitleBn.
  ///
  /// In en, this message translates to:
  /// **'Title (Bangla)'**
  String get serviceTitleBn;

  /// No description provided for @serviceDescription.
  ///
  /// In en, this message translates to:
  /// **'Description (English)'**
  String get serviceDescription;

  /// No description provided for @serviceDescriptionBn.
  ///
  /// In en, this message translates to:
  /// **'Description (Bangla)'**
  String get serviceDescriptionBn;

  /// No description provided for @serviceBody.
  ///
  /// In en, this message translates to:
  /// **'Text (English)'**
  String get serviceBody;

  /// No description provided for @serviceBodyBn.
  ///
  /// In en, this message translates to:
  /// **'Text (Bangla)'**
  String get serviceBodyBn;

  /// No description provided for @serviceClosesAt.
  ///
  /// In en, this message translates to:
  /// **'Closes at (Dhaka time)'**
  String get serviceClosesAt;

  /// No description provided for @serviceThreshold.
  ///
  /// In en, this message translates to:
  /// **'Minimum responses for results'**
  String get serviceThreshold;

  /// No description provided for @serviceAnonymousNote.
  ///
  /// In en, this message translates to:
  /// **'Anonymous: no individual answers are stored. HR sees only the fixed cohort’s totals after closing and at least five responses. There are no subgroup reports.'**
  String get serviceAnonymousNote;

  /// No description provided for @serviceCohortNote.
  ///
  /// In en, this message translates to:
  /// **'Publishing freezes the company’s active employee audience. People without logins cannot respond by proxy.'**
  String get serviceCohortNote;

  /// No description provided for @serviceEnpsQuestion.
  ///
  /// In en, this message translates to:
  /// **'How likely are you to recommend this company as a place to work?'**
  String get serviceEnpsQuestion;

  /// No description provided for @serviceEnpsScale.
  ///
  /// In en, this message translates to:
  /// **'0 = not at all likely; 10 = extremely likely'**
  String get serviceEnpsScale;

  /// No description provided for @servicePulseScale.
  ///
  /// In en, this message translates to:
  /// **'1 = strongly disagree; 5 = strongly agree'**
  String get servicePulseScale;

  /// No description provided for @servicePulseQuestions.
  ///
  /// In en, this message translates to:
  /// **'Pulse questions (optional, maximum 10)'**
  String get servicePulseQuestions;

  /// No description provided for @serviceQuestion.
  ///
  /// In en, this message translates to:
  /// **'Question (English)'**
  String get serviceQuestion;

  /// No description provided for @serviceQuestionBn.
  ///
  /// In en, this message translates to:
  /// **'Question (Bangla)'**
  String get serviceQuestionBn;

  /// No description provided for @serviceAddQuestion.
  ///
  /// In en, this message translates to:
  /// **'Add question'**
  String get serviceAddQuestion;

  /// No description provided for @serviceRemove.
  ///
  /// In en, this message translates to:
  /// **'Remove'**
  String get serviceRemove;

  /// No description provided for @serviceChoose.
  ///
  /// In en, this message translates to:
  /// **'Choose'**
  String get serviceChoose;

  /// No description provided for @serviceSaveDraft.
  ///
  /// In en, this message translates to:
  /// **'Save draft'**
  String get serviceSaveDraft;

  /// No description provided for @serviceEditDraft.
  ///
  /// In en, this message translates to:
  /// **'Edit draft'**
  String get serviceEditDraft;

  /// No description provided for @servicePublish.
  ///
  /// In en, this message translates to:
  /// **'Publish'**
  String get servicePublish;

  /// No description provided for @serviceCloseSurvey.
  ///
  /// In en, this message translates to:
  /// **'Close survey'**
  String get serviceCloseSurvey;

  /// No description provided for @serviceSubmitSurvey.
  ///
  /// In en, this message translates to:
  /// **'Submit anonymous response'**
  String get serviceSubmitSurvey;

  /// No description provided for @serviceAlreadyResponded.
  ///
  /// In en, this message translates to:
  /// **'Your anonymous response has been recorded.'**
  String get serviceAlreadyResponded;

  /// No description provided for @serviceResults.
  ///
  /// In en, this message translates to:
  /// **'Survey results'**
  String get serviceResults;

  /// No description provided for @serviceResultsProtected.
  ///
  /// In en, this message translates to:
  /// **'Results are protected until the survey closes and at least {minimum} people respond. No response count is disclosed before then.'**
  String serviceResultsProtected(Object minimum);

  /// No description provided for @serviceResultsEmployee.
  ///
  /// In en, this message translates to:
  /// **'Individual responses and survey results are not shown to employees.'**
  String get serviceResultsEmployee;

  /// No description provided for @serviceEnps.
  ///
  /// In en, this message translates to:
  /// **'eNPS'**
  String get serviceEnps;

  /// No description provided for @serviceResponses.
  ///
  /// In en, this message translates to:
  /// **'Responses'**
  String get serviceResponses;

  /// No description provided for @serviceEligible.
  ///
  /// In en, this message translates to:
  /// **'Eligible employees'**
  String get serviceEligible;

  /// No description provided for @servicePromoters.
  ///
  /// In en, this message translates to:
  /// **'Promoters (9–10)'**
  String get servicePromoters;

  /// No description provided for @servicePassives.
  ///
  /// In en, this message translates to:
  /// **'Passives (7–8)'**
  String get servicePassives;

  /// No description provided for @serviceDetractors.
  ///
  /// In en, this message translates to:
  /// **'Detractors (0–6)'**
  String get serviceDetractors;

  /// No description provided for @serviceMean.
  ///
  /// In en, this message translates to:
  /// **'Mean'**
  String get serviceMean;

  /// No description provided for @serviceDistribution.
  ///
  /// In en, this message translates to:
  /// **'Counts for scores 1–5'**
  String get serviceDistribution;

  /// No description provided for @serviceClosed.
  ///
  /// In en, this message translates to:
  /// **'This survey is closed.'**
  String get serviceClosed;

  /// No description provided for @serviceFixed.
  ///
  /// In en, this message translates to:
  /// **'Published wording is fixed. For a correction, retire this notice and publish a replacement.'**
  String get serviceFixed;

  /// No description provided for @serviceRequiresAcknowledgement.
  ///
  /// In en, this message translates to:
  /// **'Require a policy acknowledgement'**
  String get serviceRequiresAcknowledgement;

  /// No description provided for @serviceDueOn.
  ///
  /// In en, this message translates to:
  /// **'Due on'**
  String get serviceDueOn;

  /// No description provided for @serviceExpiresOn.
  ///
  /// In en, this message translates to:
  /// **'Expires after'**
  String get serviceExpiresOn;

  /// No description provided for @servicePolicyNote.
  ///
  /// In en, this message translates to:
  /// **'Acknowledgement records that you read this notice. It is not agreement to changed employment terms or an electronic signature.'**
  String get servicePolicyNote;

  /// No description provided for @serviceAcknowledge.
  ///
  /// In en, this message translates to:
  /// **'I have read this notice'**
  String get serviceAcknowledge;

  /// No description provided for @serviceAcknowledged.
  ///
  /// In en, this message translates to:
  /// **'Acknowledged'**
  String get serviceAcknowledged;

  /// No description provided for @serviceOutstanding.
  ///
  /// In en, this message translates to:
  /// **'Outstanding'**
  String get serviceOutstanding;

  /// No description provided for @serviceRetire.
  ///
  /// In en, this message translates to:
  /// **'Retire'**
  String get serviceRetire;

  /// No description provided for @serviceReason.
  ///
  /// In en, this message translates to:
  /// **'Reason'**
  String get serviceReason;

  /// No description provided for @serviceReceipts.
  ///
  /// In en, this message translates to:
  /// **'Policy acknowledgement register'**
  String get serviceReceipts;

  /// No description provided for @serviceExpired.
  ///
  /// In en, this message translates to:
  /// **'Expired'**
  String get serviceExpired;

  /// No description provided for @servicePending.
  ///
  /// In en, this message translates to:
  /// **'Pending'**
  String get servicePending;

  /// No description provided for @serviceValue.
  ///
  /// In en, this message translates to:
  /// **'Value'**
  String get serviceValue;

  /// No description provided for @serviceMessage.
  ///
  /// In en, this message translates to:
  /// **'Message'**
  String get serviceMessage;

  /// No description provided for @serviceRecognitionNote.
  ///
  /// In en, this message translates to:
  /// **'Your name and message will be visible to colleagues in your company.'**
  String get serviceRecognitionNote;

  /// No description provided for @serviceWithdrawRecognition.
  ///
  /// In en, this message translates to:
  /// **'Withdraw / moderate'**
  String get serviceWithdrawRecognition;

  /// No description provided for @serviceFrom.
  ///
  /// In en, this message translates to:
  /// **'From'**
  String get serviceFrom;

  /// No description provided for @serviceTo.
  ///
  /// In en, this message translates to:
  /// **'To'**
  String get serviceTo;

  /// No description provided for @serviceCategory.
  ///
  /// In en, this message translates to:
  /// **'Category'**
  String get serviceCategory;

  /// No description provided for @servicePriority.
  ///
  /// In en, this message translates to:
  /// **'Priority'**
  String get servicePriority;

  /// No description provided for @serviceSubject.
  ///
  /// In en, this message translates to:
  /// **'Subject'**
  String get serviceSubject;

  /// No description provided for @serviceRequestBody.
  ///
  /// In en, this message translates to:
  /// **'Your request'**
  String get serviceRequestBody;

  /// No description provided for @serviceRequestPrivacy.
  ///
  /// In en, this message translates to:
  /// **'Visible only to you and authorized HR handlers of this company. Managers do not inherit access. For a statutory grievance or harassment concern, use the dedicated grievance channel.'**
  String get serviceRequestPrivacy;

  /// No description provided for @serviceGrievances.
  ///
  /// In en, this message translates to:
  /// **'Grievance channel'**
  String get serviceGrievances;

  /// No description provided for @serviceStatus.
  ///
  /// In en, this message translates to:
  /// **'Status'**
  String get serviceStatus;

  /// No description provided for @serviceAssignee.
  ///
  /// In en, this message translates to:
  /// **'HR handler'**
  String get serviceAssignee;

  /// No description provided for @serviceUnassigned.
  ///
  /// In en, this message translates to:
  /// **'Unassigned'**
  String get serviceUnassigned;

  /// No description provided for @serviceUpdateRequest.
  ///
  /// In en, this message translates to:
  /// **'Update request'**
  String get serviceUpdateRequest;

  /// No description provided for @serviceReply.
  ///
  /// In en, this message translates to:
  /// **'Send reply'**
  String get serviceReply;

  /// No description provided for @serviceReplyBody.
  ///
  /// In en, this message translates to:
  /// **'Reply'**
  String get serviceReplyBody;

  /// No description provided for @serviceInternal.
  ///
  /// In en, this message translates to:
  /// **'HR-only internal note'**
  String get serviceInternal;

  /// No description provided for @serviceInternalLabel.
  ///
  /// In en, this message translates to:
  /// **'Internal note — HR only'**
  String get serviceInternalLabel;

  /// No description provided for @serviceResolve.
  ///
  /// In en, this message translates to:
  /// **'Resolve request'**
  String get serviceResolve;

  /// No description provided for @serviceCloseRequest.
  ///
  /// In en, this message translates to:
  /// **'Close resolved request'**
  String get serviceCloseRequest;

  /// No description provided for @serviceReopen.
  ///
  /// In en, this message translates to:
  /// **'Reopen request'**
  String get serviceReopen;

  /// No description provided for @serviceCreatedAt.
  ///
  /// In en, this message translates to:
  /// **'Opened'**
  String get serviceCreatedAt;

  /// No description provided for @serviceUpdatedAt.
  ///
  /// In en, this message translates to:
  /// **'Updated'**
  String get serviceUpdatedAt;

  /// No description provided for @serviceRequestClosed.
  ///
  /// In en, this message translates to:
  /// **'This request is closed. Reopen it to continue.'**
  String get serviceRequestClosed;

  /// No description provided for @serviceTag.
  ///
  /// In en, this message translates to:
  /// **'Asset tag'**
  String get serviceTag;

  /// No description provided for @serviceName.
  ///
  /// In en, this message translates to:
  /// **'Name (English)'**
  String get serviceName;

  /// No description provided for @serviceNameBn.
  ///
  /// In en, this message translates to:
  /// **'Name (Bangla)'**
  String get serviceNameBn;

  /// No description provided for @serviceKind.
  ///
  /// In en, this message translates to:
  /// **'Kind'**
  String get serviceKind;

  /// No description provided for @serviceSerialNumber.
  ///
  /// In en, this message translates to:
  /// **'Serial number'**
  String get serviceSerialNumber;

  /// No description provided for @serviceIssueAsset.
  ///
  /// In en, this message translates to:
  /// **'Issue asset'**
  String get serviceIssueAsset;

  /// No description provided for @serviceIssuedOn.
  ///
  /// In en, this message translates to:
  /// **'Issued on'**
  String get serviceIssuedOn;

  /// No description provided for @serviceCondition.
  ///
  /// In en, this message translates to:
  /// **'Condition / notes'**
  String get serviceCondition;

  /// No description provided for @serviceIssueCondition.
  ///
  /// In en, this message translates to:
  /// **'Condition when issued'**
  String get serviceIssueCondition;

  /// No description provided for @serviceReturnCondition.
  ///
  /// In en, this message translates to:
  /// **'Condition when returned'**
  String get serviceReturnCondition;

  /// No description provided for @serviceReturnedOn.
  ///
  /// In en, this message translates to:
  /// **'Returned on'**
  String get serviceReturnedOn;

  /// No description provided for @serviceReturnAsset.
  ///
  /// In en, this message translates to:
  /// **'Record return'**
  String get serviceReturnAsset;

  /// No description provided for @serviceAcknowledgeAsset.
  ///
  /// In en, this message translates to:
  /// **'I received this asset'**
  String get serviceAcknowledgeAsset;

  /// No description provided for @serviceAssetNote.
  ///
  /// In en, this message translates to:
  /// **'Receipt only; no automatic payroll deduction. HR records returns and corrections.'**
  String get serviceAssetNote;

  /// No description provided for @serviceOverdue.
  ///
  /// In en, this message translates to:
  /// **'Overdue'**
  String get serviceOverdue;

  /// No description provided for @serviceIssued.
  ///
  /// In en, this message translates to:
  /// **'Issued'**
  String get serviceIssued;

  /// No description provided for @serviceAvailable.
  ///
  /// In en, this message translates to:
  /// **'Available'**
  String get serviceAvailable;

  /// No description provided for @serviceHistory.
  ///
  /// In en, this message translates to:
  /// **'Issue history'**
  String get serviceHistory;

  /// No description provided for @serviceStatesDraft.
  ///
  /// In en, this message translates to:
  /// **'Draft'**
  String get serviceStatesDraft;

  /// No description provided for @serviceStatesOpen.
  ///
  /// In en, this message translates to:
  /// **'Open'**
  String get serviceStatesOpen;

  /// No description provided for @serviceStatesInProgress.
  ///
  /// In en, this message translates to:
  /// **'In progress'**
  String get serviceStatesInProgress;

  /// No description provided for @serviceStatesResolved.
  ///
  /// In en, this message translates to:
  /// **'Resolved'**
  String get serviceStatesResolved;

  /// No description provided for @serviceStatesClosed.
  ///
  /// In en, this message translates to:
  /// **'Closed'**
  String get serviceStatesClosed;

  /// No description provided for @serviceStatesPublished.
  ///
  /// In en, this message translates to:
  /// **'Published'**
  String get serviceStatesPublished;

  /// No description provided for @serviceStatesRetired.
  ///
  /// In en, this message translates to:
  /// **'Retired'**
  String get serviceStatesRetired;

  /// No description provided for @serviceValuesTeamwork.
  ///
  /// In en, this message translates to:
  /// **'Teamwork'**
  String get serviceValuesTeamwork;

  /// No description provided for @serviceValuesService.
  ///
  /// In en, this message translates to:
  /// **'Service'**
  String get serviceValuesService;

  /// No description provided for @serviceValuesQuality.
  ///
  /// In en, this message translates to:
  /// **'Quality'**
  String get serviceValuesQuality;

  /// No description provided for @serviceValuesInitiative.
  ///
  /// In en, this message translates to:
  /// **'Initiative'**
  String get serviceValuesInitiative;

  /// No description provided for @serviceCategoriesLetters.
  ///
  /// In en, this message translates to:
  /// **'Letters'**
  String get serviceCategoriesLetters;

  /// No description provided for @serviceCategoriesPay.
  ///
  /// In en, this message translates to:
  /// **'Pay'**
  String get serviceCategoriesPay;

  /// No description provided for @serviceCategoriesLeave.
  ///
  /// In en, this message translates to:
  /// **'Leave'**
  String get serviceCategoriesLeave;

  /// No description provided for @serviceCategoriesBenefits.
  ///
  /// In en, this message translates to:
  /// **'Benefits'**
  String get serviceCategoriesBenefits;

  /// No description provided for @serviceCategoriesOther.
  ///
  /// In en, this message translates to:
  /// **'Other'**
  String get serviceCategoriesOther;

  /// No description provided for @servicePrioritiesNormal.
  ///
  /// In en, this message translates to:
  /// **'Normal'**
  String get servicePrioritiesNormal;

  /// No description provided for @servicePrioritiesUrgent.
  ///
  /// In en, this message translates to:
  /// **'Urgent'**
  String get servicePrioritiesUrgent;

  /// No description provided for @serviceKindsLaptop.
  ///
  /// In en, this message translates to:
  /// **'Laptop'**
  String get serviceKindsLaptop;

  /// No description provided for @serviceKindsPhone.
  ///
  /// In en, this message translates to:
  /// **'Phone'**
  String get serviceKindsPhone;

  /// No description provided for @serviceKindsIdCard.
  ///
  /// In en, this message translates to:
  /// **'ID card'**
  String get serviceKindsIdCard;

  /// No description provided for @serviceKindsVehicle.
  ///
  /// In en, this message translates to:
  /// **'Vehicle'**
  String get serviceKindsVehicle;

  /// No description provided for @serviceKindsEquipment.
  ///
  /// In en, this message translates to:
  /// **'Equipment'**
  String get serviceKindsEquipment;

  /// No description provided for @serviceKindsOther.
  ///
  /// In en, this message translates to:
  /// **'Other'**
  String get serviceKindsOther;

  /// No description provided for @serviceErrorsServiceEmployeeRequired.
  ///
  /// In en, this message translates to:
  /// **'An active employee record is required.'**
  String get serviceErrorsServiceEmployeeRequired;

  /// No description provided for @serviceErrorsSurveyDates.
  ///
  /// In en, this message translates to:
  /// **'Choose a future closing time.'**
  String get serviceErrorsSurveyDates;

  /// No description provided for @serviceErrorsSurveyCohort.
  ///
  /// In en, this message translates to:
  /// **'This company’s audience is smaller than the minimum reporting threshold.'**
  String get serviceErrorsSurveyCohort;

  /// No description provided for @serviceErrorsSurveyFixed.
  ///
  /// In en, this message translates to:
  /// **'Published surveys are fixed.'**
  String get serviceErrorsSurveyFixed;

  /// No description provided for @serviceErrorsSurveyClosed.
  ///
  /// In en, this message translates to:
  /// **'The survey is closed.'**
  String get serviceErrorsSurveyClosed;

  /// No description provided for @serviceErrorsSurveySubmitted.
  ///
  /// In en, this message translates to:
  /// **'You already responded.'**
  String get serviceErrorsSurveySubmitted;

  /// No description provided for @serviceErrorsSurveyAnswers.
  ///
  /// In en, this message translates to:
  /// **'Answer every question.'**
  String get serviceErrorsSurveyAnswers;

  /// No description provided for @serviceErrorsAnnouncementDates.
  ///
  /// In en, this message translates to:
  /// **'Choose a valid current or future date.'**
  String get serviceErrorsAnnouncementDates;

  /// No description provided for @serviceErrorsAnnouncementFixed.
  ///
  /// In en, this message translates to:
  /// **'This notice is fixed or no longer accepts acknowledgements.'**
  String get serviceErrorsAnnouncementFixed;

  /// No description provided for @serviceErrorsRecognitionSelf.
  ///
  /// In en, this message translates to:
  /// **'Recognize a colleague, not yourself.'**
  String get serviceErrorsRecognitionSelf;

  /// No description provided for @serviceErrorsRecognitionHidden.
  ///
  /// In en, this message translates to:
  /// **'This recognition was already withdrawn.'**
  String get serviceErrorsRecognitionHidden;

  /// No description provided for @serviceErrorsHrHandler.
  ///
  /// In en, this message translates to:
  /// **'Choose an active HR handler with access to this company.'**
  String get serviceErrorsHrHandler;

  /// No description provided for @serviceErrorsHrRequestClosed.
  ///
  /// In en, this message translates to:
  /// **'Reopen the request before replying or changing it.'**
  String get serviceErrorsHrRequestClosed;

  /// No description provided for @serviceErrorsHrRequestTransition.
  ///
  /// In en, this message translates to:
  /// **'This status change is not available.'**
  String get serviceErrorsHrRequestTransition;

  /// No description provided for @serviceErrorsAssetRetired.
  ///
  /// In en, this message translates to:
  /// **'This asset is retired.'**
  String get serviceErrorsAssetRetired;

  /// No description provided for @serviceErrorsAssetIssued.
  ///
  /// In en, this message translates to:
  /// **'This asset is already issued. Record its return first.'**
  String get serviceErrorsAssetIssued;

  /// No description provided for @serviceErrorsAssetReturned.
  ///
  /// In en, this message translates to:
  /// **'This issue was already returned.'**
  String get serviceErrorsAssetReturned;

  /// No description provided for @serviceErrorsAssetDates.
  ///
  /// In en, this message translates to:
  /// **'Check the issue, due and return dates. Recorded events cannot be future dated.'**
  String get serviceErrorsAssetDates;

  /// No description provided for @serviceErrorsAssetEmployeeScope.
  ///
  /// In en, this message translates to:
  /// **'The employee must work for this company on the issue date.'**
  String get serviceErrorsAssetEmployeeScope;

  /// No description provided for @serviceUnknown.
  ///
  /// In en, this message translates to:
  /// **'Not available'**
  String get serviceUnknown;

  /// No description provided for @serviceCancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get serviceCancel;

  /// No description provided for @serviceFieldRequired.
  ///
  /// In en, this message translates to:
  /// **'Complete this field.'**
  String get serviceFieldRequired;

  /// No description provided for @ssoMethod.
  ///
  /// In en, this message translates to:
  /// **'Organisation'**
  String get ssoMethod;

  /// No description provided for @ssoContinue.
  ///
  /// In en, this message translates to:
  /// **'Continue with single sign-on'**
  String get ssoContinue;

  /// No description provided for @ssoFinish.
  ///
  /// In en, this message translates to:
  /// **'Finish browser sign-in'**
  String get ssoFinish;

  /// No description provided for @ssoBrowserHint.
  ///
  /// In en, this message translates to:
  /// **'Sign in through your organisation in the browser, then return here and finish.'**
  String get ssoBrowserHint;

  /// No description provided for @ssoPending.
  ///
  /// In en, this message translates to:
  /// **'Browser sign-in is not complete yet. Finish there, then try again.'**
  String get ssoPending;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['ar', 'bn', 'en'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'ar':
      return AppLocalizationsAr();
    case 'bn':
      return AppLocalizationsBn();
    case 'en':
      return AppLocalizationsEn();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
