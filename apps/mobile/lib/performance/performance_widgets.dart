import 'package:flutter/material.dart';

import '../api/api_exception.dart';
import '../api/api_models.dart';
import '../l10n/app_localizations.dart';
import '../leave/leave_widgets.dart';
import '../ui/error_text.dart';
import '../ui/format.dart';
import '../ui/theme.dart';

/// Reviews and check-ins are dated in Bangladesh time, as on the web.
const performanceTimeZone = 'Asia/Dhaka';

/// `bn` or `en`, for competency names.
String languageOf(AppLocalizations l10n) =>
    l10n.localeName.startsWith('bn') ? 'bn' : 'en';

String personName(AppLocalizations l10n, EmployeeRef person) =>
    localizedName(l10n, person.fullName, person.fullNameBn);

/// A rating with its words, never the number alone: `3 · Meets
/// expectations`.
String ratingText(AppLocalizations l10n, int rating) =>
    '${formatNumber(l10n, rating)} · ${l10n.ratingName('$rating')}';

/// A percent in the UI language's digits: `40%` or `৪০%`.
String formatPercent(AppLocalizations l10n, num value) =>
    l10n.performancePercent(formatNumber(l10n, value));

/// One of the API's decimals, such as `40.00`, as `40`.
String formatDecimal(AppLocalizations l10n, String value) =>
    formatNumber(l10n, num.tryParse(value) ?? 0);

/// The day an instant falls on in Bangladesh, such as `Oct 29, 2026`.
String formatPerformanceDay(AppLocalizations l10n, DateTime instant) =>
    formatShortDate(l10n, wallClock(instant, performanceTimeZone));

/// Typed digits, Bangla ones included, as ASCII.
String asciiDigits(String text) => text.trim().replaceAllMapped(
  RegExp('[০-৯]'),
  (m) => '${'০১২৩৪৫৬৭৮৯'.indexOf(m[0]!)}',
);

/// User-facing text for a performance refusal's `code`, or the general text
/// for an error from the API layer.
String performanceErrorText(AppLocalizations l10n, Object error) =>
    switch (error is ApiException ? error.code : null) {
      'goal_checkin_empty' => l10n.goalCheckinEmpty,
      'goal_closed' => l10n.goalErrorClosed,
      'goal_cycle_closed' => l10n.goalErrorCycleClosed,
      'goal_not_draft' => l10n.goalErrorNotDraft,
      'goal_weight_required' => l10n.goalErrorWeightRequired,
      'goal_weights_over' => l10n.goalErrorWeightsOver,
      'goal_weights_total' => l10n.goalErrorWeightsTotal,
      'no_draft_goals' => l10n.goalErrorNoDrafts,
      'ratings_missing' => l10n.selfReviewIncomplete,
      'review_step_closed' => l10n.reviewErrorStepClosed,
      'already_acknowledged' => l10n.acknowledgeErrorAlready,
      'review_not_released' => l10n.acknowledgeErrorNotReleased,
      'peer_answered' => l10n.peerErrorAnswered,
      'peer_step_closed' => l10n.peerErrorClosed,
      'peer_decided' => l10n.peerErrorDecided,
      _ => describeError(l10n, error),
    };

/// A refusal that means the screen shows something out of date: reload it.
bool isStale(Object error) =>
    error is ApiException &&
    error.kind == ApiErrorKind.server &&
    error.statusCode == 409;

/// A titled part of a performance screen.
class PerformanceSection extends StatelessWidget {
  const PerformanceSection({
    super.key,
    required this.title,
    required this.child,
  });

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

/// Muted text, for empty states and hints within a section.
class MutedText extends StatelessWidget {
  const MutedText(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Text(
      text,
      style: theme.textTheme.bodyMedium?.copyWith(
        color: theme.colorScheme.onSurfaceVariant,
      ),
    );
  }
}

/// A card that opens something, with a chevron.
class TappableCard extends StatelessWidget {
  const TappableCard({super.key, required this.onTap, required this.child});

  final VoidCallback onTap;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Card.outlined(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: Semantics(
        button: true,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(child: child),
                const SizedBox(width: 8),
                Icon(Icons.chevron_right, color: scheme.onSurfaceVariant),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Progress from 0 to 100 as a bar with the number beside it, so it never
/// rests on colour alone.
class GoalProgressBar extends StatelessWidget {
  const GoalProgressBar({super.key, required this.value});

  final int value;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final percent = formatPercent(l10n, value);
    return Semantics(
      label: l10n.goalProgressLabel,
      value: percent,
      excludeSemantics: true,
      child: Row(
        children: [
          Expanded(
            child: LinearProgressIndicator(
              value: value.clamp(0, 100) / 100,
              minHeight: 8,
              borderRadius: BorderRadius.circular(4),
            ),
          ),
          const SizedBox(width: 12),
          Text(percent, style: theme.textTheme.labelLarge),
        ],
      ),
    );
  }
}

/// A goal's status as a coloured label.
class GoalStatusPill extends StatelessWidget {
  const GoalStatusPill({super.key, required this.status});

  final GoalStatus status;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    final warning = StatusColors.of(context);
    final (background, foreground) = switch (status) {
      GoalStatus.draft => (
        warning.warningContainer,
        warning.onWarningContainer,
      ),
      GoalStatus.agreed => (
        scheme.secondaryContainer,
        scheme.onSecondaryContainer,
      ),
      GoalStatus.completed => (
        scheme.primaryContainer,
        scheme.onPrimaryContainer,
      ),
      GoalStatus.dropped || GoalStatus.unknown => (
        scheme.surfaceContainerHighest,
        scheme.onSurfaceVariant,
      ),
    };
    return LeavePill(
      label: l10n.goalStatusName(status.wire),
      background: background,
      foreground: foreground,
    );
  }
}

/// Where a review is, as a coloured label.
class ReviewStatusPill extends StatelessWidget {
  const ReviewStatusPill({super.key, required this.status});

  final ReviewStatus status;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    final warning = StatusColors.of(context);
    final (background, foreground) = switch (status) {
      ReviewStatus.self => (
        scheme.secondaryContainer,
        scheme.onSecondaryContainer,
      ),
      ReviewStatus.manager || ReviewStatus.calibration => (
        warning.warningContainer,
        warning.onWarningContainer,
      ),
      ReviewStatus.released => (
        scheme.primaryContainer,
        scheme.onPrimaryContainer,
      ),
      ReviewStatus.acknowledged || ReviewStatus.unknown => (
        scheme.surfaceContainerHighest,
        scheme.onSurfaceVariant,
      ),
    };
    return LeavePill(
      label: l10n.reviewStatusName(status.wire),
      background: background,
      foreground: foreground,
    );
  }
}

/// A choice of 1 to 5, each with its words, so a rating never rests on a
/// number alone.
class RatingChoice extends StatelessWidget {
  const RatingChoice({
    super.key,
    required this.id,
    required this.label,
    required this.rating,
    required this.onChanged,
    this.error,
  });

  /// Names the chips' keys, [ratingKey].
  final String id;
  final String label;
  final int? rating;

  /// `null` while the form is busy.
  final ValueChanged<int>? onChanged;

  /// Shown under the choices, such as that a rating is missing.
  final String? error;

  static ValueKey<String> ratingKey(String id, int rating) =>
      ValueKey('rating-$id-$rating');
  static ValueKey<String> errorKey(String id) => ValueKey('rating-error-$id');

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 4,
      children: [
        Text(label, style: theme.textTheme.titleSmall),
        Wrap(
          spacing: 8,
          runSpacing: 4,
          children: [
            for (var value = 1; value <= 5; value++)
              ChoiceChip(
                key: ratingKey(id, value),
                label: Text(ratingText(l10n, value)),
                selected: rating == value,
                onSelected: onChanged == null ? null : (_) => onChanged!(value),
              ),
          ],
        ),
        if (error case final error?)
          Text(
            error,
            key: errorKey(id),
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.error,
            ),
          ),
      ],
    );
  }
}

/// A rating given, in words, and its comment.
class AnswerView extends StatelessWidget {
  const AnswerView({super.key, required this.label, required this.answer});

  final String label;
  final ReviewAnswer? answer;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final answer = this.answer;
    return MergeSemantics(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 2,
        children: [
          Text(label, style: theme.textTheme.titleSmall),
          if (answer == null)
            MutedText(l10n.reviewNotRated)
          else ...[
            Text(
              ratingText(l10n, answer.rating),
              style: theme.textTheme.bodyMedium,
            ),
            if (answer.comment case final comment? when comment.isNotEmpty)
              Text(
                comment,
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
          ],
        ],
      ),
    );
  }
}

/// One part of a review read back: each goal's and competency's rating and
/// comment, and the overall comment.
class AnswersView extends StatelessWidget {
  const AnswersView({super.key, required this.answers, required this.review});

  final ReviewAnswers? answers;
  final ReviewDetail review;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final answers = this.answers;
    if (answers == null) return MutedText(l10n.reviewNothingWritten);
    final language = languageOf(l10n);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 12,
      children: [
        for (final goal in review.goals)
          AnswerView(label: goal.title, answer: answers.goals[goal.id]),
        for (final competency in review.cycle.competencies)
          AnswerView(
            label: competency.nameIn(language),
            answer: answers.competencies[competency.key],
          ),
        if (answers.overall case final overall? when overall.isNotEmpty)
          MergeSemantics(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 2,
              children: [
                Text(l10n.reviewOverall, style: theme.textTheme.titleSmall),
                Text(overall, style: theme.textTheme.bodyMedium),
              ],
            ),
          ),
      ],
    );
  }
}

/// A goal's kind, weight and due date: `KPI · weight 40% · due Dec 31,
/// 2026`.
String goalFactsText(AppLocalizations l10n, GoalView goal) => [
  l10n.goalKindName(goal.kind.wire),
  if (goal.weight case final weight?)
    l10n.goalWeight(formatPercent(l10n, num.tryParse(weight) ?? 0)),
  if (goal.dueOn case final due?) l10n.goalDue(formatShortDate(l10n, due)),
].join(' · ');

/// A goal's measure: the key results done, or the value against the
/// target; `null` for an objective without key results.
String? goalMeasureText(AppLocalizations l10n, GoalView goal) {
  if (goal.kind != GoalKind.kpi) {
    if (goal.keyResults.isEmpty) return null;
    return l10n.goalKeyResultsDone(
      formatNumber(l10n, goal.keyResults.where((k) => k.done).length),
      formatNumber(l10n, goal.keyResults.length),
    );
  }
  final target = formatDecimal(l10n, goal.target ?? '0');
  final unit = goal.measureUnit ?? '';
  final measure = switch (goal.currentValue) {
    final value? => l10n.goalMeasure(formatDecimal(l10n, value), target, unit),
    null => l10n.goalMeasureNone(target, unit),
  };
  return switch (goal.direction) {
    final direction? when direction != KpiDirection.unknown =>
      '$measure · ${l10n.goalDirectionName(direction.wire)}',
    _ => measure,
  };
}

/// How a KPI from the records got its value, in words.
String kpiReadingText(AppLocalizations l10n, KpiReading reading) {
  final from = formatShortDate(l10n, reading.from);
  final to = formatShortDate(l10n, reading.to);
  final people = reading.people > 1
      ? l10n.goalReadingPeople(formatNumber(l10n, reading.people))
      : '';
  return switch (reading) {
    AttendanceReading(workingDays: 0) => l10n.goalReadingNoAttendance(from, to),
    AttendanceReading(:final presentDays, :final workingDays) =>
      l10n.goalReadingAttendance(
        formatNumber(l10n, presentDays),
        formatNumber(l10n, workingDays),
        people,
        from,
        to,
      ),
    ProductionReading(target: 0) => l10n.goalReadingNoProduction(from, to),
    ProductionReading(:final pieces, :final target) =>
      l10n.goalReadingProduction(
        formatNumber(l10n, pieces),
        formatNumber(l10n, target),
        people,
        from,
        to,
      ),
  };
}

/// One goal in a list: its title, kind, weight and due date, its measure,
/// progress and status. Opens the goal.
class GoalCard extends StatelessWidget {
  const GoalCard({
    super.key,
    required this.goal,
    required this.onTap,
    this.action,
  });

  final GoalView goal;
  final VoidCallback onTap;

  /// Under the card's facts, such as an Agree button.
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final measure = goalMeasureText(l10n, goal);
    return TappableCard(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 4,
        children: [
          Text(goal.title, style: theme.textTheme.titleMedium),
          Text(goalFactsText(l10n, goal), style: theme.textTheme.bodyMedium),
          if (measure != null)
            Text(
              measure,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          const SizedBox(height: 4),
          GoalProgressBar(value: goal.progress),
          const SizedBox(height: 4),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: GoalStatusPill(status: goal.status),
          ),
          ?action,
        ],
      ),
    );
  }
}

/// The weights of one person's goals for a cycle, in percent to two
/// decimals as the API adds them up: agreed (and completed, which were
/// agreed), drafts still to agree, and both; dropped goals count for
/// nothing.
({num agreed, num draft, num total}) goalWeights(List<GoalView> goals) {
  num sum(Set<GoalStatus> statuses) =>
      (goals
                  .where((g) => statuses.contains(g.status))
                  .fold<num>(
                    0,
                    (n, g) => n + (num.tryParse(g.weight ?? '') ?? 0),
                  ) *
              100)
          .round() /
      100;
  final agreed = sum({GoalStatus.agreed, GoalStatus.completed});
  final draft = sum({GoalStatus.draft});
  return (
    agreed: agreed,
    draft: draft,
    total: ((agreed + draft) * 100).round() / 100,
  );
}

/// The weights of one person's goals for a cycle: `Weights: 90% of 100% ·
/// agreed 60%, drafts 30%`. Agreed goals for a cycle weigh 100% together.
class WeightsLine extends StatelessWidget {
  const WeightsLine({super.key, required this.goals});

  final List<GoalView> goals;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final (:agreed, :draft, :total) = goalWeights(goals);
    return Text(
      '${l10n.goalWeights(formatPercent(l10n, total))} · '
      '${l10n.goalWeightsSplit(formatPercent(l10n, agreed), formatPercent(l10n, draft))}',
      style: theme.textTheme.bodySmall?.copyWith(
        color: theme.colorScheme.onSurfaceVariant,
      ),
    );
  }
}

/// Goals grouped by cycle in the order they come, goals outside any cycle
/// last, as on the web.
List<(GoalCycleRef?, List<GoalView>)> goalsByCycle(List<GoalView> goals) {
  final groups = <String, (GoalCycleRef?, List<GoalView>)>{};
  for (final goal in goals) {
    groups
        .putIfAbsent(goal.cycle?.id ?? '', () => (goal.cycle, []))
        .$2
        .add(goal);
  }
  final ordered = groups.values.toList();
  return [
    ...ordered.where((g) => g.$1 != null),
    ...ordered.where((g) => g.$1 == null),
  ];
}

/// The title of a group of goals: its cycle, or outside review cycles.
String cycleGroupTitle(AppLocalizations l10n, GoalCycleRef? cycle) =>
    cycle?.name ?? l10n.goalsOutsideCycles;
