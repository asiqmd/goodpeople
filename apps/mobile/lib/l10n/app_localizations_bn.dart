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
}
