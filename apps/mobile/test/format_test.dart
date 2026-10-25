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

  test('taka have grouping and the UI language\'s digits; paisa only when '
      'there are any', () {
    expect(formatTaka(en, '12500.00'), '৳12,500');
    expect(formatTaka(en, '1250.50'), '৳1,250.50');
    expect(formatTaka(en, '0.05'), '৳0.05');
    expect(formatTaka(en, '1234567.8'), '৳1,234,567.80');
    expect(formatTaka(en, '-300.00'), '-৳300');
    expect(formatTaka(bn, '12500.00'), '৳১২,৫০০');
    // Bangla groups by lakh, as the web does.
    expect(formatTaka(bn, '125000.00'), '৳১,২৫,০০০');
    expect(formatTaka(bn, '1250.50'), '৳১,২৫০.৫০');
  });

  test('a pay period is its month when whole, else its dates', () {
    expect(
      formatPayPeriod(en, DateTime.utc(2026, 10), DateTime.utc(2026, 10, 31)),
      'October 2026',
    );
    expect(
      formatPayPeriod(bn, DateTime.utc(2026, 10), DateTime.utc(2026, 10, 31)),
      'অক্টোবর ২০২৬',
    );
    // February's last day, in a leap year and not.
    expect(
      formatPayPeriod(en, DateTime.utc(2028, 2), DateTime.utc(2028, 2, 29)),
      'February 2028',
    );
    expect(
      formatPayPeriod(en, DateTime.utc(2028, 2), DateTime.utc(2028, 2, 28)),
      'Feb 1 – Feb 28, 2028',
    );
    expect(
      formatPayPeriod(en, DateTime.utc(2026, 9, 2), DateTime.utc(2026, 9, 30)),
      'Sep 2 – Sep 30, 2026',
    );
    // A month that starts mid-way and crosses into the next.
    expect(
      formatPayPeriod(
        en,
        DateTime.utc(2026, 9, 26),
        DateTime.utc(2026, 10, 25),
      ),
      'Sep 26 – Oct 25, 2026',
    );
    expect(
      formatPayPeriod(
        en,
        DateTime.utc(2026, 12, 16),
        DateTime.utc(2027, 1, 15),
      ),
      'Dec 16, 2026 – Jan 15, 2027',
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
