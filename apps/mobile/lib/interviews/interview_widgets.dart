import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../api/api_models.dart';
import '../l10n/app_localizations.dart';
import '../leave/leave_widgets.dart';
import '../ui/format.dart';

/// Interviews are scheduled in Bangladesh time, as on the web, so the app
/// shows them in it wherever the phone is.
const interviewTimeZone = 'Asia/Dhaka';

/// When an interview is, in Bangladesh time: `Thu, Oct 29, 2026 · 10:00 AM
/// – 11:00 AM`, with the end's date too when it ends on another day.
String interviewWhenText(AppLocalizations l10n, MyInterviewItem interview) {
  final start = wallClock(interview.startsAt, interviewTimeZone);
  final end = wallClock(interview.endsAt, interviewTimeZone);
  final day = DateFormat.yMMMEd(l10n.localeName);
  final from = formatClock(l10n, start.hour, start.minute);
  final to = formatClock(l10n, end.hour, end.minute);
  final sameDay =
      start.year == end.year &&
      start.month == end.month &&
      start.day == end.day;
  return sameDay
      ? '${day.format(start)} · $from – $to'
      : '${day.format(start)} · $from – ${day.format(end)} · $to';
}

/// The position, in the job post's title in the UI language when there is
/// one.
String interviewOpeningTitle(AppLocalizations l10n, MyInterviewItem item) =>
    item.opening.titleIn(l10n.localeName.startsWith('bn') ? 'bn' : 'en');

/// How the interview is held, and its status unless it is still to come.
class InterviewPills extends StatelessWidget {
  const InterviewPills({super.key, required this.interview});

  final MyInterviewItem interview;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    final status = interview.status;
    return Wrap(
      spacing: 8,
      runSpacing: 4,
      children: [
        LeavePill(
          label: l10n.interviewKindName(interview.kind.wire),
          background: scheme.secondaryContainer,
          foreground: scheme.onSecondaryContainer,
        ),
        if (status != InterviewStatus.scheduled)
          LeavePill(
            label: l10n.interviewStatusName(status.wire),
            background: status == InterviewStatus.cancelled
                ? scheme.errorContainer
                : scheme.surfaceContainerHighest,
            foreground: status == InterviewStatus.cancelled
                ? scheme.onErrorContainer
                : scheme.onSurfaceVariant,
          ),
        // A cancelled interview takes no scorecard.
        if (status != InterviewStatus.cancelled)
          LeavePill(
            label: interview.submitted
                ? l10n.interviewScorecardIn
                : l10n.interviewScorecardToDo,
            background: interview.submitted
                ? scheme.primaryContainer
                : scheme.tertiaryContainer,
            foreground: interview.submitted
                ? scheme.onPrimaryContainer
                : scheme.onTertiaryContainer,
          ),
      ],
    );
  }
}

/// A recommendation as a coloured label.
class RecommendationPill extends StatelessWidget {
  const RecommendationPill({super.key, required this.recommendation});

  final Recommendation recommendation;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    final (background, foreground) = switch (recommendation) {
      Recommendation.strongYes || Recommendation.yes => (
        scheme.primaryContainer,
        scheme.onPrimaryContainer,
      ),
      Recommendation.strongNo ||
      Recommendation.no => (scheme.errorContainer, scheme.onErrorContainer),
      Recommendation.unknown => (
        scheme.surfaceContainerHighest,
        scheme.onSurfaceVariant,
      ),
    };
    return LeavePill(
      label: l10n.recommendationName(recommendation.wire),
      background: background,
      foreground: foreground,
    );
  }
}

/// A submitted scorecard, read only: each criterion's rating, the
/// recommendation, the notes and when it was submitted.
class ScorecardSummary extends StatelessWidget {
  const ScorecardSummary({super.key, required this.scorecard});

  final Scorecard scorecard;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final secondary = theme.textTheme.bodySmall?.copyWith(
      color: theme.colorScheme.onSurfaceVariant,
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 6,
      children: [
        for (final MapEntry(key: criterion, value: rating)
            in scorecard.ratings.entries)
          MergeSemantics(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(criterion, style: theme.textTheme.bodyMedium),
                ),
                const SizedBox(width: 8),
                Text(
                  l10n.scorecardRating(rating),
                  style: theme.textTheme.titleSmall,
                ),
              ],
            ),
          ),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: RecommendationPill(recommendation: scorecard.recommendation),
        ),
        if (scorecard.feedback case final feedback? when feedback.isNotEmpty)
          Text(feedback, style: theme.textTheme.bodyMedium),
        Text(
          l10n.scorecardSubmittedOn(
            formatShortDate(
              l10n,
              wallClock(scorecard.submittedAt, interviewTimeZone),
            ),
          ),
          style: secondary,
        ),
      ],
    );
  }
}
