import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_models.dart';
import '../auth/auth_controller.dart';
import '../l10n/app_localizations.dart';
import '../ui/format.dart';
import '../ui/language_menu.dart';
import '../ui/load_error_view.dart';
import 'service_form.dart';

final employeeServicesProvider =
    FutureProvider.autoDispose<EmployeeServicesOverview>((ref) {
      if (ref.watch(authProvider) is! SignedIn) {
        throw const SessionExpiredException();
      }
      return ref.read(authProvider.notifier).fetchEmployeeServices();
    }, retry: (count, error) => null);
final hrServiceRequestProvider = FutureProvider.autoDispose
    .family<HrServiceRequest, String>((ref, id) {
      if (ref.watch(authProvider) is! SignedIn) {
        throw const SessionExpiredException();
      }
      return ref.read(authProvider.notifier).fetchHrRequest(id);
    }, retry: (count, error) => null);

class EmployeeServicesScreen extends ConsumerStatefulWidget {
  const EmployeeServicesScreen({super.key, this.initialTab = 0});
  final int initialTab;
  static Route<void> route({int tab = 0}) => MaterialPageRoute(
    builder: (_) => EmployeeServicesScreen(initialTab: tab),
  );
  @override
  ConsumerState<EmployeeServicesScreen> createState() =>
      _EmployeeServicesScreenState();
}

class _EmployeeServicesScreenState
    extends ConsumerState<EmployeeServicesScreen> {
  final _busy = <String>{};
  Future<void> _newRequest() async {
    final l = AppLocalizations.of(context);
    HrServiceRequest? created;
    final done = await showServiceForm(
      context,
      title: l.serviceNewRequest,
      note: l.serviceRequestPrivacy,
      fields: [
        ServiceInput(
          'category',
          l.serviceCategory,
          choices: {
            'letters': l.serviceCategoriesLetters,
            'pay': l.serviceCategoriesPay,
            'leave': l.serviceCategoriesLeave,
            'benefits': l.serviceCategoriesBenefits,
            'other': l.serviceCategoriesOther,
          },
        ),
        ServiceInput(
          'priority',
          l.servicePriority,
          choices: {
            'normal': l.servicePrioritiesNormal,
            'urgent': l.servicePrioritiesUrgent,
          },
        ),
        ServiceInput('subject', l.serviceSubject),
        ServiceInput(
          'body',
          l.serviceRequestBody,
          long: true,
          maxLength: 10000,
        ),
      ],
      submit: (d) async {
        created = await ref
            .read(authProvider.notifier)
            .createHrRequest(
              subject: d['subject']!,
              body: d['body']!,
              category: d['category']!,
              priority: d['priority']!,
            );
      },
    );
    if (done == true && mounted) {
      ref.invalidate(employeeServicesProvider);
      await Navigator.of(context).push(HrRequestScreen.route(created!.id));
    }
  }

  Future<void> _acknowledge(EmployeeAssetIssue issue) async {
    setState(() => _busy.add(issue.id));
    try {
      await ref.read(authProvider.notifier).acknowledgeAsset(issue.id);
      if (mounted) ref.invalidate(employeeServicesProvider);
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
      if (mounted) setState(() => _busy.remove(issue.id));
    }
  }

  Widget _list(List<Widget> children) => RefreshIndicator(
    onRefresh: () =>
        ref.refresh(employeeServicesProvider.future).then<void>((_) {}),
    child: ListView(
      padding: const EdgeInsets.all(16),
      physics: const AlwaysScrollableScrollPhysics(),
      children: children,
    ),
  );
  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context), bn = l.localeName.startsWith('bn');
    final writable =
        ref.watch(tenantAccessProvider).value?.access.accessState ==
        AccessState.full;
    return DefaultTabController(
      length: 2,
      initialIndex: widget.initialTab,
      child: Scaffold(
        appBar: AppBar(
          title: Text(l.serviceServices),
          actions: const [LanguageMenuButton()],
          bottom: TabBar(
            tabs: [
              Tab(text: l.serviceRequests),
              Tab(text: l.serviceAssets),
            ],
          ),
        ),
        body: switch (ref.watch(employeeServicesProvider)) {
          AsyncData(:final value) => TabBarView(
            children: [
              _list([
                Text(l.serviceRequestPrivacy),
                if (value.manage) Text(l.serviceHrOnWeb),
                if (value.employee != null)
                  FilledButton(
                    onPressed: writable ? _newRequest : null,
                    child: Text(l.serviceNewRequest),
                  ),
                if (value.requests.isEmpty) Text(l.serviceEmpty),
                for (final r in value.requests)
                  Card(
                    child: ListTile(
                      key: ValueKey('service-request-${r.id}'),
                      title: Text(r.subject),
                      subtitle: Text(serviceStatus(l, r.status)),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () =>
                          Navigator.of(context)
                              .push(HrRequestScreen.route(r.id)),
                    ),
                  ),
              ]),
              _list([
                Text(l.serviceAssetNote),
                if (value.issues.isEmpty) Text(l.serviceEmpty),
                for (final issue in value.issues)
                  Card(
                    child: ExpansionTile(
                      key: ValueKey('service-asset-${issue.id}'),
                      title: Text(
                        '${issue.tag} · ${bn ? issue.nameBn : issue.name}',
                      ),
                      subtitle: Text(
                        issue.returnedOn != null
                            ? '${l.serviceReturnedOn}: ${formatDate(l, issue.returnedOn!)}'
                            : issue.overdue
                            ? l.serviceOverdue
                            : l.serviceIssued,
                      ),
                      childrenPadding: const EdgeInsets.all(16),
                      expandedCrossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          '${l.serviceIssuedOn}: ${formatDate(l, issue.issuedOn)}',
                        ),
                        if (issue.dueOn != null)
                          Text(
                            '${l.serviceDueOn}: ${formatDate(l, issue.dueOn!)}',
                          ),
                        Text(issue.condition),
                        if (issue.acknowledgedAt != null)
                          Text(l.serviceAcknowledged),
                        if (issue.canAcknowledge)
                          FilledButton(
                            onPressed: writable && !_busy.contains(issue.id)
                                ? () => _acknowledge(issue)
                                : null,
                            child: Text(l.serviceAcknowledgeAsset),
                          ),
                      ],
                    ),
                  ),
              ]),
            ],
          ),
          AsyncError(:final error) => LoadErrorView(
            title: l.serviceServices,
            error: error,
            onRetry: () => ref.invalidate(employeeServicesProvider),
          ),
          _ => const Center(child: CircularProgressIndicator()),
        },
      ),
    );
  }
}

class HrRequestScreen extends ConsumerWidget {
  const HrRequestScreen({super.key, required this.id});
  final String id;
  static Route<void> route(String id) =>
      MaterialPageRoute(builder: (_) => HrRequestScreen(id: id));
  Future<void> _compose(
    BuildContext context,
    WidgetRef ref, {
    String? status,
  }) async {
    final l = AppLocalizations.of(context),
        action = status == null
            ? l.serviceReply
            : status == 'open'
            ? l.serviceReopen
            : l.serviceCloseRequest;
    final done = await showServiceForm(
      context,
      title: action,
      fields: [
        ServiceInput(
          'text',
          status == null ? l.serviceReplyBody : l.serviceReason,
          long: true,
          maxLength: status == null ? 10000 : 4000,
        ),
      ],
      submit: (d) async {
        final auth = ref.read(authProvider.notifier);
        if (status == null) {
          await auth.replyToHrRequest(id, d['text']!);
        } else {
          await auth.moveHrRequest(id, status: status, reason: d['text']!);
        }
      },
    );
    if (done == true && context.mounted) {
      ref.invalidate(hrServiceRequestProvider(id));
      ref.invalidate(employeeServicesProvider);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context),
        writable =
            ref.watch(tenantAccessProvider).value?.access.accessState ==
            AccessState.full;
    final metadata = ref.watch(employeeServicesProvider);
    final own = metadata.value?.employee?.id;
    return Scaffold(
      appBar: AppBar(
        title: Text(l.serviceRequests),
        actions: const [LanguageMenuButton()],
      ),
      body: metadata.isLoading
          ? const Center(child: CircularProgressIndicator())
          : metadata.hasError
          ? LoadErrorView(
              title: l.serviceServices,
              error: metadata.error!,
              onRetry: () => ref.invalidate(employeeServicesProvider),
            )
          : switch (ref.watch(hrServiceRequestProvider(id))) {
              AsyncData(:final value)
                  when own != null && own == value.employee.id =>
                RefreshIndicator(
                  onRefresh: () => ref
                      .refresh(hrServiceRequestProvider(id).future)
                      .then<void>((_) {}),
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: [
                      Text(
                        value.subject,
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      Text(serviceStatus(l, value.status)),
                      Text(l.serviceRequestPrivacy),
                      for (final message in value.messages.where(
                        (m) => !m.internal,
                      ))
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                Text(
                                  message.authorName,
                                  style: Theme.of(context).textTheme.titleSmall,
                                ),
                                Text(message.body),
                              ],
                            ),
                          ),
                        ),
                      if (value.status != 'closed')
                        FilledButton(
                          onPressed: writable
                              ? () => _compose(context, ref)
                              : null,
                          child: Text(l.serviceReply),
                        ),
                      if (value.status == 'resolved')
                        OutlinedButton(
                          onPressed: writable
                              ? () => _compose(context, ref, status: 'closed')
                              : null,
                          child: Text(l.serviceCloseRequest),
                        ),
                      if (['resolved', 'closed'].contains(value.status))
                        OutlinedButton(
                          onPressed: writable
                              ? () => _compose(context, ref, status: 'open')
                              : null,
                          child: Text(l.serviceReopen),
                        ),
                    ],
                  ),
                ),
              AsyncData() => Padding(
                padding: const EdgeInsets.all(16),
                child: Text(l.serviceHrOnWeb),
              ),
              AsyncError(:final error) => LoadErrorView(
                title: l.serviceRequests,
                error: error,
                onRetry: () {
                  ref.invalidate(employeeServicesProvider);
                  ref.invalidate(hrServiceRequestProvider(id));
                },
              ),
              _ => const Center(child: CircularProgressIndicator()),
            },
    );
  }
}
