import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_models.dart';
import '../auth/auth_controller.dart';
import '../l10n/app_localizations.dart';
import '../ui/error_text.dart';
import '../ui/format.dart';
import '../ui/load_error_view.dart';
import 'leave_providers.dart';
import 'leave_widgets.dart';

/// The signed-in employee's own requests for the chosen year, with their
/// approval trail and a Cancel action where the API allows it.
class RequestsTab extends ConsumerStatefulWidget {
  const RequestsTab({super.key});

  static ValueKey<String> requestKey(String requestId) =>
      ValueKey('leave-request-$requestId');

  static const confirmCancelKey = ValueKey('leave-cancel-confirm');

  @override
  ConsumerState<RequestsTab> createState() => _RequestsTabState();
}

class _RequestsTabState extends ConsumerState<RequestsTab> {
  /// Requests whose cancel call is running.
  final _cancelling = <String>{};

  Future<void> _cancel(LeaveRequest request) async {
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    // Still usable if the screen closes before the call returns.
    final container = ProviderScope.containerOf(context, listen: false);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.leaveCancelTitle),
        content: Text(
          l10n.leaveCancelBody(
            leaveTypeName(l10n, request.leaveType),
            requestDatesText(l10n, request),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(l10n.leaveKeepRequest),
          ),
          FilledButton(
            key: RequestsTab.confirmCancelKey,
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(l10n.leaveCancelRequest),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() => _cancelling.add(request.id));
    try {
      await container
          .read(authProvider.notifier)
          .cancelLeaveRequest(request.id);
      container
        ..invalidate(myLeaveRequestsProvider)
        ..invalidate(leaveBalancesProvider);
      messenger.showSnackBar(SnackBar(content: Text(l10n.leaveCancelled)));
    } on SessionExpiredException {
      // AuthGate is already showing the login screen.
    } on Object catch (error) {
      // A 409 means the request changed meanwhile: show why and reload.
      container.invalidate(myLeaveRequestsProvider);
      messenger.showSnackBar(
        SnackBar(content: Text(describeError(l10n, error))),
      );
    } finally {
      if (mounted) setState(() => _cancelling.remove(request.id));
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final year = ref.watch(leaveYearProvider);
    final today = ref.watch(todayProvider);
    final requests = ref.watch(myLeaveRequestsProvider(year));

    return RefreshIndicator(
      onRefresh: () =>
          awaitRefresh(ref.refresh(myLeaveRequestsProvider(year).future)),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(16),
        children: [
          const LeaveYearSwitcher(),
          const SizedBox(height: 16),
          switch (requests) {
            AsyncData(value: final List<LeaveRequest> list) when list.isEmpty =>
              LeaveEmptyState(
                icon: Icons.event_note_outlined,
                message: l10n.leaveNoRequests(formatYear(l10n, year)),
              ),
            AsyncData(value: final List<LeaveRequest> list) => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 12,
              children: [
                for (final request in list)
                  LeaveRequestCard(
                    key: RequestsTab.requestKey(request.id),
                    request: request,
                    cancelling: _cancelling.contains(request.id),
                    onCancel: request.canCancelOn(today)
                        ? () => _cancel(request)
                        : null,
                  ),
              ],
            ),
            AsyncData() => LeaveEmptyState(
              icon: Icons.badge_outlined,
              title: l10n.leaveNoEmployeeTitle,
              message: l10n.leaveNoEmployeeBody,
            ),
            AsyncError(:final error)
                when !requests.isLoading && error is! SessionExpiredException =>
              LoadErrorView(
                title: l10n.leaveLoadFailed,
                error: error,
                onRetry: () => ref.invalidate(myLeaveRequestsProvider(year)),
              ),
            _ => const LeaveLoading(),
          },
        ],
      ),
    );
  }
}
