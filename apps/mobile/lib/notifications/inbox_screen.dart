import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_models.dart';
import '../auth/auth_controller.dart';
import '../l10n/app_localizations.dart';
import '../leave/leave_widgets.dart';
import '../ui/format.dart';
import '../ui/language_menu.dart';
import '../ui/load_error_view.dart';
import 'notification_providers.dart';
import 'notification_routes.dart';

/// The signed-in user's notifications, newest first, reloaded on opening.
///
/// Tapping one marks it read and opens what it is about, when the app has a
/// screen for it.
class InboxScreen extends ConsumerStatefulWidget {
  const InboxScreen({super.key});

  static const markAllReadKey = ValueKey('inbox-mark-all-read');
  static const emptyKey = ValueKey('inbox-empty');

  static ValueKey<String> itemKey(String id) => ValueKey('inbox-item-$id');
  static ValueKey<String> unreadDotKey(String id) =>
      ValueKey('inbox-unread-$id');

  static Route<void> route() =>
      MaterialPageRoute(builder: (context) => const InboxScreen());

  @override
  ConsumerState<InboxScreen> createState() => _InboxScreenState();
}

class _InboxScreenState extends ConsumerState<InboxScreen> {
  @override
  void initState() {
    super.initState();
    // What the bell showed may be minutes old. Not during this build: the
    // home screen's badge is listening.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) ref.invalidate(notificationInboxProvider);
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final inbox = ref.watch(notificationInboxProvider);
    final unread = inbox.value?.unread ?? 0;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.notificationsTitle),
        actions: [
          IconButton(
            key: InboxScreen.markAllReadKey,
            tooltip: l10n.notificationsMarkAllRead,
            icon: const Icon(Icons.done_all),
            onPressed: unread > 0
                ? () =>
                      ref.read(notificationInboxProvider.notifier).markAllRead()
                : null,
          ),
          const LanguageMenuButton(),
        ],
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () =>
              awaitRefresh(ref.refresh(notificationInboxProvider.future)),
          child: switch (inbox) {
            AsyncData(:final value) when value.items.isEmpty => ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(16),
              children: [
                LeaveEmptyState(
                  key: InboxScreen.emptyKey,
                  icon: Icons.notifications_none,
                  message: l10n.notificationsEmpty,
                ),
              ],
            ),
            AsyncData(:final value) => ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
              itemCount: value.items.length,
              separatorBuilder: (context, index) => const Divider(height: 1),
              itemBuilder: (context, index) =>
                  _InboxTile(item: value.items[index]),
            ),
            AsyncError(:final error)
                when !inbox.isLoading && error is! SessionExpiredException =>
              ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: [
                  LoadErrorView(
                    title: l10n.notificationsLoadFailed,
                    error: error,
                    onRetry: () => ref.invalidate(notificationInboxProvider),
                  ),
                ],
              ),
            _ => const Center(child: CircularProgressIndicator()),
          },
        ),
      ),
    );
  }
}

class _InboxTile extends ConsumerWidget {
  const _InboxTile({required this.item});

  final InboxNotification item;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final unread = !item.isRead;
    final local = wallClock(item.createdAt, null);
    final when =
        '${formatShortDate(l10n, local)} · '
        '${formatInstantClock(l10n, item.createdAt, null)}';

    return ListTile(
      key: InboxScreen.itemKey(item.id),
      tileColor: unread
          ? scheme.secondaryContainer.withValues(alpha: 0.4)
          : null,
      leading: Icon(_icon(item.event), color: scheme.primary),
      title: Text(
        item.title,
        style: unread ? const TextStyle(fontWeight: FontWeight.w600) : null,
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(item.body, maxLines: 3, overflow: TextOverflow.ellipsis),
          const SizedBox(height: 4),
          Text(
            when,
            style: theme.textTheme.bodySmall?.copyWith(
              color: scheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
      trailing: unread
          ? Semantics(
              label: l10n.notificationUnread,
              child: Container(
                key: InboxScreen.unreadDotKey(item.id),
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  color: scheme.primary,
                  shape: BoxShape.circle,
                ),
              ),
            )
          : null,
      isThreeLine: true,
      onTap: () {
        final navigator = Navigator.of(context);
        if (unread) {
          ref.read(notificationInboxProvider.notifier).markRead(item.id);
        }
        openNotificationTarget(navigator, item.event, item.link);
      },
    );
  }

  static IconData _icon(NotificationEvent event) => switch (event) {
    NotificationEvent.approvalRequested => Icons.pending_actions_outlined,
    NotificationEvent.approvalDecided => Icons.task_alt,
    NotificationEvent.documentExpiring => Icons.event_busy_outlined,
    NotificationEvent.letterIssued => Icons.mail_outline,
    NotificationEvent.missingPunch => Icons.fingerprint,
    NotificationEvent.probationEnding => Icons.badge_outlined,
    NotificationEvent.unknown => Icons.notifications_none,
  };
}
