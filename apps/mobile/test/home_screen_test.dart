import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:good_people/api/api_models.dart';
import 'package:good_people/api/good_people_api.dart';
import 'package:good_people/app.dart';
import 'package:good_people/auth/auth_controller.dart';
import 'package:good_people/home/home_screen.dart';
import 'package:good_people/ui/notice_card.dart';

import 'support/fake_api.dart';

void main() {
  /// Signs in through the fake API, then shows the app (so, HomeScreen).
  Future<void> pumpSignedIn(WidgetTester tester, FakeGoodPeopleApi api) async {
    final container = ProviderContainer.test(
      overrides: [goodPeopleApiProvider.overrideWithValue(api)],
    );
    await container
        .read(authProvider.notifier)
        .signIn(workspace: 'acme', email: 'rahima@acme.test', password: 'x');
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const GoodPeopleApp(),
      ),
    );
    await tester.pumpAndSettle();
  }

  Finder moduleStatus(String feature, String status) => find.descendant(
    of: find.byKey(HomeScreen.moduleTileKey(feature)),
    matching: find.text(status),
  );

  testWidgets(
    'read-only tenant without payroll: banner shown, payroll locked',
    (tester) async {
      final api = FakeGoodPeopleApi()..accessView = readOnlyWithoutPayroll;
      await pumpSignedIn(tester, api);

      expect(find.byType(HomeScreen), findsOneWidget);
      expect(find.text('Read-only access'), findsOneWidget);
      expect(find.text('You can view data but not change it.'), findsOneWidget);
      expect(find.text('Growth'), findsOneWidget);
      expect(find.text('Trial'), findsOneWidget);

      expect(moduleStatus('payroll', 'Locked'), findsOneWidget);
      expect(moduleStatus('core_hr', 'Enabled'), findsOneWidget);
      expect(moduleStatus('sso', 'Locked'), findsOneWidget);
    },
  );

  testWidgets('suspended tenant shows the suspended banner', (tester) async {
    final api = FakeGoodPeopleApi()
      ..accessView = TenantAccessView.fromJson(
        accessJson(accessState: 'suspended', status: 'suspended'),
      );
    await pumpSignedIn(tester, api);

    expect(find.text('Access suspended'), findsOneWidget);
    expect(find.text('Read-only access'), findsNothing);
  });

  testWidgets('full access shows no banner and lists every module', (
    tester,
  ) async {
    await pumpSignedIn(tester, FakeGoodPeopleApi());

    expect(find.byType(NoticeCard), findsNothing);
    expect(moduleStatus('payroll', 'Enabled'), findsOneWidget);
    expect(find.byType(ListTile), findsNWidgets(11));
  });
}
