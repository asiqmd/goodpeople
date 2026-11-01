import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_models.dart';
import '../auth/auth_controller.dart';
import '../l10n/app_localizations.dart';
import '../leave/leave_widgets.dart';
import '../ui/format.dart';
import '../ui/language_menu.dart';
import '../ui/load_error_view.dart';
import 'goal_screen.dart';
import 'performance_providers.dart';
import 'performance_widgets.dart';

/// For a manager: the draft goals of the people below them, by person and
/// cycle, each with Agree, and Agree all for a person's drafts of one cycle,
/// as on the web. Within a cycle a person's agreed goals weigh 100%
/// together, so each cycle shows its weights.
class TeamGoalsScreen extends ConsumerWidget {
  const TeamGoalsScreen({super.key});

  static Route<void> route() =>
      MaterialPageRoute(builder: (context) => const TeamGoalsScreen());

  static ValueKey<String> personKey(String employeeId) =>
      ValueKey('team-goals-$employeeId');
  static ValueKey<String> agreeKey(String goalId) =>
      ValueKey('team-goal-agree-$goalId');
  static ValueKey<String> agreeAllKey(String employeeId, String? cycleId) =>
      ValueKey('team-goals-agree-all-$employeeId-${cycleId ?? 'none'}');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final team = ref.watch(teamGoalsProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.teamGoalsTitle),
        actions: const [LanguageMenuButton()],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () => awaitRefresh(ref.refresh(teamGoalsProvider.future)),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: switch (team) {
              AsyncData(:final value) => _people(context, value),
              AsyncError(:final error)
                  when !team.isLoading && error is! SessionExpiredException =>
                [
                  LoadErrorView(
                    title: l10n.teamGoalsLoadFailed,
                    error: error,
                    onRetry: () => ref.invalidate(teamGoalsProvider),
                  ),
                ],
              _ => [const LeaveLoading()],
            },
          ),
        ),
      ),
    );
  }

  List<Widget> _people(BuildContext context, TeamGoals team) {
    final l10n = AppLocalizations.of(context);
    final waiting = [
      for (final person in team.people)
        if (_toAgree(person) case final groups when groups.isNotEmpty)
          (person, groups),
    ];
    if (waiting.isEmpty) {
      return [
        LeaveEmptyState(
          icon: Icons.fact_check_outlined,
          message: l10n.teamGoalsNone,
        ),
      ];
    }
    return [
      Text(
        l10n.teamGoalsToAgree(team.toAgree),
        style: Theme.of(context).textTheme.bodyLarge,
      ),
      for (final (person, groups) in waiting)
        _PersonCard(
          key: personKey(person.employee.id),
          person: person,
          groups: groups,
        ),
    ];
  }

  /// A person's goals by cycle, only the cycles still open with drafts.
  static List<(GoalCycleRef?, List<GoalView>)> _toAgree(
    TeamGoalsPerson person,
  ) => [
    for (final group in goalsByCycle(person.goals))
      if ((group.$1?.status.goalsOpen ?? true) &&
          group.$2.any((g) => g.status == GoalStatus.draft))
        group,
  ];
}

class _PersonCard extends ConsumerStatefulWidget {
  const _PersonCard({super.key, required this.person, required this.groups});

  final TeamGoalsPerson person;
  final List<(GoalCycleRef?, List<GoalView>)> groups;

  @override
  ConsumerState<_PersonCard> createState() => _PersonCardState();
}

class _PersonCardState extends ConsumerState<_PersonCard> {
  bool _busy = false;

  Future<void> _run(
    Future<void> Function(TeamGoalsController team) agree,
  ) async {
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final container = ProviderScope.containerOf(context, listen: false);
    setState(() => _busy = true);
    String message;
    try {
      await agree(container.read(teamGoalsProvider.notifier));
      message = l10n.goalAgreed;
    } on SessionExpiredException {
      return;
    } on Object catch (error) {
      message = performanceErrorText(l10n, error);
      if (isStale(error)) container.invalidate(teamGoalsProvider);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
    messenger
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final employee = widget.person.employee;
    return PerformanceSection(
      title: '${personName(l10n, employee)} · ${employee.employeeCode}',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 8,
        children: [
          if (widget.person.manager case final manager?)
            MutedText(l10n.goalsReportsTo(personName(l10n, manager))),
          for (final (cycle, goals) in widget.groups) ...[
            Text(
              cycleGroupTitle(l10n, cycle),
              style: theme.textTheme.titleSmall,
            ),
            if (cycle != null) WeightsLine(goals: goals),
            for (final goal in goals.where((g) => g.status == GoalStatus.draft))
              GoalCard(
                goal: goal,
                onTap: () =>
                    Navigator.of(context).push(GoalScreen.route(goal.id)),
                action: Align(
                  alignment: AlignmentDirectional.centerEnd,
                  child: OutlinedButton(
                    key: TeamGoalsScreen.agreeKey(goal.id),
                    onPressed: _busy
                        ? null
                        : () => _run((team) => team.agree(goal.id)),
                    child: Text(l10n.goalAgree),
                  ),
                ),
              ),
            if (_draftsOf(goals) case final drafts when drafts > 1)
              Align(
                alignment: AlignmentDirectional.centerEnd,
                child: FilledButton(
                  key: TeamGoalsScreen.agreeAllKey(employee.id, cycle?.id),
                  onPressed: _busy
                      ? null
                      : () => _run(
                          (team) => team.agreeAll(employee.id, cycle?.id),
                        ),
                  child: Text(
                    cycle == null
                        ? l10n.goalAgreeAllNoCycle(formatNumber(l10n, drafts))
                        : l10n.goalAgreeAll(
                            formatNumber(l10n, drafts),
                            formatPercent(l10n, goalWeights(goals).total),
                          ),
                  ),
                ),
              ),
          ],
        ],
      ),
    );
  }

  static int _draftsOf(List<GoalView> goals) =>
      goals.where((g) => g.status == GoalStatus.draft).length;
}
