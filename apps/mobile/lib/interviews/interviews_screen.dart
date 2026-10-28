import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_models.dart';
import '../auth/auth_controller.dart';
import '../l10n/app_localizations.dart';
import '../leave/leave_widgets.dart';
import '../ui/language_menu.dart';
import '../ui/load_error_view.dart';
import 'interview_providers.dart';
import 'interview_screen.dart';
import 'interview_widgets.dart';

/// The interviews the signed-in login is on the panel of: those to come,
/// soonest first, then past ones, latest first. Each opens with the CV and
/// the scorecard.
class InterviewsScreen extends ConsumerWidget {
  const InterviewsScreen({super.key});

  static Route<void> route() =>
      MaterialPageRoute(builder: (context) => const InterviewsScreen());

  static ValueKey<String> itemKey(String interviewId) =>
      ValueKey('interview-$interviewId');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final interviews = ref.watch(myInterviewsProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.myInterviewsTitle),
        actions: const [LanguageMenuButton()],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () {
            ref.invalidate(interviewsToDoProvider);
            return awaitRefresh(ref.refresh(myInterviewsProvider.future));
          },
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: switch (interviews) {
              AsyncData(:final value) => [
                _Section(
                  title: l10n.interviewsUpcoming,
                  items: value.upcoming,
                  empty: l10n.interviewsNoUpcoming,
                ),
                const SizedBox(height: 24),
                _Section(
                  title: l10n.interviewsPast,
                  items: value.past,
                  empty: l10n.interviewsNoPast,
                ),
              ],
              AsyncError(:final error)
                  when !interviews.isLoading &&
                      error is! SessionExpiredException =>
                [
                  LoadErrorView(
                    title: l10n.interviewsLoadFailed,
                    error: error,
                    onRetry: () => ref.invalidate(myInterviewsProvider),
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

class _Section extends StatelessWidget {
  const _Section({
    required this.title,
    required this.items,
    required this.empty,
  });

  final String title;
  final List<MyInterviewItem> items;
  final String empty;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: 12,
      children: [
        Semantics(
          header: true,
          child: Text(title, style: theme.textTheme.titleMedium),
        ),
        if (items.isEmpty)
          Text(
            empty,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          )
        else
          for (final item in items)
            _InterviewCard(
              key: InterviewsScreen.itemKey(item.id),
              interview: item,
            ),
      ],
    );
  }
}

/// The candidate, the position, when and how, and whether the scorecard is
/// in.
class _InterviewCard extends StatelessWidget {
  const _InterviewCard({super.key, required this.interview});

  final MyInterviewItem interview;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    return Card.outlined(
      margin: EdgeInsets.zero,
      clipBehavior: Clip.antiAlias,
      child: Semantics(
        button: true,
        child: InkWell(
          onTap: () =>
              Navigator.of(context).push(InterviewScreen.route(interview.id)),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    spacing: 4,
                    children: [
                      Text(
                        interview.candidateName,
                        style: theme.textTheme.titleMedium,
                      ),
                      Text(
                        l10n.interviewForOpening(
                          interviewOpeningTitle(l10n, interview),
                        ),
                        style: theme.textTheme.bodyMedium,
                      ),
                      Text(
                        interviewWhenText(l10n, interview),
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                      const SizedBox(height: 4),
                      InterviewPills(interview: interview),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Icon(
                  Icons.chevron_right,
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
