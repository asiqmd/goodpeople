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
