import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

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
      <String>['bn', 'en'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
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
