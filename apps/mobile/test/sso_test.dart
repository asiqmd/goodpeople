import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:good_people/api/api_models.dart';
import 'package:good_people/api/good_people_api.dart';
import 'package:good_people/api/token_store.dart';
import 'package:good_people/app.dart';
import 'package:good_people/auth/auth_controller.dart';
import 'package:good_people/auth/login_screen.dart';
import 'package:good_people/interviews/link_opener.dart';
import 'support/fake_api.dart';

void main(){
  test('SSO binds a system-browser flow to a private app verifier and stores only completed tokens',()async{
    final api=FakeGoodPeopleApi();
    final container=ProviderContainer.test(overrides:[goodPeopleApiProvider.overrideWithValue(api)]);
    final auth=container.read(authProvider.notifier);
    await auth.startSso(' Acme ');
    expect(api.ssoTenant,'acme');expect(api.ssoBinding,matches(RegExp(r'^[A-Za-z0-9_-]{43}$')));
    expect((await auth.finishSso()).pending,isTrue);
    expect(await container.read(tokenStoreProvider).read(),isNull);
    expect(base64UrlEncode(sha256.convert(utf8.encode(api.ssoVerifier!)).bytes).replaceAll('=',''),api.ssoBinding);
    expect(api.ssoVerifier,isNot(api.ssoBinding));
    api.ssoOutcome=LoginOutcome.fromJson(loginJson);
    expect((await auth.finishSso()).pending,isFalse);
    expect(container.read(authProvider),isA<SignedIn>());
    expect((await container.read(tokenStoreProvider).read())?.refreshToken,'refresh-1');
    await expectLater(auth.finishSso(),throwsFormatException);
  });
  test('cancelled SSO cannot complete and a new attempt uses another binding',()async{
    final api=FakeGoodPeopleApi();
    final container=ProviderContainer.test(overrides:[goodPeopleApiProvider.overrideWithValue(api)]);
    final auth=container.read(authProvider.notifier);
    await auth.startSso('acme');final binding=api.ssoBinding;
    auth.cancelSso();await expectLater(auth.finishSso(),throwsFormatException);
    await auth.startSso('acme');expect(api.ssoBinding,isNot(binding));
  });
  test('SSO second-step challenges never create a session prematurely',()async{
    final api=FakeGoodPeopleApi()..ssoOutcome=LoginOutcome.fromJson({'mfaRequired':true,'mfaToken':'fixture-second-step'});
    final container=ProviderContainer.test(overrides:[goodPeopleApiProvider.overrideWithValue(api)]);
    final auth=container.read(authProvider.notifier);
    await auth.startSso('acme');final result=await auth.finishSso();
    expect(result.challenge?.mfaToken,'fixture-second-step');expect(container.read(authProvider),isA<SignedOut>());
    expect(await container.read(tokenStoreProvider).read(),isNull);
  });
  testWidgets('organisation sign-in opens the system browser without asking for a password',(tester)async{
    tester.view.physicalSize=const Size(360,900);tester.view.devicePixelRatio=1;
    addTearDown(tester.view.resetPhysicalSize);addTearDown(tester.view.resetDevicePixelRatio);
    final api=FakeGoodPeopleApi(),opener=_Opener();
    await tester.pumpWidget(ProviderScope(overrides:[goodPeopleApiProvider.overrideWithValue(api),linkOpenerProvider.overrideWithValue(opener)],child:const GoodPeopleApp()));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(LoginScreen.methodKey(SignInMethod.sso)));await tester.pumpAndSettle();
    expect(find.byKey(LoginScreen.passwordFieldKey),findsNothing);
    await tester.enterText(find.byKey(LoginScreen.workspaceFieldKey),'acme');
    await tester.tap(find.byKey(LoginScreen.submitKey));await tester.pumpAndSettle();
    expect(opener.urls.single.scheme,'https');expect(api.ssoBinding,isNotNull);
    expect(tester.takeException(),isNull);
  });
}
class _Opener implements LinkOpener{
  final urls=<Uri>[];
  @override Future<bool> open(Uri uri)async{urls.add(uri);return true;}
}
