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
}
