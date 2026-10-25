import 'package:intl/intl.dart';

import '../l10n/app_localizations.dart';

/// A calendar date in the UI language, for example `April 8, 1996` or
/// `৮ এপ্রিল, ১৯৯৬` (Bangla digits).
String formatDate(AppLocalizations l10n, DateTime date) =>
    DateFormat.yMMMMd(l10n.localeName).format(date);

/// A compact date, for example `Oct 29, 2026` or `২৯ অক্টো, ২০২৬`.
String formatShortDate(AppLocalizations l10n, DateTime date) =>
    DateFormat.yMMMd(l10n.localeName).format(date);

/// A date with its weekday and no year, for example `Fri, Oct 30`.
String formatWeekdayDate(AppLocalizations l10n, DateTime date) =>
    DateFormat.MMMEd(l10n.localeName).format(date);

/// The dates of a leave request, which never crosses a year: `Oct 29, 2026`
/// for one day, `Oct 29 – Oct 31, 2026` for several.
String formatDateRange(AppLocalizations l10n, DateTime start, DateTime end) {
  if (start.year == end.year &&
      start.month == end.month &&
      start.day == end.day) {
    return formatShortDate(l10n, start);
  }
  final startText = start.year == end.year
      ? DateFormat.MMMd(l10n.localeName).format(start)
      : formatShortDate(l10n, start);
  return '$startText – ${formatShortDate(l10n, end)}';
}

/// A year without grouping, for example `2026` or `২০২৬`.
String formatYear(AppLocalizations l10n, int year) =>
    DateFormat.y(l10n.localeName).format(DateTime.utc(year));

/// A number in the UI language's digits, keeping halves: `1.5` or `১.৫`.
String formatNumber(AppLocalizations l10n, num value) =>
    NumberFormat.decimalPattern(l10n.localeName).format(value);

/// A month and year, for example `October 2026` or `অক্টোবর ২০২৬`.
String formatMonth(AppLocalizations l10n, DateTime date) =>
    DateFormat.yMMMM(l10n.localeName).format(date);

/// A pay period: its month and year when it is one whole calendar month,
/// for example `October 2026` or `অক্টোবর ২০২৬`, else its dates as in
/// [formatDateRange], for example `Oct 15 – Oct 31, 2026`.
String formatPayPeriod(AppLocalizations l10n, DateTime start, DateTime end) {
  final lastOfMonth = DateTime.utc(start.year, start.month + 1, 0).day;
  final wholeMonth =
      start.day == 1 &&
      end.year == start.year &&
      end.month == start.month &&
      end.day == lastOfMonth;
  return wholeMonth
      ? formatMonth(l10n, start)
      : formatDateRange(l10n, start, end);
}

/// An income year such as the API's `2026-27` in the UI language's digits:
/// `2026-27` or `২০২৬-২৭`.
String formatFiscalYear(AppLocalizations l10n, String fiscalYear) {
  final match = RegExp(r'^(\d{4})-(\d{2})$').firstMatch(fiscalYear);
  if (match == null) return fiscalYear;
  final start = NumberFormat(
    '0000',
    l10n.localeName,
  ).format(int.parse(match[1]!));
  final end = NumberFormat('00', l10n.localeName).format(int.parse(match[2]!));
  return '$start-$end';
}

/// An amount in taka in the UI language's digits, as on the web:
/// `৳12,500` or `৳১২,৫০০`. Paisa show only when there are any:
/// `৳12,500.50`. [amount] is the API's decimal string, such as `12500.00`.
String formatTaka(AppLocalizations l10n, String amount) {
  final value = num.tryParse(amount);
  if (value == null) return '৳$amount';
  final format = NumberFormat.decimalPattern(l10n.localeName)
    ..minimumFractionDigits = value % 1 == 0 ? 0 : 2
    ..maximumFractionDigits = 2;
  final text = format.format(value.abs());
  return value < 0 ? '-৳$text' : '৳$text';
}

/// A day with its full weekday and no year, for example
/// `Saturday, October 24`.
String formatDayHeading(AppLocalizations l10n, DateTime date) =>
    DateFormat.MMMMEEEEd(l10n.localeName).format(date);

/// UTC offsets of the time zones the app can show without a time zone
/// database. Bangladesh has kept UTC+6 all year since 2009.
const _fixedOffsets = {
  'Asia/Dhaka': Duration(hours: 6),
  'UTC': Duration.zero,
  'Etc/UTC': Duration.zero,
};

/// The wall-clock time of [instant] in [timeZone], for formatting: the
/// result's fields read as that zone's local date and time.
///
/// Only zones with a fixed offset are known (Asia/Dhaka and UTC); any other
/// zone, or none, falls back to the device's local time.
DateTime wallClock(DateTime instant, String? timeZone) {
  final offset = _fixedOffsets[timeZone];
  return offset == null ? instant.toLocal() : instant.toUtc().add(offset);
}

/// A time of day in the UI language, for example `8:05 AM` or `৮:০৫ AM`.
///
/// The space before AM or PM is always a no-break space (U+00A0), so a
/// time never wraps inside a narrow row. intl writes a narrow no-break
/// space in English and a plain space in Bangla.
String formatClock(AppLocalizations l10n, int hour, int minute) =>
    DateFormat.jm(l10n.localeName)
        .format(DateTime.utc(2000, 1, 1, hour, minute))
        .replaceAll(_clockSpace, '\u00a0');

final _clockSpace = RegExp('[ \u202f]');

/// [instant] as a time of day in [timeZone] (see [wallClock]).
String formatInstantClock(
  AppLocalizations l10n,
  DateTime instant,
  String? timeZone,
) {
  final local = wallClock(instant, timeZone);
  return formatClock(l10n, local.hour, local.minute);
}

/// A duration in minutes as hours and minutes, for example `8:05`,
/// `152:30` or `৮:০৫`.
String formatMinutes(AppLocalizations l10n, int minutes) {
  final sign = minutes < 0 ? '-' : '';
  final total = minutes.abs();
  final hours = NumberFormat('0', l10n.localeName).format(total ~/ 60);
  final rest = NumberFormat('00', l10n.localeName).format(total % 60);
  return '$sign$hours:$rest';
}
