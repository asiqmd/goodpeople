import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_models.dart';
import '../auth/auth_controller.dart';
import '../l10n/app_localizations.dart';
import '../leave/leave_widgets.dart';
import '../ui/language_menu.dart';
import '../ui/load_error_view.dart';
import 'goal_screen.dart';
import 'performance_providers.dart';
import 'performance_widgets.dart';

/// The login's goals by review cycle, with the weights of each cycle's
/// goals, each goal's progress and status. Drafts of a cycle still open can
/// be sent to the manager to agree; drafting goals is done on the web.
class MyGoalsScreen extends ConsumerWidget {
  const MyGoalsScreen({super.key});

  static Route<void> route() =>
      MaterialPageRoute(builder: (context) => const MyGoalsScreen());

  static ValueKey<String> goalKey(String goalId) => ValueKey('goal-$goalId');
  static ValueKey<String> submitKey(String? cycleId) =>
      ValueKey('goals-submit-${cycleId ?? 'none'}');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final goals = ref.watch(myGoalsProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.myGoalsTitle),
        actions: const [LanguageMenuButton()],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () => awaitRefresh(ref.refresh(myGoalsProvider.future)),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: switch (goals) {
              AsyncData(value: MyGoals(employee: null)) => [
                LeaveEmptyState(
                  icon: Icons.person_off_outlined,
                  message: l10n.goalsNoEmployee,
                ),
              ],
              AsyncData(:final value) => [_MyGoalsBody(goals: value)],
              AsyncError(:final error)
                  when !goals.isLoading && error is! SessionExpiredException =>
                [
                  LoadErrorView(
                    title: l10n.goalsLoadFailed,
                    error: error,
                    onRetry: () => ref.invalidate(myGoalsProvider),
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

class _MyGoalsBody extends StatelessWidget {
  const _MyGoalsBody({required this.goals});

  final MyGoals goals;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (goals.manager case final manager?)
          MutedText(l10n.goalsAgreedWith(personName(l10n, manager))),
        if (goals.goals.isEmpty)
          LeaveEmptyState(icon: Icons.flag_outlined, message: l10n.goalsNone),
        for (final (cycle, list) in goalsByCycle(goals.goals))
          PerformanceSection(
            title: cycleGroupTitle(l10n, cycle),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 8,
              children: [
                if (cycle != null) WeightsLine(goals: list),
                for (final goal in list)
                  GoalCard(
                    key: MyGoalsScreen.goalKey(goal.id),
                    goal: goal,
                    onTap: () =>
                        Navigator.of(context).push(GoalScreen.route(goal.id)),
                  ),
                if ((cycle?.status.goalsOpen ?? true) &&
                    list.any((g) => g.status == GoalStatus.draft))
                  Align(
                    alignment: AlignmentDirectional.centerEnd,
                    child: _SubmitButton(cycleId: cycle?.id),
                  ),
              ],
            ),
          ),
        const SizedBox(height: 24),
        Text(
          l10n.goalsDraftOnWeb,
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
      ],
    );
  }
}

/// Sends the drafts of one cycle to the manager to agree.
class _SubmitButton extends ConsumerStatefulWidget {
  const _SubmitButton({required this.cycleId});

  final String? cycleId;

  @override
  ConsumerState<_SubmitButton> createState() => _SubmitButtonState();
}

class _SubmitButtonState extends ConsumerState<_SubmitButton> {
  bool _busy = false;

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final container = ProviderScope.containerOf(context, listen: false);
    setState(() => _busy = true);
    String message;
    try {
      final sent = await container
          .read(authProvider.notifier)
          .submitGoals(widget.cycleId);
      message = sent.notified > 0
          ? l10n.goalsSubmitted(sent.goals)
          : l10n.goalsSubmittedAlready;
    } on SessionExpiredException {
      // AuthGate is already showing the login screen.
      return;
    } on Object catch (error) {
      message = performanceErrorText(l10n, error);
      if (isStale(error)) container.invalidate(myGoalsProvider);
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
    return OutlinedButton(
      key: MyGoalsScreen.submitKey(widget.cycleId),
      onPressed: _busy ? null : _submit,
      child: Text(l10n.goalsSubmit),
    );
  }
}
