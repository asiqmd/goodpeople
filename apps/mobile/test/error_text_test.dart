import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:good_people/api/api_exception.dart';
import 'package:good_people/l10n/app_localizations.dart';
import 'package:good_people/ui/error_text.dart';

ApiException _error(
  int status,
  String? code, {
  String message = 'The API says so',
  int? retryAfterSeconds,
}) => ApiException(
  kind: ApiErrorKind.server,
  statusCode: status,
  code: code,
  message: message,
  retryAfterSeconds: retryAfterSeconds,
);

void main() {
  final en = lookupAppLocalizations(const Locale('en'));
  final bn = lookupAppLocalizations(const Locale('bn'));

  /// Each code the app translates, with its English and Bangla text.
  final codes = <(int, String, String, String)>[
    (
      429,
      'too_many_attempts',
      'Too many attempts. Please wait a few minutes and try again.',
      'অনেকবার চেষ্টা করা হয়েছে। কয়েক মিনিট অপেক্ষা করে আবার চেষ্টা করুন।',
    ),
    (
      403,
      'login_disabled',
      'This login is no longer active. Ask your HR team.',
      'এই লগইনটি আর সক্রিয় নেই। আপনার এইচআর টিমের সাথে যোগাযোগ করুন।',
    ),
    (
      403,
      'tenant_suspended',
      'This workspace is suspended. Contact your administrator.',
      'এই ওয়ার্কস্পেসটি স্থগিত করা হয়েছে। আপনার অ্যাডমিনের সাথে যোগাযোগ করুন।',
    ),
    (
      403,
      'tenant_read_only',
      'This workspace is read-only for now, so changes can\'t be saved.',
      'এই ওয়ার্কস্পেসটি এখন শুধু দেখার জন্য খোলা, তাই কোনো পরিবর্তন সংরক্ষণ '
          'করা যাবে না।',
    ),
    (
      403,
      'role_not_allowed',
      'Your role can\'t do this.',
      'আপনার ভূমিকায় এটি করার অনুমতি নেই।',
    ),
    (
      400,
      'outside_geofence',
      'You are outside your workplace area, so you can\'t punch here.',
      'আপনি কর্মস্থলের নির্ধারিত এলাকার বাইরে আছেন, তাই এখান থেকে পাঞ্চ করা যাবে '
          'না।',
    ),
    (
      400,
      'location_required',
      'Allow location access to punch in or out.',
      'পাঞ্চ ইন বা আউট করতে লোকেশন ব্যবহারের অনুমতি দিন।',
    ),
    (
      400,
      'selfie_required',
      'Your workspace now asks for a photo with each punch. Punch again to '
          'take one.',
      'আপনার ওয়ার্কস্পেসে এখন প্রতিটি পাঞ্চের সাথে ছবি লাগে। ছবি তুলতে আবার পাঞ্চ '
          'করুন।',
    ),
    (
      409,
      'too_soon',
      'You punched less than a minute ago. Wait a moment before punching '
          'again.',
      'আপনি এক মিনিটেরও কম সময় আগে পাঞ্চ করেছেন। আবার পাঞ্চ করার আগে একটু '
          'অপেক্ষা করুন।',
    ),
    (400, 'no_geofence', en.punchBlockedNoGeofence, bn.punchBlockedNoGeofence),
    (
      403,
      'self_punch_disabled',
      'Punching from the app is turned off for your workspace. Use the '
          'attendance device at work.',
      bn.punchBlockedDisabled,
    ),
    (
      403,
      'separated',
      'Your employment has already ended.',
      'আপনার চাকরির মেয়াদ ইতিমধ্যে শেষ হয়ে গেছে।',
    ),
    (
      400,
      'offline_punch_too_old',
      'This punch was saved more than 72 hours ago, so it can\'t be added '
          'now. Ask for a correction instead.',
      bn.punchErrorOfflineTooOld,
    ),
    (
      400,
      'future_punch',
      'A punch time can\'t be in the future.',
      'পাঞ্চের সময় ভবিষ্যতের হতে পারবে না।',
    ),
  ];

  test('each known code reads in English and Bangla, not the API\'s '
      'English', () {
    for (final (status, code, english, bangla) in codes) {
      final error = _error(status, code);
      expect(describeError(en, error), english, reason: code);
      expect(describeError(bn, error), bangla, reason: code);
      expect(describeError(bn, error), isNot(error.message), reason: code);
    }
  });

  test('too_many_attempts says when to try again, in whole minutes', () {
    expect(
      describeError(en, _error(429, 'too_many_attempts', retryAfterSeconds: 1)),
      'Too many attempts. Try again in 1 minute.',
    );
    expect(
      describeError(
        en,
        _error(429, 'too_many_attempts', retryAfterSeconds: 125),
      ),
      'Too many attempts. Try again in 3 minutes.',
    );
    expect(
      describeError(
        bn,
        _error(429, 'too_many_attempts', retryAfterSeconds: 900),
      ),
      'অনেকবার চেষ্টা করা হয়েছে। ১৫ মিনিট পরে আবার চেষ্টা করুন।',
    );
  });

  test('an unknown code, or none, falls back to the API\'s message', () {
    expect(
      describeError(bn, _error(400, 'brand_new_rule', message: 'Paused')),
      'Paused',
    );
    expect(
      describeError(en, _error(404, null, message: 'Employee not found')),
      'Employee not found',
    );
    expect(apiErrorCodeText(en, _error(400, null)), isNull);
  });

  test('network and contract failures get the app\'s own words', () {
    expect(
      describeError(
        bn,
        const ApiException(kind: ApiErrorKind.network, message: 'timeout'),
      ),
      bn.networkError,
    );
    expect(
      describeError(
        en,
        const ApiException(kind: ApiErrorKind.badResponse, message: 'x'),
      ),
      en.unexpectedError,
    );
    expect(describeError(en, StateError('bug')), en.unexpectedError);
  });
}
