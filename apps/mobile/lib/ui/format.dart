import 'package:intl/intl.dart';

import '../l10n/app_localizations.dart';

/// A calendar date in the UI language, for example `April 8, 1996` or
/// `৮ এপ্রিল, ১৯৯৬` (Bangla digits).
String formatDate(AppLocalizations l10n, DateTime date) =>
    DateFormat.yMMMMd(l10n.localeName).format(date);
