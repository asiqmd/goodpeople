import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:good_people/l10n/app_localizations.dart';
import 'package:good_people/ui/format.dart';
import 'package:intl/date_symbol_data_local.dart';

void main() {
  late AppLocalizations en;
  late AppLocalizations bn;

  setUpAll(() async {
    // In the app, the Material localizations load the date symbols.
    await initializeDateFormatting();
    en = await AppLocalizations.delegate.load(const Locale('en'));
    bn = await AppLocalizations.delegate.load(const Locale('bn'));
  });

  test('wallClock shows an instant in Dhaka time, UTC+6 all year', () {
    final firstIn = DateTime.utc(2026, 10, 24, 1, 55);
    final dhaka = wallClock(firstIn, 'Asia/Dhaka');
    expect((dhaka.hour, dhaka.minute), (7, 55));
    expect(dhaka.day, 24);
    // 19:30 UTC is already 01:30 the next day in Dhaka.
    final late = wallClock(DateTime.utc(2026, 10, 24, 19, 30), 'Asia/Dhaka');
    expect((late.day, late.hour, late.minute), (25, 1, 30));
    // Bangladesh has no daylight saving: June is the same offset.
    expect(wallClock(DateTime.utc(2026, 6, 1, 2), 'Asia/Dhaka').hour, 8);
    expect(wallClock(firstIn, 'UTC').hour, 1);
  });

  test('wallClock falls back to device time for zones it does not know', () {
    final at = DateTime.utc(2026, 10, 24, 1, 55);
    expect(wallClock(at, 'Asia/Kolkata'), at.toLocal());
    expect(wallClock(at, null), at.toLocal());
  });

  test('times keep AM and PM on the same line, in both languages', () {
    expect(formatClock(en, 8, 5), '8:05 AM');
    expect(formatClock(en, 17, 40), '5:40 PM');
    expect(formatClock(bn, 8, 5), '৮:০৫ AM');
    expect(
      formatInstantClock(en, DateTime.utc(2026, 10, 24, 11, 10), 'Asia/Dhaka'),
      '5:10 PM',
    );
  });

  test('minutes read as h:mm, past 24 hours too', () {
    expect(formatMinutes(en, 0), '0:00');
    expect(formatMinutes(en, 25), '0:25');
    expect(formatMinutes(en, 485), '8:05');
    expect(formatMinutes(en, 7250), '120:50');
    expect(formatMinutes(bn, 485), '৮:০৫');
  });
}
