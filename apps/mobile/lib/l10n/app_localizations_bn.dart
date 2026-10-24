// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Bengali Bangla (`bn`).
class AppLocalizationsBn extends AppLocalizations {
  AppLocalizationsBn([String locale = 'bn']) : super(locale);

  @override
  String get appTitle => 'গুড পিপল';

  @override
  String get signIn => 'সাইন ইন';

  @override
  String get signInSubtitle => 'আপনার ওয়ার্কস্পেসে সাইন ইন করুন';

  @override
  String get workspace => 'ওয়ার্কস্পেস';

  @override
  String get workspaceHint => 'যেমন: your-company';

  @override
  String get email => 'ইমেইল';

  @override
  String get password => 'পাসওয়ার্ড';

  @override
  String get showPassword => 'পাসওয়ার্ড দেখান';

  @override
  String get hidePassword => 'পাসওয়ার্ড লুকান';

  @override
  String get workspaceRequired => 'আপনার ওয়ার্কস্পেসের নাম লিখুন';

  @override
  String get emailRequired => 'আপনার ইমেইল লিখুন';

  @override
  String get emailInvalid => 'একটি সঠিক ইমেইল ঠিকানা লিখুন';

  @override
  String get passwordRequired => 'আপনার পাসওয়ার্ড লিখুন';

  @override
  String get signOut => 'সাইন আউট';

  @override
  String get language => 'ভাষা';

  @override
  String get yourModules => 'আপনার মডিউলসমূহ';

  @override
  String signedInAs(String name) {
    return '$name হিসেবে সাইন ইন করা আছে';
  }

  @override
  String get planLabel => 'প্ল্যান';

  @override
  String get billingLabel => 'বিলিং';

  @override
  String planName(String plan) {
    String _temp0 = intl.Intl.selectLogic(plan, {
      'starter': 'স্টার্টার',
      'growth': 'গ্রোথ',
      'business': 'বিজনেস',
      'enterprise': 'এন্টারপ্রাইজ',
      'other': 'অজানা',
    });
    return '$_temp0';
  }

  @override
  String billingModeName(String mode) {
    String _temp0 = intl.Intl.selectLogic(mode, {
      'paid': 'পরিশোধিত',
      'trial': 'ট্রায়াল',
      'complimentary': 'বিনামূল্যে',
      'internal': 'অভ্যন্তরীণ',
      'partner': 'অংশীদার',
      'license': 'লাইসেন্স',
      'other': 'অজানা',
    });
    return '$_temp0';
  }

  @override
  String get readOnlyTitle => 'শুধু দেখার অনুমতি';

  @override
  String get readOnlyBody =>
      'আপনি তথ্য দেখতে পারবেন, কিন্তু কোনো পরিবর্তন করতে পারবেন না।';

  @override
  String get suspendedTitle => 'অ্যাক্সেস স্থগিত';

  @override
  String get suspendedBody =>
      'এই ওয়ার্কস্পেসটি স্থগিত করা হয়েছে। অ্যাক্সেস ফিরে পেতে আপনার অ্যাডমিনের সাথে যোগাযোগ করুন।';

  @override
  String get moduleEnabled => 'চালু';

  @override
  String get moduleLocked => 'লক করা';

  @override
  String get moduleCoreHr => 'মূল এইচআর';

  @override
  String get moduleLeave => 'ছুটি';

  @override
  String get moduleAttendance => 'হাজিরা';

  @override
  String get modulePayroll => 'বেতন ও পে-রোল';

  @override
  String get moduleBdTax => 'বাংলাদেশ আয়কর';

  @override
  String get moduleRecruitment => 'নিয়োগ';

  @override
  String get modulePerformance => 'কর্মদক্ষতা মূল্যায়ন';

  @override
  String get moduleLms => 'প্রশিক্ষণ';

  @override
  String get moduleMultiEntity => 'একাধিক আইনি প্রতিষ্ঠান';

  @override
  String get moduleApiAccess => 'এপিআই অ্যাক্সেস';

  @override
  String get moduleSso => 'সিঙ্গেল সাইন-অন';

  @override
  String get networkError =>
      'সার্ভারের সাথে সংযোগ করা যায়নি। ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।';

  @override
  String get unexpectedError =>
      'কোনো একটি সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।';

  @override
  String get sessionExpired =>
      'আপনার সেশন শেষ হয়ে গেছে। অনুগ্রহ করে আবার সাইন ইন করুন।';

  @override
  String get loadAccessFailed => 'আপনার ওয়ার্কস্পেসের তথ্য লোড করা যায়নি।';

  @override
  String get retry => 'আবার চেষ্টা করুন';
}
