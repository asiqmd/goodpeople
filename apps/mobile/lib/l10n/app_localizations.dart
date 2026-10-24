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
