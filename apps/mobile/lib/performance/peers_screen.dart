import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_models.dart';
import '../auth/auth_controller.dart';
import '../l10n/app_localizations.dart';
import '../leave/leave_widgets.dart';
import '../ui/format.dart';
import '../ui/language_menu.dart';
import '../ui/load_error_view.dart';
import 'peer_request_screen.dart';
import 'performance_providers.dart';
import 'performance_widgets.dart';

/// Feedback colleagues are asked to give: the login's requests, open or
/// given, each opening its form; and, for a manager, the peers named for
/// their team's reviews, to approve or decline.
class PeerFeedbackScreen extends ConsumerWidget {
  const PeerFeedbackScreen({super.key});

  static Route<void> route() =>
      MaterialPageRoute(builder: (context) => const PeerFeedbackScreen());

  static ValueKey<String> requestKey(String peerId) =>
      ValueKey('peer-request-$peerId');
  static ValueKey<String> approveKey(String peerId) =>
      ValueKey('peer-approve-$peerId');
  static ValueKey<String> declineKey(String peerId) =>
      ValueKey('peer-decline-$peerId');

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final inbox = ref.watch(peerInboxProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.peerFeedbackTitle),
        actions: const [LanguageMenuButton()],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () => awaitRefresh(ref.refresh(peerInboxProvider.future)),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: switch (inbox) {
              AsyncData(:final value) => [
                if (value.toApprove.isNotEmpty)
                  PerformanceSection(
                    title: l10n.peersToApprove,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      spacing: 8,
                      children: [
                        for (final approval in value.toApprove)
                          _ApprovalCard(approval: approval),
                      ],
                    ),
                  ),
                PerformanceSection(
                  title: l10n.peersToAnswer,
                  child: value.toAnswer.isEmpty
                      ? MutedText(l10n.peersNoneToAnswer)
                      : Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          spacing: 8,
                          children: [
                            for (final request in value.toAnswer)
                              _RequestCard(
                                key: requestKey(request.id),
                                request: request,
                              ),
                          ],
                        ),
                ),
              ],
              AsyncError(:final error)
                  when !inbox.isLoading && error is! SessionExpiredException =>
                [
                  LoadErrorView(
                    title: l10n.peersLoadFailed,
                    error: error,
                    onRetry: () => ref.invalidate(peerInboxProvider),
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

/// A request for the login's feedback: on whom, the cycle, by when, and
/// whether it is given, waiting or closed.
class _RequestCard extends StatelessWidget {
  const _RequestCard({super.key, required this.request});

  final PeerRequest request;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final (label, background, foreground) = switch (request) {
      PeerRequest(status: PeerStatus.submitted) => (
        l10n.peerStatusAnswered,
        scheme.primaryContainer,
        scheme.onPrimaryContainer,
      ),
      PeerRequest(open: true) => (
        l10n.peerStatusWaiting,
        scheme.tertiaryContainer,
        scheme.onTertiaryContainer,
      ),
      _ => (
        l10n.peerStatusClosed,
        scheme.surfaceContainerHighest,
        scheme.onSurfaceVariant,
      ),
    };
    return TappableCard(
      onTap: () =>
          Navigator.of(context).push(PeerRequestScreen.route(request.id)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: 4,
        children: [
          Text(
            l10n.peerFeedbackOn(personName(l10n, request.person)),
            style: theme.textTheme.titleMedium,
          ),
          Text(
            [
              request.cycle.name,
              if (request.dueOn case final due? when request.open)
                l10n.performanceDueBy(formatShortDate(l10n, due)),
            ].join(' · '),
            style: theme.textTheme.bodySmall?.copyWith(
              color: scheme.onSurfaceVariant,
            ),
          ),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: LeavePill(
              label: label,
              background: background,
              foreground: foreground,
            ),
          ),
        ],
      ),
    );
  }
}

/// A peer named for someone's review, waiting for the manager's yes or no.
class _ApprovalCard extends ConsumerStatefulWidget {
  const _ApprovalCard({required this.approval});

  final PeerApproval approval;

  @override
  ConsumerState<_ApprovalCard> createState() => _ApprovalCardState();
}

class _ApprovalCardState extends ConsumerState<_ApprovalCard> {
  bool _busy = false;

  Future<void> _decide({required bool approve}) async {
    final l10n = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final container = ProviderScope.containerOf(context, listen: false);
    setState(() => _busy = true);
    String message;
    try {
      await container
          .read(peerInboxProvider.notifier)
          .decide(widget.approval.id, approve: approve);
      message = approve ? l10n.peerApproved : l10n.peerDeclined;
    } on SessionExpiredException {
      return;
    } on Object catch (error) {
      message = performanceErrorText(l10n, error);
      if (isStale(error)) container.invalidate(peerInboxProvider);
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
    final approval = widget.approval;
    return Card.outlined(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: 8,
          children: [
            Text(
              l10n.peerApproveLine(
                personName(l10n, approval.peer),
                personName(l10n, approval.person),
              ),
              style: theme.textTheme.titleSmall,
            ),
            MutedText(approval.cycle.name),
            Wrap(
              alignment: WrapAlignment.end,
              spacing: 8,
              children: [
                OutlinedButton(
                  key: PeerFeedbackScreen.declineKey(approval.id),
                  onPressed: _busy ? null : () => _decide(approve: false),
                  child: Text(l10n.peerDecline),
                ),
                FilledButton(
                  key: PeerFeedbackScreen.approveKey(approval.id),
                  onPressed: _busy ? null : () => _decide(approve: true),
                  child: Text(l10n.peerApprove),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
