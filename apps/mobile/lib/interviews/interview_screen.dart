import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_exception.dart';
import '../api/api_models.dart';
import '../auth/auth_controller.dart';
import '../documents/file_opener.dart';
import '../l10n/app_localizations.dart';
import '../leave/leave_widgets.dart';
import '../ui/error_text.dart';
import '../ui/format.dart';
import '../ui/language_menu.dart';
import '../ui/load_error_view.dart';
import 'interview_providers.dart';
import 'interview_widgets.dart';
import 'link_opener.dart';

/// User-facing text for a scorecard refusal's `code`, or the general text
/// for an error from the API layer.
String scorecardErrorText(AppLocalizations l10n, Object error) =>
    switch (error is ApiException ? error.code : null) {
      'scorecard_criteria' => l10n.scorecardCriteriaChanged,
      'application_closed' => l10n.scorecardClosed,
      'interview_cancelled' => l10n.scorecardCancelled,
      _ => describeError(l10n, error),
    };

/// User-facing text for a CV that could not be downloaded or opened.
String cvErrorText(AppLocalizations l10n, Object error) => switch (error) {
  FileOpenFailed(problem: FileOpenProblem.noApp) => l10n.interviewCvNoApp,
  FileOpenFailed() => l10n.fileOpenFailed,
  ApiException(kind: ApiErrorKind.server, statusCode: 404) =>
    l10n.interviewCvGone,
  _ => describeError(l10n, error),
};

/// One of the login's interviews: the candidate, when and where, HR's
/// notes, the candidate's note and CV, the interviewer's scorecard and,
/// once that is in, the other interviewers' scorecards.
class InterviewScreen extends ConsumerWidget {
  const InterviewScreen({super.key, required this.interviewId});

  final String interviewId;

  static Route<void> route(String interviewId) => MaterialPageRoute(
    builder: (context) => InterviewScreen(interviewId: interviewId),
  );

  static const cvKey = ValueKey('interview-cv');
  static const joinKey = ValueKey('interview-join');
  static const othersHiddenKey = ValueKey('interview-others-hidden');
  static const othersKey = ValueKey('interview-others');
  static const panelKey = ValueKey('interview-panel');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final provider = myInterviewProvider(interviewId);
    final interview = ref.watch(provider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.interviewTitle),
        actions: const [LanguageMenuButton()],
      ),
      body: SafeArea(
        child: switch (interview) {
          AsyncData(:final value) => RefreshIndicator(
            onRefresh: () => awaitRefresh(ref.refresh(provider.future)),
            child: _InterviewBody(detail: value),
          ),
          // Taken off the panel, or the interview is gone.
          AsyncError(error: ApiException(statusCode: 404))
              when !interview.isLoading =>
            LeaveEmptyState(
              icon: Icons.event_busy_outlined,
              message: l10n.interviewGone,
            ),
          AsyncError(:final error)
              when !interview.isLoading && error is! SessionExpiredException =>
            LoadErrorView(
              title: l10n.interviewLoadFailed,
              error: error,
              onRetry: () => ref.invalidate(provider),
            ),
          _ => const Center(child: CircularProgressIndicator()),
        },
      ),
    );
  }
}

class _InterviewBody extends ConsumerStatefulWidget {
  const _InterviewBody({required this.detail});

  final MyInterviewDetail detail;

  @override
  ConsumerState<_InterviewBody> createState() => _InterviewBodyState();
}

class _InterviewBodyState extends ConsumerState<_InterviewBody> {
  bool _openingCv = false;

  void _show(String text) => ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(text)));

  Future<void> _openCv() async {
    final l10n = AppLocalizations.of(context);
    // Still usable if the screen closes before the download returns.
    final container = ProviderScope.containerOf(context, listen: false);
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _openingCv = true);
    try {
      final file = await container
          .read(authProvider.notifier)
          .downloadApplicationCv(widget.detail.applicationId);
      await container
          .read(fileOpenerProvider)
          .open(
            file.bytes,
            fileName: file.fileName ?? _cvFileName(file.contentType),
            contentType: file.contentType,
          );
    } on SessionExpiredException {
      // AuthGate is already showing the login screen.
    } on Object catch (error) {
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(cvErrorText(l10n, error))));
    } finally {
      if (mounted) setState(() => _openingCv = false);
    }
  }

  Future<void> _join(String url) async {
    final l10n = AppLocalizations.of(context);
    final uri = Uri.tryParse(url);
    final opened = uri != null && await ref.read(linkOpenerProvider).open(uri);
    if (!opened && mounted) _show(l10n.interviewLinkFailed);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final detail = widget.detail;
    final panel = detail.panel;

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      children: [
        Card.outlined(
          margin: EdgeInsets.zero,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 8,
              children: [
                Text(detail.candidateName, style: theme.textTheme.titleLarge),
                Text(
                  l10n.interviewForOpening(interviewOpeningTitle(l10n, detail)),
                  style: theme.textTheme.bodyMedium,
                ),
                InterviewPills(interview: detail),
                LeaveFact(
                  label: l10n.interviewWhen,
                  value: interviewWhenText(l10n, detail),
                ),
                if (detail.location case final location?
                    when location.isNotEmpty)
                  LeaveFact(
                    label: detail.kind == InterviewKind.phone
                        ? l10n.interviewPhoneNote
                        : l10n.interviewPlace,
                    value: location,
                  ),
                if (detail.meetingUrl case final url? when url.isNotEmpty) ...[
                  LeaveFact(label: l10n.interviewMeetingLink, value: url),
                  if (detail.status != InterviewStatus.cancelled)
                    Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: FilledButton.tonalIcon(
                        key: InterviewScreen.joinKey,
                        onPressed: () => _join(url),
                        icon: const Icon(Icons.videocam_outlined),
                        label: Text(l10n.interviewJoinCall),
                      ),
                    ),
                ],
                const Divider(height: 8),
                if (detail.hasCv)
                  Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: OutlinedButton.icon(
                      key: InterviewScreen.cvKey,
                      onPressed: _openingCv ? null : _openCv,
                      icon: _openingCv
                          ? const SizedBox.square(
                              dimension: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Icon(Icons.description_outlined),
                      label: Text(l10n.interviewOpenCv),
                    ),
                  )
                else
                  Text(
                    l10n.interviewNoCv,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
              ],
            ),
          ),
        ),
        if (detail.notes case final notes? when notes.isNotEmpty)
          _Section(
            title: l10n.interviewHrNotes,
            child: Text(notes, style: theme.textTheme.bodyMedium),
          ),
        if (detail.coverNote case final note? when note.isNotEmpty)
          _Section(
            title: l10n.interviewCoverNote,
            child: Text(note, style: theme.textTheme.bodyMedium),
          ),
        if (panel != null && panel.isNotEmpty)
          _Section(
            key: InterviewScreen.panelKey,
            title: l10n.interviewPanel,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 4,
              children: [
                for (final member in panel)
                  MergeSemantics(
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            localizedName(
                              l10n,
                              member.employee.fullName,
                              member.employee.fullNameBn,
                            ),
                            style: theme.textTheme.bodyMedium,
                          ),
                        ),
                        Text(
                          member.submitted
                              ? l10n.interviewScorecardIn
                              : l10n.interviewScorecardToDo,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        _Section(
          title: l10n.scorecardTitle,
          // A new form once a scorecard is in, seeded with it.
          child: ScorecardForm(
            key: ValueKey(detail.mine?.submittedAt),
            detail: detail,
          ),
        ),
        _Section(
          title: l10n.scorecardOthersTitle,
          child: switch (detail) {
            MyInterviewDetail(mine: null) => Text(
              l10n.scorecardOthersHidden,
              key: InterviewScreen.othersHiddenKey,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            MyInterviewDetail(others: []) => Text(
              l10n.scorecardOthersNone,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            MyInterviewDetail(:final others) => Column(
              key: InterviewScreen.othersKey,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 12,
              children: [
                for (final peer in others)
                  Card.outlined(
                    margin: EdgeInsets.zero,
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        spacing: 8,
                        children: [
                          Text(
                            localizedName(
                              l10n,
                              peer.employee.fullName,
                              peer.employee.fullNameBn,
                            ),
                            style: theme.textTheme.titleSmall,
                          ),
                          ScorecardSummary(scorecard: peer.scorecard),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          },
        ),
      ],
    );
  }
}

/// A CV's file name when the download did not say.
String _cvFileName(String contentType) =>
    contentType == 'application/pdf' ? 'cv.pdf' : 'cv.docx';

/// A titled part of the interview's page.
class _Section extends StatelessWidget {
  const _Section({super.key, required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 8,
        children: [
          Semantics(
            header: true,
            child: Text(title, style: theme.textTheme.titleMedium),
          ),
          child,
        ],
      ),
    );
  }
}

/// The interviewer's scorecard: a rating from 1 to 5 for each criterion, a
/// recommendation and notes. Read only once the interview is cancelled or
/// the application closed.
class ScorecardForm extends ConsumerStatefulWidget {
  const ScorecardForm({super.key, required this.detail});

  final MyInterviewDetail detail;

  static ValueKey<String> ratingKey(String criterion, int rating) =>
      ValueKey('scorecard-rating-$criterion-$rating');
  static ValueKey<String> ratingErrorKey(String criterion) =>
      ValueKey('scorecard-rating-error-$criterion');
  static ValueKey<String> recommendationKey(Recommendation recommendation) =>
      ValueKey('scorecard-recommendation-${recommendation.wire}');
  static const recommendationErrorKey = ValueKey(
    'scorecard-recommendation-error',
  );
  static const feedbackKey = ValueKey('scorecard-feedback');
  static const submitKey = ValueKey('scorecard-submit');

  @override
  ConsumerState<ScorecardForm> createState() => _ScorecardFormState();
}

class _ScorecardFormState extends ConsumerState<ScorecardForm> {
  late final Map<String, int> _ratings = {...?widget.detail.mine?.ratings};
  late Recommendation? _recommendation =
      switch (widget.detail.mine?.recommendation) {
        null || Recommendation.unknown => null,
        final Recommendation chosen => chosen,
      };
  late final _feedback = TextEditingController(
    text: widget.detail.mine?.feedback ?? '',
  );

  /// Shows what is missing, after a first try to submit.
  bool _checked = false;
  bool _busy = false;

  @override
  void dispose() {
    _feedback.dispose();
    super.dispose();
  }

  bool get _complete =>
      widget.detail.criteria.every(_ratings.containsKey) &&
      _recommendation != null;

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final detail = widget.detail;
    if (!_complete) {
      setState(() => _checked = true);
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(l10n.scorecardIncomplete)));
      return;
    }
    final provider = myInterviewProvider(detail.id);
    // Still usable once a new form replaces this one.
    final container = ProviderScope.containerOf(context, listen: false);
    final feedback = _feedback.text.trim();
    final draft = ScorecardDraft(
      // Only the opening's criteria as they are now.
      ratings: {for (final c in detail.criteria) c: _ratings[c]!},
      recommendation: _recommendation!,
      feedback: feedback.isEmpty ? null : feedback,
    );
    final first = detail.mine == null;
    setState(() => _busy = true);
    try {
      await container.read(provider.notifier).submit(draft);
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(
              first ? l10n.scorecardSubmitted : l10n.scorecardUpdated,
            ),
          ),
        );
    } on SessionExpiredException {
      // AuthGate is already showing the login screen.
    } on Object catch (error) {
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(content: Text(scorecardErrorText(l10n, error))),
        );
      // The criteria changed, the application closed or the interview was
      // cancelled since the page loaded: show it as it is now.
      if (error is ApiException && error.kind == ApiErrorKind.server) {
        container.invalidate(provider);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final detail = widget.detail;
    final error = theme.textTheme.bodySmall?.copyWith(color: scheme.error);
    final secondary = theme.textTheme.bodyMedium?.copyWith(
      color: scheme.onSurfaceVariant,
    );

    if (!detail.scorable) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 8,
        children: [
          Text(
            detail.status == InterviewStatus.cancelled
                ? l10n.scorecardCancelled
                : l10n.scorecardClosed,
            style: secondary,
          ),
          if (detail.mine case final mine?) ScorecardSummary(scorecard: mine),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 8,
      children: [
        Text(l10n.scorecardIntro, style: secondary),
        for (final criterion in detail.criteria) ...[
          const SizedBox(height: 4),
          Text(criterion, style: theme.textTheme.titleSmall),
          _RatingButtons(
            criterion: criterion,
            rating: _ratings[criterion],
            onChanged: _busy
                ? null
                : (rating) => setState(() => _ratings[criterion] = rating),
          ),
          if (_checked && !_ratings.containsKey(criterion))
            Text(
              l10n.scorecardRateThis,
              key: ScorecardForm.ratingErrorKey(criterion),
              style: error,
            ),
        ],
        const SizedBox(height: 8),
        Text(l10n.scorecardRecommendation, style: theme.textTheme.titleSmall),
        Wrap(
          spacing: 8,
          runSpacing: 4,
          children: [
            for (final choice in Recommendation.choices)
              ChoiceChip(
                key: ScorecardForm.recommendationKey(choice),
                label: Text(l10n.recommendationName(choice.wire)),
                selected: _recommendation == choice,
                onSelected: _busy
                    ? null
                    : (_) => setState(() => _recommendation = choice),
              ),
          ],
        ),
        if (_checked && _recommendation == null)
          Text(
            l10n.scorecardChooseRecommendation,
            key: ScorecardForm.recommendationErrorKey,
            style: error,
          ),
        const SizedBox(height: 8),
        TextField(
          key: ScorecardForm.feedbackKey,
          controller: _feedback,
          enabled: !_busy,
          minLines: 3,
          maxLines: 8,
          maxLength: 4000,
          textCapitalization: TextCapitalization.sentences,
          decoration: InputDecoration(
            labelText: l10n.scorecardFeedback,
            helperText: l10n.scorecardFeedbackHint,
            helperMaxLines: 3,
            border: const OutlineInputBorder(),
            alignLabelWithHint: true,
          ),
        ),
        Align(
          alignment: AlignmentDirectional.centerEnd,
          child: FilledButton(
            key: ScorecardForm.submitKey,
            onPressed: _busy ? null : _submit,
            child: Text(
              detail.mine == null ? l10n.scorecardSubmit : l10n.scorecardUpdate,
            ),
          ),
        ),
      ],
    );
  }
}

/// 1 to 5 for one criterion, in the UI language's digits.
class _RatingButtons extends StatelessWidget {
  const _RatingButtons({
    required this.criterion,
    required this.rating,
    required this.onChanged,
  });

  final String criterion;
  final int? rating;
  final ValueChanged<int>? onChanged;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return SegmentedButton<int>(
      emptySelectionAllowed: true,
      showSelectedIcon: false,
      segments: [
        for (var value = 1; value <= 5; value++)
          ButtonSegment(
            value: value,
            label: Semantics(
              label: l10n.scorecardRatingOption(value),
              excludeSemantics: true,
              child: Text(
                formatNumber(l10n, value),
                key: ScorecardForm.ratingKey(criterion, value),
              ),
            ),
          ),
      ],
      selected: {?rating},
      onSelectionChanged: onChanged == null
          ? null
          : (selected) {
              // Tapping the chosen rating again keeps it.
              if (selected.isNotEmpty) onChanged!(selected.single);
            },
    );
  }
}
