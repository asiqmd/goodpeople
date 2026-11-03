import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../api/api_models.dart';
import '../auth/auth_controller.dart';
import '../l10n/app_localizations.dart';
import '../ui/format.dart';
import '../ui/language_menu.dart';
import '../ui/load_error_view.dart';
import 'service_form.dart';

final engagementProvider = FutureProvider.autoDispose<EngagementOverview>((
  ref,
) {
  if (ref.watch(authProvider) is! SignedIn) {
    throw const SessionExpiredException();
  }
  return ref.read(authProvider.notifier).fetchEngagement();
}, retry: (count, error) => null);

class EngagementScreen extends ConsumerStatefulWidget {
  const EngagementScreen({super.key, this.initialTab = 0});
  final int initialTab;
  static Route<void> route({int tab = 0}) =>
      MaterialPageRoute(builder: (_) => EngagementScreen(initialTab: tab));
  @override
  ConsumerState<EngagementScreen> createState() => _EngagementScreenState();
}

class _EngagementScreenState extends ConsumerState<EngagementScreen> {
  final _busy = <String>{};
  Future<void> _action(String id, Future<void> Function() task) async {
    setState(() => _busy.add(id));
    try {
      await task();
      if (mounted) ref.invalidate(engagementProvider);
    } on SessionExpiredException {
      /* AuthGate handles the session. */
    } on Object catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(serviceError(AppLocalizations.of(context), error)),
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _busy.remove(id));
    }
  }

  Future<void> _survey(EmployeeSurvey s) async {
    final l = AppLocalizations.of(context), bn = l.localeName.startsWith('bn');
    final done = await showServiceForm(
      context,
      title: l.serviceSubmitSurvey,
      note:
          '${l.serviceAnonymousNote}\n${l.serviceEnpsScale}\n${l.servicePulseScale}',
      fields: [
        ServiceInput(
          'enps',
          l.serviceEnpsQuestion,
          choices: {for (var i = 0; i <= 10; i++) '$i': formatNumber(l, i)},
        ),
        for (var i = 0; i < s.questions.length; i++)
          ServiceInput(
            'q$i',
            bn ? s.questions[i].textBn : s.questions[i].text,
            choices: {for (var n = 1; n <= 5; n++) '$n': formatNumber(l, n)},
          ),
      ],
      submit: (data) => ref
          .read(authProvider.notifier)
          .respondToSurvey(
            s.id,
            enps: int.parse(data['enps']!),
            scores: [
              for (var i = 0; i < s.questions.length; i++)
                int.parse(data['q$i']!),
            ],
          ),
    );
    if (done == true && mounted) ref.invalidate(engagementProvider);
  }

  Future<void> _recognize() async {
    final l = AppLocalizations.of(context);
    final done = await showServiceForm(
      context,
      title: l.serviceNewRecognition,
      note: l.serviceRecognitionNote,
      fields: [
        ServiceInput(
          'employeeCode',
          l.serviceEmployeeCode,
          maxLength: 40,
          minLength: 1,
        ),
        ServiceInput(
          'value',
          l.serviceValue,
          choices: {
            'teamwork': l.serviceValuesTeamwork,
            'service': l.serviceValuesService,
            'quality': l.serviceValuesQuality,
            'initiative': l.serviceValuesInitiative,
          },
        ),
        ServiceInput('message', l.serviceMessage, long: true, maxLength: 1000),
      ],
      submit: (d) => ref
          .read(authProvider.notifier)
          .recognizeColleague(
            employeeCode: d['employeeCode']!,
            value: d['value']!,
            message: d['message']!,
          ),
    );
    if (done == true && mounted) ref.invalidate(engagementProvider);
  }

  Future<void> _withdraw(ColleagueRecognition r) async {
    final l = AppLocalizations.of(context);
    final done = await showServiceForm(
      context,
      title: l.serviceWithdrawRecognition,
      fields: [ServiceInput('reason', l.serviceReason, maxLength: 4000)],
      submit: (d) => ref
          .read(authProvider.notifier)
          .withdrawRecognition(r.id, d['reason']!),
    );
    if (done == true && mounted) ref.invalidate(engagementProvider);
  }

  Widget _list(List<Widget> children) => RefreshIndicator(
    onRefresh: () => ref.refresh(engagementProvider.future).then<void>((_) {}),
    child: ListView(
      padding: const EdgeInsets.all(16),
      physics: const AlwaysScrollableScrollPhysics(),
      children: children,
    ),
  );
  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context), bn = l.localeName.startsWith('bn');
    final state = ref.watch(engagementProvider),
        writable =
            ref.watch(tenantAccessProvider).value?.access.accessState ==
            AccessState.full;
    String valueLabel(String value) => switch (value) {
      'teamwork' => l.serviceValuesTeamwork,
      'service' => l.serviceValuesService,
      'quality' => l.serviceValuesQuality,
      'initiative' => l.serviceValuesInitiative,
      _ => l.serviceUnknown,
    };
    return DefaultTabController(
      length: 3,
      initialIndex: widget.initialTab,
      child: Scaffold(
        appBar: AppBar(
          title: Text(l.serviceEngagement),
          actions: const [LanguageMenuButton()],
          bottom: TabBar(
            isScrollable: true,
            tabs: [
              Tab(text: l.serviceAnnouncements),
              Tab(text: l.serviceSurveys),
              Tab(text: l.serviceRecognition),
            ],
          ),
        ),
        body: switch (state) {
          AsyncData(:final value) => TabBarView(
            children: [
              _list([
                if (value.manage) Text(l.serviceHrOnWeb),
                if (value.announcements.isEmpty) Text(l.serviceEmpty),
                for (final a in value.announcements)
                  Card(
                    child: ExpansionTile(
                      key: ValueKey('service-notice-${a.id}'),
                      title: Text(bn ? a.titleBn : a.title),
                      subtitle: Text(
                        a.acknowledgedAt != null
                            ? l.serviceAcknowledged
                            : serviceStatus(l, a.status),
                      ),
                      childrenPadding: const EdgeInsets.all(16),
                      expandedCrossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(bn ? a.bodyBn : a.body),
                        if (a.dueOn != null)
                          Text('${l.serviceDueOn}: ${formatDate(l, a.dueOn!)}'),
                        const SizedBox(height: 12),
                        if (a.canAcknowledge) ...[
                          Text(l.servicePolicyNote),
                          FilledButton(
                            onPressed: writable && !_busy.contains(a.id)
                                ? () => _action(
                                    a.id,
                                    () => ref
                                        .read(authProvider.notifier)
                                        .acknowledgeAnnouncement(a.id),
                                  )
                                : null,
                            child: Text(l.serviceAcknowledge),
                          ),
                        ],
                      ],
                    ),
                  ),
              ]),
              _list([
                Text(l.serviceAnonymousNote),
                if (value.surveys.isEmpty) Text(l.serviceEmpty),
                for (final s in value.surveys)
                  Card(
                    child: ExpansionTile(
                      key: ValueKey('service-survey-${s.id}'),
                      title: Text(bn ? s.titleBn : s.title),
                      subtitle: Text(serviceStatus(l, s.status)),
                      childrenPadding: const EdgeInsets.all(16),
                      expandedCrossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(bn ? s.descriptionBn : s.description),
                        Text(
                          '${l.serviceClosesAt}: ${formatShortDate(l, s.closesAt.toUtc().add(const Duration(hours: 6)))} ${DateFormat.jm(l.localeName).format(s.closesAt.toUtc().add(const Duration(hours: 6)))}',
                        ),
                        if (s.submitted) Text(l.serviceAlreadyResponded),
                        if (s.eligible && !s.submitted && s.status == 'open')
                          FilledButton(
                            onPressed: writable ? () => _survey(s) : null,
                            child: Text(l.serviceSubmitSurvey),
                          ),
                      ],
                    ),
                  ),
              ]),
              _list([
                if (value.employee != null)
                  FilledButton(
                    onPressed: writable ? _recognize : null,
                    child: Text(l.serviceNewRecognition),
                  ),
                Text(l.serviceRecognitionNote),
                if (value.recognition.isEmpty) Text(l.serviceEmpty),
                for (final r in value.recognition)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text(
                            '${bn ? r.recipient.nameBn ?? r.recipient.name : r.recipient.name} · ${valueLabel(r.value)}',
                            style: Theme.of(context).textTheme.titleSmall,
                          ),
                          Text(
                            '${l.serviceFrom}: ${bn ? r.sender.nameBn ?? r.sender.name : r.sender.name}',
                          ),
                          Text(r.message),
                          if (r.canHide && r.sender.id == value.employee?.id)
                            TextButton(
                              onPressed: writable ? () => _withdraw(r) : null,
                              child: Text(l.serviceWithdrawRecognition),
                            ),
                        ],
                      ),
                    ),
                  ),
              ]),
            ],
          ),
          AsyncError(:final error) => LoadErrorView(
            title: l.serviceEngagement,
            error: error,
            onRetry: () => ref.invalidate(engagementProvider),
          ),
          _ => const Center(child: CircularProgressIndicator()),
        },
      ),
    );
  }
}
