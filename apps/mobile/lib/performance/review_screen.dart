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

/// One of the login's reviews, as they may see it: the goals it rates, the
/// self review (a form while it is open, read only once submitted) and,
/// once released, the outcome, the manager's ratings and comments, the peer
/// feedback together and the acknowledgement. Someone else's review, such
/// as one a manager writes, is read and written on the web.
class ReviewScreen extends ConsumerWidget {
  const ReviewScreen({super.key, required this.reviewId});

  final String reviewId;

  static Route<void> route(String reviewId) =>
      MaterialPageRoute(builder: (context) => ReviewScreen(reviewId: reviewId));

  static const onWebKey = ValueKey('review-on-web');
  static const outcomeKey = ValueKey('review-outcome');
  static const selfKey = ValueKey('review-self');
  static const managerKey = ValueKey('review-manager');
  static const peersKey = ValueKey('review-peers');
  static const acknowledgementKey = ValueKey('review-acknowledgement');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final provider = reviewProvider(reviewId);
    final review = ref.watch(provider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.reviewTitle),
        actions: const [LanguageMenuButton()],
      ),
      body: SafeArea(
        child: switch (review) {
          AsyncData(:final value) => RefreshIndicator(
            onRefresh: () => awaitRefresh(ref.refresh(provider.future)),
            child: _ReviewBody(review: value),
          ),
          AsyncError(error: ApiException(statusCode: 404))
              when !review.isLoading =>
            LeaveEmptyState(
              icon: Icons.assignment_late_outlined,
              message: l10n.reviewGone,
            ),
          AsyncError(:final error)
              when !review.isLoading && error is! SessionExpiredException =>
            LoadErrorView(
              title: l10n.reviewLoadFailed,
              error: error,
              onRetry: () => ref.invalidate(provider),
            ),
          _ => const Center(child: CircularProgressIndicator()),
        },
      ),
    );
  }
}

class _ReviewBody extends StatelessWidget {
  const _ReviewBody({required this.review});

  final ReviewDetail review;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final mine = review.role == ReviewRole.person;
    final released = review.status.isReleased;
    final cycle = review.cycle;

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
                Text(
                  mine
                      ? l10n.reviewMine(cycle.name)
                      : '${personName(l10n, review.employee)} · ${cycle.name}',
                  style: theme.textTheme.titleLarge,
                ),
                Text(
                  formatDateRange(l10n, cycle.periodStart, cycle.periodEnd),
                  style: theme.textTheme.bodyMedium,
                ),
                Text(
                  switch (review.manager) {
                    final manager? => l10n.reviewManager(
                      personName(l10n, manager),
                    ),
                    null => l10n.reviewNoManager,
                  },
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
                ),
                Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: ReviewStatusPill(status: review.status),
                ),
              ],
            ),
          ),
        ),
        if (!mine) ...[
          const SizedBox(height: 16),
          NoticeCard(
            key: ReviewScreen.onWebKey,
            icon: Icons.computer_outlined,
            message: l10n.reviewOnWeb,
            background: scheme.surfaceContainerHighest,
            foreground: scheme.onSurfaceVariant,
          ),
        ] else ...[
          if (released)
            PerformanceSection(
              key: ReviewScreen.outcomeKey,
              title: l10n.reviewOutcome,
              child: Wrap(
                spacing: 32,
                runSpacing: 12,
                children: [
                  LeaveFact(
                    label: l10n.reviewFinalRating,
                    value: switch (review.finalRating) {
                      final rating? => ratingText(l10n, rating),
                      null => l10n.reviewNotRated,
                    },
                  ),
                  if (review.goalScore case final score?)
                    LeaveFact(
                      label: l10n.reviewGoalScore,
                      value: formatDecimal(l10n, score),
                    ),
                  if (review.releasedAt case final at?)
                    LeaveFact(
                      label: l10n.reviewReleasedOn,
                      value: formatPerformanceDay(l10n, at),
                    ),
                ],
              ),
            ),
          PerformanceSection(
            title: l10n.reviewGoalsTitle,
            child: review.goals.isEmpty
                ? MutedText(l10n.reviewNoGoals)
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    spacing: 12,
                    children: [
                      for (final goal in review.goals) _ReviewGoalTile(goal),
                    ],
                  ),
          ),
          PerformanceSection(
            key: ReviewScreen.selfKey,
            title: l10n.reviewSelfTitle,
            child: switch (review) {
              ReviewDetail(can: ReviewActions(writeSelf: true)) =>
                SelfReviewForm(review: review),
              ReviewDetail(self: ReviewPart(submittedAt: _?)) => Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                spacing: 12,
                children: [
                  if (!released) MutedText(l10n.reviewWithManager),
                  AnswersView(answers: review.self!.answers, review: review),
                ],
              ),
              _ when released => MutedText(l10n.reviewNoSelf),
              _ => MutedText(l10n.reviewManagerOnly),
            },
          ),
          if (released && review.managerReview != null)
            PerformanceSection(
              key: ReviewScreen.managerKey,
              title: l10n.reviewManagerTitle,
              child: AnswersView(
                answers: review.managerReview!.answers,
                review: review,
              ),
            ),
          if (review.peerSummary case final summary?)
            PerformanceSection(
              key: ReviewScreen.peersKey,
              title: l10n.peerFeedbackTitle,
              child: _PeerSummaryView(summary: summary),
            ),
          if (review.can.proposePeers) ...[
            const SizedBox(height: 16),
            MutedText(l10n.reviewNamePeersOnWeb),
          ],
          if (review.can.acknowledge)
            PerformanceSection(
              title: l10n.acknowledgeTitle,
              child: AcknowledgeForm(reviewId: review.id),
            ),
          if (review.acknowledgement case final acknowledgement?)
            PerformanceSection(
              key: ReviewScreen.acknowledgementKey,
              title: l10n.acknowledgeTitle,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                spacing: 4,
                children: [
                  Text(
                    '${acknowledgement.agrees == false ? l10n.acknowledgedDisagreeing : l10n.acknowledgedAgreeing} · '
                    '${formatPerformanceDay(l10n, acknowledgement.at)}',
                    style: theme.textTheme.bodyMedium,
                  ),
                  if (acknowledgement.comment case final comment?
                      when comment.isNotEmpty)
                    Text(
                      comment,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: scheme.onSurfaceVariant,
                      ),
                    ),
                ],
              ),
            ),
        ],
      ],
    );
  }
}

/// A goal the review rates: its title, weight, measure and progress.
class _ReviewGoalTile extends StatelessWidget {
  const _ReviewGoalTile(this.goal);

  final ReviewGoal goal;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final facts = [
      if (goal.weight case final weight?)
        l10n.goalWeight(formatPercent(l10n, num.tryParse(weight) ?? 0)),
      if (goal.kind == GoalKind.kpi && goal.target != null)
        l10n.goalMeasureShort(
          goal.currentValue == null
              ? '–'
              : formatDecimal(l10n, goal.currentValue!),
          formatDecimal(l10n, goal.target!),
          goal.measureUnit ?? '',
        ),
      if (goal.status == GoalStatus.completed)
        l10n.goalStatusName(GoalStatus.completed.wire),
    ].join(' · ');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 4,
      children: [
        Text(goal.title, style: theme.textTheme.titleSmall),
        if (goal.description case final description?
            when description.isNotEmpty)
          Text(description, style: theme.textTheme.bodyMedium),
        if (facts.isNotEmpty)
          Text(
            facts,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        GoalProgressBar(value: goal.progress),
      ],
    );
  }
}

/// Peer feedback as the person reads it: together, never who wrote what.
class _PeerSummaryView extends StatelessWidget {
  const _PeerSummaryView({required this.summary});

  final PeerSummary summary;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    if (!summary.shown) return MutedText(l10n.peerSummaryTooFew);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 8,
      children: [
        Text(
          l10n.peerSummaryAverage(switch (summary.averageRating) {
            final average? => formatNumber(l10n, average),
            null => '–',
          }),
          style: theme.textTheme.bodyMedium,
        ),
        for (final question in PeerQuestion.values) ...[
          Text(
            l10n.peerQuestion(question.wire),
            style: theme.textTheme.titleSmall,
          ),
          for (final answer in summary.answers[question] ?? const <String>[])
            Text('• $answer', style: theme.textTheme.bodyMedium),
        ],
        MutedText(l10n.peerSummaryTogether),
      ],
    );
  }
}

/// The person's own ratings and comments for each goal and competency, and
/// an overall comment: a draft until they submit it to their manager, after
/// a confirmation, when it can no longer change.
class SelfReviewForm extends ConsumerStatefulWidget {
  const SelfReviewForm({super.key, required this.review});

  final ReviewDetail review;

  static ValueKey<String> commentKey(String id) =>
      ValueKey('self-review-comment-$id');
  static const overallKey = ValueKey('self-review-overall');
  static const saveKey = ValueKey('self-review-save');
  static const submitKey = ValueKey('self-review-submit');
  static const confirmKey = ValueKey('self-review-confirm');

  @override
  ConsumerState<SelfReviewForm> createState() => _SelfReviewFormState();
}

/// One thing a review rates: a goal (by id) or a competency (by key).
typedef _Item = ({bool goal, String id, String label});

class _SelfReviewFormState extends ConsumerState<SelfReviewForm> {
  late final ReviewAnswers? _saved = widget.review.self?.answers;
  late final Map<String, int> _ratings = {
    for (final MapEntry(:key, :value) in {
      ...?_saved?.goals,
      ...?_saved?.competencies,
    }.entries)
      key: value.rating,
  };
  late final Map<String, TextEditingController> _comments = {
    for (final goal in widget.review.goals)
      goal.id: TextEditingController(
        text: _saved?.goals[goal.id]?.comment ?? '',
      ),
    for (final competency in widget.review.cycle.competencies)
      competency.key: TextEditingController(
        text: _saved?.competencies[competency.key]?.comment ?? '',
      ),
  };
  late final _overall = TextEditingController(text: _saved?.overall ?? '');

  /// What is missing, shown after a try to save or submit.
  Set<String> _missing = {};
  bool _busy = false;

  List<_Item> get _items {
    final language = languageOf(AppLocalizations.of(context));
    return [
      for (final goal in widget.review.goals)
        (goal: true, id: goal.id, label: goal.title),
      for (final competency in widget.review.cycle.competencies)
        (goal: false, id: competency.key, label: competency.nameIn(language)),
    ];
  }

  @override
  void dispose() {
    for (final controller in _comments.values) {
      controller.dispose();
    }
    _overall.dispose();
    super.dispose();
  }

  String? _comment(String id) => switch (_comments[id]!.text.trim()) {
    '' => null,
    final text => text,
  };

  /// Each rated item; a comment is kept only with its rating.
  ReviewAnswers _answers() {
    Map<String, ReviewAnswer> group(bool goals) => {
      for (final item in _items.where((i) => i.goal == goals))
        if (_ratings[item.id] case final rating?)
          item.id: ReviewAnswer(rating: rating, comment: _comment(item.id)),
    };
    final overall = _overall.text.trim();
    return ReviewAnswers(
      goals: group(true),
      competencies: group(false),
      overall: overall.isEmpty ? null : overall,
    );
  }

  Future<void> _save({required bool submit}) async {
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    // A submitted review rates everything; a draft keeps no comment without
    // its rating.
    final missing = {
      for (final item in _items)
        if (!_ratings.containsKey(item.id) &&
            (submit || _comment(item.id) != null))
          item.id,
    };
    setState(() => _missing = missing);
    if (missing.isNotEmpty) {
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(
              submit
                  ? l10n.selfReviewIncomplete
                  : l10n.selfReviewCommentUnrated,
            ),
          ),
        );
      return;
    }
    if (submit) {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(l10n.selfReviewConfirmTitle),
          content: Text(l10n.selfReviewConfirmBody),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: Text(MaterialLocalizations.of(context).cancelButtonLabel),
            ),
            FilledButton(
              key: SelfReviewForm.confirmKey,
              onPressed: () => Navigator.of(context).pop(true),
              child: Text(l10n.selfReviewSubmit),
            ),
          ],
        ),
      );
      if (confirmed != true || !mounted) return;
    }
    // Still usable once the read-only view replaces this form.
    final container = ProviderScope.containerOf(context, listen: false);
    final provider = reviewProvider(widget.review.id);
    setState(() => _busy = true);
    try {
      await container
          .read(provider.notifier)
          .saveSelf(SelfReviewDraft(answers: _answers(), submit: submit));
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(
              submit ? l10n.selfReviewSubmitted : l10n.selfReviewSaved,
            ),
          ),
        );
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
    final theme = Theme.of(context);
    final review = widget.review;
    final items = _items;

    Widget field(_Item item) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 8,
      children: [
        RatingChoice(
          id: item.id,
          label: item.label,
          rating: _ratings[item.id],
          onChanged: _busy
              ? null
              : (rating) => setState(() {
                  _ratings[item.id] = rating;
                  _missing = {..._missing}..remove(item.id);
                }),
          error: _missing.contains(item.id)
              ? l10n.performanceChooseRating
              : null,
        ),
        TextField(
          key: SelfReviewForm.commentKey(item.id),
          controller: _comments[item.id],
          enabled: !_busy,
          minLines: 1,
          maxLines: 5,
          maxLength: 2000,
          textCapitalization: TextCapitalization.sentences,
          decoration: InputDecoration(
            labelText: l10n.selfReviewComment,
            border: const OutlineInputBorder(),
          ),
        ),
      ],
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 12,
      children: [
        if (review.cycle.selfDueOn case final due?)
          Text(
            l10n.performanceDueBy(formatShortDate(l10n, due)),
            style: theme.textTheme.titleSmall,
          ),
        MutedText(l10n.selfReviewIntro),
        if (review.goals.isNotEmpty) ...[
          Text(l10n.selfReviewGoals, style: theme.textTheme.titleMedium),
          for (final item in items.where((i) => i.goal)) field(item),
        ],
        Text(l10n.selfReviewCompetencies, style: theme.textTheme.titleMedium),
        for (final item in items.where((i) => !i.goal)) field(item),
        TextField(
          key: SelfReviewForm.overallKey,
          controller: _overall,
          enabled: !_busy,
          minLines: 3,
          maxLines: 8,
          maxLength: 4000,
          textCapitalization: TextCapitalization.sentences,
          decoration: InputDecoration(
            labelText: l10n.selfReviewOverall,
            border: const OutlineInputBorder(),
            alignLabelWithHint: true,
          ),
        ),
        Wrap(
          alignment: WrapAlignment.end,
          spacing: 8,
          runSpacing: 8,
          children: [
            OutlinedButton(
              key: SelfReviewForm.saveKey,
              onPressed: _busy ? null : () => _save(submit: false),
              child: Text(l10n.selfReviewSaveDraft),
            ),
            FilledButton(
              key: SelfReviewForm.submitKey,
              onPressed: _busy ? null : () => _save(submit: true),
              child: Text(l10n.selfReviewSubmit),
            ),
          ],
        ),
      ],
    );
  }
}

/// The person has read their released review: whether they agree, and
/// their comments, kept on record with it once confirmed.
class AcknowledgeForm extends ConsumerStatefulWidget {
  const AcknowledgeForm({super.key, required this.reviewId});

  final String reviewId;

  static const agreeKey = ValueKey('acknowledge-agree');
  static const disagreeKey = ValueKey('acknowledge-disagree');
  static const commentKey = ValueKey('acknowledge-comment');
  static const submitKey = ValueKey('acknowledge-submit');
  static const confirmKey = ValueKey('acknowledge-confirm');

  @override
  ConsumerState<AcknowledgeForm> createState() => _AcknowledgeFormState();
}

class _AcknowledgeFormState extends ConsumerState<AcknowledgeForm> {
  bool _agrees = true;
  final _comment = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.acknowledgeConfirmTitle),
        content: Text(l10n.acknowledgeConfirmBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(MaterialLocalizations.of(context).cancelButtonLabel),
          ),
          FilledButton(
            key: AcknowledgeForm.confirmKey,
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(l10n.acknowledgeSubmit),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    // Still usable once the acknowledgement replaces this form.
    final container = ProviderScope.containerOf(context, listen: false);
    final provider = reviewProvider(widget.reviewId);
    final comment = _comment.text.trim();
    setState(() => _busy = true);
    try {
      await container
          .read(provider.notifier)
          .acknowledge(
            AcknowledgementDraft(
              agrees: _agrees,
              comment: comment.isEmpty ? null : comment,
            ),
          );
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(l10n.acknowledgeDone)));
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
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 8,
      children: [
        MutedText(l10n.acknowledgeIntro),
        Text(l10n.acknowledgeQuestion, style: theme.textTheme.titleSmall),
        RadioGroup<bool>(
          groupValue: _agrees,
          onChanged: (value) {
            if (!_busy && value != null) setState(() => _agrees = value);
          },
          child: Column(
            children: [
              RadioListTile<bool>(
                key: AcknowledgeForm.agreeKey,
                contentPadding: EdgeInsets.zero,
                value: true,
                title: Text(l10n.acknowledgeAgree),
              ),
              RadioListTile<bool>(
                key: AcknowledgeForm.disagreeKey,
                contentPadding: EdgeInsets.zero,
                value: false,
                title: Text(l10n.acknowledgeDisagree),
              ),
            ],
          ),
        ),
        TextField(
          key: AcknowledgeForm.commentKey,
          controller: _comment,
          enabled: !_busy,
          minLines: 2,
          maxLines: 6,
          maxLength: 2000,
          textCapitalization: TextCapitalization.sentences,
          decoration: InputDecoration(
            labelText: l10n.acknowledgeComment,
            helperText: l10n.acknowledgeCommentHint,
            border: const OutlineInputBorder(),
            alignLabelWithHint: true,
          ),
        ),
        Align(
          alignment: AlignmentDirectional.centerEnd,
          child: FilledButton(
            key: AcknowledgeForm.submitKey,
            onPressed: _busy ? null : _submit,
            child: Text(l10n.acknowledgeSubmit),
          ),
        ),
      ],
    );
  }
}
