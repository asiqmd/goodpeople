/// Bangladesh mobile numbers and sign-in codes as people type them.
library;

/// The API's Bangladesh mobile pattern: `01712345678`, optionally after
/// `88` or `+88`.
final _bdMobile = RegExp(r'^(?:\+?88)?01[3-9]\d{8}$');

/// Spaces, dashes, dots and brackets people put between digits.
final _separators = RegExp(r'[\s\-().]');

/// [text] with Bangla digits (০ to ৯) as ASCII digits, so a Bangla keyboard
/// works for numbers and codes.
String asciiDigits(String text) => String.fromCharCodes([
  for (final unit in text.codeUnits)
    unit >= 0x09E6 && unit <= 0x09EF ? unit - 0x09E6 + 0x30 : unit,
]);

/// [input] as the API takes a Bangladesh mobile number, for example
/// `01712345678` or `+8801712345678`, or `null` when it is not one. The API
/// stores it as `+8801712345678`.
String? cleanBdMobile(String input) {
  final cleaned = asciiDigits(input.trim()).replaceAll(_separators, '');
  return _bdMobile.hasMatch(cleaned) ? cleaned : null;
}

/// A 6-digit code from an SMS or an authenticator app, as typed: Bangla
/// digits and stray spaces are fine. `null` when it is not 6 digits.
String? cleanSixDigitCode(String input) {
  final cleaned = asciiDigits(input).replaceAll(_separators, '');
  return RegExp(r'^\d{6}$').hasMatch(cleaned) ? cleaned : null;
}

/// A one-time recovery code such as `k7qm-2xpd`, lower case, or `null`
/// when [input] is not one.
String? cleanRecoveryCode(String input) {
  final cleaned = asciiDigits(input.trim()).toLowerCase();
  return RegExp(r'^[a-z0-9]{4}-[a-z0-9]{4}$').hasMatch(cleaned)
      ? cleaned
      : null;
}
