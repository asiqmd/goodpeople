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

  @override
  String get myProfile => 'আমার প্রোফাইল';

  @override
  String get myProfileSubtitle => 'আপনার চাকরি, ব্যক্তিগত ও পেমেন্টের তথ্য';

  @override
  String get profileJob => 'চাকরি';

  @override
  String get profilePersonal => 'ব্যক্তিগত তথ্য';

  @override
  String get profileIdentity => 'পরিচয়পত্র';

  @override
  String get profileAddresses => 'ঠিকানা';

  @override
  String get profileNominees => 'নমিনি';

  @override
  String get profilePaymentAccounts => 'পেমেন্ট অ্যাকাউন্ট';

  @override
  String get legalEntityLabel => 'আইনি প্রতিষ্ঠান';

  @override
  String get locationLabel => 'কর্মস্থল';

  @override
  String get orgUnitLabel => 'ইউনিট';

  @override
  String get designationLabel => 'পদবি';

  @override
  String get gradeLabel => 'গ্রেড';

  @override
  String get managerLabel => 'ম্যানেজার';

  @override
  String managerValue(String name, String code) {
    return '$name ($code)';
  }

  @override
  String get employmentTypeLabel => 'চাকরির ধরন';

  @override
  String get workerCategoryLabel => 'কর্মীর শ্রেণি';

  @override
  String get joinedOnLabel => 'যোগদানের তারিখ';

  @override
  String get confirmedOnLabel => 'স্থায়ীকরণের তারিখ';

  @override
  String get probationEndsOnLabel => 'শিক্ষানবিশকাল শেষ';

  @override
  String get noCurrentJob => 'বর্তমানে কোনো পদে নিয়োগের তথ্য নেই';

  @override
  String get fatherNameLabel => 'পিতার নাম';

  @override
  String get motherNameLabel => 'মাতার নাম';

  @override
  String get dateOfBirthLabel => 'জন্ম তারিখ';

  @override
  String get genderLabel => 'লিঙ্গ';

  @override
  String get religionLabel => 'ধর্ম';

  @override
  String get bloodGroupLabel => 'রক্তের গ্রুপ';

  @override
  String get mobilePhoneLabel => 'মোবাইল নম্বর';

  @override
  String get nidLabel => 'জাতীয় পরিচয়পত্র (এনআইডি)';

  @override
  String get birthRegistrationLabel => 'জন্ম নিবন্ধন';

  @override
  String get passportLabel => 'পাসপোর্ট';

  @override
  String get tinLabel => 'টিআইএন';

  @override
  String get presentAddressLabel => 'বর্তমান ঠিকানা';

  @override
  String get permanentAddressLabel => 'স্থায়ী ঠিকানা';

  @override
  String get noneRecorded => 'কোনো তথ্য নেই';

  @override
  String nomineeDetails(String relation, num share) {
    final intl.NumberFormat shareNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String shareString = shareNumberFormat.format(share);

    return '$relation · $shareString% অংশ';
  }

  @override
  String get primaryAccount => 'প্রধান';

  @override
  String get adolescentWorker => 'কিশোর শ্রমিক';

  @override
  String get noEmployeeRecordTitle => 'এখনো কোনো কর্মী রেকর্ড নেই';

  @override
  String get noEmployeeRecordBody =>
      'আপনার লগইনের সাথে কোনো কর্মী রেকর্ড যুক্ত নেই, তাই দেখানোর মতো কোনো প্রোফাইল নেই। ওয়ার্কস্পেস অ্যাডমিনদের সাধারণত এটি থাকে না। আপনার থাকার কথা মনে হলে আপনার এইচআর টিমকে জানান।';

  @override
  String get loadProfileFailed => 'আপনার প্রোফাইল লোড করা যায়নি।';

  @override
  String get unknownValue => 'অজানা';

  @override
  String genderName(String gender) {
    String _temp0 = intl.Intl.selectLogic(gender, {
      'male': 'পুরুষ',
      'female': 'নারী',
      'third_gender': 'তৃতীয় লিঙ্গ',
      'other': 'অজানা',
    });
    return '$_temp0';
  }

  @override
  String religionName(String religion) {
    String _temp0 = intl.Intl.selectLogic(religion, {
      'islam': 'ইসলাম',
      'hinduism': 'হিন্দু',
      'buddhism': 'বৌদ্ধ',
      'christianity': 'খ্রিস্টান',
      'unknown': 'অজানা',
      'other': 'অন্যান্য',
    });
    return '$_temp0';
  }

  @override
  String employmentTypeName(String type) {
    String _temp0 = intl.Intl.selectLogic(type, {
      'permanent': 'স্থায়ী',
      'probationer': 'শিক্ষানবিশ',
      'apprentice': 'শিক্ষাধীন',
      'badli': 'বদলি',
      'casual': 'সাময়িক',
      'temporary': 'অস্থায়ী',
      'seasonal': 'মৌসুমী',
      'contractual': 'চুক্তিভিত্তিক',
      'other': 'অজানা',
    });
    return '$_temp0';
  }

  @override
  String workerCategoryName(String category) {
    String _temp0 = intl.Intl.selectLogic(category, {
      'worker': 'শ্রমিক',
      'staff': 'কর্মচারী',
      'other': 'অজানা',
    });
    return '$_temp0';
  }

  @override
  String paymentMethodName(String method) {
    String _temp0 = intl.Intl.selectLogic(method, {
      'bank': 'ব্যাংক হিসাব',
      'mfs': 'মোবাইল ব্যাংকিং',
      'cash': 'নগদ অর্থ',
      'other': 'অজানা',
    });
    return '$_temp0';
  }

  @override
  String paymentProviderName(String provider) {
    String _temp0 = intl.Intl.selectLogic(provider, {
      'bkash': 'বিকাশ',
      'nagad': 'নগদ',
      'rocket': 'রকেট',
      'upay': 'উপায়',
      'other': '$provider',
    });
    return '$_temp0';
  }

  @override
  String divisionName(String division) {
    String _temp0 = intl.Intl.selectLogic(division, {
      'barishal': 'বরিশাল',
      'chattogram': 'চট্টগ্রাম',
      'dhaka': 'ঢাকা',
      'khulna': 'খুলনা',
      'mymensingh': 'ময়মনসিংহ',
      'rajshahi': 'রাজশাহী',
      'rangpur': 'রংপুর',
      'sylhet': 'সিলেট',
      'other': 'অজানা',
    });
    return '$_temp0';
  }

  @override
  String get leaveTitle => 'ছুটি';

  @override
  String get leaveSubtitle => 'ছুটির হিসাব, আবেদন ও ছুটির দিন';

  @override
  String get leaveTabBalances => 'ছুটির হিসাব';

  @override
  String get leaveTabApply => 'আবেদন';

  @override
  String get leaveTabRequests => 'আমার আবেদন';

  @override
  String get leaveTabApprovals => 'অনুমোদন';

  @override
  String get leaveTabHolidays => 'ছুটির দিন';

  @override
  String get leaveLoadFailed => 'আপনার ছুটির তথ্য লোড করা যায়নি।';

  @override
  String get approvalsLoadFailed => 'আপনার অনুমোদনের তালিকা লোড করা যায়নি।';

  @override
  String get holidaysLoadFailed => 'ছুটির দিনের তালিকা লোড করা যায়নি।';

  @override
  String get leaveNoEmployeeTitle => 'কোনো কর্মী রেকর্ড নেই';

  @override
  String get leaveNoEmployeeBody =>
      'ছুটির তথ্য কর্মী রেকর্ডের সাথে যুক্ত থাকে, কিন্তু আপনার লগইনের সাথে কোনো কর্মী রেকর্ড যুক্ত নেই। আপনার থাকার কথা মনে হলে আপনার এইচআর টিমকে জানান।';

  @override
  String leaveDays(num count) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countString দিন',
    );
    return '$_temp0';
  }

  @override
  String get leaveAvailable => 'অবশিষ্ট';

  @override
  String get leaveOnRequest => 'আবেদন সাপেক্ষে';

  @override
  String get leaveEntitlement => 'প্রাপ্য';

  @override
  String get leaveCarriedForward => 'আগের বছরের জমা';

  @override
  String get leaveAdjustments => 'সমন্বয়';

  @override
  String get leaveTaken => 'ভোগকৃত';

  @override
  String get leavePendingDays => 'অপেক্ষমাণ';

  @override
  String get leaveUnpaid => 'বিনা বেতনে';

  @override
  String leaveEligibleFrom(String date) {
    return '$date থেকে প্রাপ্য';
  }

  @override
  String get leaveNoTypes => 'এখনো কোনো ছুটির ধরন যোগ করা হয়নি।';

  @override
  String get leaveTypeLabel => 'ছুটির ধরন';

  @override
  String get leaveTypeRequired => 'ছুটির ধরন বেছে নিন';

  @override
  String get leaveStartDate => 'শুরু';

  @override
  String get leaveEndDate => 'শেষ';

  @override
  String get leaveChooseDate => 'তারিখ বেছে নিন';

  @override
  String get leaveFullDay => 'পুরো দিন';

  @override
  String halfDayName(String part) {
    String _temp0 = intl.Intl.selectLogic(part, {
      'first_half': 'প্রথমার্ধ',
      'second_half': 'দ্বিতীয়ার্ধ',
      'other': 'অর্ধদিবস',
    });
    return '$_temp0';
  }

  @override
  String get leaveReason => 'কারণ';

  @override
  String get leaveReasonTooShort => 'অন্তত ৩টি অক্ষর লিখুন';

  @override
  String leaveDocumentHint(num days) {
    final intl.NumberFormat daysNumberFormat = intl.NumberFormat.decimalPattern(
      localeName,
    );
    final String daysString = daysNumberFormat.format(days);

    String _temp0 = intl.Intl.pluralLogic(
      days,
      locale: localeName,
      other: '$daysString দিনের বেশি ছুটির জন্য সহায়ক কাগজপত্র জমা দিতে হবে।',
    );
    return '$_temp0';
  }

  @override
  String get leaveCountsOffDaysHint =>
      'এই ছুটির মাঝে পড়া সাপ্তাহিক ছুটি ও অন্যান্য ছুটির দিনও ছুটি হিসেবে গণনা হবে।';

  @override
  String get leavePreviewHint =>
      'কত দিন ছুটি লাগবে দেখতে ছুটির ধরন ও তারিখ বেছে নিন।';

  @override
  String get leaveDaysLabel => 'ছুটির দিন সংখ্যা';

  @override
  String get leaveNotCounted => 'গণনার বাইরে';

  @override
  String excludedDayReason(String reason) {
    String _temp0 = intl.Intl.selectLogic(reason, {
      'weekly_off': 'সাপ্তাহিক ছুটি',
      'holiday': 'ছুটির দিন',
      'other': 'গণনার বাইরে',
    });
    return '$_temp0';
  }

  @override
  String excludedDayWithName(String reason, String name) {
    return '$reason: $name';
  }

  @override
  String get leaveProblemsTitle => 'এই আবেদন এখনো পাঠানো যাবে না:';

  @override
  String get leaveSubmit => 'আবেদন পাঠান';

  @override
  String get leaveSubmitted => 'ছুটির আবেদন পাঠানো হয়েছে';

  @override
  String get leaveSubmittedBody =>
      'অনুমোদনকারীরা এখন এটি দেখতে পাচ্ছেন। \"আমার আবেদন\" অংশে এর অগ্রগতি দেখুন।';

  @override
  String get leaveViewRequests => 'আমার আবেদন দেখুন';

  @override
  String get leaveApplyAgain => 'আরও ছুটির আবেদন করুন';

  @override
  String leaveNoRequests(String year) {
    return '$year সালে কোনো ছুটির আবেদন নেই।';
  }

  @override
  String leaveStatusName(String status) {
    String _temp0 = intl.Intl.selectLogic(status, {
      'pending': 'অপেক্ষমাণ',
      'approved': 'অনুমোদিত',
      'rejected': 'প্রত্যাখ্যাত',
      'cancelled': 'বাতিল',
      'other': 'অজানা',
    });
    return '$_temp0';
  }

  @override
  String approvalStepKindName(String kind) {
    String _temp0 = intl.Intl.selectLogic(kind, {
      'manager': 'ম্যানেজার',
      'hr': 'এইচআর',
      'other': 'অনুমোদনকারী',
    });
    return '$_temp0';
  }

  @override
  String approvalStepStatusName(String status) {
    String _temp0 = intl.Intl.selectLogic(status, {
      'waiting': 'আগের ধাপের অপেক্ষায়',
      'pending': 'সিদ্ধান্তের অপেক্ষায়',
      'approved': 'অনুমোদিত',
      'rejected': 'প্রত্যাখ্যাত',
      'skipped': 'বাদ দেওয়া হয়েছে',
      'cancelled': 'বাতিল',
      'other': 'অজানা',
    });
    return '$_temp0';
  }

  @override
  String get approvalHrTeam => 'এইচআর টিম';

  @override
  String get approvalTrail => 'অনুমোদনের ধাপ';

  @override
  String approvalStepTitle(String kind, String approver) {
    return '$kind: $approver';
  }

  @override
  String approvalDecidedBy(String name, String date) {
    return '$name, $date';
  }

  @override
  String get leaveNeedsDocument => 'সহায়ক কাগজপত্র জমা দিতে হবে';

  @override
  String get leaveCancelRequest => 'আবেদন বাতিল করুন';

  @override
  String get leaveCancelTitle => 'এই আবেদনটি বাতিল করবেন?';

  @override
  String leaveCancelBody(String type, String dates) {
    return '$type, $dates। যে দিনগুলো এখনো নেওয়া হয়নি, সেগুলো আপনার ছুটির হিসাবে ফিরে যাবে।';
  }

  @override
  String get leaveKeepRequest => 'রেখে দিন';

  @override
  String get leaveCancelled => 'আবেদন বাতিল করা হয়েছে';

  @override
  String approvalYourStep(String kind) {
    return 'আপনার ধাপ: $kind';
  }

  @override
  String get approvalBalance => 'তাঁর ছুটির হিসাব';

  @override
  String approvalAvailable(String days) {
    return '$days অবশিষ্ট';
  }

  @override
  String get approve => 'অনুমোদন করুন';

  @override
  String get reject => 'প্রত্যাখ্যান করুন';

  @override
  String get approveTitle => 'এই ছুটি অনুমোদন করবেন?';

  @override
  String get rejectTitle => 'এই ছুটি প্রত্যাখ্যান করবেন?';

  @override
  String get decisionComment => 'মন্তব্য (ঐচ্ছিক)';

  @override
  String get leaveApproved => 'ছুটি অনুমোদন করা হয়েছে';

  @override
  String get leaveRejected => 'ছুটি প্রত্যাখ্যান করা হয়েছে';

  @override
  String get approvalsEmpty => 'আপনার সিদ্ধান্তের অপেক্ষায় কিছু নেই।';

  @override
  String holidayKindName(String kind) {
    String _temp0 = intl.Intl.selectLogic(kind, {
      'public': 'সাধারণ ছুটি',
      'festival': 'উৎসব ছুটি',
      'optional': 'ঐচ্ছিক ছুটি',
      'company': 'প্রতিষ্ঠানের ছুটি',
      'other': 'ছুটি',
    });
    return '$_temp0';
  }

  @override
  String get holidayTentative => 'সম্ভাব্য';

  @override
  String get holidaysTentativeNote =>
      'সম্ভাব্য তারিখগুলো চাঁদ দেখার ওপর নির্ভর করে, তাই বদলাতে পারে।';

  @override
  String holidaysNone(String year) {
    return '$year সালে কোনো ছুটির দিন নেই।';
  }

  @override
  String get holidaysNoCalendar =>
      'এখনো কোনো ছুটির ক্যালেন্ডার তৈরি করা হয়নি।';

  @override
  String get attendanceTitle => 'হাজিরা';

  @override
  String get attendanceSubtitle => 'পাঞ্চ ইন ও আউট, মাসের হাজিরা ও সংশোধন';

  @override
  String get attendanceTabToday => 'আজ';

  @override
  String get attendanceTabMonth => 'এই মাস';

  @override
  String get attendanceTabCorrections => 'সংশোধন';

  @override
  String get attendanceLoadFailed => 'আপনার হাজিরার তথ্য লোড করা যায়নি।';

  @override
  String get attendanceNoEmployeeBody =>
      'হাজিরার তথ্য কর্মী রেকর্ডের সাথে যুক্ত থাকে, কিন্তু আপনার লগইনের সাথে কোনো কর্মী রেকর্ড যুক্ত নেই। আপনার থাকার কথা মনে হলে আপনার এইচআর টিমকে জানান।';

  @override
  String attendanceStatusName(String status) {
    String _temp0 = intl.Intl.selectLogic(status, {
      'present': 'উপস্থিত',
      'half_day': 'অর্ধদিবস',
      'absent': 'অনুপস্থিত',
      'on_leave': 'ছুটিতে',
      'missing_punch': 'পাঞ্চ অসম্পূর্ণ',
      'off': 'বন্ধ',
      'pending': 'চলমান',
      'other': 'অজানা',
    });
    return '$_temp0';
  }

  @override
  String attendanceFlagName(String flag) {
    String _temp0 = intl.Intl.selectLogic(flag, {
      'late': 'দেরিতে আগমন',
      'early_out': 'আগে প্রস্থান',
      'over_daily_limit': 'দৈনিক সীমার বেশি',
      'regularized': 'সংশোধিত',
      'on_duty': 'অফিসের কাজে বাইরে',
      'outside_geofence': 'কর্মস্থলের এলাকার বাইরে',
      'other': 'মন্তব্য',
    });
    return '$_temp0';
  }

  @override
  String dayTypeName(String type) {
    String _temp0 = intl.Intl.selectLogic(type, {
      'working': 'কর্মদিবস',
      'weekly_off': 'সাপ্তাহিক ছুটি',
      'holiday': 'ছুটির দিন',
      'other': 'দিন',
    });
    return '$_temp0';
  }

  @override
  String punchSourceName(String source) {
    String _temp0 = intl.Intl.selectLogic(source, {
      'device': 'ডিভাইস',
      'web': 'ওয়েব',
      'mobile': 'মোবাইল অ্যাপ',
      'manual': 'এইচআর যোগ করেছে',
      'regularization': 'সংশোধন',
      'other': 'অন্যান্য',
    });
    return '$_temp0';
  }

  @override
  String punchDirectionName(String direction) {
    String _temp0 = intl.Intl.selectLogic(direction, {
      'in': 'প্রবেশ',
      'out': 'প্রস্থান',
      'other': 'পাঞ্চ',
    });
    return '$_temp0';
  }

  @override
  String regularizationKindName(String kind) {
    String _temp0 = intl.Intl.selectLogic(kind, {
      'missed_punch': 'বাদ পড়া পাঞ্চ',
      'on_duty': 'অফিসের কাজে বাইরে',
      'other': 'সংশোধন',
    });
    return '$_temp0';
  }

  @override
  String get attendanceNoShift => 'কোনো শিফট নির্ধারিত নেই';

  @override
  String get attendanceFirstIn => 'প্রথম প্রবেশ';

  @override
  String get attendanceLastOut => 'শেষ প্রস্থান';

  @override
  String get attendanceWorked => 'কাজের সময়';

  @override
  String get attendanceOvertime => 'ওভারটাইম';

  @override
  String attendanceLateBy(String duration) {
    return 'দেরি $duration';
  }

  @override
  String attendanceEarlyOutBy(String duration) {
    return 'আগে প্রস্থান $duration';
  }

  @override
  String attendanceOvertimeBy(String duration) {
    return 'ওটি $duration';
  }

  @override
  String attendanceLeaveCode(String code) {
    return 'ছুটি: $code';
  }

  @override
  String attendanceHolidayNamed(String name) {
    return 'ছুটির দিন: $name';
  }

  @override
  String attendanceCorrectionStatus(String status) {
    return 'সংশোধন: $status';
  }

  @override
  String get punchIn => 'পাঞ্চ ইন';

  @override
  String get punchOut => 'পাঞ্চ আউট';

  @override
  String get punchedIn => 'পাঞ্চ ইন হয়েছে';

  @override
  String get punchedOut => 'পাঞ্চ আউট হয়েছে';

  @override
  String get punchLocating => 'আপনার অবস্থান খোঁজা হচ্ছে…';

  @override
  String get punchGeofencedHint =>
      'পাঞ্চ করার সময় আপনার অবস্থান কর্মস্থলের নির্ধারিত এলাকার সাথে মিলিয়ে দেখা হয়।';

  @override
  String get punchAnywhereHint =>
      'আপনি যেকোনো জায়গা থেকে পাঞ্চ করতে পারবেন। অনুমতি দিলে আপনার অবস্থানও পাঠানো হবে।';

  @override
  String get punchBlockedDisabled =>
      'আপনার ওয়ার্কস্পেসে অ্যাপ থেকে পাঞ্চ করা বন্ধ আছে। কর্মস্থলের হাজিরা ডিভাইস ব্যবহার করুন।';

  @override
  String get punchBlockedNoGeofence =>
      'আপনার কর্মস্থলের জন্য এখনো পাঞ্চ করার এলাকা নির্ধারণ করা হয়নি, তাই অ্যাপ থেকে পাঞ্চ করা যাবে না। এইচআরকে এটি নির্ধারণ করতে বলুন।';

  @override
  String get punchBlockedOther => 'এই মুহূর্তে অ্যাপ থেকে পাঞ্চ করা যাচ্ছে না।';

  @override
  String get todaysPunches => 'আজকের পাঞ্চ';

  @override
  String get noPunchesYet => 'এখনো কোনো পাঞ্চ নেই।';

  @override
  String get punchVoided => 'বাতিল';

  @override
  String get locationServicesOff =>
      'এই ফোনে লোকেশন বন্ধ আছে। পাঞ্চ করতে লোকেশন চালু করুন।';

  @override
  String get locationPermissionDenied =>
      'আপনি কর্মস্থলে আছেন কিনা যাচাই করতে অ্যাপটিকে লোকেশন ব্যবহারের অনুমতি দিন।';

  @override
  String get locationPermissionBlocked =>
      'এই অ্যাপের জন্য লোকেশন ব্যবহারের অনুমতি বন্ধ করা আছে। পাঞ্চ করতে সেটিংসে গিয়ে অনুমতি দিন।';

  @override
  String get locationTimeout =>
      'আপনার অবস্থান পাওয়া যায়নি। খোলা জায়গায় গিয়ে আবার চেষ্টা করুন।';

  @override
  String get locationFailed =>
      'আপনার অবস্থান পড়া যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।';

  @override
  String get openSettings => 'সেটিংস খুলুন';

  @override
  String punchErrorOutsideGeofence(String distance, String radius) {
    return 'আপনি কর্মস্থল থেকে প্রায় $distance মিটার দূরে আছেন। কর্মস্থলের $radius মিটারের মধ্যে থেকে পাঞ্চ করা যায়।';
  }

  @override
  String get punchErrorOutsideArea =>
      'আপনি কর্মস্থলের নির্ধারিত এলাকার বাইরে আছেন, তাই এখান থেকে পাঞ্চ করা যাবে না।';

  @override
  String get punchErrorLocationRequired =>
      'পাঞ্চ ইন বা আউট করতে লোকেশন ব্যবহারের অনুমতি দিন।';

  @override
  String get punchErrorTooSoon =>
      'আপনি এক মিনিটেরও কম সময় আগে পাঞ্চ করেছেন। আবার পাঞ্চ করার আগে একটু অপেক্ষা করুন।';

  @override
  String get punchErrorSeparated =>
      'আপনার চাকরির মেয়াদ শেষ হয়ে গেছে, তাই পাঞ্চ করা যাবে না।';

  @override
  String get correctionErrorFutureDay =>
      'শুধু যে দিনগুলো শুরু হয়ে গেছে, সেগুলোই সংশোধন করা যায়।';

  @override
  String get correctionErrorOutsideWindow =>
      'এই দিনটি অনেক আগের, তাই অ্যাপ থেকে সংশোধন করা যাবে না। এইচআরকে ঠিক করে দিতে বলুন।';

  @override
  String get correctionErrorNotTracked =>
      'সেদিন হাজিরা রাখা হয়নি, তাই সংশোধনের কিছু নেই।';

  @override
  String get correctionErrorWrongDay =>
      'এই সময়টি অন্য দিনের শিফটের। তারিখ ও সময় আবার দেখুন।';

  @override
  String get correctionErrorFuturePunch =>
      'পাঞ্চের সময় ভবিষ্যতের হতে পারবে না।';

  @override
  String get correctionErrorAlreadyPending =>
      'এই দিনের একটি সংশোধন ইতিমধ্যে অনুমোদনের অপেক্ষায় আছে।';

  @override
  String get correctionErrorNotPending =>
      'এই সংশোধনের বিষয়ে ইতিমধ্যে সিদ্ধান্ত হয়ে গেছে।';

  @override
  String get attendanceMonthEmpty => 'এই মাসে এখনো কোনো হাজিরার দিন নেই।';

  @override
  String get attendanceCorrectDay => 'এই দিনের সংশোধনের আবেদন করুন';

  @override
  String get correctionRequest => 'সংশোধনের আবেদন';

  @override
  String get correctionsEmpty => 'আপনি এখনো কোনো সংশোধনের আবেদন করেননি।';

  @override
  String get correctionsLoadFailed => 'আপনার সংশোধনের তালিকা লোড করা যায়নি।';

  @override
  String correctionInAt(String time) {
    return 'প্রবেশ $time';
  }

  @override
  String correctionOutAt(String time) {
    return 'প্রস্থান $time';
  }

  @override
  String get correctionCancel => 'সংশোধন বাতিল করুন';

  @override
  String get correctionCancelTitle => 'এই সংশোধনটি বাতিল করবেন?';

  @override
  String correctionCancelBody(String date) {
    return '$date তারিখের জন্য আপনার সংশোধনের আবেদন তুলে নেওয়া হবে।';
  }

  @override
  String get correctionCancelled => 'সংশোধন বাতিল করা হয়েছে';

  @override
  String get correctionDate => 'দিন';

  @override
  String get correctionDateRequired => 'কোন দিনটি সংশোধন করবেন, বেছে নিন';

  @override
  String get correctionInTime => 'প্রবেশের সময়';

  @override
  String get correctionOutTime => 'প্রস্থানের সময়';

  @override
  String get correctionChooseTime => 'সময় বেছে নিন';

  @override
  String get correctionClearTime => 'সময় মুছে ফেলুন';

  @override
  String get correctionTimesHint =>
      'আপনি কখন এসেছিলেন, কখন বের হয়েছিলেন, অথবা দুটোই দিন।';

  @override
  String get correctionTimesRequired =>
      'প্রবেশের সময়, প্রস্থানের সময় অথবা দুটোই দিন।';

  @override
  String get correctionOnDutyHint =>
      'অফিসের কাজে বাইরে থাকার দিন পুরো শিফট হিসেবে গণনা হয়, তাই কোনো সময় দিতে হবে না।';

  @override
  String get correctionSubmit => 'সংশোধন পাঠান';

  @override
  String get correctionSent => 'সংশোধনের আবেদন অনুমোদনের জন্য পাঠানো হয়েছে';

  @override
  String get approvalCorrectionTitle => 'হাজিরা সংশোধন';

  @override
  String get approvalAskedFor => 'যা চাওয়া হয়েছে';

  @override
  String get approvalDayNow => 'এখন যা রেকর্ড আছে';

  @override
  String get approveCorrectionTitle => 'এই সংশোধন অনুমোদন করবেন?';

  @override
  String get rejectCorrectionTitle => 'এই সংশোধন প্রত্যাখ্যান করবেন?';

  @override
  String get correctionApproved => 'সংশোধন অনুমোদন করা হয়েছে';

  @override
  String get correctionRejected => 'সংশোধন প্রত্যাখ্যান করা হয়েছে';

  @override
  String get approvalUnknownItem =>
      'অ্যাপের এই সংস্করণে এই আবেদনটি দেখানো যায় না। ওয়েব থেকে সিদ্ধান্ত দিন।';

  @override
  String get punchSelfieHint =>
      'আপনার ওয়ার্কস্পেসে প্রতিটি পাঞ্চের সাথে একটি ছবি লাগে। পাঞ্চ করলে সামনের ক্যামেরা খুলবে।';

  @override
  String get punchTakingPhoto => 'আপনার ছবি তোলা হচ্ছে…';

  @override
  String get punchNoPhoto =>
      'কোনো ছবি তোলা হয়নি, তাই পাঞ্চ হয়নি। আবার পাঞ্চ করে ছবিটি তুলুন।';

  @override
  String get punchWithPhoto => 'ছবিসহ';

  @override
  String get punchErrorSelfieRequired =>
      'আপনার ওয়ার্কস্পেসে এখন প্রতিটি পাঞ্চের সাথে ছবি লাগে। ছবি তুলতে আবার পাঞ্চ করুন।';

  @override
  String get punchErrorSelfieTooLarge =>
      'ছবিটি পাঠানোর জন্য অনেক বড়। অনুগ্রহ করে আবার তুলুন।';

  @override
  String get punchErrorSelfieUnreadable =>
      'ছবিটি পড়া যায়নি। অনুগ্রহ করে আবার তুলুন।';

  @override
  String get cameraPermissionDenied =>
      'এই অ্যাপের জন্য ক্যামেরা ব্যবহারের অনুমতি বন্ধ আছে। পাঞ্চের ছবি তুলতে সেটিংসে গিয়ে অনুমতি দিন।';

  @override
  String get cameraUnavailable =>
      'এই ফোনে অ্যাপটি ব্যবহার করতে পারে এমন কোনো ক্যামেরা নেই, তাই ছবিসহ পাঞ্চ করা যাবে না।';

  @override
  String get cameraFailed =>
      'ক্যামেরা খোলা যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।';

  @override
  String get documentsTitle => 'আমার কাগজপত্র';

  @override
  String get documentsSubtitle => 'চিঠি, সনদপত্র ও আপনার সার্ভিস বই';

  @override
  String get documentsLoadFailed => 'আপনার কাগজপত্র লোড করা যায়নি।';

  @override
  String get documentsEmpty =>
      'এইচআর এখনো আপনার সাথে কোনো কাগজপত্র শেয়ার করেনি।';

  @override
  String get documentsNoEmployeeBody =>
      'কাগজপত্র কর্মী রেকর্ডের সাথে যুক্ত থাকে, কিন্তু আপনার লগইনের সাথে কোনো কর্মী রেকর্ড যুক্ত নেই। আপনার থাকার কথা মনে হলে আপনার এইচআর টিমকে জানান।';

  @override
  String documentCategoryName(String category) {
    String _temp0 = intl.Intl.selectLogic(category, {
      'photo': 'ছবি',
      'nid': 'জাতীয় পরিচয়পত্র',
      'birth_certificate': 'জন্ম নিবন্ধন সনদ',
      'passport': 'পাসপোর্ট',
      'educational_certificate': 'শিক্ষাগত সনদ',
      'experience_certificate': 'অভিজ্ঞতার সনদ',
      'appointment_letter': 'নিয়োগপত্র',
      'contract': 'চুক্তিপত্র',
      'medical_certificate': 'মেডিকেল সনদ',
      'police_verification': 'পুলিশ ভেরিফিকেশন',
      'nominee_form': 'নমিনি ফরম',
      'letter': 'চিঠি',
      'punch_selfie': 'পাঞ্চের ছবি',
      'other': 'কাগজপত্র',
    });
    return '$_temp0';
  }

  @override
  String documentIssuedOn(String date) {
    return 'ইস্যু: $date';
  }

  @override
  String documentExpiresOn(String date) {
    return 'মেয়াদ শেষ: $date';
  }

  @override
  String get documentExpired => 'মেয়াদোত্তীর্ণ';

  @override
  String get documentExpiresSoon => 'শীঘ্রই মেয়াদ শেষ';

  @override
  String get documentSourceLetter => 'এইচআরের চিঠি';

  @override
  String get documentSourceUpload => 'এইচআর আপলোড করেছে';

  @override
  String documentRefNo(String refNo) {
    return 'স্মারক নং $refNo';
  }

  @override
  String get documentErrorNotShared =>
      'এই কাগজটি আর আপনার সাথে শেয়ার করা নেই।';

  @override
  String get documentErrorGone => 'এই কাগজটি সরিয়ে ফেলা হয়েছে।';

  @override
  String get fileNoApp =>
      'এই ফোনে ফাইলটি খোলার মতো কোনো অ্যাপ নেই। একটি পিডিএফ রিডার ইনস্টল করে আবার চেষ্টা করুন।';

  @override
  String get fileOpenFailed =>
      'ফাইলটি খোলা যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।';

  @override
  String get imageLoadFailed => 'ছবিটি দেখানো যাচ্ছে না।';

  @override
  String get serviceBookTitle => 'আমার সার্ভিস বই';

  @override
  String get serviceBookBody =>
      'শ্রম আইনের ধারা ৬ অনুযায়ী সংরক্ষিত আপনার চাকরির রেকর্ড। এটি অ্যাপের ভাষায় পিডিএফ হিসেবে খুলবে।';

  @override
  String get serviceBookOpen => 'পিডিএফ খুলুন';

  @override
  String get payslipsTitle => 'বেতন বিবরণী';

  @override
  String get payslipsLoadFailed => 'আপনার বেতন বিবরণী লোড করা যায়নি।';

  @override
  String get payslipsEmpty =>
      'এখনো কোনো বেতন বিবরণী নেই। পে-রোল প্রকাশ করলে এখানে দেখা যাবে।';

  @override
  String get payslipNetPay => 'নিট বেতন';

  @override
  String payslipPaidOn(String date) {
    return 'পরিশোধ: $date';
  }

  @override
  String get payslipAdjustment => 'সমন্বয়';

  @override
  String get payslipOpenEnglish => 'ইংরেজিতে খুলুন';

  @override
  String get payslipOpenBangla => 'বাংলায় খুলুন';

  @override
  String get payslipErrorGone => 'এই বেতন বিবরণীটি আর পাওয়া যাচ্ছে না।';

  @override
  String get myPayTitle => 'আমার বেতন';

  @override
  String get myPaySubtitle => 'বেতন বিবরণী, কর, ভবিষ্য তহবিল ও ঋণ';

  @override
  String get myPayTabTax => 'কর';

  @override
  String get myPayTabProvidentFund => 'ভবিষ্য তহবিল';

  @override
  String get myPayTabLoans => 'ঋণ';

  @override
  String get payrollRunKindBonus => 'বোনাস';

  @override
  String get payrollRunKindSettlement => 'চূড়ান্ত নিষ্পত্তি';

  @override
  String get payrollRunKindWppf => 'অংশগ্রহণ তহবিল';

  @override
  String get taxLoadFailed => 'আপনার করের তথ্য লোড করা যায়নি।';

  @override
  String get taxNoEmployeeBody =>
      'বেতনের কর কর্মী রেকর্ডের সাথে যুক্ত থাকে, কিন্তু আপনার লগইনের সাথে কোনো কর্মী রেকর্ড যুক্ত নেই। আপনার থাকার কথা মনে হলে আপনার এইচআর টিমকে জানান।';

  @override
  String get taxYearSoFar => 'এ বছর এ পর্যন্ত';

  @override
  String get taxSalaryPaid => 'পরিশোধিত বেতন';

  @override
  String get taxDeducted => 'কর্তিত কর';

  @override
  String taxIncludesOpening(String salary, String tax) {
    return 'এতে বছরের আগের অংশের (যেমন আগের নিয়োগকর্তার) $salary বেতন ও $tax কর ধরা আছে।';
  }

  @override
  String get taxForYear => 'বছরের মোট কর (আনুমানিক)';

  @override
  String get taxThisMonth => 'এই মাসে';

  @override
  String get taxRebate => 'কর রেয়াত';

  @override
  String get taxThreshold => 'করমুক্ত আয়সীমা';

  @override
  String get taxMonthsLeft => 'বাকি মাস';

  @override
  String get taxNotWorkedOut =>
      'পে-রোল আপনার বেতন থেকে হিসাব করলে বছরের কর এখানে দেখা যাবে।';

  @override
  String get taxMonthsTitle => 'মাসভিত্তিক হিসাব';

  @override
  String get taxNoMonths => 'এ বছরে এখনো কোনো বেতন পরিশোধ হয়নি।';

  @override
  String taxMonthLine(String salary, String tax) {
    return 'বেতন $salary · কর $tax';
  }

  @override
  String taxChallan(String number) {
    return 'চালান নং $number';
  }

  @override
  String taxChallanOn(String number, String date) {
    return 'চালান নং $number, জমা: $date';
  }

  @override
  String get taxCertificateTitle => 'বেতন ও কর কর্তনের সনদ';

  @override
  String get taxCertificateBody =>
      'আয়কর রিটার্নের জন্য: এ বছরের বেতন ও তা থেকে কর্তিত কর। এটি পিডিএফ হিসেবে খুলবে।';

  @override
  String get taxCertificateEnglish => 'সনদ (ইংরেজি)';

  @override
  String get taxCertificateBangla => 'সনদ (বাংলা)';

  @override
  String get declarationTitle => 'বিনিয়োগ ঘোষণা';

  @override
  String get declarationHint =>
      'ঘোষিত বিনিয়োগে প্রতি মাসে কম কর কাটা হয়; পে-রোল আপনার প্রমাণপত্র যাচাই করার পর গৃহীত অঙ্কগুলোই হিসাবে ধরা হয়।';

  @override
  String declarationStatusName(String status) {
    String _temp0 = intl.Intl.selectLogic(status, {
      'draft': 'খসড়া',
      'submitted': 'জমা দেওয়া হয়েছে',
      'verified': 'যাচাইকৃত',
      'other': 'অজানা',
    });
    return '$_temp0';
  }

  @override
  String declarationSubmittedOn(String date) {
    return 'জমা: $date';
  }

  @override
  String declarationVerifiedOn(String date) {
    return 'যাচাই: $date';
  }

  @override
  String investmentKindName(String kind) {
    String _temp0 = intl.Intl.selectLogic(kind, {
      'savings_certificate': 'সঞ্চয়পত্র',
      'dps': 'ডিপিএস',
      'life_insurance': 'জীবন বিমার প্রিমিয়াম',
      'provident_fund_other': 'অন্যান্য ভবিষ্য তহবিল',
      'superannuation': 'অনুমোদিত সুপারঅ্যানুয়েশন বা কল্যাণ তহবিল',
      'universal_pension': 'সর্বজনীন পেনশন',
      'listed_shares': 'তালিকাভুক্ত শেয়ার',
      'mutual_fund': 'মিউচুয়াল ফান্ড',
      'zakat': 'যাকাত',
      'donation': 'অনুমোদিত দান',
      'other': 'অন্যান্য',
    });
    return '$_temp0';
  }

  @override
  String get declarationKind => 'বিনিয়োগের ধরন';

  @override
  String get declarationKindRequired => 'কোথায় বিনিয়োগ করেছেন তা বেছে নিন';

  @override
  String get declarationAmount => 'অঙ্ক (টাকা)';

  @override
  String get declarationAmountInvalid =>
      '১২৫০০ বা ১২৫০০.৫০-এর মতো একটি অঙ্ক লিখুন';

  @override
  String get declarationNote => 'নোট (ঐচ্ছিক)';

  @override
  String get declarationAddRow => 'আরেকটি বিনিয়োগ যোগ করুন';

  @override
  String get declarationRemoveRow => 'সরান';

  @override
  String get declarationSaveDraft => 'খসড়া সংরক্ষণ';

  @override
  String get declarationSubmit => 'পে-রোলে জমা দিন';

  @override
  String get declarationSaved => 'খসড়া সংরক্ষিত হয়েছে।';

  @override
  String get declarationSent => 'পে-রোলে পাঠানো হয়েছে।';

  @override
  String get declarationErrorVerified =>
      'পে-রোল এই ঘোষণা যাচাই করে ফেলেছে, তাই এটি আর বদলানো যাবে না।';

  @override
  String get declarationErrorInvalid => 'অঙ্কগুলো দেখে আবার চেষ্টা করুন।';

  @override
  String get declarationTotal => 'মোট ঘোষিত';

  @override
  String get declarationDeclared => 'ঘোষিত';

  @override
  String get declarationAccepted => 'গৃহীত';

  @override
  String get declarationEmpty => 'কোনো বিনিয়োগ ঘোষণা করা হয়নি।';

  @override
  String get pfLoadFailed => 'আপনার ভবিষ্য তহবিলের তথ্য লোড করা যায়নি।';

  @override
  String get pfNotMember => 'আপনি ভবিষ্য তহবিলের সদস্য নন।';

  @override
  String get pfTotal => 'মোট স্থিতি';

  @override
  String get pfOwn => 'আপনার চাঁদা';

  @override
  String get pfEmployer => 'নিয়োগকর্তার চাঁদা';

  @override
  String get pfPayable => 'আজ চাকরি ছাড়লে প্রাপ্য';

  @override
  String pfVested(String percent) {
    return 'আপনার চাঁদা ও নিয়োগকর্তার অংশের $percent%';
  }

  @override
  String pfMemberSince(String date) {
    return 'সদস্য: $date থেকে';
  }

  @override
  String pfLeftOn(String date) {
    return 'তহবিল ছেড়েছেন: $date';
  }

  @override
  String get pfEntriesTitle => 'হিসাব বিবরণী';

  @override
  String get pfNoEntries => 'এখনো কোনো লেনদেন নেই।';

  @override
  String pfEntryKindName(String kind) {
    String _temp0 = intl.Intl.selectLogic(kind, {
      'opening': 'প্রারম্ভিক স্থিতি',
      'contribution': 'চাঁদা',
      'interest': 'মুনাফা',
      'loan_out': 'ঋণ গ্রহণ',
      'loan_repaid': 'ঋণ পরিশোধ',
      'withdrawal': 'উত্তোলন',
      'forfeited': 'বাজেয়াপ্ত',
      'other': 'লেনদেন',
    });
    return '$_temp0';
  }

  @override
  String pfAccountName(String account) {
    String _temp0 = intl.Intl.selectLogic(account, {
      'own': 'নিজের হিসাব',
      'employer': 'নিয়োগকর্তার হিসাব',
      'other': 'হিসাব',
    });
    return '$_temp0';
  }

  @override
  String get loansLoadFailed => 'আপনার অগ্রিম ও ঋণের তথ্য লোড করা যায়নি।';

  @override
  String get loansEmpty => 'কোনো অগ্রিম বা ঋণ নেই।';

  @override
  String loanKindName(String kind) {
    String _temp0 = intl.Intl.selectLogic(kind, {
      'advance': 'বেতন অগ্রিম',
      'loan': 'ঋণ',
      'pf_loan': 'ভবিষ্য তহবিল ঋণ',
      'other': 'ঋণ',
    });
    return '$_temp0';
  }

  @override
  String loanStatusName(String status) {
    String _temp0 = intl.Intl.selectLogic(status, {
      'pending': 'অপেক্ষমাণ',
      'active': 'চলমান',
      'closed': 'পরিশোধিত',
      'rejected': 'প্রত্যাখ্যাত',
      'cancelled': 'বাতিল',
      'other': 'অজানা',
    });
    return '$_temp0';
  }

  @override
  String get loanPrincipal => 'মূল অঙ্ক';

  @override
  String get loanInstallment => 'মাসিক কিস্তি';

  @override
  String get loanOutstanding => 'বাকি';

  @override
  String get loanRepaid => 'পরিশোধিত';

  @override
  String get loanStartMonth => 'প্রথম কর্তন';

  @override
  String loanRepayments(num count) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'পরিশোধ ($countString)',
      zero: 'পরিশোধ',
    );
    return '$_temp0';
  }

  @override
  String get loanNoRepayments => 'এখনো কিছু পরিশোধ হয়নি।';

  @override
  String get loanFromSalary => 'বেতন থেকে কর্তন';

  @override
  String get loanPaidIn => 'সরাসরি জমা';

  @override
  String get resignationTitle => 'পদত্যাগ';

  @override
  String get resignationEntrySubtitle =>
      'নোটিশ দিন, অথবা আপনার পদত্যাগের অবস্থা দেখুন';

  @override
  String get separationsLoadFailed => 'আপনার পদত্যাগের তথ্য লোড করা যায়নি।';

  @override
  String get separationsNoEmployeeBody =>
      'পদত্যাগের জন্য কর্মী রেকর্ড লাগে, কিন্তু আপনার লগইনের সাথে কোনো কর্মী রেকর্ড যুক্ত নেই। আপনার থাকার কথা মনে হলে আপনার এইচআর টিমকে জানান।';

  @override
  String get separationsEarlier => 'আগের';

  @override
  String separationTypeName(String type) {
    String _temp0 = intl.Intl.selectLogic(type, {
      'resignation': 'পদত্যাগ',
      'termination': 'চাকরির অবসান',
      'dismissal': 'বরখাস্ত',
      'discharge': 'ডিসচার্জ',
      'retrenchment': 'ছাঁটাই',
      'retirement': 'অবসর',
      'death': 'মৃত্যু',
      'contract_end': 'চুক্তির মেয়াদ শেষ',
      'other': 'চাকরি থেকে অব্যাহতি',
    });
    return '$_temp0';
  }

  @override
  String separationStatusName(String status) {
    String _temp0 = intl.Intl.selectLogic(status, {
      'pending': 'অপেক্ষমাণ',
      'approved': 'অনুমোদিত',
      'completed': 'সম্পন্ন',
      'rejected': 'প্রত্যাখ্যাত',
      'cancelled': 'বাতিল',
      'other': 'অজানা',
    });
    return '$_temp0';
  }

  @override
  String get separationNoticeDate => 'নোটিশের তারিখ';

  @override
  String get separationLastWorkingDay => 'শেষ কর্মদিবস';

  @override
  String get separationNoticeRequired => 'প্রয়োজনীয় নোটিশ';

  @override
  String get separationNoticeGiven => 'দেওয়া নোটিশ';

  @override
  String get separationNoNoticeRequired => 'প্রয়োজন নেই';

  @override
  String separationShortfall(String days) {
    return 'শ্রম আইনে যে নোটিশ চাওয়া হয়, এটি তার চেয়ে $days কম। ঘাটতির দিনগুলোর মজুরি আপনার চূড়ান্ত পাওনা থেকে কেটে রাখা হতে পারে।';
  }

  @override
  String get resignationCancel => 'পদত্যাগ প্রত্যাহার করুন';

  @override
  String get resignationCancelTitle => 'পদত্যাগ প্রত্যাহার করবেন?';

  @override
  String resignationCancelBody(String date) {
    return '$date শেষ কর্মদিবস ধরে দেওয়া আপনার পদত্যাগপত্র প্রত্যাহার করা হবে, এবং আপনার চাকরি বহাল থাকবে।';
  }

  @override
  String get resignationCancelled => 'পদত্যাগ প্রত্যাহার করা হয়েছে';

  @override
  String get resignHeading => 'চাকরি থেকে পদত্যাগ';

  @override
  String get resignNoticeInfo =>
      'বাংলাদেশ শ্রম আইনের ২৭ ধারা অনুযায়ী, পদত্যাগ করতে স্থায়ী শ্রমিককে ৬০ দিনের এবং মাসিক মজুরির অস্থায়ী শ্রমিককে ৩০ দিনের লিখিত নোটিশ দিতে হয়। আপনার নোটিশ আজ থেকে শুরু হবে। এর চেয়ে কম নোটিশ দিলে ঘাটতির দিনগুলোর মজুরি আপনার চূড়ান্ত পাওনা থেকে কেটে রাখা হতে পারে।';

  @override
  String get resignLastDayRequired => 'আপনার শেষ কর্মদিবস বেছে নিন';

  @override
  String resignNoticeGiven(String days) {
    return 'এতে $days নোটিশ দেওয়া হবে।';
  }

  @override
  String get resignSubmit => 'পদত্যাগপত্র পাঠান';

  @override
  String get resignConfirmTitle => 'পদত্যাগপত্র পাঠাবেন?';

  @override
  String resignConfirmBody(String date) {
    return 'আপনার শেষ কর্মদিবস হবে $date। এটি প্রথমে আপনার ম্যানেজার, তারপর এইচআরের কাছে যাবে। অপেক্ষমাণ থাকা অবস্থায় আপনি এটি প্রত্যাহার করতে পারবেন।';
  }

  @override
  String get resignConfirm => 'পদত্যাগ করুন';

  @override
  String get resignSent => 'পদত্যাগপত্র অনুমোদনের জন্য পাঠানো হয়েছে';

  @override
  String get resignErrorOpen =>
      'একটি পদত্যাগ বা চাকরি ছাড়ার প্রক্রিয়া ইতিমধ্যে চলমান আছে।';

  @override
  String get resignErrorSeparated =>
      'আপনার চাকরির মেয়াদ ইতিমধ্যে শেষ হয়ে গেছে।';

  @override
  String get resignErrorPastLastDay =>
      'শেষ কর্মদিবস অতীতের কোনো তারিখ হতে পারবে না।';

  @override
  String get resignErrorNotOpen =>
      'এই পদত্যাগের বিষয়ে ইতিমধ্যে সিদ্ধান্ত হয়ে গেছে, তাই এটি প্রত্যাহার করা যাবে না।';

  @override
  String approvalSeparationDates(String notice, String lastDay) {
    return 'নোটিশ $notice → শেষ কর্মদিবস $lastDay';
  }

  @override
  String approvalNoticeShort(String days) {
    return 'নোটিশ $days কম';
  }

  @override
  String get approveSeparationTitle => 'এই পদত্যাগ অনুমোদন করবেন?';

  @override
  String get rejectSeparationTitle => 'এই পদত্যাগ প্রত্যাখ্যান করবেন?';

  @override
  String get separationApproved => 'পদত্যাগ অনুমোদন করা হয়েছে';

  @override
  String get separationRejected => 'পদত্যাগ প্রত্যাখ্যান করা হয়েছে';

  @override
  String get signInWithEmail => 'ইমেইল';

  @override
  String get signInWithPhone => 'মোবাইল';

  @override
  String get mobileNumber => 'মোবাইল নম্বর';

  @override
  String get mobileNumberHint => 'যেমন: 01712345678';

  @override
  String get mobileNumberRequired => 'আপনার মোবাইল নম্বর লিখুন';

  @override
  String get mobileNumberInvalid =>
      'বাংলাদেশের একটি মোবাইল নম্বর লিখুন, যেমন: 01712345678';

  @override
  String get sendCode => 'কোড পাঠান';

  @override
  String get otpTitle => 'পাঠানো কোডটি লিখুন';

  @override
  String otpSentBody(String phone, num minutes) {
    final intl.NumberFormat minutesNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String minutesString = minutesNumberFormat.format(minutes);

    String _temp0 = intl.Intl.pluralLogic(
      minutes,
      locale: localeName,
      other: '$minutesString মিনিট',
    );
    return '$phone নম্বরে গুড পিপলের লগইন থাকলে, এসএমএসে একটি ৬ সংখ্যার কোড পাঠানো হচ্ছে। কোডটি $_temp0 পর্যন্ত কাজ করবে।';
  }

  @override
  String get codeLabel => '৬ সংখ্যার কোড';

  @override
  String get codeRequired => '৬ সংখ্যার কোডটি লিখুন';

  @override
  String get codeWrongOrExpired =>
      'কোডটি ভুল অথবা এর মেয়াদ শেষ হয়ে গেছে। আবার দেখে লিখুন, অথবা নতুন কোড চান।';

  @override
  String get sendCodeAgain => 'আবার পাঠান';

  @override
  String sendCodeAgainHint(String seconds) {
    return 'কোড পাননি? $seconds সেকেন্ড পরে নতুন কোড চাইতে পারবেন।';
  }

  @override
  String get codeSentAgain => 'নতুন একটি কোড পাঠানো হচ্ছে।';

  @override
  String get useDifferentNumber => 'অন্য নম্বর ব্যবহার করুন';

  @override
  String get twoStepTitle => 'দুই ধাপে সাইন ইন';

  @override
  String get twoStepBody =>
      'আপনার অথেনটিকেটর অ্যাপে দেখানো ৬ সংখ্যার কোডটি লিখুন।';

  @override
  String get twoStepRecoveryBody =>
      'আপনার রিকভারি কোডগুলোর একটি লিখুন, যেমন: k7qm-2xpd। প্রতিটি কোড একবারই কাজ করে।';

  @override
  String get recoveryCodeLabel => 'রিকভারি কোড';

  @override
  String get recoveryCodeInvalid => 'k7qm-2xpd-এর মতো একটি রিকভারি কোড লিখুন';

  @override
  String get useRecoveryCode => 'এর বদলে রিকভারি কোড ব্যবহার করুন';

  @override
  String get useAuthenticatorCode => 'এর বদলে অ্যাপের কোড ব্যবহার করুন';

  @override
  String get twoStepWrongCode =>
      'কোডটি ভুল অথবা এর মেয়াদ শেষ হয়ে গেছে। আবার চেষ্টা করুন, অথবা পেছনে গিয়ে আবার সাইন ইন করুন।';

  @override
  String get verify => 'যাচাই করুন';

  @override
  String get twoStepSetupTitle => 'আগে দুই ধাপে সাইন ইন চালু করুন';

  @override
  String get twoStepSetupBody =>
      'আপনার ভূমিকার জন্য দুই ধাপে সাইন ইন বাধ্যতামূলক। গুড পিপলের ওয়েব অ্যাপে এটি চালু করুন, তারপর এখানে সাইন ইন করুন।';

  @override
  String get back => 'ফিরে যান';

  @override
  String get loginWrongCredentials => 'ওয়ার্কস্পেস, ইমেইল অথবা পাসওয়ার্ড ভুল';

  @override
  String get errorTooManyAttempts =>
      'অনেকবার চেষ্টা করা হয়েছে। কয়েক মিনিট অপেক্ষা করে আবার চেষ্টা করুন।';

  @override
  String errorTooManyAttemptsWait(num minutes) {
    final intl.NumberFormat minutesNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String minutesString = minutesNumberFormat.format(minutes);

    String _temp0 = intl.Intl.pluralLogic(
      minutes,
      locale: localeName,
      other:
          'অনেকবার চেষ্টা করা হয়েছে। $minutesString মিনিট পরে আবার চেষ্টা করুন।',
    );
    return '$_temp0';
  }

  @override
  String get errorLoginDisabled =>
      'এই লগইনটি আর সক্রিয় নেই। আপনার এইচআর টিমের সাথে যোগাযোগ করুন।';

  @override
  String get errorWrongPassword => 'আপনার বর্তমান পাসওয়ার্ডটি সঠিক নয়।';

  @override
  String get errorTenantSuspended =>
      'এই ওয়ার্কস্পেসটি স্থগিত করা হয়েছে। আপনার অ্যাডমিনের সাথে যোগাযোগ করুন।';

  @override
  String get errorTenantReadOnly =>
      'এই ওয়ার্কস্পেসটি এখন শুধু দেখার জন্য খোলা, তাই কোনো পরিবর্তন সংরক্ষণ করা যাবে না।';

  @override
  String get errorRoleNotAllowed => 'আপনার ভূমিকায় এটি করার অনুমতি নেই।';

  @override
  String get errorFeatureNotInPlan => 'আপনার ওয়ার্কস্পেসের প্ল্যানে এটি নেই।';

  @override
  String get punchErrorOfflineTooOld =>
      'এই পাঞ্চটি ৭২ ঘণ্টারও বেশি আগে সংরক্ষণ করা হয়েছিল, তাই এখন আর যোগ করা যাবে না। এর বদলে সংশোধনের আবেদন করুন।';

  @override
  String punchSavedOffline(String time) {
    return 'ইন্টারনেট সংযোগ নেই। $time-এর পাঞ্চটি এই ফোনে রাখা আছে, সংযোগ ফিরলেই পাঠানো হবে।';
  }

  @override
  String punchesWaiting(num count) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countStringটি পাঞ্চ পাঠানোর অপেক্ষায়',
    );
    return '$_temp0';
  }

  @override
  String punchesWaitingBody(String times) {
    return 'সংযোগ ছাড়া নেওয়া হয়েছে: $times। সার্ভারে পৌঁছানো গেলেই অ্যাপ নিজে থেকে এগুলো পাঠিয়ে দেবে।';
  }

  @override
  String get punchesSendNow => 'এখনই পাঠান';

  @override
  String punchesSent(num count) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'রাখা $countStringটি পাঞ্চ পাঠানো হয়েছে',
    );
    return '$_temp0';
  }

  @override
  String punchRefusedTitle(String time, String date) {
    return '$date তারিখের $time-এর পাঞ্চটি রেকর্ড হয়নি';
  }

  @override
  String get punchRefusedHint => 'দিনটি ঠিক করতে সংশোধনের আবেদন করুন।';

  @override
  String get dismiss => 'ঠিক আছে';

  @override
  String get homePunchRefused =>
      'সংযোগ ছাড়া রাখা একটি পাঞ্চ রেকর্ড হয়নি। কারণ জানতে হাজিরা খুলুন।';

  @override
  String get notificationsTitle => 'নোটিফিকেশন';

  @override
  String get notificationsEmpty => 'এখনো কোনো নোটিফিকেশন নেই।';

  @override
  String get notificationsLoadFailed => 'আপনার নোটিফিকেশন লোড করা যায়নি।';

  @override
  String get notificationsMarkAllRead => 'সবগুলো পড়া হয়েছে বলে চিহ্নিত করুন';

  @override
  String notificationsUnread(num count) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'নোটিফিকেশন, $countStringটি অপঠিত',
      zero: 'নোটিফিকেশন',
    );
    return '$_temp0';
  }

  @override
  String get notificationUnread => 'অপঠিত';

  @override
  String get pushOpen => 'দেখুন';

  @override
  String get teamTitle => 'টিম';

  @override
  String get teamSubtitle => 'আজ কে এসেছেন, আর কে ছুটিতে আছেন';

  @override
  String get teamLoadFailed => 'আপনার টিমের তথ্য লোড করা যায়নি।';

  @override
  String get teamEmpty => 'এখানে দেখানোর মতো কেউ নেই।';

  @override
  String get teamAll => 'সবাই';

  @override
  String get teamOnLeave => 'এই সপ্তাহে ছুটিতে';

  @override
  String get teamNoLeave => 'এই সপ্তাহে কেউ ছুটিতে নেই।';

  @override
  String get teamLeaveLoadFailed => 'কে ছুটিতে আছেন, তা লোড করা যায়নি।';

  @override
  String get teamNoEmployeeBody =>
      'টিমের তথ্য দেখতে আপনার লগইনের সাথে একটি কর্মী রেকর্ড যুক্ত থাকতে হয়।';

  @override
  String get accountTitle => 'অ্যাকাউন্ট';

  @override
  String get accountSubtitle => 'সাইন ইন, পাসওয়ার্ড ও দুই ধাপে সাইন ইন';

  @override
  String get accountLoadFailed => 'আপনার অ্যাকাউন্টের তথ্য লোড করা যায়নি।';

  @override
  String get accountName => 'নাম';

  @override
  String get accountRole => 'ভূমিকা';

  @override
  String get accountNotSet => 'দেওয়া নেই';

  @override
  String roleName(String role) {
    String _temp0 = intl.Intl.selectLogic(role, {
      'tenant_admin': 'ওয়ার্কস্পেস অ্যাডমিন',
      'hr_admin': 'এইচআর অ্যাডমিন',
      'hr_officer': 'এইচআর কর্মকর্তা',
      'attendance_officer': 'হাজিরা কর্মকর্তা',
      'auditor': 'নিরীক্ষক',
      'employee': 'কর্মী',
      'other': 'অজানা',
    });
    return '$_temp0';
  }

  @override
  String get accountTwoStep => 'দুই ধাপে সাইন ইন';

  @override
  String get accountTwoStepOn => 'চালু';

  @override
  String get accountTwoStepOff => 'বন্ধ';

  @override
  String get accountTwoStepRequired => 'আপনার ভূমিকার জন্য বাধ্যতামূলক।';

  @override
  String get accountTwoStepHint =>
      'গুড পিপলের ওয়েব অ্যাপ থেকে এটি চালু বা বন্ধ করুন।';

  @override
  String get accountNoPassword =>
      'আপনি মোবাইলে পাঠানো কোড দিয়ে সাইন ইন করেন, তাই বদলানোর মতো কোনো পাসওয়ার্ড নেই।';

  @override
  String get changePassword => 'পাসওয়ার্ড বদলান';

  @override
  String get currentPassword => 'বর্তমান পাসওয়ার্ড';

  @override
  String get currentPasswordRequired => 'আপনার বর্তমান পাসওয়ার্ড লিখুন';

  @override
  String get newPassword => 'নতুন পাসওয়ার্ড';

  @override
  String get newPasswordHint => 'কমপক্ষে ১০টি অক্ষর';

  @override
  String get confirmNewPassword => 'নতুন পাসওয়ার্ড আবার লিখুন';

  @override
  String get newPasswordTooShort => 'কমপক্ষে ১০টি অক্ষর ব্যবহার করুন';

  @override
  String get newPasswordSame =>
      'এমন একটি পাসওয়ার্ড বেছে নিন যা আপনি এখন ব্যবহার করছেন না';

  @override
  String get newPasswordMismatch => 'দুটি নতুন পাসওয়ার্ড মিলছে না';

  @override
  String get passwordChanged =>
      'পাসওয়ার্ড বদলানো হয়েছে। এই ফোনে আপনি সাইন ইন থাকবেন; অন্য ফোন ও ব্রাউজার থেকে সাইন আউট করে দেওয়া হয়েছে।';

  @override
  String get timesheetTitle => 'টাইমশিট';

  @override
  String get timesheetSubtitle =>
      'প্রতিটি প্রকল্পে আপনার কাজের ঘণ্টা, অফলাইনেও';

  @override
  String get timesheetPreviousMonth => 'আগের মাস';

  @override
  String get timesheetNextMonth => 'পরের মাস';

  @override
  String get timesheetNoEmployeeBody =>
      'টাইমশিট একজন কর্মীর রেকর্ডের অংশ, কিন্তু আপনার লগইনের সঙ্গে কোনো রেকর্ড যুক্ত নেই। থাকা উচিত মনে হলে আপনার মানবসম্পদ বিভাগকে জিজ্ঞাসা করুন।';

  @override
  String get timesheetLoadFailed => 'আপনার টাইমশিট লোড করা যায়নি।';

  @override
  String get timesheetOffline =>
      'আপনি অফলাইনে আছেন। এটি আপনার ফোনে রাখা কপি; যে ঘণ্টা লিখবেন তা আবার অনলাইনে এলে পাঠানো হবে।';

  @override
  String timesheetStatus(String status) {
    String _temp0 = intl.Intl.selectLogic(status, {
      'draft': 'খসড়া',
      'submitted': 'জমা দেওয়া হয়েছে',
      'approved': 'অনুমোদিত',
      'rejected': 'ফেরত এসেছে',
      'other': 'অজানা',
    });
    return '$_temp0';
  }

  @override
  String get timesheetDue =>
      'এ মাসে আপনি একটি প্রকল্পে নিযুক্ত আছেন। আপনার ঘণ্টাগুলো লিখুন এবং মাস শেষে জমা দিন।';

  @override
  String timesheetSubmittedNotice(String date) {
    return '$date তারিখে জমা দেওয়া হয়েছে। অনুমোদনের অপেক্ষায়।';
  }

  @override
  String timesheetApprovedNotice(String name, String date) {
    return '$name $date তারিখে অনুমোদন করেছেন।';
  }

  @override
  String get timesheetRejectedNotice =>
      'সংশোধনের জন্য ফেরত এসেছে। ঘণ্টাগুলো ঠিক করে আবার জমা দিন।';

  @override
  String timesheetReopenedNotice(String note) {
    return 'মানবসম্পদ বিভাগ এটি আবার খুলেছে: $note';
  }

  @override
  String get timesheetWeekend => 'সাপ্তাহিক ছুটি';

  @override
  String get timesheetOffDay => 'বন্ধের দিন';

  @override
  String timesheetLeave(String name) {
    return 'ছুটি: $name';
  }

  @override
  String timesheetWorked(String hours) {
    return 'হাজিরা $hours ঘণ্টা';
  }

  @override
  String timesheetHours(String hours) {
    return '$hours ঘণ্টা';
  }

  @override
  String get timesheetHoursUnit => 'ঘণ্টা';

  @override
  String get timesheetOtherWork => 'অন্যান্য কাজ';

  @override
  String timesheetPlanned(String percent) {
    return 'পরিকল্পিত $percent%';
  }

  @override
  String timesheetShare(String hours, String percent) {
    return '$hours ঘণ্টা · $percent%';
  }

  @override
  String timesheetTotal(String hours) {
    return 'মোট $hours ঘণ্টা';
  }

  @override
  String get timesheetNoHours => 'কোনো ঘণ্টা নেই';

  @override
  String timesheetEditDay(String date) {
    return '$date তারিখের ঘণ্টা';
  }

  @override
  String get timesheetHoursInvalid =>
      '০ থেকে ২৪-এর মধ্যে ঘণ্টা লিখুন, যেমন ৭.৫';

  @override
  String get timesheetDayTooLong => 'এক দিনে ২৪ ঘণ্টার বেশি হতে পারে না';

  @override
  String get timesheetSaveDay => 'সংরক্ষণ করুন';

  @override
  String get timesheetCancel => 'বাতিল';

  @override
  String get timesheetAddProject => 'প্রকল্প যোগ করুন';

  @override
  String get timesheetUnsent => 'এখনো পাঠানো হয়নি';

  @override
  String timesheetWaiting(num count) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countStringটি পরিবর্তন পাঠানোর অপেক্ষায়',
    );
    return '$_temp0';
  }

  @override
  String get timesheetSendNow => 'এখনই পাঠান';

  @override
  String timesheetSent(num count) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countStringটি পরিবর্তন পাঠানো হয়েছে',
    );
    return '$_temp0';
  }

  @override
  String get timesheetSavedOffline =>
      'আপনার ফোনে রাখা হয়েছে। অনলাইনে এলে পাঠানো হবে।';

  @override
  String timesheetRefusedTitle(String project, String date) {
    return '$date তারিখে $project-এর ঘণ্টা সংরক্ষিত হয়নি';
  }

  @override
  String get timesheetPrefill => 'হাজিরা থেকে পূরণ করুন';

  @override
  String timesheetPrefilled(num count) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'হাজিরা থেকে $countStringটি দিন পূরণ হয়েছে',
      zero: 'পূরণ করার মতো কোনো দিন ছিল না',
    );
    return '$_temp0';
  }

  @override
  String get timesheetSubmit => 'জমা দিন';

  @override
  String get timesheetSubmitTitle => 'আপনার টাইমশিট জমা দিন';

  @override
  String get timesheetDeclaration =>
      'আমি প্রত্যয়ন করছি যে এই টাইমশিটে উল্লিখিত ঘণ্টাগুলো এ মাসে প্রদর্শিত প্রকল্পগুলোতে আমার প্রকৃতপক্ষে সম্পাদিত কাজের সময়।';

  @override
  String get timesheetDeclarationConfirm => 'আমি এই ঘোষণা দিচ্ছি';

  @override
  String get timesheetSubmitted => 'টাইমশিট জমা দেওয়া হয়েছে';

  @override
  String get timesheetSendFirst =>
      'আপনার পরিবর্তনগুলো এখনো সার্ভারে পৌঁছায়নি। জমা দেওয়ার আগে সেগুলো পাঠান।';

  @override
  String get timesheetNoProjects => 'এ মাসে ঘণ্টা লেখার মতো কোনো প্রকল্প নেই।';

  @override
  String get timesheetErrorLocked =>
      'এই টাইমশিট জমা বা অনুমোদিত হয়ে গেছে, তাই আর বদলানো যাবে না।';

  @override
  String get timesheetErrorEmpty => 'জমা দেওয়ার আগে আপনার ঘণ্টাগুলো লিখুন।';

  @override
  String get timesheetErrorMonthNotStarted =>
      'মাস শুরু হওয়ার পরেই তা জমা দেওয়া যায়।';

  @override
  String get timesheetErrorOutsideMonth => 'দিনটি এই মাসের নয়।';

  @override
  String get timesheetErrorProjectUnknown => 'এমন কোনো প্রকল্প নেই।';

  @override
  String get timesheetErrorProjectClosed => 'প্রকল্পটি বন্ধ হয়ে গেছে।';

  @override
  String get timesheetErrorOtherCompany => 'প্রকল্পটি অন্য কোম্পানির।';

  @override
  String get timesheetErrorOutsidePeriod => 'সেদিন প্রকল্পটি চালু ছিল না।';

  @override
  String get timesheetErrorDayOver24 => 'এক দিনে ২৪ ঘণ্টার বেশি হতে পারে না।';

  @override
  String get timesheetErrorClientIdTaken => 'এই এন্ট্রিটি অন্য কারও।';

  @override
  String get approvalTimesheetTitle => 'প্রকল্প টাইমশিট';

  @override
  String get approveTimesheetTitle => 'এই টাইমশিট অনুমোদন করবেন?';

  @override
  String get rejectTimesheetTitle => 'এই টাইমশিট প্রত্যাখ্যান করবেন?';

  @override
  String get timesheetApproved => 'টাইমশিট অনুমোদন করা হয়েছে';

  @override
  String get timesheetRejected => 'টাইমশিট সংশোধনের জন্য ফেরত পাঠানো হয়েছে';

  @override
  String get approvalOpeningTitle => 'নিয়োগের পদ';

  @override
  String approvalOpeningPositions(num count, String type) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countStringটি পদ',
    );
    return '$_temp0, $type';
  }

  @override
  String get approvalOpeningNew => 'নতুন পদ';

  @override
  String approvalOpeningReplaces(String name) {
    return '$name-এর স্থলে';
  }

  @override
  String get approvalBudget => 'মাসিক মোট বেতনের বাজেট';

  @override
  String approvalBudgetUpTo(String amount) {
    return 'সর্বোচ্চ $amount';
  }

  @override
  String approvalBudgetFrom(String amount) {
    return 'অন্তত $amount';
  }

  @override
  String get approvalHiringManager => 'নিয়োগকারী ব্যবস্থাপক';

  @override
  String get approvalJustification => 'কেন প্রয়োজন';

  @override
  String get approveOpeningTitle => 'এই পদটি অনুমোদন করবেন?';

  @override
  String get rejectOpeningTitle => 'এই পদটি প্রত্যাখ্যান করবেন?';

  @override
  String get openingApproved => 'পদটি অনুমোদন করা হয়েছে';

  @override
  String get openingRejected => 'পদটি প্রত্যাখ্যান করা হয়েছে';

  @override
  String get approvalOfferTitle => 'বাজেটের বেশি নিয়োগ প্রস্তাব';

  @override
  String get approvalOfferPay => 'মাসিক মোট বেতন';

  @override
  String approvalOfferAgainstBudget(String amount, String budget) {
    return '$amount · বাজেট সর্বোচ্চ $budget';
  }

  @override
  String get approvalOfferJoining => 'যোগদান';

  @override
  String approvalOfferDraftedBy(String name) {
    return 'খসড়া করেছেন $name';
  }

  @override
  String get approveOfferTitle => 'এই নিয়োগ প্রস্তাব অনুমোদন করবেন?';

  @override
  String get rejectOfferTitle => 'এই নিয়োগ প্রস্তাব প্রত্যাখ্যান করবেন?';

  @override
  String get offerApproved =>
      'নিয়োগ প্রস্তাব অনুমোদিত। এইচআর এখন এটি পাঠাতে পারবে।';

  @override
  String get offerRejected => 'নিয়োগ প্রস্তাব প্রত্যাখ্যান করা হয়েছে';

  @override
  String get interviewsTitle => 'সাক্ষাৎকার';

  @override
  String get interviewsSubtitle =>
      'যাঁদের সাক্ষাৎকার নেবেন, তাঁদের সিভি ও আপনার স্কোরকার্ড';

  @override
  String interviewsToDo(num count) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countStringটি সাক্ষাৎকারে আপনাকে প্রয়োজন',
    );
    return '$_temp0';
  }

  @override
  String get myInterviewsTitle => 'আমার সাক্ষাৎকার';

  @override
  String get interviewsUpcoming => 'সামনে';

  @override
  String get interviewsPast => 'আগের';

  @override
  String get interviewsNoUpcoming => 'সামনে কোনো সাক্ষাৎকার নেই।';

  @override
  String get interviewsNoPast => 'এখনো নেই।';

  @override
  String get interviewsLoadFailed => 'আপনার সাক্ষাৎকারগুলো লোড করা যায়নি।';

  @override
  String interviewKindName(String kind) {
    String _temp0 = intl.Intl.selectLogic(kind, {
      'in_person': 'সরাসরি',
      'phone': 'ফোনে',
      'video': 'ভিডিওতে',
      'other': 'সাক্ষাৎকার',
    });
    return '$_temp0';
  }

  @override
  String interviewStatusName(String status) {
    String _temp0 = intl.Intl.selectLogic(status, {
      'scheduled': 'নির্ধারিত',
      'completed': 'সম্পন্ন',
      'cancelled': 'বাতিল',
      'other': 'অজানা',
    });
    return '$_temp0';
  }

  @override
  String get interviewScorecardIn => 'স্কোরকার্ড জমা হয়েছে';

  @override
  String get interviewScorecardToDo => 'স্কোরকার্ড বাকি';

  @override
  String interviewForOpening(String title) {
    return '$title পদের জন্য';
  }

  @override
  String get interviewTitle => 'সাক্ষাৎকার';

  @override
  String get interviewLoadFailed => 'এই সাক্ষাৎকারটি লোড করা যায়নি।';

  @override
  String get interviewGone => 'আপনি আর এই সাক্ষাৎকারের প্যানেলে নেই।';

  @override
  String get interviewWhen => 'সময় (বাংলাদেশ সময়)';

  @override
  String get interviewPlace => 'স্থান';

  @override
  String get interviewPhoneNote => 'ফোনের নোট';

  @override
  String get interviewMeetingLink => 'মিটিংয়ের লিংক';

  @override
  String get interviewJoinCall => 'ভিডিও কলে যোগ দিন';

  @override
  String get interviewLinkFailed => 'লিংকটি খোলা যায়নি।';

  @override
  String get interviewHrNotes => 'এইচআরের নোট';

  @override
  String get interviewCoverNote => 'প্রার্থীর বার্তা';

  @override
  String get interviewOpenCv => 'সিভি খুলুন';

  @override
  String get interviewNoCv => 'সিভি নেই';

  @override
  String get interviewCvGone => 'সিভিটি আর পাওয়া যাচ্ছে না।';

  @override
  String get interviewCvNoApp =>
      'এই ফোনের কোনো অ্যাপ সিভিটি খুলতে পারছে না। একটি পিডিএফ বা ওয়ার্ড রিডার ইনস্টল করে আবার চেষ্টা করুন।';

  @override
  String get interviewPanel => 'প্যানেল';

  @override
  String get scorecardTitle => 'আপনার স্কোরকার্ড';

  @override
  String get scorecardIntro =>
      'প্রতিটি মানদণ্ডে ১ (দুর্বল) থেকে ৫ (চমৎকার) দিন।';

  @override
  String get scorecardRateThis => '১ থেকে ৫-এর মধ্যে নম্বর দিন';

  @override
  String scorecardRatingOption(int rating) {
    final intl.NumberFormat ratingNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String ratingString = ratingNumberFormat.format(rating);

    return '৫-এর মধ্যে $ratingString';
  }

  @override
  String scorecardRating(int rating) {
    final intl.NumberFormat ratingNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String ratingString = ratingNumberFormat.format(rating);

    return '$ratingString / ৫';
  }

  @override
  String get scorecardRecommendation => 'সুপারিশ';

  @override
  String get scorecardChooseRecommendation => 'একটি সুপারিশ বেছে নিন';

  @override
  String recommendationName(String value) {
    String _temp0 = intl.Intl.selectLogic(value, {
      'strong_no': 'একেবারেই না',
      'no': 'না',
      'yes': 'হ্যাঁ',
      'strong_yes': 'অবশ্যই হ্যাঁ',
      'other': 'অজানা',
    });
    return '$_temp0';
  }

  @override
  String get scorecardFeedback => 'মতামত';

  @override
  String get scorecardFeedbackHint =>
      'সাক্ষাৎকার ও কাজ নিয়ে লিখুন। প্রার্থী চাইলে এই মতামত মুছে ফেলা হয়।';

  @override
  String get scorecardSubmit => 'স্কোরকার্ড জমা দিন';

  @override
  String get scorecardUpdate => 'স্কোরকার্ড হালনাগাদ করুন';

  @override
  String get scorecardSubmitted => 'স্কোরকার্ড জমা দেওয়া হয়েছে';

  @override
  String get scorecardUpdated => 'স্কোরকার্ড হালনাগাদ হয়েছে';

  @override
  String get scorecardIncomplete =>
      'প্রতিটি মানদণ্ডে নম্বর দিন এবং একটি সুপারিশ বেছে নিন।';

  @override
  String scorecardSubmittedOn(String date) {
    return '$date তারিখে জমা';
  }

  @override
  String get scorecardClosed =>
      'এই আবেদনটি বন্ধ হয়ে গেছে, তাই স্কোরকার্ড আর বদলানো যায় না।';

  @override
  String get scorecardCancelled => 'এই সাক্ষাৎকারটি বাতিল হয়েছে।';

  @override
  String get scorecardCriteriaChanged =>
      'এই পদের মানদণ্ড বদলেছে। নম্বরগুলো দেখে আবার জমা দিন।';

  @override
  String get scorecardOthersTitle => 'অন্য সাক্ষাৎকারগ্রহীতাদের স্কোরকার্ড';

  @override
  String get scorecardOthersHidden =>
      'আপনার স্কোরকার্ড জমা দেওয়ার পর অন্যদেরগুলো দেখতে পাবেন, যাতে আপনার মূল্যায়ন একান্তই আপনার থাকে।';

  @override
  String get scorecardOthersNone => 'আর কেউ এখনো স্কোরকার্ড জমা দেননি।';

  @override
  String get performanceTitle => 'কর্মমূল্যায়ন';

  @override
  String get performanceSubtitle =>
      'আপনার লক্ষ্য ও মূল্যায়ন, আর সহকর্মীরা আপনার কাছে যে মতামত চান';

  @override
  String performanceTasksWaiting(num count) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countStringটি কাজ আপনার অপেক্ষায়',
    );
    return '$_temp0';
  }

  @override
  String get performanceLoadFailed =>
      'আপনার কর্মমূল্যায়নের তথ্য লোড করা যায়নি।';

  @override
  String get performanceTasksTitle => 'আপনার জন্য অপেক্ষা করছে';

  @override
  String get performanceNoTasks => 'আপনার জন্য কিছু অপেক্ষা করছে না।';

  @override
  String performanceDueBy(String date) {
    return '$date-এর মধ্যে';
  }

  @override
  String get performanceTaskOnWeb => 'গুড পিপলের ওয়েব অ্যাপে করতে হয়';

  @override
  String get performanceOnTheWeb =>
      'আপনার দলের মূল্যায়ন লেখা, ক্যালিব্রেশন, মূল্যায়ন চক্র, উন্নয়ন পরিকল্পনা ও শিক্ষানবিশকালের মূল্যায়ন গুড পিপলের ওয়েব অ্যাপে করা হয়।';

  @override
  String performancePercent(String value) {
    return '$value%';
  }

  @override
  String get performanceChooseRating => 'একটি রেটিং বেছে নিন';

  @override
  String ratingName(String rating) {
    String _temp0 = intl.Intl.selectLogic(rating, {
      '1': 'প্রত্যাশার অনেক নিচে',
      '2': 'প্রত্যাশার নিচে',
      '3': 'প্রত্যাশা পূরণ করেছে',
      '4': 'প্রত্যাশার চেয়ে ভালো',
      '5': 'প্রত্যাশার চেয়ে অনেক ভালো',
      'other': 'রেটিং দেওয়া হয়নি',
    });
    return '$_temp0';
  }

  @override
  String taskSelfReview(String cycle) {
    return 'আপনার আত্মমূল্যায়ন · $cycle';
  }

  @override
  String taskAcknowledge(String cycle) {
    return 'আপনার মূল্যায়ন পড়ে স্বীকার করুন · $cycle';
  }

  @override
  String taskPeerAnswer(String person, String cycle) {
    return '$person সম্পর্কে মতামত · $cycle';
  }

  @override
  String taskPeerApprove(num count, String person) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$person-এর জন্য $countStringজন সহকর্মী অনুমোদন',
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
      other: '$person-এর $countStringটি লক্ষ্যে সম্মতি দিন',
    );
    return '$_temp0';
  }

  @override
  String taskManagerReview(String person, String cycle) {
    return '$person-এর মূল্যায়ন · $cycle';
  }

  @override
  String taskNoManager(num count, String cycle) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: 'ম্যানেজার ছাড়া $countStringটি মূল্যায়ন · $cycle',
    );
    return '$_temp0';
  }

  @override
  String taskProbationReview(String person) {
    return '$person-এর শিক্ষানবিশকালের মূল্যায়ন';
  }

  @override
  String get taskOther => 'কর্মমূল্যায়নের একটি কাজ';

  @override
  String get myGoalsTitle => 'আমার লক্ষ্য';

  @override
  String get myGoalsNone => 'আপনার এখনো কোনো লক্ষ্য নেই।';

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
      other: '$totalStringটি লক্ষ্য',
    );
    return '$_temp0: $agreedটি সম্মত, $draftটি সম্মতির অপেক্ষায়, $completedটি সম্পন্ন।';
  }

  @override
  String get myReviewsTitle => 'আমার মূল্যায়ন';

  @override
  String get myReviewsNone => 'আপনি এখনো কোনো মূল্যায়ন চক্রে ছিলেন না।';

  @override
  String get goalsLoadFailed => 'আপনার লক্ষ্যগুলো লোড করা যায়নি।';

  @override
  String get goalsNoEmployee =>
      'এই লগইনের কোনো কর্মী রেকর্ড নেই, তাই এর নিজের কোনো লক্ষ্য নেই।';

  @override
  String get goalsNone => 'এখনো কোনো লক্ষ্য নেই।';

  @override
  String goalsAgreedWith(String name) {
    return 'আপনার লক্ষ্যে সম্মতি দেন $name।';
  }

  @override
  String get goalsOutsideCycles => 'কোনো মূল্যায়ন চক্রের বাইরে';

  @override
  String get goalsDraftOnWeb =>
      'নতুন লক্ষ্যের খসড়া করা, আর লক্ষ্য বদলানো, সম্পন্ন করা বা বাদ দেওয়া হয় গুড পিপলের ওয়েব অ্যাপে।';

  @override
  String get goalsSubmit => 'সম্মতির জন্য পাঠান';

  @override
  String goalsSubmitted(num count) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countStringটি লক্ষ্য',
    );
    return '$_temp0 সম্মতির জন্য আপনার ম্যানেজারের কাছে পাঠানো হয়েছে।';
  }

  @override
  String get goalsSubmittedAlready =>
      'এই লক্ষ্যগুলো আগেই পাঠানো হয়েছে; আপনার ম্যানেজারের কাছে আছে।';

  @override
  String goalsReportsTo(String name) {
    return '$name-এর কাছে রিপোর্ট করেন';
  }

  @override
  String goalKindName(String kind) {
    String _temp0 = intl.Intl.selectLogic(kind, {
      'objective': 'উদ্দেশ্য',
      'kpi': 'কেপিআই',
      'other': 'লক্ষ্য',
    });
    return '$_temp0';
  }

  @override
  String goalStatusName(String status) {
    String _temp0 = intl.Intl.selectLogic(status, {
      'draft': 'খসড়া',
      'agreed': 'সম্মত',
      'completed': 'সম্পন্ন',
      'dropped': 'বাদ দেওয়া',
      'other': 'অজানা',
    });
    return '$_temp0';
  }

  @override
  String goalWeight(String weight) {
    return 'ওজন $weight';
  }

  @override
  String goalDue(String date) {
    return 'শেষ তারিখ $date';
  }

  @override
  String goalKeyResultsDone(String done, String total) {
    return '$totalটি মূল ফলের মধ্যে $doneটি সম্পন্ন';
  }

  @override
  String goalMeasure(String value, String target, String unit) {
    return 'লক্ষ্যমাত্রা $target $unit-এর বিপরীতে $value $unit';
  }

  @override
  String goalMeasureNone(String target, String unit) {
    return 'লক্ষ্যমাত্রা $target $unit; এখনো কোনো মান নেই';
  }

  @override
  String goalMeasureShort(String current, String target, String unit) {
    return '$target $unit-এর মধ্যে $current';
  }

  @override
  String goalDirectionName(String direction) {
    String _temp0 = intl.Intl.selectLogic(direction, {
      'higher': 'যত বেশি তত ভালো',
      'lower': 'যত কম তত ভালো',
      'other': '',
    });
    return '$_temp0';
  }

  @override
  String get goalProgressLabel => 'অগ্রগতি';

  @override
  String get goalTitle => 'লক্ষ্য';

  @override
  String get goalLoadFailed => 'এই লক্ষ্যটি লোড করা যায়নি।';

  @override
  String get goalGone => 'এই লক্ষ্যটি আপনার জন্য খোলা নেই।';

  @override
  String goalDropped(String note) {
    return 'বাদ দেওয়া হয়েছে: $note';
  }

  @override
  String get goalProgressTitle => 'অগ্রগতি';

  @override
  String goalReadingAttendance(
    String present,
    String working,
    String people,
    String from,
    String to,
  ) {
    return 'হাজিরা থেকে: $from থেকে $to পর্যন্ত $working কর্মদিবসের মধ্যে $present দিন উপস্থিত$people।';
  }

  @override
  String goalReadingPeople(String count) {
    return ' ($count জন)';
  }

  @override
  String goalReadingNoAttendance(String from, String to) {
    return 'হাজিরা থেকে: $from থেকে $to পর্যন্ত এখনো কোনো কর্মদিবস প্রক্রিয়া হয়নি।';
  }

  @override
  String goalReadingProduction(
    String pieces,
    String target,
    String people,
    String from,
    String to,
  ) {
    return 'উৎপাদন থেকে: $from থেকে $to পর্যন্ত $target পিসের লক্ষ্যমাত্রার বিপরীতে $pieces পিস$people।';
  }

  @override
  String goalReadingNoProduction(String from, String to) {
    return 'উৎপাদন থেকে: $from থেকে $to পর্যন্ত দৈনিক লক্ষ্যমাত্রার কোনো কাজ এখনো নেই।';
  }

  @override
  String get goalReadingClosed =>
      'এই লক্ষ্য বন্ধ; এর মান শেষবার যেমন পড়া হয়েছিল তেমনই আছে।';

  @override
  String goalSourceHint(String source) {
    String _temp0 = intl.Intl.selectLogic(source, {
      'attendance_rate': 'প্রক্রিয়াকৃত হাজিরা থেকে পড়া হয়: নির্ধারিত কর্মদিবসের কত অংশে উপস্থিত ছিলেন। অনুমোদিত ছুটি, সাপ্তাহিক ছুটি ও সরকারি ছুটি এর বিপক্ষে গণ্য হয় না।',
      'production_target': 'দৈনিক উৎপাদন থেকে পড়া হয়: যে অপারেশনে কাজ হয়েছে তার দৈনিক লক্ষ্যমাত্রার বিপরীতে তৈরি পিস।',
      'other': 'প্রতিটি হালনাগাদে মান লেখা হয়।',
    });
    return '$_temp0';
  }

  @override
  String goalSourceName(String source) {
    String _temp0 = intl.Intl.selectLogic(source, {
      'manual': 'হালনাগাদে লেখা',
      'attendance_rate': 'উপস্থিতির হার, হাজিরা থেকে',
      'production_target': 'লক্ষ্যমাত্রার বিপরীতে উৎপাদন, উৎপাদন থেকে',
      'other': 'অজানা',
    });
    return '$_temp0';
  }

  @override
  String get goalKeyResultDone => 'সম্পন্ন';

  @override
  String get goalKeyResultOpen => 'এখনো বাকি';

  @override
  String get goalDetailsTitle => 'বিস্তারিত';

  @override
  String get goalStartsOn => 'শুরু';

  @override
  String get goalDueOn => 'শেষ তারিখ';

  @override
  String get goalValueFrom => 'মান আসে';

  @override
  String get goalServes => 'যে লক্ষ্যের জন্য';

  @override
  String get goalServesNothing => 'অন্য কোনো লক্ষ্যের জন্য নয়';

  @override
  String get goalCheckinsTitle => 'হালনাগাদ';

  @override
  String get goalNoCheckins => 'এখনো কোনো হালনাগাদ নেই।';

  @override
  String goalCheckinValue(String value, String unit) {
    return 'মান $value $unit';
  }

  @override
  String get goalAgree => 'সম্মতি দিন';

  @override
  String get goalAgreed => 'সম্মতি দেওয়া হয়েছে।';

  @override
  String goalAgreeAll(String count, String total) {
    return 'সবগুলোতে সম্মতি দিন ($countটি, $total)';
  }

  @override
  String goalAgreeAllNoCycle(String count) {
    return 'সবগুলোতে সম্মতি দিন ($countটি)';
  }

  @override
  String goalWeights(String total) {
    return 'ওজন: ১০০%-এর মধ্যে $total';
  }

  @override
  String goalWeightsSplit(String agreed, String draft) {
    return 'সম্মত $agreed, খসড়া $draft';
  }

  @override
  String get goalCheckinKeyResults => 'সম্পন্ন মূল ফল';

  @override
  String get goalCheckinProgress => 'অগ্রগতি, শতাংশে';

  @override
  String get goalCheckinProgressHint => 'লক্ষ্য কতদূর এগিয়েছে, ০ থেকে ১০০।';

  @override
  String get goalCheckinProgressInvalid =>
      '০ থেকে ১০০-এর মধ্যে একটি পূর্ণ সংখ্যা দিন';

  @override
  String goalCheckinValueLabel(String unit) {
    return 'এখনকার মান ($unit)';
  }

  @override
  String get goalCheckinValueInvalid =>
      'একটি সংখ্যা দিন, দশমিকের পর সর্বোচ্চ দুই ঘর';

  @override
  String get goalCheckinEmpty => 'অগ্রগতি, মান অথবা একটি নোট দিন';

  @override
  String get goalCheckinFromRecords =>
      'মান আসে রেকর্ড থেকে; কাজ কেমন চলছে, তা নিয়ে একটি নোট লিখুন।';

  @override
  String get goalCheckinNote => 'নোট';

  @override
  String get goalCheckinNoteRequired =>
      'কাজ কেমন চলছে, তা নিয়ে একটি নোট লিখুন';

  @override
  String get goalCheckinAdd => 'হালনাগাদ যোগ করুন';

  @override
  String get goalCheckinSaved => 'হালনাগাদ যোগ হয়েছে।';

  @override
  String get goalErrorClosed => 'এই লক্ষ্যটি বন্ধ, এটি আর বদলায় না।';

  @override
  String get goalErrorCycleClosed =>
      'এই মূল্যায়ন চক্রে লক্ষ্য ঠিক করার সময় পেরিয়ে গেছে; এর লক্ষ্যগুলো আর বদলায় না।';

  @override
  String get goalErrorNotDraft => 'এই লক্ষ্যটি আর খসড়া নয়।';

  @override
  String get goalErrorWeightRequired =>
      'সম্মতি দেওয়ার আগে ওয়েবে চক্রের প্রতিটি লক্ষ্যের ওজন দিন।';

  @override
  String get goalErrorWeightsOver =>
      'এই চক্রের সম্মত লক্ষ্যগুলোর ওজন ১০০%-এর বেশি হয়ে যাবে।';

  @override
  String get goalErrorWeightsTotal =>
      'একটি চক্রে একজনের সম্মত লক্ষ্যগুলোর ওজন মিলিয়ে ১০০% হতে হবে।';

  @override
  String get goalErrorNoDrafts =>
      'পাঠানো বা সম্মতি দেওয়ার মতো কোনো খসড়া লক্ষ্য নেই।';

  @override
  String get teamGoalsTitle => 'সম্মতির অপেক্ষায় লক্ষ্য';

  @override
  String get teamGoalsLoadFailed => 'আপনার দলের লক্ষ্যগুলো লোড করা যায়নি।';

  @override
  String get teamGoalsNone => 'আপনার সম্মতির অপেক্ষায় কিছু নেই।';

  @override
  String teamGoalsToAgree(num count) {
    final intl.NumberFormat countNumberFormat =
        intl.NumberFormat.decimalPattern(localeName);
    final String countString = countNumberFormat.format(count);

    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$countStringটি লক্ষ্য আপনার সম্মতির অপেক্ষায়।',
      zero: 'আপনার সম্মতির অপেক্ষায় কিছু নেই।',
    );
    return '$_temp0';
  }

  @override
  String get reviewTitle => 'মূল্যায়ন';

  @override
  String get reviewLoadFailed => 'এই মূল্যায়নটি লোড করা যায়নি।';

  @override
  String get reviewGone => 'এই মূল্যায়নটি আপনার জন্য খোলা নেই।';

  @override
  String reviewMine(String cycle) {
    return 'আমার মূল্যায়ন: $cycle';
  }

  @override
  String reviewManager(String name) {
    return 'ম্যানেজার: $name';
  }

  @override
  String get reviewNoManager => 'ম্যানেজার নেই: এইচআর লিখবে';

  @override
  String reviewStatusName(String status) {
    String _temp0 = intl.Intl.selectLogic(status, {
      'self': 'আত্মমূল্যায়ন',
      'manager': 'ম্যানেজারের কাছে',
      'calibration': 'ক্যালিব্রেশনে',
      'released': 'প্রকাশিত',
      'acknowledged': 'স্বীকার করা হয়েছে',
      'other': 'অজানা',
    });
    return '$_temp0';
  }

  @override
  String get reviewOnWeb =>
      'এই মূল্যায়ন গুড পিপলের ওয়েব অ্যাপে পড়ুন ও লিখুন।';

  @override
  String get reviewOutcome => 'ফলাফল';

  @override
  String get reviewFinalRating => 'চূড়ান্ত রেটিং';

  @override
  String get reviewGoalScore => 'লক্ষ্যের স্কোর';

  @override
  String get reviewReleasedOn => 'প্রকাশের তারিখ';

  @override
  String get reviewNotRated => 'রেটিং দেওয়া হয়নি';

  @override
  String get reviewGoalsTitle => 'লক্ষ্য';

  @override
  String get reviewNoGoals =>
      'এই চক্রে কোনো সম্মত লক্ষ্য নেই: মূল্যায়নে শুধু দক্ষতাগুলোর রেটিং দেওয়া হবে।';

  @override
  String get reviewSelfTitle => 'আত্মমূল্যায়ন';

  @override
  String get reviewWithManager =>
      'জমা হয়েছে। এরপর আপনার ম্যানেজার মূল্যায়ন করবেন; এইচআর প্রকাশ করলে আপনি ফলাফল পড়তে পারবেন।';

  @override
  String get reviewManagerOnly =>
      'এই চক্রে আপনার ম্যানেজার আপনার মূল্যায়ন করবেন। এইচআর প্রকাশ করলে আপনি ফলাফল পড়তে পারবেন।';

  @override
  String get reviewNoSelf => 'এই মূল্যায়নে আত্মমূল্যায়ন নেই।';

  @override
  String get reviewManagerTitle => 'ম্যানেজারের মূল্যায়ন';

  @override
  String get reviewNothingWritten => 'এখনো কিছু লেখা হয়নি।';

  @override
  String get reviewOverall => 'সার্বিক মন্তব্য';

  @override
  String get reviewNamePeersOnWeb =>
      'মতামতের জন্য সহকর্মীদের নাম গুড পিপলের ওয়েব অ্যাপে দিতে পারেন।';

  @override
  String get reviewErrorStepClosed =>
      'মূল্যায়নের এই ধাপে আর পরিবর্তন করা যায় না।';

  @override
  String get selfReviewIntro =>
      'প্রতিটি লক্ষ্য ও দক্ষতার জন্য ১ থেকে ৫ রেটিং দিন এবং কারণ লিখুন। খসড়া সংরক্ষণ করে পরে ফিরে আসতে পারেন; জমা দেওয়ার পর আপনার আত্মমূল্যায়ন ম্যানেজারের কাছে যাবে এবং আর বদলানো যাবে না।';

  @override
  String get selfReviewGoals => 'লক্ষ্য';

  @override
  String get selfReviewCompetencies => 'দক্ষতা';

  @override
  String get selfReviewComment => 'মন্তব্য (ঐচ্ছিক)';

  @override
  String get selfReviewOverall => 'সার্বিক মন্তব্য';

  @override
  String get selfReviewIncomplete =>
      'জমা দেওয়ার আগে প্রতিটি লক্ষ্য ও দক্ষতার রেটিং দিন।';

  @override
  String get selfReviewCommentUnrated =>
      'মন্তব্য তার রেটিংয়ের সঙ্গে রাখা হয়: একটি রেটিং বেছে নিন, অথবা মন্তব্যটি মুছে দিন।';

  @override
  String get selfReviewSaveDraft => 'খসড়া সংরক্ষণ';

  @override
  String get selfReviewSubmit => 'ম্যানেজারের কাছে জমা দিন';

  @override
  String get selfReviewSaved => 'সংরক্ষিত হয়েছে।';

  @override
  String get selfReviewSubmitted =>
      'জমা হয়েছে। এরপর আপনার ম্যানেজার মূল্যায়ন করবেন।';

  @override
  String get selfReviewConfirmTitle => 'আত্মমূল্যায়ন জমা দেবেন?';

  @override
  String get selfReviewConfirmBody =>
      'এটি আপনার ম্যানেজারের কাছে যাবে, এবং আপনার রেটিং ও মন্তব্য আর বদলানো যাবে না।';

  @override
  String get acknowledgeTitle => 'স্বীকৃতি';

  @override
  String get acknowledgeIntro =>
      'আপনার মূল্যায়ন পড়ে স্বীকার করুন। আপনি একমত কি না জানাতে এবং মন্তব্য যোগ করতে পারেন; তা মূল্যায়নের সঙ্গে রেকর্ডে থাকবে।';

  @override
  String get acknowledgeQuestion => 'আপনি কি আপনার মূল্যায়নের সঙ্গে একমত?';

  @override
  String get acknowledgeAgree => 'আমি একমত';

  @override
  String get acknowledgeDisagree => 'আমি একমত নই';

  @override
  String get acknowledgeComment => 'আপনার মন্তব্য';

  @override
  String get acknowledgeCommentHint =>
      'ঐচ্ছিক। আপনার ম্যানেজার ও এইচআর পড়বেন।';

  @override
  String get acknowledgeSubmit => 'স্বীকার করুন';

  @override
  String get acknowledgeConfirmTitle => 'আপনার মূল্যায়ন স্বীকার করবেন?';

  @override
  String get acknowledgeConfirmBody =>
      'আপনার উত্তর ও মন্তব্য মূল্যায়নের সঙ্গে রেকর্ডে থাকবে এবং আর বদলানো যাবে না।';

  @override
  String get acknowledgeDone => 'স্বীকার করা হয়েছে।';

  @override
  String get acknowledgedAgreeing => 'স্বীকার করেছেন, একমত';

  @override
  String get acknowledgedDisagreeing => 'স্বীকার করেছেন, একমত নন';

  @override
  String get acknowledgeErrorAlready =>
      'আপনি এই মূল্যায়ন আগেই স্বীকার করেছেন।';

  @override
  String get acknowledgeErrorNotReleased => 'এই মূল্যায়ন এখনো প্রকাশিত হয়নি।';

  @override
  String get peerFeedbackTitle => 'সহকর্মীর মতামত';

  @override
  String get peersLoadFailed => 'সহকর্মীর মতামতের তালিকা লোড করা যায়নি।';

  @override
  String get peersToApprove => 'অনুমোদনের অপেক্ষায় সহকর্মী';

  @override
  String get peersToAnswer => 'আপনার কাছে চাওয়া মতামত';

  @override
  String get peersNoneToAnswer => 'কেউ আপনার মতামত চাননি।';

  @override
  String peerApproveLine(String peer, String person) {
    return '$person-এর জন্য $peer';
  }

  @override
  String get peerApprove => 'অনুমোদন';

  @override
  String get peerDecline => 'বাতিল';

  @override
  String get peerApproved => 'অনুমোদিত। তাঁর কাছে মতামত চাওয়া হয়েছে।';

  @override
  String get peerDeclined => 'বাতিল করা হয়েছে।';

  @override
  String peerFeedbackOn(String person) {
    return '$person সম্পর্কে মতামত';
  }

  @override
  String get peerStatusAnswered => 'উত্তর দিয়েছেন';

  @override
  String get peerStatusWaiting => 'আপনার অপেক্ষায়';

  @override
  String get peerStatusClosed => 'বন্ধ';

  @override
  String get peerRequestLoadFailed => 'এই অনুরোধটি লোড করা যায়নি।';

  @override
  String get peerRequestGone => 'এই অনুরোধটি আপনার জন্য খোলা নেই।';

  @override
  String get peerRequestClosed => 'এই মতামত আর দেওয়া যাবে না।';

  @override
  String get peerAnswerPrivacy =>
      'সৎভাবে ও সম্মানের সঙ্গে উত্তর দিন। যাঁর মূল্যায়ন, তিনি আপনার উত্তর শুধু অন্য সহকর্মীদের উত্তরের সঙ্গে একসঙ্গে দেখবেন, তাও অন্তত তিনজন উত্তর দিলে; কে কী লিখেছেন, কখনো দেখবেন না। তাঁর ম্যানেজার প্রতিটি উত্তর লেখকের নামসহ দেখবেন।';

  @override
  String peerQuestion(String question) {
    String _temp0 = intl.Intl.selectLogic(question, {
      'strengths': 'এই মানুষটি কোন কাজ ভালো করেন?',
      'improvements': 'তিনি কোথায় আরও ভালো করতে পারেন?',
      'other': 'প্রশ্ন',
    });
    return '$_temp0';
  }

  @override
  String get peerAnswerRequired => 'কয়েকটি শব্দ লিখুন';

  @override
  String get peerRating => 'আপনার সার্বিক রেটিং';

  @override
  String get peerSend => 'আমার মতামত পাঠান';

  @override
  String get peerConfirmTitle => 'আপনার মতামত পাঠাবেন?';

  @override
  String get peerConfirmBody =>
      'মতামত একবারই দেওয়া যায়: পাঠানোর পর আর বদলানো যাবে না।';

  @override
  String get peerThanks => 'ধন্যবাদ। আপনার মতামত পাঠানো হয়েছে।';

  @override
  String get peerYourAnswer => 'আপনার মতামত';

  @override
  String get peerSummaryTooFew =>
      'অন্তত তিনজন সহকর্মী উত্তর দিলে তবেই সহকর্মীর মতামত দেখানো হয়।';

  @override
  String peerSummaryAverage(String average) {
    return 'সহকর্মীদের গড় রেটিং: $average';
  }

  @override
  String get peerSummaryTogether =>
      'উত্তরগুলো একসঙ্গে দেখানো হয়; কে কী লিখেছেন, কখনো দেখানো হয় না।';

  @override
  String get peerErrorAnswered => 'আপনি আগেই মতামত দিয়েছেন।';

  @override
  String get peerErrorClosed =>
      'এই মূল্যায়নে সহকর্মীর মতামতের ধাপ বন্ধ হয়ে গেছে।';

  @override
  String get peerErrorDecided =>
      'এই সহকর্মীকে আগেই অনুমোদন বা বাতিল করা হয়েছে।';

  @override
  String get learningTitle => 'প্রশিক্ষণ';

  @override
  String get learningSubtitle =>
      'আপনার প্রশিক্ষণ, প্রয়োজনীয় কোর্স ও সম্পন্ন করার রেকর্ড।';

  @override
  String get learningRequirements => 'আমার প্রয়োজনীয় প্রশিক্ষণ';

  @override
  String get learningNoneRequirements =>
      'এই তালিকায় কোনো প্রয়োজনীয় কোর্স নেই।';

  @override
  String get learningSessions => 'প্রশিক্ষণ সেশন';

  @override
  String get learningNoneSessions => 'কোনো সেশন নেই।';

  @override
  String get learningCertificates => 'সম্পন্ন করার রেকর্ড';

  @override
  String get learningNoneCertificates => 'সম্পন্ন করার রেকর্ড এখনো নেই।';

  @override
  String get learningEnrol => 'নিবন্ধন করুন';

  @override
  String get learningWithdraw => 'নিবন্ধন প্রত্যাহার';

  @override
  String get learningCurrent => 'হালনাগাদ';

  @override
  String get learningDue => 'বাকি';

  @override
  String get learningOverdue => 'সময়সীমা পেরিয়েছে';

  @override
  String get learningEnrolled => 'নিবন্ধিত';

  @override
  String get learningWithdrawn => 'প্রত্যাহৃত';

  @override
  String get learningAttended => 'উপস্থিত';

  @override
  String get learningAbsent => 'অনুপস্থিত';

  @override
  String get learningRevoked => 'প্রত্যাহৃত';

  @override
  String get learningNoExpiry => 'মেয়াদ নির্ধারিত নেই';

  @override
  String get learningExpires => 'মেয়াদ শেষ';

  @override
  String get learningDownload => 'বাংলা পিডিএফ নামান';

  @override
  String get learningFull => 'সব আসন পূর্ণ।';

  @override
  String get learningStarted =>
      'সেশন শুরু হলে নিজে নিবন্ধন বা প্রত্যাহার করা যায় না।';

  @override
  String get learningFixed => 'সম্পন্ন বা বাতিল সেশনে আর পরিবর্তন করা যায় না।';

  @override
  String get learningManageOnWeb =>
      'কোর্স, উপস্থিতি ও অগ্নিনির্বাপন মহড়া ওয়েব থেকে পরিচালনা করুন।';

  @override
  String get learningLoadFailed => 'প্রশিক্ষণের তথ্য আনা যায়নি';

  @override
  String get learningUnknown => 'সংরক্ষিত হয়েছে।';

  @override
  String get learningExpired => 'মেয়াদোত্তীর্ণ';

  @override
  String get serviceEngagement => 'অংশগ্রহণ';

  @override
  String get serviceServices => 'কর্মীসেবা';

  @override
  String get serviceAnnouncements => 'ঘোষণা';

  @override
  String get serviceSurveys => 'জরিপ ও ইএনপিএস';

  @override
  String get serviceRecognition => 'অবদানের স্বীকৃতি';

  @override
  String get serviceRequests => 'এইচআর অনুরোধ';

  @override
  String get serviceAssets => 'আমার নেওয়া সম্পদ';

  @override
  String get serviceInventory => 'কোম্পানির সম্পদ';

  @override
  String get serviceIntroEngagement =>
      'কোম্পানির খবর, বেনামি জরিপ ও সহকর্মীদের অবদানের স্বীকৃতি।';

  @override
  String get serviceIntroServices =>
      'এইচআর দলের কাছে ব্যক্তিগত অনুরোধ ও আপনার নেওয়া সম্পদের তথ্য।';

  @override
  String get serviceNoEmployee =>
      'অনুরোধ বা প্রাপ্তি স্বীকারের জন্য সক্রিয় কর্মীর রেকর্ড লাগবে। এইচআরের কাজগুলো নিচে আছে।';

  @override
  String get serviceEmpty => 'এখনও কোনো তথ্য নেই।';

  @override
  String get serviceSaved => 'সংরক্ষিত হয়েছে।';

  @override
  String get serviceHelp => 'সাহায্য';

  @override
  String get serviceHrOnWeb =>
      'তৈরি ও পরিচালনার কাজগুলো এইচআর ওয়েব থেকে করেন।';

  @override
  String get serviceNewSurvey => 'জরিপ তৈরি করুন';

  @override
  String get serviceNewAnnouncement => 'ঘোষণা তৈরি করুন';

  @override
  String get serviceNewRecognition => 'সহকর্মীর অবদানের স্বীকৃতি দিন';

  @override
  String get serviceNewRequest => 'এইচআর অনুরোধ করুন';

  @override
  String get serviceNewAsset => 'সম্পদ নিবন্ধন করুন';

  @override
  String get serviceAllRequests => 'এইচআর সেবার অনুরোধ';

  @override
  String get serviceMyRequests => 'আমার অনুরোধ';

  @override
  String get serviceCompany => 'কোম্পানি';

  @override
  String get serviceEmployee => 'কর্মী';

  @override
  String get serviceEmployeeCode => 'কর্মী কোড';

  @override
  String get serviceTitle => 'শিরোনাম (ইংরেজি)';

  @override
  String get serviceTitleBn => 'শিরোনাম (বাংলা)';

  @override
  String get serviceDescription => 'বিবরণ (ইংরেজি)';

  @override
  String get serviceDescriptionBn => 'বিবরণ (বাংলা)';

  @override
  String get serviceBody => 'লেখা (ইংরেজি)';

  @override
  String get serviceBodyBn => 'লেখা (বাংলা)';

  @override
  String get serviceClosesAt => 'শেষ হবে (ঢাকার সময়)';

  @override
  String get serviceThreshold => 'ফল দেখাতে ন্যূনতম উত্তরসংখ্যা';

  @override
  String get serviceAnonymousNote =>
      'বেনামি জরিপ: আলাদা ব্যক্তির উত্তর রাখা হয় না। জরিপ শেষ হলে অন্তত পাঁচজন উত্তর দিলে এইচআর নির্ধারিত দলের সামগ্রিক ফল দেখেন। ছোট উপদলের ফল দেখানো হয় না।';

  @override
  String get serviceCohortNote =>
      'প্রকাশের সময় কোম্পানির সক্রিয় কর্মীদের তালিকা নির্ধারিত হয়। লগইনবিহীন কর্মীর হয়ে অন্য কেউ উত্তর দিতে পারেন না।';

  @override
  String get serviceEnpsQuestion =>
      'কাজের জায়গা হিসেবে এই কোম্পানিতে যোগ দিতে আপনি কতটা সুপারিশ করবেন?';

  @override
  String get serviceEnpsScale => '০ = একেবারেই নয়; ১০ = খুব জোর দিয়ে';

  @override
  String get servicePulseScale => '১ = সম্পূর্ণ অসম্মত; ৫ = সম্পূর্ণ সম্মত';

  @override
  String get servicePulseQuestions => 'মতামতের প্রশ্ন (ঐচ্ছিক, সর্বোচ্চ ১০টি)';

  @override
  String get serviceQuestion => 'প্রশ্ন (ইংরেজি)';

  @override
  String get serviceQuestionBn => 'প্রশ্ন (বাংলা)';

  @override
  String get serviceAddQuestion => 'প্রশ্ন যোগ করুন';

  @override
  String get serviceRemove => 'সরান';

  @override
  String get serviceChoose => 'বেছে নিন';

  @override
  String get serviceSaveDraft => 'খসড়া সংরক্ষণ করুন';

  @override
  String get serviceEditDraft => 'খসড়া সম্পাদনা';

  @override
  String get servicePublish => 'প্রকাশ করুন';

  @override
  String get serviceCloseSurvey => 'জরিপ শেষ করুন';

  @override
  String get serviceSubmitSurvey => 'বেনামি উত্তর জমা দিন';

  @override
  String get serviceAlreadyResponded => 'আপনার বেনামি উত্তর নথিভুক্ত হয়েছে।';

  @override
  String get serviceResults => 'জরিপের ফল';

  @override
  String serviceResultsProtected(Object minimum) {
    return 'জরিপ শেষ ও অন্তত $minimum জনের উত্তর না পাওয়া পর্যন্ত ফল গোপন থাকবে। তার আগে উত্তরসংখ্যাও দেখানো হয় না।';
  }

  @override
  String get serviceResultsEmployee =>
      'কর্মীদের আলাদা উত্তর বা জরিপের ফল দেখানো হয় না।';

  @override
  String get serviceEnps => 'ইএনপিএস';

  @override
  String get serviceResponses => 'উত্তরসংখ্যা';

  @override
  String get serviceEligible => 'অন্তর্ভুক্ত কর্মী';

  @override
  String get servicePromoters => 'প্রোমোটার (৯–১০)';

  @override
  String get servicePassives => 'প্যাসিভ (৭–৮)';

  @override
  String get serviceDetractors => 'ডিট্র্যাক্টর (০–৬)';

  @override
  String get serviceMean => 'গড়';

  @override
  String get serviceDistribution => '১–৫ স্কোরে উত্তরসংখ্যা';

  @override
  String get serviceClosed => 'জরিপটি শেষ হয়েছে।';

  @override
  String get serviceFixed =>
      'প্রকাশিত লেখা পরিবর্তন হয় না। সংশোধনের জন্য পুরোনো নোটিশ প্রত্যাহার করে নতুনটি প্রকাশ করুন।';

  @override
  String get serviceRequiresAcknowledgement => 'নীতিমালার প্রাপ্তি স্বীকার চাই';

  @override
  String get serviceDueOn => 'নির্ধারিত তারিখ';

  @override
  String get serviceExpiresOn => 'শেষ কার্যকর তারিখ';

  @override
  String get servicePolicyNote =>
      'প্রাপ্তি স্বীকার মানে আপনি নোটিশটি পড়েছেন। এটি চাকরির নতুন শর্তে সম্মতি বা ইলেকট্রনিক স্বাক্ষর নয়।';

  @override
  String get serviceAcknowledge => 'আমি নোটিশটি পড়েছি';

  @override
  String get serviceAcknowledged => 'প্রাপ্তি স্বীকৃত';

  @override
  String get serviceOutstanding => 'বাকি';

  @override
  String get serviceRetire => 'প্রত্যাহার করুন';

  @override
  String get serviceReason => 'কারণ';

  @override
  String get serviceReceipts => 'নীতিমালার প্রাপ্তি স্বীকারের তালিকা';

  @override
  String get serviceExpired => 'মেয়াদ শেষ';

  @override
  String get servicePending => 'বাকি';

  @override
  String get serviceValue => 'মূল্যবোধ';

  @override
  String get serviceMessage => 'বার্তা';

  @override
  String get serviceRecognitionNote =>
      'আপনার নাম ও বার্তা আপনার কোম্পানির সহকর্মীরা দেখতে পাবেন।';

  @override
  String get serviceWithdrawRecognition => 'প্রত্যাহার / সংযত করুন';

  @override
  String get serviceFrom => 'প্রেরক';

  @override
  String get serviceTo => 'প্রাপক';

  @override
  String get serviceCategory => 'ধরন';

  @override
  String get servicePriority => 'অগ্রাধিকার';

  @override
  String get serviceSubject => 'বিষয়';

  @override
  String get serviceRequestBody => 'আপনার অনুরোধ';

  @override
  String get serviceRequestPrivacy =>
      'শুধু আপনি ও এই কোম্পানির অনুমোদিত এইচআর কর্মীরা দেখতে পারবেন। ম্যানেজার এই অধিকার পান না। বিধিবদ্ধ অভিযোগ বা হয়রানির বিষয়ে আলাদা অভিযোগ চ্যানেল ব্যবহার করুন।';

  @override
  String get serviceGrievances => 'অভিযোগের চ্যানেল';

  @override
  String get serviceStatus => 'অবস্থা';

  @override
  String get serviceAssignee => 'দায়িত্বপ্রাপ্ত এইচআর';

  @override
  String get serviceUnassigned => 'কাউকে দেওয়া হয়নি';

  @override
  String get serviceUpdateRequest => 'অনুরোধ হালনাগাদ করুন';

  @override
  String get serviceReply => 'উত্তর পাঠান';

  @override
  String get serviceReplyBody => 'উত্তর';

  @override
  String get serviceInternal => 'শুধু এইচআরের অভ্যন্তরীণ নোট';

  @override
  String get serviceInternalLabel => 'অভ্যন্তরীণ নোট — শুধু এইচআরের জন্য';

  @override
  String get serviceResolve => 'সমাধান হিসেবে চিহ্নিত করুন';

  @override
  String get serviceCloseRequest => 'সমাধান পাওয়া অনুরোধ বন্ধ করুন';

  @override
  String get serviceReopen => 'অনুরোধ আবার খুলুন';

  @override
  String get serviceCreatedAt => 'খোলা হয়েছে';

  @override
  String get serviceUpdatedAt => 'হালনাগাদ';

  @override
  String get serviceRequestClosed =>
      'অনুরোধটি বন্ধ আছে। কথা চালাতে আবার খুলুন।';

  @override
  String get serviceTag => 'সম্পদের ট্যাগ';

  @override
  String get serviceName => 'নাম (ইংরেজি)';

  @override
  String get serviceNameBn => 'নাম (বাংলা)';

  @override
  String get serviceKind => 'ধরন';

  @override
  String get serviceSerialNumber => 'ক্রমিক নম্বর';

  @override
  String get serviceIssueAsset => 'সম্পদ দিন';

  @override
  String get serviceIssuedOn => 'দেওয়ার তারিখ';

  @override
  String get serviceCondition => 'অবস্থা / মন্তব্য';

  @override
  String get serviceIssueCondition => 'দেওয়ার সময় অবস্থা';

  @override
  String get serviceReturnCondition => 'ফেরতের সময় অবস্থা';

  @override
  String get serviceReturnedOn => 'ফেরতের তারিখ';

  @override
  String get serviceReturnAsset => 'ফেরত নথিভুক্ত করুন';

  @override
  String get serviceAcknowledgeAsset => 'আমি সম্পদটি পেয়েছি';

  @override
  String get serviceAssetNote =>
      'শুধু প্রাপ্তির রেকর্ড; বেতন থেকে স্বয়ংক্রিয়ভাবে টাকা কাটা হয় না। এইচআর ফেরত ও সংশোধন নথিভুক্ত করেন।';

  @override
  String get serviceOverdue => 'সময় পেরিয়েছে';

  @override
  String get serviceIssued => 'দেওয়া হয়েছে';

  @override
  String get serviceAvailable => 'দেওয়ার জন্য আছে';

  @override
  String get serviceHistory => 'দেওয়া ও ফেরতের ইতিহাস';

  @override
  String get serviceStatesDraft => 'খসড়া';

  @override
  String get serviceStatesOpen => 'খোলা';

  @override
  String get serviceStatesInProgress => 'কাজ চলছে';

  @override
  String get serviceStatesResolved => 'সমাধান হয়েছে';

  @override
  String get serviceStatesClosed => 'বন্ধ';

  @override
  String get serviceStatesPublished => 'প্রকাশিত';

  @override
  String get serviceStatesRetired => 'প্রত্যাহৃত';

  @override
  String get serviceValuesTeamwork => 'দলগত কাজ';

  @override
  String get serviceValuesService => 'সেবা';

  @override
  String get serviceValuesQuality => 'মান';

  @override
  String get serviceValuesInitiative => 'উদ্যোগ';

  @override
  String get serviceCategoriesLetters => 'চিঠিপত্র';

  @override
  String get serviceCategoriesPay => 'বেতন';

  @override
  String get serviceCategoriesLeave => 'ছুটি';

  @override
  String get serviceCategoriesBenefits => 'সুযোগ-সুবিধা';

  @override
  String get serviceCategoriesOther => 'অন্যান্য';

  @override
  String get servicePrioritiesNormal => 'সাধারণ';

  @override
  String get servicePrioritiesUrgent => 'জরুরি';

  @override
  String get serviceKindsLaptop => 'ল্যাপটপ';

  @override
  String get serviceKindsPhone => 'ফোন';

  @override
  String get serviceKindsIdCard => 'পরিচয়পত্র';

  @override
  String get serviceKindsVehicle => 'যানবাহন';

  @override
  String get serviceKindsEquipment => 'সরঞ্জাম';

  @override
  String get serviceKindsOther => 'অন্যান্য';

  @override
  String get serviceErrorsServiceEmployeeRequired =>
      'সক্রিয় কর্মীর রেকর্ড লাগবে।';

  @override
  String get serviceErrorsSurveyDates => 'ভবিষ্যতের শেষ সময় বেছে নিন।';

  @override
  String get serviceErrorsSurveyCohort =>
      'এই কোম্পানির কর্মীসংখ্যা ফল প্রকাশের ন্যূনতম সীমার কম।';

  @override
  String get serviceErrorsSurveyFixed => 'প্রকাশিত জরিপ পরিবর্তন হয় না।';

  @override
  String get serviceErrorsSurveyClosed => 'জরিপ শেষ হয়েছে।';

  @override
  String get serviceErrorsSurveySubmitted => 'আপনি ইতিমধ্যে উত্তর দিয়েছেন।';

  @override
  String get serviceErrorsSurveyAnswers => 'প্রতিটি প্রশ্নের উত্তর দিন।';

  @override
  String get serviceErrorsAnnouncementDates =>
      'আজ বা ভবিষ্যতের বৈধ তারিখ বেছে নিন।';

  @override
  String get serviceErrorsAnnouncementFixed =>
      'এই নোটিশ পরিবর্তন বা প্রাপ্তি স্বীকার করা যাচ্ছে না।';

  @override
  String get serviceErrorsRecognitionSelf =>
      'নিজের বদলে সহকর্মীর অবদানের স্বীকৃতি দিন।';

  @override
  String get serviceErrorsRecognitionHidden =>
      'স্বীকৃতিটি ইতিমধ্যে প্রত্যাহৃত।';

  @override
  String get serviceErrorsHrHandler =>
      'এই কোম্পানির অধিকার থাকা সক্রিয় এইচআর কর্মী বেছে নিন।';

  @override
  String get serviceErrorsHrRequestClosed =>
      'উত্তর বা পরিবর্তনের আগে অনুরোধটি আবার খুলুন।';

  @override
  String get serviceErrorsHrRequestTransition =>
      'এভাবে অবস্থা পরিবর্তন করা যাবে না।';

  @override
  String get serviceErrorsAssetRetired => 'সম্পদটি ব্যবহার থেকে সরানো হয়েছে।';

  @override
  String get serviceErrorsAssetIssued =>
      'সম্পদটি ইতিমধ্যে দেওয়া আছে। আগে ফেরত নথিভুক্ত করুন।';

  @override
  String get serviceErrorsAssetReturned => 'এটি ইতিমধ্যে ফেরত এসেছে।';

  @override
  String get serviceErrorsAssetDates =>
      'দেওয়া, ফেরত ও নির্ধারিত তারিখ পরীক্ষা করুন। ঘটা ঘটনা ভবিষ্যতের তারিখে লেখা যাবে না।';

  @override
  String get serviceErrorsAssetEmployeeScope =>
      'দেওয়ার তারিখে কর্মীকে এই কোম্পানিতে কাজ করতে হবে।';

  @override
  String get serviceUnknown => 'তথ্য নেই';

  @override
  String get serviceCancel => 'বাতিল';

  @override
  String get serviceFieldRequired => 'ঘরটি পূরণ করুন।';

  @override
  String get ssoMethod => 'প্রতিষ্ঠান';

  @override
  String get ssoContinue => 'একক লগইনে এগিয়ে যান';

  @override
  String get ssoFinish => 'ব্রাউজারের লগইন শেষ করুন';

  @override
  String get ssoBrowserHint =>
      'ব্রাউজারে প্রতিষ্ঠানের একক লগইন করুন, তারপর এখানে ফিরে লগইন শেষ করুন।';

  @override
  String get ssoPending =>
      'ব্রাউজারে লগইন এখনও সম্পন্ন হয়নি। সেখানে শেষ করে আবার চেষ্টা করুন।';
}
