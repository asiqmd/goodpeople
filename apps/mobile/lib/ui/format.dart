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
