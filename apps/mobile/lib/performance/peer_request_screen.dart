import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/api_models.dart';
import '../auth/auth_controller.dart';
import '../l10n/app_localizations.dart';
import '../leave/leave_widgets.dart';
import '../ui/format.dart';
import '../ui/language_menu.dart';
import '../ui/load_error_view.dart';
import '../ui/notice_card.dart';
import 'performance_providers.dart';
import 'performance_widgets.dart';

/// A request for the login's feedback on a colleague: the two questions and
/// a rating, given once. The form says that the person reads the answers
/// only together with other peers', never who wrote what.
class PeerRequestScreen extends ConsumerWidget {
  const PeerRequestScreen({super.key, required this.peerId});

  final String peerId;

  static Route<void> route(String peerId) => MaterialPageRoute(
    builder: (context) => PeerRequestScreen(peerId: peerId),
  );

  static const privacyKey = ValueKey('peer-privacy');
  static const answerKey = ValueKey('peer-answer');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final provider = peerRequestProvider(peerId);
    final request = ref.watch(provider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.peerFeedbackTitle),
        actions: const [LanguageMenuButton()],
      ),
      body: SafeArea(
        child: switch (request) {
          AsyncData(:final value) => RefreshIndicator(
            onRefresh: () => awaitRefresh(ref.refresh(provider.future)),
            child: _RequestBody(request: value),
          ),
          AsyncError(error: ApiException(statusCode: 404))
              when !request.isLoading =>
            LeaveEmptyState(
              icon: Icons.forum_outlined,
              message: l10n.peerRequestGone,
            ),
          AsyncError(:final error)
              when !request.isLoading && error is! SessionExpiredException =>
            LoadErrorView(
              title: l10n.peerRequestLoadFailed,
              error: error,
              onRetry: () => ref.invalidate(provider),
            ),
          _ => const Center(child: CircularProgressIndicator()),
        },
      ),
    );
  }
}

class _RequestBody extends StatelessWidget {
  const _RequestBody({required this.request});

  final PeerRequest request;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      children: [
        Text(
          l10n.peerFeedbackOn(personName(l10n, request.person)),
          style: theme.textTheme.titleLarge,
        ),
        const SizedBox(height: 4),
        Text(
          [
            request.cycle.name,
            if (request.dueOn case final due? when request.open)
              l10n.performanceDueBy(formatShortDate(l10n, due)),
          ].join(' · '),
          style: theme.textTheme.bodyMedium?.copyWith(
            color: scheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 16),
        NoticeCard(
          key: PeerRequestScreen.privacyKey,
          icon: Icons.lock_outline,
          message: l10n.peerAnswerPrivacy,
          background: scheme.secondaryContainer,
          foreground: scheme.onSecondaryContainer,
        ),
        const SizedBox(height: 16),
        if (request.open)
          PeerAnswerForm(request: request)
        else if (request.status == PeerStatus.submitted)
          Column(
            key: PeerRequestScreen.answerKey,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: 8,
            children: [
              Text(l10n.peerYourAnswer, style: theme.textTheme.titleMedium),
              for (final question in PeerQuestion.values) ...[
                Text(
                  l10n.peerQuestion(question.wire),
                  style: theme.textTheme.titleSmall,
                ),
                Text(
                  request.answers[question] ?? '',
                  style: theme.textTheme.bodyMedium,
                ),
              ],
              if (request.rating case final rating?)
                LeaveFact(
                  label: l10n.peerRating,
                  value: ratingText(l10n, rating),
                ),
            ],
          )
        else
          MutedText(l10n.peerRequestClosed),
      ],
    );
  }
}

/// A peer's two answers and rating, sent once after a confirmation.
class PeerAnswerForm extends ConsumerStatefulWidget {
  const PeerAnswerForm({super.key, required this.request});

  final PeerRequest request;

  static ValueKey<String> questionKey(PeerQuestion question) =>
      ValueKey('peer-question-${question.wire}');
  static const ratingId = 'peer';
  static const sendKey = ValueKey('peer-send');
  static const confirmKey = ValueKey('peer-confirm');

  @override
  ConsumerState<PeerAnswerForm> createState() => _PeerAnswerFormState();
}

class _PeerAnswerFormState extends ConsumerState<PeerAnswerForm> {
  final _answers = {
    for (final question in PeerQuestion.values)
      question: TextEditingController(),
  };
  final _formKey = GlobalKey<FormState>();
  int? _rating;

  /// After a first try to send, a missing rating shows.
  bool _checked = false;
  bool _busy = false;

  @override
  void dispose() {
    for (final controller in _answers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _send() async {
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final valid = _formKey.currentState?.validate() ?? false;
    setState(() => _checked = true);
    final rating = _rating;
    if (!valid || rating == null) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.peerConfirmTitle),
        content: Text(l10n.peerConfirmBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(MaterialLocalizations.of(context).cancelButtonLabel),
          ),
          FilledButton(
            key: PeerAnswerForm.confirmKey,
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(l10n.peerSend),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    // Still usable once the answer replaces this form.
    final container = ProviderScope.containerOf(context, listen: false);
    final provider = peerRequestProvider(widget.request.id);
    setState(() => _busy = true);
    try {
      await container
          .read(provider.notifier)
          .answer(
            PeerAnswerDraft(
              strengths: _answers[PeerQuestion.strengths]!.text.trim(),
              improvements: _answers[PeerQuestion.improvements]!.text.trim(),
              rating: rating,
            ),
          );
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(l10n.peerThanks)));
    } on SessionExpiredException {
      // AuthGate is already showing the login screen.
    } on Object catch (error) {
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(content: Text(performanceErrorText(l10n, error))),
        );
      if (isStale(error)) container.invalidate(provider);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 12,
        children: [
          for (final question in PeerQuestion.values)
            TextFormField(
              key: PeerAnswerForm.questionKey(question),
              controller: _answers[question],
              enabled: !_busy,
              minLines: 3,
              maxLines: 8,
              maxLength: 2000,
              textCapitalization: TextCapitalization.sentences,
              validator: (text) =>
                  (text ?? '').trim().isEmpty ? l10n.peerAnswerRequired : null,
              decoration: InputDecoration(
                labelText: l10n.peerQuestion(question.wire),
                border: const OutlineInputBorder(),
                alignLabelWithHint: true,
              ),
            ),
          RatingChoice(
            id: PeerAnswerForm.ratingId,
            label: l10n.peerRating,
            rating: _rating,
            onChanged: _busy
                ? null
                : (rating) => setState(() => _rating = rating),
            error: _checked && _rating == null
                ? l10n.performanceChooseRating
                : null,
          ),
          Align(
            alignment: AlignmentDirectional.centerEnd,
            child: FilledButton(
              key: PeerAnswerForm.sendKey,
              onPressed: _busy ? null : _send,
              child: Text(l10n.peerSend),
            ),
          ),
        ],
      ),
    );
  }
}
