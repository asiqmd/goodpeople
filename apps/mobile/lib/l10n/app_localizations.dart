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
