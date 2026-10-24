import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/api_models.dart';
import '../auth/auth_controller.dart';
import '../l10n/app_localizations.dart';
import '../leave/leave_providers.dart';
import '../leave/leave_widgets.dart';
import '../ui/error_text.dart';
import '../ui/format.dart';
import '../ui/language_menu.dart';
import '../ui/load_error_view.dart';
import '../ui/theme.dart';
import 'document_image_screen.dart';
import 'documents_providers.dart';
import 'file_opener.dart';

/// The documents HR shared with the signed-in employee, and their service
/// book.
///
/// Tapping a document downloads it: photos and scans open in the app, PDFs
/// in the phone's own viewer. The service book is printed in the app's
/// language.
class DocumentsScreen extends ConsumerStatefulWidget {
  const DocumentsScreen({super.key});

  static const serviceBookKey = ValueKey('documents-service-book');
  static const serviceBookOpenKey = ValueKey('documents-service-book-open');

  static ValueKey<String> documentKey(String id) => ValueKey('document-$id');
  static ValueKey<String> expiryKey(String id) =>
      ValueKey('document-expiry-$id');

  static Route<void> route() =>
      MaterialPageRoute(builder: (context) => const DocumentsScreen());

  @override
  ConsumerState<DocumentsScreen> createState() => _DocumentsScreenState();
}

class _DocumentsScreenState extends ConsumerState<DocumentsScreen> {
  /// Documents whose download is running.
  final _opening = <String>{};
  bool _openingServiceBook = false;

  Future<void> _open(EmployeeDocument document) async {
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    // Still usable if the screen closes before the call returns.
    final container = ProviderScope.containerOf(context, listen: false);
    setState(() => _opening.add(document.id));
    try {
      final file = await container
          .read(authProvider.notifier)
          .downloadDocument(document.id);
      if (!mounted) return;
      // The response's type, unless it did not say.
      final contentType = file.contentType == 'application/octet-stream'
          ? document.contentType
          : file.contentType;
      if (contentType.startsWith('image/')) {
        navigator.push(
          DocumentImageScreen.route(title: document.title, bytes: file.bytes),
        );
      } else {
        await container
            .read(fileOpenerProvider)
            .open(
              file.bytes,
              fileName: document.fileName,
              contentType: contentType,
            );
      }
    } on SessionExpiredException {
      // AuthGate is already showing the login screen.
    } on Object catch (error) {
      // Only the latest failure matters when several taps fail.
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(documentErrorText(l10n, error))));
      // Unshared or removed since the list loaded: show the list as it is.
      if (error is ApiException &&
          (error.statusCode == 403 || error.statusCode == 404)) {
        container.invalidate(myDocumentsProvider);
      }
    } finally {
      if (mounted) setState(() => _opening.remove(document.id));
    }
  }

  Future<void> _openServiceBook() async {
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final container = ProviderScope.containerOf(context, listen: false);
    final language = l10n.localeName.startsWith('bn')
        ? LetterLanguage.bn
        : LetterLanguage.en;
    setState(() => _openingServiceBook = true);
    try {
      final file = await container
          .read(authProvider.notifier)
          .fetchMyServiceBook(language);
      await container
          .read(fileOpenerProvider)
          .open(
            file.bytes,
            fileName: file.fileName ?? 'service-book-${language.wire}.pdf',
            contentType: 'application/pdf',
          );
    } on SessionExpiredException {
      // AuthGate is already showing the login screen.
    } on Object catch (error) {
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(documentErrorText(l10n, error))));
    } finally {
      if (mounted) setState(() => _openingServiceBook = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final documents = ref.watch(myDocumentsProvider);
    final today = ref.watch(todayProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.documentsTitle),
        actions: const [LanguageMenuButton()],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () =>
              awaitRefresh(ref.refresh(myDocumentsProvider.future)),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: [
              switch (documents) {
                AsyncData(value: final List<EmployeeDocument> list) => Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  spacing: 12,
                  children: [
                    _ServiceBookCard(
                      busy: _openingServiceBook,
                      onOpen: _openServiceBook,
                    ),
                    if (list.isEmpty)
                      LeaveEmptyState(
                        icon: Icons.folder_open_outlined,
                        message: l10n.documentsEmpty,
                      ),
                    for (final document in list)
                      _DocumentCard(
                        key: DocumentsScreen.documentKey(document.id),
                        document: document,
                        expiry: document.expiryOn(today),
                        opening: _opening.contains(document.id),
                        onOpen: () => _open(document),
                      ),
                  ],
                ),
                AsyncData() => LeaveEmptyState(
                  icon: Icons.badge_outlined,
                  title: l10n.leaveNoEmployeeTitle,
                  message: l10n.documentsNoEmployeeBody,
                ),
                AsyncError(:final error)
                    when !documents.isLoading &&
                        error is! SessionExpiredException =>
                  LoadErrorView(
                    title: l10n.documentsLoadFailed,
                    error: error,
                    onRetry: () => ref.invalidate(myDocumentsProvider),
                  ),
                _ => const LeaveLoading(),
              },
            ],
          ),
        ),
      ),
    );
  }
}

/// User-facing text for a failed download or open.
String documentErrorText(AppLocalizations l10n, Object error) =>
    switch (error) {
      FileOpenFailed(problem: FileOpenProblem.noApp) => l10n.fileNoApp,
      FileOpenFailed() => l10n.fileOpenFailed,
      ApiException(kind: ApiErrorKind.server, statusCode: 403) =>
        l10n.documentErrorNotShared,
      ApiException(kind: ApiErrorKind.server, statusCode: 404) =>
        l10n.documentErrorGone,
      _ => describeError(l10n, error),
    };

/// The service book, a PDF in the app's language.
class _ServiceBookCard extends StatelessWidget {
  const _ServiceBookCard({required this.busy, required this.onOpen});

  final bool busy;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Card.filled(
      key: DocumentsScreen.serviceBookKey,
      margin: EdgeInsets.zero,
      color: scheme.secondaryContainer,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: 8,
          children: [
            Row(
              children: [
                Icon(
                  Icons.menu_book_outlined,
                  color: scheme.onSecondaryContainer,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    l10n.serviceBookTitle,
                    style: theme.textTheme.titleMedium?.copyWith(
                      color: scheme.onSecondaryContainer,
                    ),
                  ),
                ),
              ],
            ),
            Text(
              l10n.serviceBookBody,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: scheme.onSecondaryContainer,
              ),
            ),
            Align(
              alignment: AlignmentDirectional.centerEnd,
              child: FilledButton.icon(
                key: DocumentsScreen.serviceBookOpenKey,
                onPressed: busy ? null : onOpen,
                icon: busy
                    ? const SizedBox.square(
                        dimension: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.picture_as_pdf_outlined),
                label: Text(l10n.serviceBookOpen),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// One document: title, kind, dates, an expiry mark, and where it came
/// from. Tapping it opens it.
class _DocumentCard extends StatelessWidget {
  const _DocumentCard({
    super.key,
    required this.document,
    required this.expiry,
    required this.opening,
    required this.onOpen,
  });

  final EmployeeDocument document;
  final DocumentExpiry expiry;
  final bool opening;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final warning = StatusColors.of(context);
    final secondary = theme.textTheme.bodySmall?.copyWith(
      color: scheme.onSurfaceVariant,
    );
    final dates = [
      if (document.issuedOn case final issued?)
        l10n.documentIssuedOn(formatShortDate(l10n, issued)),
      if (document.expiresOn case final expires?)
        l10n.documentExpiresOn(formatShortDate(l10n, expires)),
    ].join(' · ');
    final source = switch (document.source) {
      DocumentSource.generated => [
        l10n.documentSourceLetter,
        if (document.refNo case final refNo? when refNo.isNotEmpty)
          l10n.documentRefNo(refNo),
      ].join(' · '),
      DocumentSource.upload ||
      DocumentSource.unknown => l10n.documentSourceUpload,
    };
    final badge = switch (expiry) {
      DocumentExpiry.expired => LeavePill(
        key: DocumentsScreen.expiryKey(document.id),
        label: l10n.documentExpired,
        background: scheme.errorContainer,
        foreground: scheme.onErrorContainer,
      ),
      DocumentExpiry.soon => LeavePill(
        key: DocumentsScreen.expiryKey(document.id),
        label: l10n.documentExpiresSoon,
        background: warning.warningContainer,
        foreground: warning.onWarningContainer,
      ),
      DocumentExpiry.none => null,
    };

    return Card.outlined(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: Semantics(
        button: true,
        child: InkWell(
          onTap: opening ? null : onOpen,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  document.isImage
                      ? Icons.image_outlined
                      : document.contentType == 'application/pdf'
                      ? Icons.picture_as_pdf_outlined
                      : Icons.description_outlined,
                  color: scheme.primary,
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    spacing: 2,
                    children: [
                      Text(document.title, style: theme.textTheme.titleMedium),
                      Text(
                        l10n.documentCategoryName(document.category.wire),
                        style: theme.textTheme.bodyMedium,
                      ),
                      if (dates.isNotEmpty) Text(dates, style: secondary),
                      Text(source, style: secondary),
                      if (badge != null) ...[const SizedBox(height: 4), badge],
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                if (opening)
                  const SizedBox.square(
                    dimension: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                else
                  Icon(Icons.chevron_right, color: scheme.onSurfaceVariant),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
