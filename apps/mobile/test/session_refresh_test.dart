import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:good_people/api/api_exception.dart';
import 'package:good_people/api/good_people_api.dart';
import 'package:good_people/api/token_store.dart';
import 'package:good_people/app.dart';
import 'package:good_people/auth/auth_controller.dart';
import 'package:good_people/auth/login_screen.dart';
import 'package:good_people/home/home_screen.dart';
import 'package:good_people/profile/profile_screen.dart';

import 'support/fake_api.dart';

const _expiredToken = ApiException(
  kind: ApiErrorKind.server,
  statusCode: 401,
  message: 'Unauthorized',
);

void main() {
  test('a 401 from /tenant/access refreshes once and retries', () async {
    final api = FakeGoodPeopleApi()..accessResults.add(_expiredToken);
    final container = ProviderContainer.test(
      overrides: [goodPeopleApiProvider.overrideWithValue(api)],
    );
    final auth = container.read(authProvider.notifier);
    await auth.signIn(workspace: 'acme', email: 'a@acme.test', password: 'x');

    final view = await auth.fetchTenantAccess();

    expect(view.tenant.name, 'Acme Garments Ltd');
    expect(api.refreshTokens, ['refresh-1']);
    expect(api.accessTokens, ['access-1', 'access-2']);
    final stored = await container.read(tokenStoreProvider).read();
    expect(stored?.refreshToken, 'refresh-2');
    expect(container.read(authProvider), isA<SignedIn>());
  });

  testWidgets('a rejected refresh sends the user back to login', (
    tester,
  ) async {
    final api = FakeGoodPeopleApi()
      ..accessResults.add(_expiredToken)
      ..refreshResult = _expiredToken;
    await tester.pumpWidget(appWith(api));

    await tester.enterText(find.byKey(LoginScreen.workspaceFieldKey), 'acme');
    await tester.enterText(
      find.byKey(LoginScreen.emailFieldKey),
      'a@acme.test',
    );
    await tester.enterText(find.byKey(LoginScreen.passwordFieldKey), 'x');
    await tester.tap(find.byKey(LoginScreen.submitKey));
    await tester.pumpAndSettle();

    expect(api.refreshTokens, ['refresh-1']);
    expect(find.byType(HomeScreen), findsNothing);
    expect(find.byType(LoginScreen), findsOneWidget);
    expect(
      find.text('Your session has ended. Please sign in again.'),
      findsOneWidget,
    );
  });

  test('a 401 from /tenant/me/employee refreshes once and retries', () async {
    final api = FakeGoodPeopleApi()..employeeResults.add(_expiredToken);
    final container = ProviderContainer.test(
      overrides: [goodPeopleApiProvider.overrideWithValue(api)],
    );
    final auth = container.read(authProvider.notifier);
    await auth.signIn(workspace: 'acme', email: 'a@acme.test', password: 'x');

    final employee = await auth.fetchMyEmployee();

    expect(employee.employeeCode, 'MG-0005');
    expect(api.refreshTokens, ['refresh-1']);
    expect(api.employeeTokens, ['access-1', 'access-2']);
    expect(container.read(authProvider), isA<SignedIn>());
  });

  testWidgets('a session that ends on the profile screen returns to login', (
    tester,
  ) async {
    final api = FakeGoodPeopleApi()
      ..employeeResults.add(_expiredToken)
      ..refreshResult = _expiredToken;
    final container = ProviderContainer.test(
      overrides: [goodPeopleApiProvider.overrideWithValue(api)],
    );
    await container
        .read(authProvider.notifier)
        .signIn(workspace: 'acme', email: 'a@acme.test', password: 'x');
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const GoodPeopleApp(),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(HomeScreen.myProfileKey));
    await tester.pumpAndSettle();

    expect(api.refreshTokens, ['refresh-1']);
    expect(find.byType(ProfileScreen), findsNothing);
    expect(find.byType(LoginScreen), findsOneWidget);
    expect(
      find.text('Your session has ended. Please sign in again.'),
      findsOneWidget,
    );
  });
}
