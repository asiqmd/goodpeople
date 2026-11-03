import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../api/api_exception.dart';
import '../api/api_models.dart';
import '../auth/auth_controller.dart';
import '../documents/file_opener.dart';
import '../l10n/app_localizations.dart';
import '../ui/format.dart';
import '../ui/language_menu.dart';
import '../ui/load_error_view.dart';
import '../ui/error_text.dart';

final learningMeProvider = FutureProvider.autoDispose<LearningMe>((ref) {
  if (ref.watch(authProvider) is! SignedIn) {
    throw const SessionExpiredException();
  }
  return ref.read(authProvider.notifier).fetchLearningMe();
}, retry: (count, error) => null);

class LearningScreen extends ConsumerStatefulWidget {
  const LearningScreen({super.key});
  static Route<void> route() =>
      MaterialPageRoute(builder: (_) => const LearningScreen());
  @override
  ConsumerState<LearningScreen> createState() => _LearningScreenState();
}

class _LearningScreenState extends ConsumerState<LearningScreen> {
  final _busy = <String>{};
  Future<void> _move(String id, bool enrol) async {
    setState(() => _busy.add(id));
    try {
      await ref
          .read(authProvider.notifier)
          .moveLearningEnrolment(id, enrol: enrol);
      ref.invalidate(learningMeProvider);
    } on SessionExpiredException {
      /* AuthGate handles the ended session. */
    } on Object catch (error) {
      if (mounted) _error(error);
    } finally {
      if (mounted) setState(() => _busy.remove(id));
    }
  }

  void _error(Object error) {
    final l = AppLocalizations.of(context);
    final message = switch (error) {
      ApiException(code: 'learning_capacity') => l.learningFull,
      ApiException(code: 'learning_started') => l.learningStarted,
      ApiException(code: 'learning_session_fixed') => l.learningFixed,
      _ => describeError(l, error),
    };
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  Future<void> _download(LearningCertificate c) async {
    final l = AppLocalizations.of(context);
    setState(() => _busy.add(c.id));
    try {
      final file = await ref
          .read(authProvider.notifier)
          .downloadLearningCertificate(
            c.id,
            language: l.localeName.startsWith('bn')
                ? LetterLanguage.bn
                : LetterLanguage.en,
          );
      if (!mounted) return;
      await ref
          .read(fileOpenerProvider)
          .open(
            file.bytes,
            fileName: file.fileName ?? 'training-${c.id}.pdf',
            contentType: file.contentType,
          );
    } on SessionExpiredException {
      /* AuthGate handles the ended session. */
    } on Object catch (error) {
      if (mounted) _error(error);
    } finally {
      if (mounted) setState(() => _busy.remove(c.id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final bn = l.localeName.startsWith('bn');
    final state = ref.watch(learningMeProvider);
    final writable =
        ref.watch(tenantAccessProvider).value?.access.accessState ==
        AccessState.full;
    String status(String s) => switch (s) {
      'current' => l.learningCurrent,
      'due' => l.learningDue,
      'overdue' => l.learningOverdue,
      'enrolled' => l.learningEnrolled,
      'cancelled' => l.learningWithdrawn,
      'attended' => l.learningAttended,
      'absent' => l.learningAbsent,
      _ => l.learningUnknown,
    };
    Widget heading(String text) => Padding(
      padding: const EdgeInsets.only(top: 20, bottom: 8),
      child: Text(text, style: Theme.of(context).textTheme.titleMedium),
    );
    return Scaffold(
      appBar: AppBar(
        title: Text(l.learningTitle),
        actions: const [LanguageMenuButton()],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () =>
              ref.refresh(learningMeProvider.future).then<void>((_) {}),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: switch (state) {
              AsyncData(:final value) => [
                if (value.manage) Text(l.learningManageOnWeb),
                heading(l.learningRequirements),
                if (value.requirements.isEmpty)
                  Text(l.learningNoneRequirements),
                ...value.requirements.map(
                  (r) => Card(
                    child: ListTile(
                      title: Text(bn ? r.courseNameBn : r.courseName),
                      subtitle: Text(
                        '${status(r.state)} · ${formatDate(l, r.dueOn)}',
                      ),
                    ),
                  ),
                ),
                heading(l.learningSessions),
                if (value.sessions.isEmpty) Text(l.learningNoneSessions),
                ...value.sessions.map((s) {
                  final at = s.startsAt.toUtc().add(const Duration(hours: 6));
                  return Card(
                    key: ValueKey('learning-session-${s.id}'),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            bn ? s.courseNameBn : s.courseName,
                            style: Theme.of(context).textTheme.titleSmall,
                          ),
                          Text(
                            '${formatShortDate(l, at)} · ${DateFormat.jm(l.localeName).format(at)} · ${s.venue}',
                          ),
                          if (s.myStatus != null) Text(status(s.myStatus!)),
                          if (s.canEnrol)
                            FilledButton(
                              onPressed: writable && !_busy.contains(s.id)
                                  ? () => _move(s.id, true)
                                  : null,
                              child: Text(l.learningEnrol),
                            ),
                          if (s.canWithdraw)
                            OutlinedButton(
                              onPressed: writable && !_busy.contains(s.id)
                                  ? () => _move(s.id, false)
                                  : null,
                              child: Text(l.learningWithdraw),
                            ),
                        ],
                      ),
                    ),
                  );
                }),
                heading(l.learningCertificates),
                if (value.certificates.isEmpty)
                  Text(l.learningNoneCertificates),
                ...value.certificates.map(
                  (c) => Card(
                    key: ValueKey('learning-certificate-${c.id}'),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            bn ? c.courseNameBn : c.courseName,
                            style: Theme.of(context).textTheme.titleSmall,
                          ),
                          Text(formatDate(l, c.completedOn)),
                          Text(
                            c.revokedAt != null
                                ? l.learningRevoked
                                : c.expiresOn == null
                                ? l.learningNoExpiry
                                : '${l.learningExpires}: ${formatDate(l, c.expiresOn!)}',
                          ),
                          OutlinedButton(
                            onPressed: _busy.contains(c.id)
                                ? null
                                : () => _download(c),
                            child: Text(l.learningDownload),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
              AsyncError(:final error) => [
                LoadErrorView(
                  title: l.learningLoadFailed,
                  error: error,
                  onRetry: () => ref.invalidate(learningMeProvider),
                ),
              ],
              _ => [const Center(child: CircularProgressIndicator())],
            },
          ),
        ),
      ),
    );
  }
}
