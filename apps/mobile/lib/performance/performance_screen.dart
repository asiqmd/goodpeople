import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_models.dart';
import '../auth/auth_controller.dart';
import '../l10n/app_localizations.dart';
import '../leave/leave_widgets.dart';
import '../ui/format.dart';
import '../ui/language_menu.dart';
import '../ui/load_error_view.dart';
import 'goals_screen.dart';
import 'peer_request_screen.dart';
import 'peers_screen.dart';
import 'performance_providers.dart';
import 'performance_widgets.dart';
import 'review_screen.dart';
import 'team_goals_screen.dart';

/// What waits for the login, their goals in numbers and their reviews by
/// cycle. Each task opens its screen where the app has one; the rest (a
/// manager's reviews, calibration, probation reviews, cycles and plans)
/// is done on the web, and the task says so.
class PerformanceScreen extends ConsumerWidget {
  const PerformanceScreen({super.key});

  static Route<void> route() =>
      MaterialPageRoute(builder: (context) => const PerformanceScreen());

  static ValueKey<String> taskKey(PerformanceTask task) =>
      ValueKey('performance-task-${task.kind.wire}-${task.id}');
  static ValueKey<String> reviewKey(String reviewId) =>
      ValueKey('performance-review-$reviewId');
  static const goalsKey = ValueKey('performance-goals');
  static const teamGoalsKey = ValueKey('performance-team-goals');
  static const peersKey = ValueKey('performance-peers');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final me = ref.watch(performanceMeProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.performanceTitle),
        actions: const [LanguageMenuButton()],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () =>
              awaitRefresh(ref.refresh(performanceMeProvider.future)),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: switch (me) {
              AsyncData(:final value) => [_PerformanceBody(me: value)],
              AsyncError(:final error)
                  when !me.isLoading && error is! SessionExpiredException =>
                [
                  LoadErrorView(
                    title: l10n.performanceLoadFailed,
                    error: error,
                    onRetry: () => ref.invalidate(performanceMeProvider),
                  ),
                ],
              _ => [const LeaveLoading()],
            },
          ),
        ),
      ),
    );
  }
}

class _PerformanceBody extends StatelessWidget {
  const _PerformanceBody({required this.me});

  final PerformanceMe me;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final goals = me.goals;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Semantics(
          header: true,
          child: Text(
            l10n.performanceTasksTitle,
            style: theme.textTheme.titleMedium,
          ),
        ),
        const SizedBox(height: 8),
        if (me.items.isEmpty)
          MutedText(l10n.performanceNoTasks)
        else
          Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: 8,
            children: [
              for (final task in me.items)
                _TaskCard(key: PerformanceScreen.taskKey(task), task: task),
            ],
          ),
        PerformanceSection(
          title: l10n.myGoalsTitle,
          child: TappableCard(
            key: PerformanceScreen.goalsKey,
            onTap: () => Navigator.of(context).push(MyGoalsScreen.route()),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 8,
              children: [
                if (goals.total == 0)
                  Text(l10n.myGoalsNone, style: theme.textTheme.bodyMedium)
                else
                  Text(
                    l10n.myGoalsCounts(
                      goals.total,
                      formatNumber(l10n, goals.agreed),
                      formatNumber(l10n, goals.draft),
                      formatNumber(l10n, goals.completed),
                    ),
                    style: theme.textTheme.bodyMedium,
                  ),
                if (goals.progress case final progress?)
                  GoalProgressBar(value: progress),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        Card.outlined(
          margin: EdgeInsets.zero,
          clipBehavior: Clip.antiAlias,
          child: Column(
            children: [
              if (me.manager) ...[
                ListTile(
                  key: PerformanceScreen.teamGoalsKey,
                  leading: const Icon(Icons.fact_check_outlined),
                  title: Text(l10n.teamGoalsTitle),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () =>
                      Navigator.of(context).push(TeamGoalsScreen.route()),
                ),
                const Divider(height: 1),
              ],
              ListTile(
                key: PerformanceScreen.peersKey,
                leading: const Icon(Icons.forum_outlined),
                title: Text(l10n.peerFeedbackTitle),
                trailing: const Icon(Icons.chevron_right),
                onTap: () =>
                    Navigator.of(context).push(PeerFeedbackScreen.route()),
              ),
            ],
          ),
        ),
        PerformanceSection(
          title: l10n.myReviewsTitle,
          child: me.reviews.isEmpty
              ? MutedText(l10n.myReviewsNone)
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  spacing: 8,
                  children: [
                    for (final review in me.reviews)
                      _ReviewCard(
                        key: PerformanceScreen.reviewKey(review.id),
                        review: review,
                      ),
                  ],
                ),
        ),
        const SizedBox(height: 24),
        MutedText(l10n.performanceOnTheWeb),
      ],
    );
  }
}

/// A task's words, as the web lists them.
String taskText(AppLocalizations l10n, PerformanceTask task) {
  final person = switch (task.person) {
    final person? => personName(l10n, person),
    null => '',
  };
  final cycle = task.cycle ?? '';
  return switch (task.kind) {
    PerformanceTaskKind.selfReview => l10n.taskSelfReview(cycle),
    PerformanceTaskKind.acknowledge => l10n.taskAcknowledge(cycle),
    PerformanceTaskKind.peerAnswer => l10n.taskPeerAnswer(person, cycle),
    PerformanceTaskKind.peerApprove => l10n.taskPeerApprove(task.count, person),
    PerformanceTaskKind.goalsAgree => l10n.taskGoalsAgree(task.count, person),
    PerformanceTaskKind.managerReview when task.person == null =>
      l10n.taskNoManager(task.count, cycle),
    PerformanceTaskKind.managerReview => l10n.taskManagerReview(person, cycle),
    PerformanceTaskKind.probationReview => l10n.taskProbationReview(person),
    PerformanceTaskKind.unknown => l10n.taskOther,
  };
}

/// The screen a task opens, or `null` for one done on the web.
Route<void>? taskRoute(PerformanceTask task) => switch (task.kind) {
  PerformanceTaskKind.selfReview ||
  PerformanceTaskKind.acknowledge => ReviewScreen.route(task.id),
  PerformanceTaskKind.peerAnswer => PeerRequestScreen.route(task.id),
  PerformanceTaskKind.peerApprove => PeerFeedbackScreen.route(),
  PerformanceTaskKind.goalsAgree => TeamGoalsScreen.route(),
  PerformanceTaskKind.managerReview ||
  PerformanceTaskKind.probationReview ||
  PerformanceTaskKind.unknown => null,
};

class _TaskCard extends StatelessWidget {
  const _TaskCard({super.key, required this.task});

  final PerformanceTask task;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final route = taskRoute(task);
    final content = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 4,
      children: [
        Text(taskText(l10n, task), style: theme.textTheme.titleSmall),
        if (task.dueOn case final due?)
          Text(
            l10n.performanceDueBy(formatShortDate(l10n, due)),
            style: theme.textTheme.bodySmall,
          ),
        if (route == null)
          Text(
            l10n.performanceTaskOnWeb,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
      ],
    );
    if (route == null) {
      return Card.outlined(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: MergeSemantics(child: content),
        ),
      );
    }
    return TappableCard(
      onTap: () => Navigator.of(context).push(route),
      child: content,
    );
  }
}

/// One of the login's reviews: the cycle, its period, where it is and,
/// once released, the final rating in words.
class _ReviewCard extends StatelessWidget {
  const _ReviewCard({super.key, required this.review});

  final MyReviewItem review;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final cycle = review.cycle;
    return TappableCard(
      onTap: () => Navigator.of(context).push(ReviewScreen.route(review.id)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 4,
        children: [
          Text(cycle.name, style: theme.textTheme.titleMedium),
          Text(
            formatDateRange(l10n, cycle.periodStart, cycle.periodEnd),
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          if (review.finalRating case final rating?)
            Text(ratingText(l10n, rating), style: theme.textTheme.bodyMedium),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: ReviewStatusPill(status: review.status),
          ),
        ],
      ),
    );
  }
}
