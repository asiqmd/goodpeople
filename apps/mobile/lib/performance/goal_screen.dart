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

/// One goal: how it is measured and how far it has come (for a KPI from
/// the records, how the value was read), its dates, its check-ins and the
/// form for a new one. A manager agrees a draft here too; completing and
/// dropping goals is done on the web.
class GoalScreen extends ConsumerWidget {
  const GoalScreen({super.key, required this.goalId});

  final String goalId;

  static Route<void> route(String goalId) =>
      MaterialPageRoute(builder: (context) => GoalScreen(goalId: goalId));

  static const agreeKey = ValueKey('goal-agree');
  static const checkinsKey = ValueKey('goal-checkins');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final provider = goalProvider(goalId);
    final goal = ref.watch(provider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.goalTitle),
        actions: const [LanguageMenuButton()],
      ),
      body: SafeArea(
        child: switch (goal) {
          AsyncData(:final value) => RefreshIndicator(
            onRefresh: () => awaitRefresh(ref.refresh(provider.future)),
            child: _GoalBody(goal: value),
          ),
          AsyncError(error: ApiException(statusCode: 404))
              when !goal.isLoading =>
            LeaveEmptyState(icon: Icons.flag_outlined, message: l10n.goalGone),
          AsyncError(:final error)
              when !goal.isLoading && error is! SessionExpiredException =>
            LoadErrorView(
              title: l10n.goalLoadFailed,
              error: error,
              onRetry: () => ref.invalidate(provider),
            ),
          _ => const Center(child: CircularProgressIndicator()),
        },
      ),
    );
  }
}

class _GoalBody extends StatelessWidget {
  const _GoalBody({required this.goal});

  final GoalDetail goal;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final measure = goalMeasureText(l10n, goal);

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
                Text(goal.title, style: theme.textTheme.titleLarge),
                if (goal.employee case final employee?)
                  Text(
                    personName(l10n, employee),
                    style: theme.textTheme.bodyMedium,
                  ),
                Text(
                  [
                    l10n.goalKindName(goal.kind.wire),
                    cycleGroupTitle(l10n, goal.cycle),
                    if (goal.weight case final weight?)
                      l10n.goalWeight(
                        formatPercent(l10n, num.tryParse(weight) ?? 0),
                      ),
                  ].join(' · '),
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
                ),
                Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: GoalStatusPill(status: goal.status),
                ),
                if (goal.can.agree) _AgreeButton(goalId: goal.id),
              ],
            ),
          ),
        ),
        if (goal.status == GoalStatus.dropped && goal.dropNote != null) ...[
          const SizedBox(height: 12),
          NoticeCard(
            icon: Icons.block,
            message: l10n.goalDropped(goal.dropNote!),
            background: scheme.surfaceContainerHighest,
            foreground: scheme.onSurfaceVariant,
          ),
        ],
        PerformanceSection(
          title: l10n.goalProgressTitle,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: 8,
            children: [
              GoalProgressBar(value: goal.progress),
              if (goal.kind == GoalKind.kpi && measure != null)
                Text(measure, style: theme.textTheme.bodyMedium),
              if (goal.fromRecords) ...[
                Text(switch (goal.reading) {
                  final reading? => kpiReadingText(l10n, reading),
                  null => l10n.goalReadingClosed,
                }, style: theme.textTheme.bodyMedium),
                MutedText(l10n.goalSourceHint(goal.source.wire)),
              ],
              for (final result in goal.keyResults)
                MergeSemantics(
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        result.done
                            ? Icons.check_circle
                            : Icons.radio_button_unchecked,
                        size: 20,
                        color: result.done ? scheme.primary : scheme.outline,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          '${result.text} '
                          '(${result.done ? l10n.goalKeyResultDone : l10n.goalKeyResultOpen})',
                          style: theme.textTheme.bodyMedium,
                        ),
                      ),
                    ],
                  ),
                ),
              if (goal.description case final description?
                  when description.isNotEmpty)
                Text(description, style: theme.textTheme.bodyMedium),
            ],
          ),
        ),
        PerformanceSection(
          title: l10n.goalDetailsTitle,
          child: Wrap(
            spacing: 32,
            runSpacing: 12,
            children: [
              if (goal.startsOn case final starts?)
                LeaveFact(
                  label: l10n.goalStartsOn,
                  value: formatShortDate(l10n, starts),
                ),
              if (goal.dueOn case final due?)
                LeaveFact(
                  label: l10n.goalDueOn,
                  value: formatShortDate(l10n, due),
                ),
              if (goal.kind == GoalKind.kpi)
                LeaveFact(
                  label: l10n.goalValueFrom,
                  value: l10n.goalSourceName(goal.source.wire),
                ),
              LeaveFact(
                label: l10n.goalServes,
                value: goal.parentTitle ?? l10n.goalServesNothing,
              ),
            ],
          ),
        ),
        PerformanceSection(
          key: GoalScreen.checkinsKey,
          title: l10n.goalCheckinsTitle,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: 12,
            children: [
              if (goal.can.checkin) ...[
                // A new form once a check-in is in.
                CheckinForm(key: ValueKey(goal.checkins.length), goal: goal),
                const Divider(height: 8),
              ],
              if (goal.checkins.isEmpty)
                MutedText(l10n.goalNoCheckins)
              else
                for (final checkin in goal.checkins)
                  _CheckinTile(goal: goal, checkin: checkin),
            ],
          ),
        ),
      ],
    );
  }
}

/// When, who, what moved and the note.
class _CheckinTile extends StatelessWidget {
  const _CheckinTile({required this.goal, required this.checkin});

  final GoalDetail goal;
  final GoalCheckin checkin;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final when = [
      formatPerformanceDay(l10n, checkin.createdAt),
      formatInstantClock(l10n, checkin.createdAt, performanceTimeZone),
      ?checkin.author,
    ].join(' · ');
    final moved = [
      if (checkin.progress case final progress?) formatPercent(l10n, progress),
      if (checkin.value case final value?)
        l10n.goalCheckinValue(
          formatDecimal(l10n, value),
          goal.measureUnit ?? '',
        ),
    ].join(' · ');
    return MergeSemantics(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 2,
        children: [
          Text(
            when,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          if (moved.isNotEmpty) Text(moved, style: theme.textTheme.titleSmall),
          if (checkin.note case final note? when note.isNotEmpty)
            Text(note, style: theme.textTheme.bodyMedium),
        ],
      ),
    );
  }
}

/// A manager agrees a draft goal of someone below them.
class _AgreeButton extends ConsumerStatefulWidget {
  const _AgreeButton({required this.goalId});

  final String goalId;

  @override
  ConsumerState<_AgreeButton> createState() => _AgreeButtonState();
}

class _AgreeButtonState extends ConsumerState<_AgreeButton> {
  bool _busy = false;

  Future<void> _agree() async {
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final container = ProviderScope.containerOf(context, listen: false);
    final provider = goalProvider(widget.goalId);
    setState(() => _busy = true);
    String message;
    try {
      await container.read(provider.notifier).agree();
      message = l10n.goalAgreed;
    } on SessionExpiredException {
      return;
    } on Object catch (error) {
      message = performanceErrorText(l10n, error);
      if (isStale(error)) container.invalidate(provider);
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
    return Align(
      alignment: AlignmentDirectional.centerStart,
      child: FilledButton(
        key: GoalScreen.agreeKey,
        onPressed: _busy ? null : _agree,
        child: Text(l10n.goalAgree),
      ),
    );
  }
}

/// A check-in: tick the key results done, or give the progress (an
/// objective without key results) or the value (a KPI typed by hand), and
/// a note. A KPI from the records takes a note only; its value comes from
/// the records.
class CheckinForm extends ConsumerStatefulWidget {
  const CheckinForm({super.key, required this.goal});

  final GoalDetail goal;

  static ValueKey<String> keyResultKey(int index) =>
      ValueKey('checkin-key-result-$index');
  static const progressKey = ValueKey('checkin-progress');
  static const valueKey = ValueKey('checkin-value');
  static const noteKey = ValueKey('checkin-note');
  static const submitKey = ValueKey('checkin-submit');

  @override
  ConsumerState<CheckinForm> createState() => _CheckinFormState();
}

enum _CheckinKind { keyResults, progress, value, note }

class _CheckinFormState extends ConsumerState<CheckinForm> {
  late final _CheckinKind _kind = switch (widget.goal) {
    GoalDetail(kind: GoalKind.kpi) when widget.goal.fromRecords =>
      _CheckinKind.note,
    GoalDetail(kind: GoalKind.kpi) => _CheckinKind.value,
    GoalDetail(keyResults: []) => _CheckinKind.progress,
    _ => _CheckinKind.keyResults,
  };
  late final Set<int> _done = {
    for (final (index, result) in widget.goal.keyResults.indexed)
      if (result.done) index,
  };
  final _progress = TextEditingController();
  final _value = TextEditingController();
  final _note = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _busy = false;
  bool _seeded = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // The progress as it stands, in the UI language's digits.
    if (!_seeded) {
      _seeded = true;
      _progress.text = formatNumber(
        AppLocalizations.of(context),
        widget.goal.progress,
      );
    }
  }

  @override
  void dispose() {
    _progress.dispose();
    _value.dispose();
    _note.dispose();
    super.dispose();
  }

  bool get _noteEmpty => _note.text.trim().isEmpty;

  String? _checkProgress(String? text) {
    final value = int.tryParse(asciiDigits(text ?? ''));
    return value == null || value < 0 || value > 100
        ? AppLocalizations.of(context).goalCheckinProgressInvalid
        : null;
  }

  String? _checkValue(String? text) {
    final l10n = AppLocalizations.of(context);
    final ascii = asciiDigits(text ?? '');
    if (ascii.isEmpty) return _noteEmpty ? l10n.goalCheckinEmpty : null;
    return RegExp(r'^\d{1,12}(\.\d{1,2})?$').hasMatch(ascii)
        ? null
        : l10n.goalCheckinValueInvalid;
  }

  String? _checkNote(String? text) => _kind == _CheckinKind.note && _noteEmpty
      ? AppLocalizations.of(context).goalCheckinNoteRequired
      : null;

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    // Still usable once a new form replaces this one.
    final container = ProviderScope.containerOf(context, listen: false);
    final provider = goalProvider(widget.goal.id);
    final note = _note.text.trim();
    final value = asciiDigits(_value.text);
    final draft = GoalCheckinDraft(
      done: _kind == _CheckinKind.keyResults ? (_done.toList()..sort()) : null,
      progress: _kind == _CheckinKind.progress
          ? int.parse(asciiDigits(_progress.text))
          : null,
      value: _kind == _CheckinKind.value && value.isNotEmpty ? value : null,
      note: note.isEmpty ? null : note,
    );
    setState(() => _busy = true);
    try {
      await container.read(provider.notifier).checkin(draft);
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(l10n.goalCheckinSaved)));
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
    final goal = widget.goal;
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 12,
        children: [
          switch (_kind) {
            _CheckinKind.keyResults => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  l10n.goalCheckinKeyResults,
                  style: theme.textTheme.titleSmall,
                ),
                for (final (index, result) in goal.keyResults.indexed)
                  CheckboxListTile(
                    key: CheckinForm.keyResultKey(index),
                    contentPadding: EdgeInsets.zero,
                    controlAffinity: ListTileControlAffinity.leading,
                    title: Text(result.text),
                    value: _done.contains(index),
                    onChanged: _busy
                        ? null
                        : (checked) => setState(
                            () => checked == true
                                ? _done.add(index)
                                : _done.remove(index),
                          ),
                  ),
              ],
            ),
            _CheckinKind.progress => TextFormField(
              key: CheckinForm.progressKey,
              controller: _progress,
              enabled: !_busy,
              keyboardType: TextInputType.number,
              validator: _checkProgress,
              decoration: InputDecoration(
                labelText: l10n.goalCheckinProgress,
                helperText: l10n.goalCheckinProgressHint,
                suffixText: '%',
                border: const OutlineInputBorder(),
              ),
            ),
            _CheckinKind.value => TextFormField(
              key: CheckinForm.valueKey,
              controller: _value,
              enabled: !_busy,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              validator: _checkValue,
              decoration: InputDecoration(
                labelText: l10n.goalCheckinValueLabel(goal.measureUnit ?? ''),
                border: const OutlineInputBorder(),
              ),
            ),
            _CheckinKind.note => Text(
              l10n.goalCheckinFromRecords,
              style: theme.textTheme.bodyMedium,
            ),
          },
          TextFormField(
            key: CheckinForm.noteKey,
            controller: _note,
            enabled: !_busy,
            minLines: 2,
            maxLines: 6,
            maxLength: 2000,
            textCapitalization: TextCapitalization.sentences,
            validator: _checkNote,
            decoration: InputDecoration(
              labelText: l10n.goalCheckinNote,
              border: const OutlineInputBorder(),
              alignLabelWithHint: true,
            ),
          ),
          Align(
            alignment: AlignmentDirectional.centerEnd,
            child: FilledButton(
              key: CheckinForm.submitKey,
              onPressed: _busy ? null : _submit,
              child: Text(l10n.goalCheckinAdd),
            ),
          ),
        ],
      ),
    );
  }
}
