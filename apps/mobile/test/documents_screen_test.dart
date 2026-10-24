import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:good_people/api/api_exception.dart';
import 'package:good_people/api/api_models.dart';
import 'package:good_people/api/good_people_api.dart';
import 'package:good_people/app.dart';
import 'package:good_people/auth/auth_controller.dart';
import 'package:good_people/auth/login_screen.dart';
import 'package:good_people/documents/document_image_screen.dart';
import 'package:good_people/documents/documents_screen.dart';
import 'package:good_people/documents/file_opener.dart';
import 'package:good_people/home/home_screen.dart';
import 'package:good_people/leave/leave_providers.dart';
import 'package:good_people/settings/locale_controller.dart';

import 'support/fake_api.dart';

void main() {
  late FakeFileOpener opener;

  setUp(() => opener = FakeFileOpener());

  /// Signs in through the fake API with "today" fixed at [leaveToday] and
  /// [opener] as the phone's viewer, shows the app in [locale] and, if
  /// [open], opens My documents from the home screen. The screen is
  /// phone-width, so overflow fails the test.
  Future<ProviderContainer> pumpDocuments(
    WidgetTester tester,
    FakeGoodPeopleApi api, {
    Locale locale = const Locale('en'),
    bool open = true,
  }) async {
    tester.view.physicalSize = const Size(360, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);

    final container = ProviderContainer.test(
      overrides: [
        goodPeopleApiProvider.overrideWithValue(api),
        todayProvider.overrideWithValue(leaveToday),
        fileOpenerProvider.overrideWithValue(opener),
      ],
    );
    container.read(localeProvider.notifier).select(locale);
    await container
        .read(authProvider.notifier)
        .signIn(
          workspace: 'my-group',
          email: 'rahima@my-group.test',
          password: 'x',
        );
    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const GoodPeopleApp(),
      ),
    );
    await tester.pumpAndSettle();
    if (open) {
      await tester.tap(find.byKey(HomeScreen.documentsKey));
      await tester.pumpAndSettle();
    }
    return container;
  }

  Finder within(Key key, Finder finder) =>
      find.descendant(of: find.byKey(key), matching: finder);

  void expectIn(String id, List<String> texts) {
    for (final text in texts) {
      expect(
        within(DocumentsScreen.documentKey(id), find.text(text)),
        findsOneWidget,
        reason: '$id: $text',
      );
    }
  }

  Future<void> tapDocument(WidgetTester tester, String id) async {
    final finder = find.byKey(DocumentsScreen.documentKey(id));
    await tester.ensureVisible(finder);
    await tester.pumpAndSettle();
    await tester.tap(finder);
    await tester.pumpAndSettle();
  }

  testWidgets('a My documents card on home opens the documents', (
    tester,
  ) async {
    final api = FakeGoodPeopleApi();
    await pumpDocuments(tester, api, open: false);

    expect(
      within(HomeScreen.documentsKey, find.text('My documents')),
      findsOneWidget,
    );
    expect(
      within(
        HomeScreen.documentsKey,
        find.text('Letters, certificates and your service book'),
      ),
      findsOneWidget,
    );
    expect(api.documentsCalls, 0);

    await tester.tap(find.byKey(HomeScreen.documentsKey));
    await tester.pumpAndSettle();

    expect(find.byType(DocumentsScreen), findsOneWidget);
    expect(find.widgetWithText(AppBar, 'My documents'), findsOneWidget);
    expect(api.documentsCalls, 1);
    expect(find.byKey(DocumentsScreen.serviceBookKey), findsOneWidget);
  });

  testWidgets('each document shows its kind, dates and source; expiring and '
      'expired ones are marked', (tester) async {
    await pumpDocuments(tester, FakeGoodPeopleApi());

    expectIn(medicalCertificateId, [
      'Fitness certificate',
      'Medical certificate',
      'Issued Nov 30, 2025 · Expires Nov 30, 2026',
      'Uploaded by HR',
    ]);
    expect(
      within(
        DocumentsScreen.expiryKey(medicalCertificateId),
        find.text('Expires soon'),
      ),
      findsOneWidget,
    );

    expectIn(policeVerificationId, [
      'Police clearance',
      'Police verification',
      'Issued Sep 30, 2024 · Expires Sep 30, 2026',
    ]);
    expect(
      within(
        DocumentsScreen.expiryKey(policeVerificationId),
        find.text('Expired'),
      ),
      findsOneWidget,
    );

    // Years left: no mark.
    expectIn(passportId, [
      'My passport',
      'Passport',
      'Issued Jun 1, 2022 · Expires May 31, 2032',
    ]);
    expect(find.byKey(DocumentsScreen.expiryKey(passportId)), findsNothing);

    // No dates at all: no dates line.
    expectIn(nidScanId, ['NID card (front)', 'National ID card']);
    expect(
      within(
        DocumentsScreen.documentKey(nidScanId),
        find.textContaining('Issued'),
      ),
      findsNothing,
    );

    // A generated letter says so, with its reference number.
    expectIn(appointmentLetterId, [
      'Appointment letter',
      'Letter',
      'Issued Mar 1, 2020',
      'Letter from HR · Ref. MG/HR/2020/0005',
    ]);
    expect(
      find.byKey(DocumentsScreen.expiryKey(appointmentLetterId)),
      findsNothing,
    );
  });

  testWidgets('an image opens in the app, in a zoomable viewer', (
    tester,
  ) async {
    final api = FakeGoodPeopleApi();
    await pumpDocuments(tester, api);

    await tapDocument(tester, nidScanId);

    expect(api.downloadedIds, [nidScanId]);
    expect(find.byType(DocumentImageScreen), findsOneWidget);
    expect(find.widgetWithText(AppBar, 'NID card (front)'), findsOneWidget);
    final viewer = tester.widget<InteractiveViewer>(
      find.byKey(DocumentImageScreen.viewerKey),
    );
    expect(viewer.maxScale, greaterThan(1));
    final image = tester.widget<Image>(
      find.byKey(DocumentImageScreen.imageKey),
    );
    expect((image.image as MemoryImage).bytes, tinyPng);
    // Nothing went to another app.
    expect(opener.opened, isEmpty);

    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.byType(DocumentsScreen), findsOneWidget);
  });

  testWidgets('a PDF goes to the phone\'s viewer; failures say why', (
    tester,
  ) async {
    final api = FakeGoodPeopleApi();
    await pumpDocuments(tester, api);

    await tapDocument(tester, appointmentLetterId);

    expect(api.downloadedIds, [appointmentLetterId]);
    final opened = opener.opened.single;
    expect(opened.bytes, pdfBytes);
    expect(opened.fileName, 'appointment-letter.pdf');
    expect(opened.contentType, 'application/pdf');
    expect(find.byType(DocumentImageScreen), findsNothing);

    // No PDF reader on the phone.
    opener.error = const FileOpenFailed(FileOpenProblem.noApp);
    await tapDocument(tester, appointmentLetterId);
    expect(
      find.text(
        'No app on this phone can open this file. Install a PDF reader and '
        'try again.',
      ),
      findsOneWidget,
    );
    opener.error = null;

    // Unshared since the list loaded: say so and reload the list.
    api.downloadErrors.add(
      const ApiException(
        kind: ApiErrorKind.server,
        statusCode: 403,
        message: 'This document is not shared with you',
      ),
    );
    api.documents = [
      for (final json in myDocumentsJson())
        if (json['id'] != medicalCertificateId) json,
    ];
    await tapDocument(tester, medicalCertificateId);
    expect(
      find.text('This document is no longer shared with you.'),
      findsOneWidget,
    );
    expect(api.documentsCalls, 2);
    expect(
      find.byKey(DocumentsScreen.documentKey(medicalCertificateId)),
      findsNothing,
    );
    expect(opener.opened, hasLength(1));
  });

  testWidgets('the service book opens as a PDF in the app\'s language', (
    tester,
  ) async {
    final api = FakeGoodPeopleApi();
    final container = await pumpDocuments(tester, api);

    expect(
      within(DocumentsScreen.serviceBookKey, find.text('My service book')),
      findsOneWidget,
    );
    await tester.tap(find.byKey(DocumentsScreen.serviceBookOpenKey));
    await tester.pumpAndSettle();

    expect(api.serviceBookLanguages, [LetterLanguage.en]);
    expect(opener.opened.single.fileName, 'service-book-MG-0005-en.pdf');
    expect(opener.opened.single.contentType, 'application/pdf');
    expect(opener.opened.single.bytes, pdfBytes);

    // In Bangla the service book, and the list, are Bangla.
    container.read(localeProvider.notifier).select(const Locale('bn'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(AppBar, 'আমার কাগজপত্র'), findsOneWidget);
    expect(
      within(DocumentsScreen.serviceBookKey, find.text('আমার সার্ভিস বই')),
      findsOneWidget,
    );
    expect(
      within(
        DocumentsScreen.expiryKey(medicalCertificateId),
        find.text('শীঘ্রই মেয়াদ শেষ'),
      ),
      findsOneWidget,
    );
    expect(
      within(
        DocumentsScreen.expiryKey(policeVerificationId),
        find.text('মেয়াদোত্তীর্ণ'),
      ),
      findsOneWidget,
    );
    expectIn(nidScanId, ['জাতীয় পরিচয়পত্র']);
    expect(
      within(
        DocumentsScreen.documentKey(appointmentLetterId),
        find.text('এইচআরের চিঠি · স্মারক নং MG/HR/2020/0005'),
      ),
      findsOneWidget,
    );
    await tester.tap(find.byKey(DocumentsScreen.serviceBookOpenKey));
    await tester.pumpAndSettle();

    expect(api.serviceBookLanguages, [LetterLanguage.en, LetterLanguage.bn]);
    expect(opener.opened.last.fileName, 'service-book-MG-0005-bn.pdf');
  });

  testWidgets('nothing shared yet says so; the service book is still there', (
    tester,
  ) async {
    final api = FakeGoodPeopleApi()..documents = [];
    await pumpDocuments(tester, api);

    expect(
      find.text("HR hasn't shared any documents with you yet."),
      findsOneWidget,
    );
    expect(find.byKey(DocumentsScreen.serviceBookKey), findsOneWidget);
  });

  testWidgets('a login with no employee record sees an empty state', (
    tester,
  ) async {
    final api = FakeGoodPeopleApi()..documentsErrors.add(noEmployeeRecord);
    await pumpDocuments(tester, api);

    expect(find.text('No employee record'), findsOneWidget);
    expect(
      find.textContaining('Documents belong to an employee record'),
      findsOneWidget,
    );
    expect(find.byKey(DocumentsScreen.serviceBookKey), findsNothing);
  });

  testWidgets('signing out deletes the file last opened', (tester) async {
    final container = await pumpDocuments(tester, FakeGoodPeopleApi());
    await tapDocument(tester, appointmentLetterId);
    expect(opener.clears, 0);

    await container.read(authProvider.notifier).signOut();
    await tester.pumpAndSettle();

    expect(find.byType(LoginScreen), findsOneWidget);
    expect(opener.clears, 1);
  });

  test('saved file names lose path separators and are never empty', () {
    expect(safeFileName('appointment-letter.pdf'), 'appointment-letter.pdf');
    expect(safeFileName('../../etc/passwd'), 'document.._.._etc_passwd');
    expect(safeFileName(r'a\b:c.pdf'), 'a_b_c.pdf');
    expect(safeFileName('  '), 'document');
  });
}
